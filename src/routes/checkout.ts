import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/environment';
import {
  validateGuestIdentityInput,
  validateGuestDraftInput,
  validateGuestClaimInput,
  validateCheckoutPayPalSessionInput,
  validateCheckoutPayopOptionsInput,
  validateCheckoutPayopSessionInput,
  validateCheckoutPayopStatusInput,
  validateCheckoutAntomOptionsInput,
  validateCheckoutAntomSessionInput,
  validateCheckoutAntomStatusInput,
  validateCheckoutNowPaymentsInvoiceInput,
  validateCheckoutNowPaymentsMinimumInput,
  validateCheckoutPayPalConfirmInput,
  validateCheckoutCreditsCompleteInput,
  validateCheckoutQaCompleteInput,
} from '../schemas/checkout';
import { guestCheckoutService } from '../services/guestCheckoutService';
import { paymentService } from '../services/paymentService';
import { paymentRepository } from '../services/paymentRepository';
import { orderService } from '../services/orderService';
import {
  buildTikTokRequestContext,
  tiktokEventsService,
} from '../services/tiktokEventsService';
import {
  buildMetaRequestContext,
  metaEventsService,
} from '../services/metaEventsService';
import { ErrorResponses, SuccessResponses, sendError } from '../utils/response';
import {
  isSellableProductErrorCode,
  sendSellableProductError,
} from '../utils/catalogApiErrors';
import { attachLegacyVariantDeprecation } from '../utils/catalogApiCompatibility';
import { Logger } from '../utils/logger';
import { getRequestIp } from '../utils/requestIp';
import { resolveCountryFromHeaders } from '../utils/currency';
import {
  paymentQuoteRateLimit,
  paymentRateLimit,
  paymentRefreshRateLimit,
} from '../middleware/paymentMiddleware';
import {
  authPreHandler,
  optionalAuthPreHandler,
} from '../middleware/authMiddleware';
import type { OrderWithItems } from '../types/order';
import type { PayopMethodQuote } from '../services/payments/payopQuoteService';
import type { AntomCheckoutOptionQuote } from '../services/payments/antomQuoteService';

const centsToAmount = (value?: number | null): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number((value / 100).toFixed(2));
};

const serializeOptionalIsoDate = (
  value?: Date | string | null
): string | null => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const resolveEventId = (
  candidate: string | null | undefined,
  fallback: string
): string => {
  const trimmed = typeof candidate === 'string' ? candidate.trim() : '';
  return trimmed || fallback;
};

const resolveOrderCurrency = (order: OrderWithItems): string => {
  const metadata =
    order.metadata && typeof order.metadata === 'object'
      ? order.metadata
      : null;
  const rawCurrency =
    resolveMetadataValue(metadata, 'display_currency') ||
    order.display_currency ||
    order.currency ||
    order.items.find(item => item.currency)?.currency ||
    'USD';
  return rawCurrency.toUpperCase();
};

const resolveOrderTotalCents = (order: OrderWithItems): number => {
  const metadata =
    order.metadata && typeof order.metadata === 'object'
      ? order.metadata
      : null;
  return (
    resolveMetadataNumber(metadata, 'display_total_cents') ??
    resolveMetadataNumber(metadata, 'displayTotalCents') ??
    order.display_total_cents ??
    order.total_cents ??
    order.items.reduce(
      (sum, item) =>
        sum +
        (Number.isFinite(item.total_price_cents) ? item.total_price_cents : 0),
      0
    )
  );
};

const resolveOrderValue = (order: OrderWithItems): number => {
  const totalCents = resolveOrderTotalCents(order);
  return centsToAmount(totalCents) ?? 0;
};

const resolveMetadataValue = (
  metadata: Record<string, unknown> | null | undefined,
  key: string
): string | undefined => {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const value = metadata[key];
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
};

const resolveMetadataNumber = (
  metadata: Record<string, unknown> | null | undefined,
  key: string
): number | undefined => {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const value = metadata[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }
  return undefined;
};

const readSingleHeader = (
  value: string | string[] | undefined
): string | null => {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== 'string') {
        continue;
      }
      const normalized = entry.trim();
      if (normalized.length > 0) {
        return normalized;
      }
    }
  }
  return null;
};

const resolveCheckoutRequestBaseUrl = (
  request: FastifyRequest
): string | null => {
  const origin = readSingleHeader(request.headers.origin);
  if (origin) {
    return origin;
  }

  const referer = readSingleHeader(request.headers.referer);
  if (referer) {
    try {
      const refererUrl = new globalThis.URL(referer);
      return refererUrl.origin;
    } catch {
      // Ignore invalid referer values and fall through to forwarded headers.
    }
  }

  const host =
    readSingleHeader(request.headers['x-forwarded-host']) ||
    readSingleHeader(request.headers.host);
  if (!host) {
    return null;
  }

  const proto =
    readSingleHeader(request.headers['x-forwarded-proto']) ||
    (env.NODE_ENV === 'production' ? 'https' : 'http');

  return `${proto}://${host}`;
};

type CheckoutLegalConsentPayload =
  | {
      immediate_fulfillment_consent: boolean;
      terms_policy_consent: boolean;
      consent_timestamp?: string | null | undefined;
      checkout_session_key_snapshot?: string | null | undefined;
      consent_source?: string | null | undefined;
    }
  | null
  | undefined;

const hasRequiredLegalConsent = (
  payload: CheckoutLegalConsentPayload
): payload is Exclude<CheckoutLegalConsentPayload, null | undefined> =>
  Boolean(
    payload &&
      payload.immediate_fulfillment_consent === true &&
      payload.terms_policy_consent === true
  );

const resolveConsentTimestamp = (value?: string | null): string => {
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
};

const buildOrderTikTokProperties = (
  order: OrderWithItems
): Record<string, unknown> => {
  const currency = resolveOrderCurrency(order);
  const value = resolveOrderValue(order);
  const contents = order.items.map(item => {
    const contentName =
      item.product_name ||
      item.variant_name ||
      resolveMetadataValue(item.metadata, 'service_name') ||
      resolveMetadataValue(item.metadata, 'service_type') ||
      item.product_variant_id ||
      item.id;
    const contentCategory =
      resolveMetadataValue(item.metadata, 'category') ||
      resolveMetadataValue(item.metadata, 'service_type');
    return {
      content_id: item.product_variant_id || item.id,
      content_type: 'product',
      content_name: contentName,
      content_category: contentCategory,
      quantity: item.quantity,
      price: centsToAmount(item.unit_price_cents) ?? undefined,
    };
  });

  const primary = contents[0];
  return {
    value,
    currency,
    content_id: `order_${order.id}`,
    content_type: order.items.length > 1 ? 'product_group' : 'product',
    content_name:
      order.items.length > 1
        ? `Order ${order.id}`
        : (primary?.content_name as string | undefined) || `Order ${order.id}`,
    contents,
  };
};

const trackMetaAddPaymentInfo = (params: {
  request: FastifyRequest;
  order: OrderWithItems;
  addPaymentInfoEventId?: string | null | undefined;
  paymentType: string;
}): void => {
  const eventContext = buildMetaRequestContext(params.request);
  const externalId =
    params.order.user_id || params.request.user?.userId || null;
  const email =
    params.request.user?.email ?? params.order.contact_email ?? null;
  const customData = {
    ...buildOrderTikTokProperties(params.order),
    payment_type: params.paymentType,
  };

  void metaEventsService.trackAddPaymentInfo({
    externalId,
    email,
    eventId: resolveEventId(
      params.addPaymentInfoEventId,
      `order_${params.order.id}_add_payment_info_${params.paymentType}`
    ),
    customData,
    context: eventContext,
  });
};

type CheckoutPurchaseTrackingPayload = {
  transaction_id: string;
  event_id: string;
  currency: string;
  value: number;
  items: Array<{
    item_id: string;
    item_name: string;
    item_category?: string;
    item_variant?: string;
    price: number;
    currency: string;
    quantity: number;
    index: number;
  }>;
};

const isSuccessfulOrderStatus = (status?: string | null): boolean =>
  Boolean(status && ['in_process', 'paid', 'delivered'].includes(status));

const buildOrderPurchaseTrackingPayload = (
  order: OrderWithItems
): CheckoutPurchaseTrackingPayload => {
  const currency = resolveOrderCurrency(order);
  const value = resolveOrderValue(order);
  const items = order.items.length
    ? order.items.map((item, index) => {
        const metadata =
          item.metadata && typeof item.metadata === 'object'
            ? item.metadata
            : null;
        const itemName =
          item.product_name ||
          item.variant_name ||
          resolveMetadataValue(metadata, 'service_name') ||
          resolveMetadataValue(metadata, 'service_type') ||
          item.product_variant_id ||
          item.id;
        const itemCategory =
          resolveMetadataValue(metadata, 'category') ||
          resolveMetadataValue(metadata, 'service_type');
        return {
          item_id: item.product_variant_id || item.id,
          item_name: itemName,
          ...(itemCategory ? { item_category: itemCategory } : {}),
          ...(item.variant_name ? { item_variant: item.variant_name } : {}),
          price: centsToAmount(item.unit_price_cents) ?? 0,
          currency,
          quantity: item.quantity,
          index,
        };
      })
    : [
        {
          item_id: `order_${order.id}`,
          item_name: `Order ${order.id}`,
          price: value,
          currency,
          quantity: 1,
          index: 0,
        },
      ];

  return {
    transaction_id: order.id,
    event_id: `order_${order.id}_purchase`,
    currency,
    value,
    items,
  };
};

const resolvePurchaseTrackingPayload = async (
  orderId: string,
  orderStatus?: string | null,
  request?: FastifyRequest
): Promise<CheckoutPurchaseTrackingPayload | null> => {
  if (!isSuccessfulOrderStatus(orderStatus)) {
    return null;
  }

  const orderForTracking = await orderService.getOrderWithItems(orderId);
  if (orderForTracking && request) {
    void metaEventsService.trackPurchase({
      externalId: orderForTracking.user_id || request.user?.userId || null,
      email: request.user?.email ?? orderForTracking.contact_email ?? null,
      eventId: `order_${orderForTracking.id}_purchase`,
      customData: buildOrderTikTokProperties(orderForTracking),
      context: buildMetaRequestContext(request),
    });
  }
  return orderForTracking
    ? buildOrderPurchaseTrackingPayload(orderForTracking)
    : null;
};

const serializePayopMethodQuote = (
  quote: PayopMethodQuote
): {
  method_id: number;
  title: string;
  type: PayopMethodQuote['type'];
  form_type: string | null | undefined;
  logo_url: string | null | undefined;
  supported_countries: string[];
  supported_currencies: string[];
  display_subtotal_cents: number | null;
  display_fee_cents: number | null;
  display_total_cents: number | null;
  processing_currency: string;
  processing_subtotal_cents: number;
  processing_fee_cents: number | null;
  processing_total_cents: number;
  converted_from_display_currency: boolean;
  required_payer_fields: string[];
  items: Array<{
    order_item_id: string;
    label: string;
    logo_key: string | null;
    total_cents: number;
  }>;
} => ({
  method_id: quote.methodId,
  title: quote.title,
  type: quote.type,
  form_type: quote.formType,
  logo_url: quote.logoUrl,
  supported_countries: quote.supportedCountries,
  supported_currencies: quote.supportedCurrencies,
  display_subtotal_cents: quote.displaySubtotalCents,
  display_fee_cents: quote.displayFeeCents,
  display_total_cents: quote.displayTotalCents,
  processing_currency: quote.processingCurrency,
  processing_subtotal_cents: quote.processingSubtotalCents,
  processing_fee_cents: quote.processingFeeCents,
  processing_total_cents: quote.processingTotalCents,
  converted_from_display_currency: quote.convertedFromDisplayCurrency,
  required_payer_fields: quote.requiredPayerFields,
  items: quote.items.map(item => ({
    order_item_id: item.orderItemId,
    label: item.label,
    logo_key: item.logoKey,
    total_cents: item.totalCents,
  })),
});

const serializeAntomOptionQuote = (
  quote: AntomCheckoutOptionQuote
): {
  option_id: AntomCheckoutOptionQuote['id'];
  title: string;
  description: string;
  method_types: string[];
  brand_names: string[];
  currency: string;
  subtotal_cents: number;
  service_fee_cents: number;
  service_fee_percent_bps: number;
  service_fee_fixed_cents: number;
  tax_cents: number;
  tax_residence_id: string;
  tax_residence_label: string;
  tax_rate_bps: number;
  tax_base_cents: number;
  total_cents: number;
  items: Array<{
    order_item_id: string;
    label: string;
    logo_key: string | null;
    total_cents: number;
  }>;
} => ({
  option_id: quote.id,
  title: quote.title,
  description: quote.description,
  method_types: quote.methodTypes,
  brand_names: quote.brandNames,
  currency: quote.currency,
  subtotal_cents: quote.subtotalCents,
  service_fee_cents: quote.serviceFeeCents,
  service_fee_percent_bps: quote.serviceFeePercentBps,
  service_fee_fixed_cents: quote.serviceFeeFixedCents,
  tax_cents: quote.taxCents,
  tax_residence_id: quote.taxResidenceId,
  tax_residence_label: quote.taxResidenceLabel,
  tax_rate_bps: quote.taxRateBps,
  tax_base_cents: quote.taxBaseCents,
  total_cents: quote.totalCents,
  items: quote.items.map(item => ({
    order_item_id: item.orderItemId,
    label: item.label,
    logo_key: item.logoKey,
    total_cents: item.totalCents,
  })),
});

export async function checkoutRoutes(fastify: FastifyInstance): Promise<void> {
  const persistLegalConsentEvidence = async (params: {
    orderId: string;
    legalConsent: CheckoutLegalConsentPayload;
    request: FastifyRequest;
    checkoutSessionKey?: string | null;
    channel: 'card' | 'crypto' | 'credits' | 'qa';
  }): Promise<boolean> => {
    if (!hasRequiredLegalConsent(params.legalConsent)) {
      return false;
    }
    const consentTimestamp = resolveConsentTimestamp(
      params.legalConsent.consent_timestamp
    );
    const requestIp = getRequestIp(params.request);
    const userAgentHeader = params.request.headers['user-agent'];
    const userAgent =
      Array.isArray(userAgentHeader) && userAgentHeader.length > 0
        ? userAgentHeader[0]
        : typeof userAgentHeader === 'string'
          ? userAgentHeader
          : null;

    return orderService.appendOrderMetadata(params.orderId, {
      checkout_legal_consent: {
        immediate_fulfillment_consent: true,
        terms_policy_consent: true,
        consent_timestamp: consentTimestamp,
        recorded_at: new Date().toISOString(),
        ip_address: requestIp ?? null,
        user_agent: userAgent,
        checkout_session_key_snapshot:
          params.legalConsent.checkout_session_key_snapshot ??
          params.checkoutSessionKey ??
          null,
        consent_source:
          params.legalConsent.consent_source ?? `checkout_${params.channel}`,
      },
    });
  };

  const resolveCheckoutOrderId = async (params: {
    request: FastifyRequest;
    reply: FastifyReply;
    checkoutSessionKey?: string | null;
    orderId?: string | null;
  }): Promise<string | null> => {
    const { request, reply, checkoutSessionKey, orderId } = params;

    if (!checkoutSessionKey && !orderId) {
      await ErrorResponses.badRequest(
        reply,
        'checkout_session_key or order_id is required'
      );
      return null;
    }

    if (checkoutSessionKey) {
      const order =
        await orderService.getOrderByCheckoutSessionKey(checkoutSessionKey);
      if (!order) {
        await ErrorResponses.notFound(reply, 'Checkout session not found');
        return null;
      }
      if (orderId && orderId !== order.id) {
        await ErrorResponses.badRequest(reply, 'Checkout session mismatch');
        return null;
      }
      return order.id;
    }

    const userId = request.user?.userId;
    if (!userId) {
      await ErrorResponses.unauthorized(reply, 'Authentication required');
      return null;
    }

    const order = await orderService.getOrderById(orderId as string);
    if (!order || order.user_id !== userId) {
      await ErrorResponses.notFound(reply, 'Order not found');
      return null;
    }

    return order.id;
  };

  const resolvePayopStatusOrderId = async (params: {
    request: FastifyRequest;
    reply: FastifyReply;
    checkoutSessionKey?: string | null;
    orderId?: string | null;
    invoiceId?: string | null;
  }): Promise<string | null> => {
    if (params.checkoutSessionKey || params.request.user?.userId) {
      return resolveCheckoutOrderId({
        request: params.request,
        reply: params.reply,
        checkoutSessionKey: params.checkoutSessionKey ?? null,
        orderId: params.orderId ?? null,
      });
    }

    if (!params.orderId || !params.invoiceId) {
      await ErrorResponses.unauthorized(
        params.reply,
        'Authentication required'
      );
      return null;
    }

    const order = await orderService.getOrderById(params.orderId);
    if (!order || order.payment_provider !== 'payop') {
      await ErrorResponses.notFound(params.reply, 'Order not found');
      return null;
    }

    if (order.payment_reference === params.invoiceId) {
      return order.id;
    }

    const metadata =
      order.metadata && typeof order.metadata === 'object'
        ? order.metadata
        : {};
    if (
      resolveMetadataValue(metadata, 'payop_invoice_id') === params.invoiceId
    ) {
      return order.id;
    }

    const payment = await paymentRepository.findByProviderPaymentId(
      'payop',
      params.invoiceId
    );
    if (!payment || payment.orderId !== order.id) {
      await ErrorResponses.notFound(params.reply, 'Order not found');
      return null;
    }

    return order.id;
  };

  const resolveAntomStatusOrderId = async (params: {
    request: FastifyRequest;
    reply: FastifyReply;
    checkoutSessionKey?: string | null;
    orderId?: string | null;
    paymentRequestId?: string | null;
  }): Promise<string | null> => {
    if (params.checkoutSessionKey || params.request.user?.userId) {
      return resolveCheckoutOrderId({
        request: params.request,
        reply: params.reply,
        checkoutSessionKey: params.checkoutSessionKey ?? null,
        orderId: params.orderId ?? null,
      });
    }

    if (!params.orderId || !params.paymentRequestId) {
      await ErrorResponses.unauthorized(
        params.reply,
        'Authentication required'
      );
      return null;
    }

    const order = await orderService.getOrderById(params.orderId);
    if (!order || order.payment_provider !== 'antom') {
      await ErrorResponses.notFound(params.reply, 'Order not found');
      return null;
    }

    if (order.payment_reference === params.paymentRequestId) {
      return order.id;
    }

    const metadata =
      order.metadata && typeof order.metadata === 'object'
        ? order.metadata
        : {};
    if (
      resolveMetadataValue(metadata, 'antom_payment_request_id') ===
      params.paymentRequestId
    ) {
      return order.id;
    }

    const payment = await paymentRepository.findByProviderPaymentId(
      'antom',
      params.paymentRequestId
    );
    if (!payment || payment.orderId !== order.id) {
      await ErrorResponses.notFound(params.reply, 'Order not found');
      return null;
    }

    return order.id;
  };

  fastify.get(
    '/paypal/sdk-config',
    {
      preHandler: [optionalAuthPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestCountry = resolveCountryFromHeaders(
        request.headers as Record<string, string | string[] | undefined>
      );
      return SuccessResponses.ok(reply, {
        enabled: Boolean(
          env.PAYPAL_ENABLED &&
            env.PAYPAL_CHECKOUT_ENABLED &&
            env.PAYPAL_CLIENT_ID
        ),
        client_id: env.PAYPAL_CLIENT_ID || null,
        mode: env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox',
        country_code: requestCountry || 'US',
      });
    }
  );

  fastify.get(
    '/payment-capabilities',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store');
      return SuccessResponses.ok(reply, {
        antom_enabled: env.ANTOM_ENABLED === true,
        payop_enabled: env.PAYOP_ENABLED === true,
        nowpayments_enabled: true,
        qa_payment_enabled:
          env.QA_PAYMENT_ENABLED === true && env.NODE_ENV !== 'production',
      });
    }
  );

  fastify.post(
    '/identity',
    {
      preHandler: [optionalAuthPreHandler],
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validation = validateGuestIdentityInput(request.body);
        if (!validation.success) {
          return sendError(
            reply,
            400,
            'Invalid Input',
            validation.error,
            'INVALID_INPUT',
            validation.details
          );
        }

        const identityResult = await guestCheckoutService.ensureGuestIdentity(
          validation.data.email,
          request.user?.userId
            ? { userId: request.user.userId, email: request.user.email }
            : undefined
        );

        if (!identityResult.success) {
          return ErrorResponses.internalError(
            reply,
            identityResult.error || 'Failed to create guest identity'
          );
        }

        return SuccessResponses.ok(reply, {
          guest_identity_id: identityResult.data.guestIdentityId,
        });
      } catch (error) {
        Logger.error('Guest identity creation failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to create guest identity'
        );
      }
    }
  );

  fastify.post(
    '/draft',
    {
      schema: {
        body: {
          type: 'object',
          required: ['guest_identity_id', 'contact_email', 'currency', 'items'],
          properties: {
            checkout_session_key: { type: 'string' },
            guest_identity_id: { type: 'string' },
            contact_email: { type: 'string' },
            currency: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                anyOf: [
                  { required: ['product_id'] },
                  { required: ['variant_id'] },
                ],
                properties: {
                  variant_id: { type: 'string' },
                  product_id: { type: ['string', 'null'] },
                  pricing_snapshot_id: { type: ['string', 'null'] },
                  term_months: { type: 'number' },
                  auto_renew: { type: 'boolean' },
                  selection_type: {
                    type: ['string', 'null'],
                    enum: ['upgrade_new_account', 'upgrade_own_account', null],
                  },
                  account_identifier: {
                    type: ['string', 'null'],
                    maxLength: 255,
                  },
                  credentials: {
                    type: ['string', 'null'],
                    maxLength: 4000,
                  },
                  manual_monthly_acknowledged: {
                    type: ['boolean', 'null'],
                  },
                },
              },
            },
            coupon_code: { type: 'string' },
            initiate_checkout_event_id: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validation = validateGuestDraftInput(request.body);
        if (!validation.success) {
          return sendError(
            reply,
            400,
            'Invalid Input',
            validation.error,
            'INVALID_INPUT',
            validation.details
          );
        }

        if (validation.data.items.some(item => Boolean(item.variant_id))) {
          attachLegacyVariantDeprecation(reply);
        }

        const draftResult = await guestCheckoutService.upsertDraftOrder(
          validation.data
        );

        if (!draftResult.success) {
          const error = draftResult.error || 'Failed to create draft order';
          if (isSellableProductErrorCode(error)) {
            return sendSellableProductError(reply, error);
          }
          if (
            [
              'guest_identity_not_found',
              'contact_email_mismatch',
              'checkout_session_not_found',
              'checkout_session_locked',
              'checkout_session_mismatch',
              'variant_not_found',
              'inactive',
              'term_unavailable',
              'price_unavailable',
              'invalid_settlement',
              'invalid_currency',
              'coupon_invalid',
              'not_found',
              'bound_user',
              'first_order_only',
              'already_redeemed',
              'max_redemptions',
              'scope_mismatch',
              'term_mismatch',
              'zero_total',
              'upgrade_selection_type_required',
              'upgrade_selection_not_available',
              'unexpected_own_account_credentials',
              'own_account_identifier_required',
              'own_account_credentials_required',
              'manual_monthly_acknowledgement_required',
            ].includes(error)
          ) {
            return ErrorResponses.badRequest(reply, error.replace(/_/g, ' '));
          }

          return ErrorResponses.internalError(reply, error);
        }

        if (validation.data.initiate_checkout_event_id) {
          const orderForTracking = await orderService.getOrderWithItems(
            draftResult.data.orderId
          );
          if (orderForTracking) {
            const properties = buildOrderTikTokProperties(orderForTracking);
            const trackingUserId =
              orderForTracking.user_id || request.user?.userId || null;
            if (trackingUserId) {
              void tiktokEventsService.trackInitiateCheckout({
                userId: trackingUserId,
                email:
                  request.user?.email ??
                  orderForTracking.contact_email ??
                  validation.data.contact_email ??
                  null,
                eventId: resolveEventId(
                  validation.data.initiate_checkout_event_id,
                  `order_${draftResult.data.orderId}_checkout`
                ),
                properties,
                context: buildTikTokRequestContext(request),
              });
            }
          }
        }

        return SuccessResponses.ok(reply, {
          checkout_session_key: draftResult.data.checkoutSessionKey,
          order_id: draftResult.data.orderId,
          ...(draftResult.data.pricing
            ? { pricing: draftResult.data.pricing }
            : {}),
        });
      } catch (error) {
        Logger.error('Guest draft creation failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to create draft order'
        );
      }
    }
  );

  fastify.post(
    '/initiate-checkout',
    {
      preHandler: [optionalAuthPreHandler],
      schema: {
        body: {
          type: 'object',
          required: ['checkout_session_key', 'event_id'],
          additionalProperties: false,
          properties: {
            checkout_session_key: { type: 'string', minLength: 1 },
            event_id: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as {
          checkout_session_key: string;
          event_id: string;
        };
        const checkoutSessionKey = body.checkout_session_key.trim();
        const eventId = body.event_id.trim();

        if (!checkoutSessionKey || !eventId) {
          return ErrorResponses.badRequest(
            reply,
            'checkout_session_key and event_id are required'
          );
        }

        const orderId = await resolveCheckoutOrderId({
          request,
          reply,
          checkoutSessionKey,
        });
        if (!orderId) {
          return reply;
        }

        const orderForTracking = await orderService.getOrderWithItems(orderId);
        if (!orderForTracking) {
          return ErrorResponses.notFound(reply, 'Order not found');
        }

        void metaEventsService.trackInitiateCheckout({
          externalId: orderForTracking.user_id || request.user?.userId || null,
          email: request.user?.email ?? orderForTracking.contact_email ?? null,
          eventId,
          customData: buildOrderTikTokProperties(orderForTracking),
          context: buildMetaRequestContext(request),
        });

        return SuccessResponses.ok(reply, {
          order_id: orderForTracking.id,
          event_id: eventId,
        });
      } catch (error) {
        Logger.error('Meta initiate checkout tracking failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to track initiate checkout'
        );
      }
    }
  );

  const cardSessionHandler = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const validation = validateCheckoutPayPalSessionInput(request.body);
      if (!validation.success) {
        return sendError(
          reply,
          400,
          'Invalid Input',
          validation.error,
          'INVALID_INPUT',
          validation.details
        );
      }

      const {
        checkout_session_key,
        order_id,
        success_url,
        cancel_url,
        funding_preference,
        add_payment_info_event_id,
        legal_consent,
      } = validation.data;

      if (!checkout_session_key && !order_id) {
        return ErrorResponses.badRequest(
          reply,
          'checkout_session_key or order_id is required'
        );
      }

      let orderId: string | null = order_id ?? null;
      if (checkout_session_key) {
        const order =
          await orderService.getOrderByCheckoutSessionKey(checkout_session_key);
        if (!order) {
          return ErrorResponses.notFound(reply, 'Checkout session not found');
        }
        orderId = order.id;
        if (order_id && order_id !== order.id) {
          return ErrorResponses.badRequest(reply, 'Checkout session mismatch');
        }
      } else if (orderId) {
        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }
        const order = await orderService.getOrderById(orderId);
        if (!order || order.user_id !== userId) {
          return ErrorResponses.notFound(reply, 'Order not found');
        }
      }

      if (!orderId) {
        return ErrorResponses.badRequest(reply, 'Order not found');
      }

      if (!hasRequiredLegalConsent(legal_consent)) {
        return ErrorResponses.badRequest(
          reply,
          'Digital fulfillment consent and policy acceptance are required'
        );
      }

      const consentSaved = await persistLegalConsentEvidence({
        orderId,
        legalConsent: legal_consent,
        request,
        checkoutSessionKey: checkout_session_key ?? null,
        channel: 'card',
      });
      if (!consentSaved) {
        return ErrorResponses.internalError(
          reply,
          'Failed to record checkout consent evidence'
        );
      }

      if (!env.PAYPAL_CHECKOUT_ENABLED) {
        return ErrorResponses.serviceUnavailable(
          reply,
          'Card checkout is temporarily unavailable. Please try again later.'
        );
      }

      const sessionResult = await paymentService.createPayPalCheckoutSession({
        orderId,
        successUrl: success_url ?? null,
        cancelUrl: cancel_url ?? null,
        buyerEmail: request.user?.email ?? null,
        fundingPreference: funding_preference ?? null,
      });

      if (!sessionResult.success) {
        const error = sessionResult.error || 'card_session_failed';
        if (
          [
            'payment_provider_unavailable',
            'payment_provider_rate_limited',
          ].includes(error)
        ) {
          return ErrorResponses.serviceUnavailable(
            reply,
            'Card checkout is temporarily unavailable. Please try again in a minute.'
          );
        }
        if (error === 'payment_provider_misconfigured') {
          Logger.error(
            'Card provider misconfigured while creating checkout session'
          );
          return ErrorResponses.serviceUnavailable(
            reply,
            'Card checkout is temporarily unavailable. Please try again later.'
          );
        }
        if (
          [
            'order_not_found',
            'order_not_pending',
            'payment_provider_mismatch',
            'order_missing_items',
            'own_account_credentials_required',
            'invalid_currency',
            'missing_app_base_url',
            'invalid_settlement',
          ].includes(error)
        ) {
          return ErrorResponses.badRequest(reply, error.replace(/_/g, ' '));
        }
        return ErrorResponses.internalError(
          reply,
          'Failed to create card session'
        );
      }

      const orderForTracking = await orderService.getOrderWithItems(
        sessionResult.orderId
      );
      const orderMetadata =
        orderForTracking?.metadata &&
        typeof orderForTracking.metadata === 'object'
          ? orderForTracking.metadata
          : null;
      const displayCurrency =
        resolveMetadataValue(orderMetadata, 'display_currency') ||
        orderForTracking?.currency ||
        null;
      const displayTotalCents =
        resolveMetadataNumber(orderMetadata, 'display_total_cents') ??
        orderForTracking?.total_cents ??
        null;
      if (orderForTracking) {
        const properties = buildOrderTikTokProperties(orderForTracking);
        const trackingUserId =
          orderForTracking.user_id || request.user?.userId || null;
        if (trackingUserId) {
          const context = buildTikTokRequestContext(request);
          void tiktokEventsService.trackAddPaymentInfo({
            userId: trackingUserId,
            email:
              request.user?.email ?? orderForTracking.contact_email ?? null,
            eventId: resolveEventId(
              add_payment_info_event_id,
              `order_${sessionResult.orderId}_add_payment_info_paypal`
            ),
            properties: {
              ...properties,
              payment_type: 'card',
              payment_provider: 'paypal',
            },
            context,
          });
        }
        trackMetaAddPaymentInfo({
          request,
          order: orderForTracking,
          addPaymentInfoEventId: add_payment_info_event_id,
          paymentType: 'card',
        });
      }

      return SuccessResponses.ok(reply, {
        order_id: sessionResult.orderId,
        session_id: sessionResult.sessionId,
        session_url: sessionResult.sessionUrl,
        payment_id: sessionResult.paymentId,
        payment_provider: 'paypal',
        pricing_snapshot_id: orderForTracking?.pricing_snapshot_id ?? null,
        display_currency: displayCurrency,
        display_total_cents: displayTotalCents,
        settlement_currency: orderForTracking?.settlement_currency ?? null,
        settlement_total_cents:
          orderForTracking?.settlement_total_cents ?? null,
      });
    } catch (error) {
      Logger.error('Card session creation failed:', error);
      return ErrorResponses.internalError(
        reply,
        'Failed to create card session'
      );
    }
  };

  for (const cardSessionPath of [
    '/paypal/session',
    '/card/session',
    '/stripe/session',
  ]) {
    fastify.post(
      cardSessionPath,
      {
        preHandler: [optionalAuthPreHandler, paymentRateLimit],
        schema: {
          body: {
            type: 'object',
            properties: {
              checkout_session_key: { type: 'string' },
              order_id: { type: 'string' },
              success_url: { type: 'string' },
              cancel_url: { type: 'string' },
              funding_preference: {
                type: 'string',
                enum: ['paypal', 'applepay', 'googlepay', 'card'],
              },
              initiate_checkout_event_id: { type: 'string' },
              add_payment_info_event_id: { type: 'string' },
              legal_consent: {
                type: 'object',
                properties: {
                  immediate_fulfillment_consent: { type: 'boolean' },
                  terms_policy_consent: { type: 'boolean' },
                  consent_timestamp: { type: 'string' },
                  checkout_session_key_snapshot: { type: 'string' },
                  consent_source: { type: 'string' },
                },
              },
            },
          },
        },
      },
      cardSessionHandler
    );
  }

  const cardConfirmHandler = async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<FastifyReply> => {
    try {
      const validation = validateCheckoutPayPalConfirmInput(request.body);
      if (!validation.success) {
        return sendError(
          reply,
          400,
          'Invalid Input',
          validation.error,
          'INVALID_INPUT',
          validation.details
        );
      }

      const order = await orderService.getOrderById(validation.data.order_id);
      if (!order) {
        return ErrorResponses.notFound(reply, 'Order not found');
      }

      const confirmResult = await paymentService.confirmPayPalCheckoutSession({
        orderId: validation.data.order_id,
        sessionId: validation.data.session_id,
        ipAddress: getRequestIp(request),
      });

      if (!confirmResult.success) {
        const error = confirmResult.error || 'card_session_confirm_failed';
        const details = confirmResult.details || undefined;
        if (
          [
            'checkout_session_mismatch',
            'payment_not_completed',
            'fulfillment_failed',
            'payment_amount_mismatch',
            'payment_currency_mismatch',
          ].includes(error)
        ) {
          return sendError(
            reply,
            400,
            'Bad Request',
            error.replace(/_/g, ' '),
            'INVALID_REQUEST',
            details
          );
        }
        return sendError(
          reply,
          500,
          'Internal Server Error',
          'Failed to confirm card session',
          'INTERNAL_ERROR',
          details
        );
      }

      await resolvePurchaseTrackingPayload(
        confirmResult.orderId,
        confirmResult.orderStatus,
        request
      );

      return SuccessResponses.ok(reply, {
        order_id: confirmResult.orderId,
        session_id: confirmResult.sessionId,
        order_status: confirmResult.orderStatus,
        fulfilled: confirmResult.fulfilled,
        payment_provider: 'paypal',
      });
    } catch (error) {
      Logger.error('Card session confirmation failed:', error);
      return ErrorResponses.internalError(
        reply,
        'Failed to confirm card session'
      );
    }
  };

  for (const cardConfirmPath of [
    '/paypal/confirm',
    '/card/confirm',
    '/stripe/confirm',
  ]) {
    fastify.post(
      cardConfirmPath,
      {
        preHandler: [optionalAuthPreHandler, paymentRateLimit],
        schema: {
          body: {
            type: 'object',
            required: ['order_id', 'session_id'],
            properties: {
              order_id: { type: 'string' },
              session_id: { type: 'string' },
            },
          },
        },
      },
      cardConfirmHandler
    );
  }

  fastify.post(
    '/nowpayments/invoice',
    {
      preHandler: [optionalAuthPreHandler, paymentRateLimit],
      schema: {
        body: {
          type: 'object',
          properties: {
            checkout_session_key: { type: 'string' },
            order_id: { type: 'string' },
            pay_currency: { type: 'string' },
            force_new_invoice: { type: 'boolean' },
            success_url: { type: 'string' },
            cancel_url: { type: 'string' },
            initiate_checkout_event_id: { type: 'string' },
            add_payment_info_event_id: { type: 'string' },
            legal_consent: {
              type: 'object',
              properties: {
                immediate_fulfillment_consent: { type: 'boolean' },
                terms_policy_consent: { type: 'boolean' },
                consent_timestamp: { type: 'string' },
                checkout_session_key_snapshot: { type: 'string' },
                consent_source: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validation = validateCheckoutNowPaymentsInvoiceInput(
          request.body
        );
        if (!validation.success) {
          return sendError(
            reply,
            400,
            'Invalid Input',
            validation.error,
            'INVALID_INPUT',
            validation.details
          );
        }

        const {
          checkout_session_key,
          order_id,
          pay_currency,
          force_new_invoice,
          success_url,
          cancel_url,
          add_payment_info_event_id,
          legal_consent,
        } = validation.data;

        if (!checkout_session_key && !order_id) {
          return ErrorResponses.badRequest(
            reply,
            'checkout_session_key or order_id is required'
          );
        }

        let orderId: string | null = order_id ?? null;
        if (checkout_session_key) {
          const order =
            await orderService.getOrderByCheckoutSessionKey(
              checkout_session_key
            );
          if (!order) {
            return ErrorResponses.notFound(reply, 'Checkout session not found');
          }
          orderId = order.id;
          if (order_id && order_id !== order.id) {
            return ErrorResponses.badRequest(
              reply,
              'Checkout session mismatch'
            );
          }
        } else if (orderId) {
          const userId = request.user?.userId;
          if (!userId) {
            return ErrorResponses.unauthorized(
              reply,
              'Authentication required'
            );
          }
          const order = await orderService.getOrderById(orderId);
          if (!order || order.user_id !== userId) {
            return ErrorResponses.notFound(reply, 'Order not found');
          }
        }

        if (!orderId) {
          return ErrorResponses.badRequest(reply, 'Order not found');
        }

        if (!hasRequiredLegalConsent(legal_consent)) {
          return ErrorResponses.badRequest(
            reply,
            'Digital fulfillment consent and policy acceptance are required'
          );
        }

        const consentSaved = await persistLegalConsentEvidence({
          orderId,
          legalConsent: legal_consent,
          request,
          checkoutSessionKey: checkout_session_key ?? null,
          channel: 'crypto',
        });
        if (!consentSaved) {
          return ErrorResponses.internalError(
            reply,
            'Failed to record checkout consent evidence'
          );
        }

        const invoiceResult =
          await paymentService.createNowPaymentsOrderInvoice({
            orderId,
            payCurrency: pay_currency ?? null,
            forceNewInvoice: force_new_invoice === true,
            successUrl: success_url ?? null,
            cancelUrl: cancel_url ?? null,
          });

        if (!invoiceResult.success) {
          const error = invoiceResult.error || 'invoice_failed';
          if (
            [
              'order_not_found',
              'order_not_pending',
              'payment_provider_mismatch',
              'order_missing_items',
              'own_account_credentials_required',
              'invalid_currency',
              'amount_invalid',
              'currency_unsupported',
              'below_nowpayments_minimum',
            ].includes(error)
          ) {
            return ErrorResponses.badRequest(reply, error.replace(/_/g, ' '));
          }
          return ErrorResponses.internalError(
            reply,
            'Failed to create invoice'
          );
        }

        const orderForTracking = await orderService.getOrderWithItems(
          invoiceResult.orderId
        );
        if (orderForTracking) {
          const properties = buildOrderTikTokProperties(orderForTracking);
          const trackingUserId =
            orderForTracking.user_id || request.user?.userId || null;
          if (trackingUserId) {
            const context = buildTikTokRequestContext(request);
            void tiktokEventsService.trackAddPaymentInfo({
              userId: trackingUserId,
              email:
                request.user?.email ?? orderForTracking.contact_email ?? null,
              eventId: resolveEventId(
                add_payment_info_event_id,
                `order_${invoiceResult.orderId}_add_payment_info_crypto`
              ),
              properties: {
                ...properties,
                payment_type: 'crypto',
              },
              context,
            });
          }
          trackMetaAddPaymentInfo({
            request,
            order: orderForTracking,
            addPaymentInfoEventId: add_payment_info_event_id,
            paymentType: 'crypto',
          });
        }

        return SuccessResponses.ok(reply, {
          order_id: invoiceResult.orderId,
          invoice_id: invoiceResult.invoiceId,
          invoice_url: invoiceResult.invoiceUrl,
          pay_address: invoiceResult.payAddress ?? null,
          pay_amount: invoiceResult.payAmount ?? null,
          pay_currency: invoiceResult.payCurrency ?? null,
          status: invoiceResult.status ?? null,
        });
      } catch (error) {
        Logger.error('NOWPayments invoice creation failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to create invoice');
      }
    }
  );

  fastify.post(
    '/nowpayments/minimum',
    {
      preHandler: [optionalAuthPreHandler, paymentQuoteRateLimit],
      schema: {
        body: {
          type: 'object',
          required: ['pay_currency'],
          properties: {
            checkout_session_key: { type: 'string' },
            order_id: { type: 'string' },
            pay_currency: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validation = validateCheckoutNowPaymentsMinimumInput(
          request.body
        );
        if (!validation.success) {
          return sendError(
            reply,
            400,
            'Invalid Input',
            validation.error,
            'INVALID_INPUT',
            validation.details
          );
        }

        const { checkout_session_key, order_id, pay_currency } =
          validation.data;
        if (!checkout_session_key && !order_id) {
          return ErrorResponses.badRequest(
            reply,
            'checkout_session_key or order_id is required'
          );
        }

        let orderId: string | null = order_id ?? null;
        if (checkout_session_key) {
          const order =
            await orderService.getOrderByCheckoutSessionKey(
              checkout_session_key
            );
          if (!order) {
            return ErrorResponses.notFound(reply, 'Checkout session not found');
          }
          orderId = order.id;
          if (order_id && order_id !== order.id) {
            return ErrorResponses.badRequest(
              reply,
              'Checkout session mismatch'
            );
          }
        } else if (orderId) {
          const userId = request.user?.userId;
          if (!userId) {
            return ErrorResponses.unauthorized(
              reply,
              'Authentication required'
            );
          }
          const order = await orderService.getOrderById(orderId);
          if (!order || order.user_id !== userId) {
            return ErrorResponses.notFound(reply, 'Order not found');
          }
        }

        if (!orderId) {
          return ErrorResponses.badRequest(reply, 'Order not found');
        }

        const minimumResult = await paymentService.getNowPaymentsOrderMinimum({
          orderId,
          payCurrency: pay_currency,
        });

        if (!minimumResult.success) {
          const error = minimumResult.error || 'minimum_amount_unavailable';
          if (
            [
              'order_not_found',
              'order_not_pending',
              'amount_invalid',
              'invalid_currency',
              'currency_unsupported',
              'minimum_amount_unavailable',
            ].includes(error)
          ) {
            return ErrorResponses.badRequest(reply, error.replace(/_/g, ' '));
          }
          return ErrorResponses.internalError(
            reply,
            'Failed to resolve minimum amount'
          );
        }

        return SuccessResponses.ok(reply, {
          order_id: minimumResult.orderId,
          pay_currency: minimumResult.payCurrency,
          price_currency: minimumResult.priceCurrency,
          order_total_amount: minimumResult.orderTotalAmount,
          min_price_amount: minimumResult.minPriceAmount,
          meets_minimum: minimumResult.meetsMinimum,
          shortfall_amount: minimumResult.shortfallAmount,
          min_fiat_equivalent: minimumResult.minFiatEquivalent ?? null,
        });
      } catch (error) {
        Logger.error('NOWPayments minimum lookup failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to resolve minimum amount'
        );
      }
    }
  );

  fastify.post(
    '/credits/complete',
    {
      preHandler: [authPreHandler, paymentRateLimit],
      schema: {
        body: {
          type: 'object',
          properties: {
            checkout_session_key: { type: 'string' },
            order_id: { type: 'string' },
            initiate_checkout_event_id: { type: 'string' },
            add_payment_info_event_id: { type: 'string' },
            purchase_event_id: { type: 'string' },
            legal_consent: {
              type: 'object',
              properties: {
                immediate_fulfillment_consent: { type: 'boolean' },
                terms_policy_consent: { type: 'boolean' },
                consent_timestamp: { type: 'string' },
                checkout_session_key_snapshot: { type: 'string' },
                consent_source: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validation = validateCheckoutCreditsCompleteInput(request.body);
        if (!validation.success) {
          return sendError(
            reply,
            400,
            'Invalid Input',
            validation.error,
            'INVALID_INPUT',
            validation.details
          );
        }

        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        const {
          checkout_session_key,
          order_id,
          add_payment_info_event_id,
          purchase_event_id,
          legal_consent,
        } = validation.data;
        if (!checkout_session_key && !order_id) {
          return ErrorResponses.badRequest(
            reply,
            'checkout_session_key or order_id is required'
          );
        }

        let orderId: string | null = order_id ?? null;
        if (checkout_session_key) {
          const order =
            await orderService.getOrderByCheckoutSessionKey(
              checkout_session_key
            );
          if (!order) {
            return ErrorResponses.notFound(reply, 'Checkout session not found');
          }
          orderId = order.id;
          if (order_id && order_id !== order.id) {
            return ErrorResponses.badRequest(
              reply,
              'Checkout session mismatch'
            );
          }
        } else if (orderId) {
          const order = await orderService.getOrderById(orderId);
          if (!order || order.user_id !== userId) {
            return ErrorResponses.notFound(reply, 'Order not found');
          }
        }

        if (!orderId) {
          return ErrorResponses.badRequest(reply, 'Order not found');
        }

        if (!hasRequiredLegalConsent(legal_consent)) {
          return ErrorResponses.badRequest(
            reply,
            'Digital fulfillment consent and policy acceptance are required'
          );
        }

        const consentSaved = await persistLegalConsentEvidence({
          orderId,
          legalConsent: legal_consent,
          request,
          checkoutSessionKey: checkout_session_key ?? null,
          channel: 'credits',
        });
        if (!consentSaved) {
          return ErrorResponses.internalError(
            reply,
            'Failed to record checkout consent evidence'
          );
        }

        const orderForTracking = await orderService.getOrderWithItems(orderId);
        if (orderForTracking) {
          const properties = buildOrderTikTokProperties(orderForTracking);
          const trackingUserId = orderForTracking.user_id || userId;
          const context = buildTikTokRequestContext(request);
          void tiktokEventsService.trackAddPaymentInfo({
            userId: trackingUserId,
            email:
              request.user?.email ?? orderForTracking.contact_email ?? null,
            eventId: resolveEventId(
              add_payment_info_event_id,
              `order_${orderId}_add_payment_info_credits`
            ),
            properties: {
              ...properties,
              payment_type: 'credits',
            },
            context,
          });
        }

        const creditsResult =
          await paymentService.completeCheckoutOrderWithCredits({
            orderId,
            userId,
          });

        if (!creditsResult.success) {
          const error = creditsResult.error;
          if (error === 'order_not_found') {
            return ErrorResponses.notFound(reply, 'Order not found');
          }
          if (error === 'order_forbidden') {
            return ErrorResponses.forbidden(reply, 'Access denied');
          }
          if (error === 'insufficient_credits') {
            return sendError(
              reply,
              402,
              'Insufficient Credits',
              creditsResult.detail || 'Insufficient credits',
              'INSUFFICIENT_CREDITS'
            );
          }
          if (
            [
              'order_not_pending',
              'payment_provider_mismatch',
              'order_missing_items',
              'own_account_credentials_required',
              'invalid_currency',
              'amount_invalid',
              'order_item_missing_variant',
              'purchase_not_allowed',
              'credit_payment_failed',
              'order_update_failed',
            ].includes(error)
          ) {
            if (error === 'purchase_not_allowed') {
              const detail = creditsResult.detail || 'Purchase not allowed';
              const itemLabel = creditsResult.itemLabel;
              const reason = itemLabel ? `${itemLabel}: ${detail}` : detail;
              return ErrorResponses.badRequest(reply, reason);
            }
            if (
              error === 'own_account_credentials_required' &&
              creditsResult.itemLabel
            ) {
              return ErrorResponses.badRequest(
                reply,
                `${error.replace(/_/g, ' ')}: ${creditsResult.itemLabel}`
              );
            }
            return ErrorResponses.badRequest(reply, error.replace(/_/g, ' '));
          }
          return ErrorResponses.internalError(
            reply,
            'Failed to complete credits checkout'
          );
        }

        if (orderForTracking) {
          trackMetaAddPaymentInfo({
            request,
            order: orderForTracking,
            addPaymentInfoEventId: add_payment_info_event_id,
            paymentType: 'credits',
          });
        }

        if (orderForTracking) {
          const properties = buildOrderTikTokProperties(orderForTracking);
          const trackingUserId = orderForTracking.user_id || userId;
          void tiktokEventsService.trackPurchase({
            userId: trackingUserId,
            email:
              request.user?.email ?? orderForTracking.contact_email ?? null,
            eventId: resolveEventId(
              purchase_event_id,
              `order_${creditsResult.orderId}_purchase`
            ),
            properties,
            context: buildTikTokRequestContext(request),
          });
        }

        return SuccessResponses.ok(reply, {
          order_id: creditsResult.orderId,
          payment_method: 'credits',
          transaction_id: creditsResult.transactionId,
          amount_debited: creditsResult.amountDebited,
          balance_after: creditsResult.balanceAfter,
          fulfilled_subscriptions: creditsResult.fulfilledSubscriptions,
        });
      } catch (error) {
        Logger.error('Credits checkout completion failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to complete credits checkout'
        );
      }
    }
  );

  fastify.get(
    '/qa/config',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      if (!env.QA_PAYMENT_ENABLED || env.NODE_ENV === 'production') {
        return ErrorResponses.notFound(reply, 'Not found');
      }

      return SuccessResponses.ok(reply, { enabled: true });
    }
  );

  fastify.post(
    '/qa/complete',
    {
      preHandler: [optionalAuthPreHandler, paymentRateLimit],
      schema: {
        body: {
          type: 'object',
          properties: {
            checkout_session_key: { type: 'string' },
            order_id: { type: 'string' },
            legal_consent: {
              type: 'object',
              properties: {
                immediate_fulfillment_consent: { type: 'boolean' },
                terms_policy_consent: { type: 'boolean' },
                consent_timestamp: { type: 'string' },
                checkout_session_key_snapshot: { type: 'string' },
                consent_source: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // This route is intentionally unavailable outside a local QA run.
      if (!env.QA_PAYMENT_ENABLED || env.NODE_ENV === 'production') {
        return ErrorResponses.notFound(reply, 'Not found');
      }

      try {
        const validation = validateCheckoutQaCompleteInput(request.body);
        if (!validation.success) {
          return sendError(
            reply,
            400,
            'Invalid Input',
            validation.error,
            'INVALID_INPUT',
            validation.details
          );
        }

        const { checkout_session_key, order_id, legal_consent } =
          validation.data;
        const orderId = await resolveCheckoutOrderId({
          request,
          reply,
          checkoutSessionKey: checkout_session_key ?? null,
          orderId: order_id ?? null,
        });
        if (!orderId) {
          return reply;
        }

        if (!hasRequiredLegalConsent(legal_consent)) {
          return ErrorResponses.badRequest(
            reply,
            'Digital fulfillment consent and policy acceptance are required'
          );
        }

        const consentSaved = await persistLegalConsentEvidence({
          orderId,
          legalConsent: legal_consent,
          request,
          checkoutSessionKey: checkout_session_key ?? null,
          channel: 'qa',
        });
        if (!consentSaved) {
          return ErrorResponses.internalError(
            reply,
            'Failed to record checkout consent evidence'
          );
        }

        const order = await orderService.getOrderWithItems(orderId);
        if (!order?.user_id) {
          return ErrorResponses.notFound(reply, 'Order not found');
        }

        const result = await paymentService.confirmManualOrderPayment({
          orderId,
          adminUserId: order.user_id,
          note: 'QA checkout payment (local test environment)',
          source: 'qa_checkout',
          audit: {
            ipAddress: getRequestIp(request),
            userAgent:
              typeof request.headers['user-agent'] === 'string'
                ? request.headers['user-agent']
                : null,
            requestId: request.id,
          },
        });

        if (!result.success) {
          if (result.status === 'not_found') {
            return ErrorResponses.notFound(reply, 'Order not found');
          }
          if (result.status === 'invalid_state') {
            return reply.status(409).send({
              error: 'Conflict',
              code: 'ORDER_NOT_PENDING_PAYMENT',
              message:
                'Only pending payment orders can be completed by QA Payment',
              current_status: result.orderStatus ?? null,
            });
          }
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to complete QA payment'
          );
        }

        return SuccessResponses.ok(reply, {
          order_id: orderId,
          payment_method: 'qa_payment',
          status: result.orderStatus,
          subscriptions_created: result.subscriptionsCreated ?? 0,
          open_tasks: result.tasksOpen ?? 0,
        });
      } catch (error) {
        Logger.error('QA checkout payment completion failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to complete QA payment'
        );
      }
    }
  );

  fastify.post(
    '/antom/options',
    {
      preHandler: [optionalAuthPreHandler, paymentQuoteRateLimit],
      schema: {
        body: {
          type: 'object',
          properties: {
            checkout_session_key: { type: 'string' },
            order_id: { type: 'string' },
            residence_id: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validation = validateCheckoutAntomOptionsInput(request.body);
        if (!validation.success) {
          return sendError(
            reply,
            400,
            'Invalid Input',
            validation.error,
            'INVALID_INPUT',
            validation.details
          );
        }

        const orderId = await resolveCheckoutOrderId({
          request,
          reply,
          checkoutSessionKey: validation.data.checkout_session_key ?? null,
          orderId: validation.data.order_id ?? null,
        });
        if (!orderId) {
          return reply;
        }

        const optionsResult = await paymentService.getAntomCheckoutOptions({
          orderId,
          residenceId: validation.data.residence_id ?? null,
        });

        if (!optionsResult.success) {
          const error = optionsResult.error || 'antom_options_failed';
          if (error === 'order_not_found') {
            return ErrorResponses.notFound(reply, 'Order not found');
          }
          if (
            [
              'order_not_pending',
              'payment_provider_mismatch',
              'order_missing_items',
              'invalid_settlement',
            ].includes(error)
          ) {
            return ErrorResponses.badRequest(reply, error.replace(/_/g, ' '));
          }
          if (
            [
              'payment_provider_unavailable',
              'payment_provider_rate_limited',
              'payment_provider_misconfigured',
            ].includes(error)
          ) {
            return ErrorResponses.serviceUnavailable(
              reply,
              'Card payment methods are temporarily unavailable. Please try another method.'
            );
          }
          return ErrorResponses.internalError(
            reply,
            'Failed to load card payment methods'
          );
        }

        return SuccessResponses.ok(reply, {
          order_id: optionsResult.orderId,
          order_status: optionsResult.orderStatus,
          enabled: optionsResult.enabled,
          display_currency: optionsResult.displayCurrency,
          display_total_cents: optionsResult.displayTotalCents,
          selected_residence_id: optionsResult.selectedResidenceId,
          residences: optionsResult.residences.map(residence => ({
            id: residence.id,
            label: residence.label,
            rate_bps: residence.rateBps,
          })),
          options: optionsResult.options.map(serializeAntomOptionQuote),
        });
      } catch (error) {
        Logger.error('Antom options lookup failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to load card payment methods'
        );
      }
    }
  );

  fastify.post(
    '/antom/session',
    {
      preHandler: [optionalAuthPreHandler, paymentRateLimit],
      schema: {
        body: {
          type: 'object',
          required: ['option_id'],
          properties: {
            checkout_session_key: { type: 'string' },
            order_id: { type: 'string' },
            option_id: { type: 'string' },
            residence_id: { type: 'string' },
            initiate_checkout_event_id: { type: 'string' },
            add_payment_info_event_id: { type: 'string' },
            legal_consent: {
              type: 'object',
              properties: {
                immediate_fulfillment_consent: { type: 'boolean' },
                terms_policy_consent: { type: 'boolean' },
                consent_timestamp: { type: 'string' },
                checkout_session_key_snapshot: { type: 'string' },
                consent_source: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validation = validateCheckoutAntomSessionInput(request.body);
        if (!validation.success) {
          return sendError(
            reply,
            400,
            'Invalid Input',
            validation.error,
            'INVALID_INPUT',
            validation.details
          );
        }

        const {
          checkout_session_key,
          order_id,
          option_id,
          residence_id,
          add_payment_info_event_id,
          legal_consent,
        } = validation.data;

        const orderId = await resolveCheckoutOrderId({
          request,
          reply,
          checkoutSessionKey: checkout_session_key ?? null,
          orderId: order_id ?? null,
        });
        if (!orderId) {
          return reply;
        }

        if (!hasRequiredLegalConsent(legal_consent)) {
          return ErrorResponses.badRequest(
            reply,
            'Digital fulfillment consent and policy acceptance are required'
          );
        }

        const consentSaved = await persistLegalConsentEvidence({
          orderId,
          legalConsent: legal_consent,
          request,
          checkoutSessionKey: checkout_session_key ?? null,
          channel: 'card',
        });
        if (!consentSaved) {
          return ErrorResponses.internalError(
            reply,
            'Failed to record checkout consent evidence'
          );
        }

        const sessionResult = await paymentService.createAntomCheckoutSession({
          orderId,
          optionId: option_id,
          residenceId: residence_id ?? null,
          returnBaseUrl: resolveCheckoutRequestBaseUrl(request),
          buyerEmail: request.user?.email ?? null,
        });

        if (!sessionResult.success) {
          const error = sessionResult.error || 'antom_session_failed';
          if (error === 'order_not_found') {
            return ErrorResponses.notFound(reply, 'Order not found');
          }
          if (
            [
              'order_not_pending',
              'payment_provider_mismatch',
              'order_missing_items',
              'own_account_credentials_required',
              'invalid_payment_method',
              'invalid_settlement',
              'missing_app_base_url',
              'payment_provider_declined',
            ].includes(error)
          ) {
            return ErrorResponses.badRequest(reply, error.replace(/_/g, ' '));
          }
          if (
            [
              'payment_provider_unavailable',
              'payment_provider_rate_limited',
              'payment_provider_misconfigured',
            ].includes(error)
          ) {
            return ErrorResponses.serviceUnavailable(
              reply,
              'Card payment is temporarily unavailable. Please try another method.'
            );
          }
          return ErrorResponses.internalError(reply, 'Failed to start payment');
        }

        const orderForTracking = await orderService.getOrderWithItems(
          sessionResult.orderId
        );
        if (orderForTracking) {
          const properties = buildOrderTikTokProperties(orderForTracking);
          const trackingUserId =
            orderForTracking.user_id || request.user?.userId || null;
          if (trackingUserId) {
            void tiktokEventsService.trackAddPaymentInfo({
              userId: trackingUserId,
              email:
                request.user?.email ?? orderForTracking.contact_email ?? null,
              eventId: resolveEventId(
                add_payment_info_event_id,
                `order_${sessionResult.orderId}_add_payment_info_antom`
              ),
              properties: {
                ...properties,
                payment_type: 'antom',
                payment_provider: 'antom',
                payment_method_title: sessionResult.optionQuote.title,
                payment_method_type: sessionResult.optionQuote.id,
              },
              context: buildTikTokRequestContext(request),
            });
          }
          trackMetaAddPaymentInfo({
            request,
            order: orderForTracking,
            addPaymentInfoEventId: add_payment_info_event_id,
            paymentType: 'antom',
          });
        }

        return SuccessResponses.ok(reply, {
          order_id: sessionResult.orderId,
          session_id: sessionResult.sessionId,
          session_url: sessionResult.sessionUrl,
          payment_id: sessionResult.paymentId,
          payment_provider: sessionResult.paymentProvider,
          option_quote: serializeAntomOptionQuote(sessionResult.optionQuote),
        });
      } catch (error) {
        Logger.error('Antom session creation failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to start payment');
      }
    }
  );

  fastify.post(
    '/antom/status',
    {
      preHandler: [optionalAuthPreHandler, paymentRefreshRateLimit],
      schema: {
        body: {
          type: 'object',
          properties: {
            checkout_session_key: { type: ['string', 'null'] },
            order_id: { type: ['string', 'null'] },
            payment_request_id: { type: ['string', 'null'] },
            payment_id: { type: ['string', 'null'] },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validation = validateCheckoutAntomStatusInput(request.body);
        if (!validation.success) {
          return sendError(
            reply,
            400,
            'Invalid Input',
            validation.error,
            'INVALID_INPUT',
            validation.details
          );
        }

        const orderId = await resolveAntomStatusOrderId({
          request,
          reply,
          checkoutSessionKey: validation.data.checkout_session_key ?? null,
          orderId: validation.data.order_id ?? null,
          paymentRequestId: validation.data.payment_request_id ?? null,
        });
        if (!orderId) {
          return reply;
        }

        const statusResult = await paymentService.getAntomCheckoutStatus({
          orderId,
          paymentRequestId: validation.data.payment_request_id ?? null,
          paymentId: validation.data.payment_id ?? null,
        });
        if (!statusResult.success) {
          const error = statusResult.error || 'antom_status_failed';
          if (error === 'order_not_found') {
            return ErrorResponses.notFound(reply, 'Order not found');
          }
          return ErrorResponses.internalError(
            reply,
            'Failed to load payment status'
          );
        }

        const purchaseTracking = await resolvePurchaseTrackingPayload(
          statusResult.orderId,
          statusResult.orderStatus,
          request
        );

        return SuccessResponses.ok(reply, {
          order_id: statusResult.orderId,
          order_created_at: serializeOptionalIsoDate(
            (statusResult as { orderCreatedAt?: Date | string | null })
              .orderCreatedAt
          ),
          order_status: statusResult.orderStatus,
          payment_status: statusResult.paymentStatus,
          provider_status: statusResult.providerStatus,
          payment_request_id: statusResult.paymentRequestId,
          antom_payment_id: statusResult.antomPaymentId,
          method_title: statusResult.methodTitle,
          processing_currency: statusResult.processingCurrency,
          processing_subtotal_cents: statusResult.processingSubtotalCents,
          processing_fee_cents: statusResult.processingFeeCents,
          processing_tax_cents: statusResult.processingTaxCents,
          processing_total_cents: statusResult.processingTotalCents,
          tax_residence_id: statusResult.taxResidenceId,
          tax_residence_label: statusResult.taxResidenceLabel,
          can_retry: statusResult.canRetry,
          is_card_decline: statusResult.isCardDecline,
          ...(purchaseTracking ? { purchase_tracking: purchaseTracking } : {}),
        });
      } catch (error) {
        Logger.error('Antom status lookup failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to load payment status'
        );
      }
    }
  );

  fastify.post(
    '/payop/options',
    {
      preHandler: [optionalAuthPreHandler, paymentQuoteRateLimit],
      schema: {
        body: {
          type: 'object',
          properties: {
            checkout_session_key: { type: 'string' },
            order_id: { type: 'string' },
            country_code: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validation = validateCheckoutPayopOptionsInput(request.body);
        if (!validation.success) {
          return sendError(
            reply,
            400,
            'Invalid Input',
            validation.error,
            'INVALID_INPUT',
            validation.details
          );
        }

        const orderId = await resolveCheckoutOrderId({
          request,
          reply,
          checkoutSessionKey: validation.data.checkout_session_key ?? null,
          orderId: validation.data.order_id ?? null,
        });
        if (!orderId) {
          return reply;
        }

        const detectedCountry = resolveCountryFromHeaders(
          request.headers as Record<string, string | string[] | undefined>
        );
        const optionsResult = await paymentService.getPayopCheckoutOptions({
          orderId,
          selectedCountry: validation.data.country_code ?? null,
          detectedCountry,
        });

        if (!optionsResult.success) {
          const error = optionsResult.error || 'payop_options_failed';
          if (error === 'order_not_found') {
            return ErrorResponses.notFound(reply, 'Order not found');
          }
          if (
            [
              'order_not_pending',
              'payment_provider_mismatch',
              'order_missing_items',
            ].includes(error)
          ) {
            return ErrorResponses.badRequest(reply, error.replace(/_/g, ' '));
          }
          if (
            [
              'payment_provider_unavailable',
              'payment_provider_rate_limited',
              'payment_provider_misconfigured',
            ].includes(error)
          ) {
            return ErrorResponses.serviceUnavailable(
              reply,
              'Payment methods are temporarily unavailable. Please try again later.'
            );
          }
          return ErrorResponses.internalError(
            reply,
            'Failed to load payment methods'
          );
        }

        return SuccessResponses.ok(reply, {
          order_id: optionsResult.orderId,
          order_status: optionsResult.orderStatus,
          display_currency: optionsResult.displayCurrency,
          display_total_cents: optionsResult.displayTotalCents,
          detected_country: optionsResult.detectedCountry,
          selected_country: optionsResult.selectedCountry,
          country_options: optionsResult.countryOptions,
          selected_method_id: optionsResult.selectedMethodId,
          methods: optionsResult.methods.map(serializePayopMethodQuote),
        });
      } catch (error) {
        Logger.error('Payop options lookup failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to load payment methods'
        );
      }
    }
  );

  fastify.post(
    '/payop/session',
    {
      preHandler: [optionalAuthPreHandler, paymentRateLimit],
      schema: {
        body: {
          type: 'object',
          required: ['method_id'],
          properties: {
            checkout_session_key: { type: 'string' },
            order_id: { type: 'string' },
            method_id: { type: 'number' },
            country_code: { type: 'string' },
            initiate_checkout_event_id: { type: 'string' },
            add_payment_info_event_id: { type: 'string' },
            legal_consent: {
              type: 'object',
              properties: {
                immediate_fulfillment_consent: { type: 'boolean' },
                terms_policy_consent: { type: 'boolean' },
                consent_timestamp: { type: 'string' },
                checkout_session_key_snapshot: { type: 'string' },
                consent_source: { type: 'string' },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validation = validateCheckoutPayopSessionInput(request.body);
        if (!validation.success) {
          return sendError(
            reply,
            400,
            'Invalid Input',
            validation.error,
            'INVALID_INPUT',
            validation.details
          );
        }

        const {
          checkout_session_key,
          order_id,
          method_id,
          country_code,
          add_payment_info_event_id,
          legal_consent,
        } = validation.data;

        const orderId = await resolveCheckoutOrderId({
          request,
          reply,
          checkoutSessionKey: checkout_session_key ?? null,
          orderId: order_id ?? null,
        });
        if (!orderId) {
          return reply;
        }

        if (!hasRequiredLegalConsent(legal_consent)) {
          return ErrorResponses.badRequest(
            reply,
            'Digital fulfillment consent and policy acceptance are required'
          );
        }

        const consentSaved = await persistLegalConsentEvidence({
          orderId,
          legalConsent: legal_consent,
          request,
          checkoutSessionKey: checkout_session_key ?? null,
          channel: 'card',
        });
        if (!consentSaved) {
          return ErrorResponses.internalError(
            reply,
            'Failed to record checkout consent evidence'
          );
        }

        const detectedCountry = resolveCountryFromHeaders(
          request.headers as Record<string, string | string[] | undefined>
        );
        const buyerName = [
          request.user?.displayName,
          [request.user?.firstName, request.user?.lastName]
            .filter((value): value is string => Boolean(value?.trim()))
            .join(' '),
        ]
          .map(value => (typeof value === 'string' ? value.trim() : ''))
          .find(value => value.length > 0);

        const sessionResult = await paymentService.createPayopCheckoutSession({
          orderId,
          methodId: method_id,
          selectedCountry: country_code ?? null,
          detectedCountry,
          returnBaseUrl: resolveCheckoutRequestBaseUrl(request),
          buyerEmail: request.user?.email ?? null,
          buyerName: buyerName ?? null,
        });

        if (!sessionResult.success) {
          const error = sessionResult.error || 'payop_session_failed';
          if (error === 'order_not_found') {
            return ErrorResponses.notFound(reply, 'Order not found');
          }
          if (
            [
              'order_not_pending',
              'payment_provider_mismatch',
              'order_missing_items',
              'own_account_credentials_required',
              'invalid_payment_method',
              'missing_app_base_url',
              'payer_email_required',
            ].includes(error)
          ) {
            return ErrorResponses.badRequest(reply, error.replace(/_/g, ' '));
          }
          if (
            [
              'payment_provider_unavailable',
              'payment_provider_rate_limited',
              'payment_provider_misconfigured',
            ].includes(error)
          ) {
            return ErrorResponses.serviceUnavailable(
              reply,
              'Payment is temporarily unavailable. Please try again later.'
            );
          }
          return ErrorResponses.internalError(reply, 'Failed to start payment');
        }

        const orderForTracking = await orderService.getOrderWithItems(
          sessionResult.orderId
        );
        if (orderForTracking) {
          const properties = buildOrderTikTokProperties(orderForTracking);
          const trackingUserId =
            orderForTracking.user_id || request.user?.userId || null;
          if (trackingUserId) {
            void tiktokEventsService.trackAddPaymentInfo({
              userId: trackingUserId,
              email:
                request.user?.email ?? orderForTracking.contact_email ?? null,
              eventId: resolveEventId(
                add_payment_info_event_id,
                `order_${sessionResult.orderId}_add_payment_info_payop`
              ),
              properties: {
                ...properties,
                payment_type: 'payop',
                payment_provider: 'payop',
                payment_method_title: sessionResult.methodQuote.title,
                payment_method_type: sessionResult.methodQuote.type,
              },
              context: buildTikTokRequestContext(request),
            });
          }
          trackMetaAddPaymentInfo({
            request,
            order: orderForTracking,
            addPaymentInfoEventId: add_payment_info_event_id,
            paymentType: 'payop',
          });
        }

        return SuccessResponses.ok(reply, {
          order_id: sessionResult.orderId,
          session_id: sessionResult.sessionId,
          session_url: sessionResult.sessionUrl,
          payment_id: sessionResult.paymentId,
          payment_provider: sessionResult.paymentProvider,
          method_quote: serializePayopMethodQuote(sessionResult.methodQuote),
        });
      } catch (error) {
        Logger.error('Payop session creation failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to start payment');
      }
    }
  );

  fastify.post(
    '/payop/status',
    {
      preHandler: [optionalAuthPreHandler, paymentRefreshRateLimit],
      schema: {
        body: {
          type: 'object',
          properties: {
            checkout_session_key: { type: 'string' },
            order_id: { type: 'string' },
            invoice_id: { type: 'string' },
            txid: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validation = validateCheckoutPayopStatusInput(request.body);
        if (!validation.success) {
          return sendError(
            reply,
            400,
            'Invalid Input',
            validation.error,
            'INVALID_INPUT',
            validation.details
          );
        }

        const orderId = await resolvePayopStatusOrderId({
          request,
          reply,
          checkoutSessionKey: validation.data.checkout_session_key ?? null,
          orderId: validation.data.order_id ?? null,
          invoiceId: validation.data.invoice_id ?? null,
        });
        if (!orderId) {
          return reply;
        }

        const statusResult = await paymentService.getPayopCheckoutStatus({
          orderId,
          invoiceId: validation.data.invoice_id ?? null,
          txid: validation.data.txid ?? null,
        });
        if (!statusResult.success) {
          const error = statusResult.error || 'payop_status_failed';
          if (error === 'order_not_found') {
            return ErrorResponses.notFound(reply, 'Order not found');
          }
          return ErrorResponses.internalError(
            reply,
            'Failed to load payment status'
          );
        }

        const purchaseTracking = await resolvePurchaseTrackingPayload(
          statusResult.orderId,
          statusResult.orderStatus,
          request
        );

        return SuccessResponses.ok(reply, {
          order_id: statusResult.orderId,
          order_status: statusResult.orderStatus,
          payment_status: statusResult.paymentStatus,
          provider_status: statusResult.providerStatus,
          invoice_id: statusResult.invoiceId,
          txid: statusResult.txid,
          method_title: statusResult.methodTitle,
          processing_currency: statusResult.processingCurrency,
          processing_subtotal_cents: statusResult.processingSubtotalCents,
          processing_fee_cents: statusResult.processingFeeCents,
          processing_total_cents: statusResult.processingTotalCents,
          can_retry: statusResult.canRetry,
          ...(purchaseTracking ? { purchase_tracking: purchaseTracking } : {}),
        });
      } catch (error) {
        Logger.error('Payop status lookup failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to load payment status'
        );
      }
    }
  );

  fastify.post(
    '/claim',
    {
      preHandler: [authPreHandler],
      schema: {
        body: {
          type: 'object',
          required: ['token'],
          properties: {
            token: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validation = validateGuestClaimInput(request.body);
        if (!validation.success) {
          return sendError(
            reply,
            400,
            'Invalid Input',
            validation.error,
            'INVALID_INPUT',
            validation.details
          );
        }

        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        const result = await guestCheckoutService.claimGuestIdentity({
          token: validation.data.token,
          userId,
        });

        if (!result.success) {
          const error = result.error || 'claim_failed';
          if (error === 'already_claimed') {
            return sendError(
              reply,
              409,
              'Order Already Claimed',
              'This order has already been claimed, or this claim link has expired.',
              'CLAIM_ALREADY_CLAIMED'
            );
          }
          if (error === 'claim_link_expired') {
            return sendError(
              reply,
              410,
              'Claim Link Expired',
              'This claim link has expired. Please contact support if you still need help accessing this order.',
              'CLAIM_LINK_EXPIRED'
            );
          }
          if (error === 'claim_email_mismatch') {
            return ErrorResponses.forbidden(
              reply,
              'Sign in with the email address used for this checkout'
            );
          }
          if (
            [
              'claim_link_unavailable',
              'claim_link_used',
              'guest_identity_not_found',
              'guest_user_not_found',
              'user_not_found',
            ].includes(error)
          ) {
            return sendError(
              reply,
              410,
              'Claim Link Unavailable',
              'This order has already been claimed, or this claim link has expired.',
              'CLAIM_LINK_UNAVAILABLE'
            );
          }
          return ErrorResponses.internalError(reply, 'Failed to claim guest');
        }

        return SuccessResponses.ok(reply, {
          guest_identity_id: result.data.guestIdentityId,
          reassigned: result.data.reassigned,
          already_claimed: result.data.alreadyClaimed,
        });
      } catch (error) {
        Logger.error('Guest claim failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to claim guest');
      }
    }
  );
}
