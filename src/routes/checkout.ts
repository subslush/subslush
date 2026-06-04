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
  validateCheckoutNowPaymentsInvoiceInput,
  validateCheckoutNowPaymentsMinimumInput,
  validateCheckoutPayPalConfirmInput,
  validateCheckoutCreditsCompleteInput,
} from '../schemas/checkout';
import { guestCheckoutService } from '../services/guestCheckoutService';
import { paymentService } from '../services/paymentService';
import { orderService } from '../services/orderService';
import {
  buildTikTokRequestContext,
  tiktokEventsService,
} from '../services/tiktokEventsService';
import { ErrorResponses, SuccessResponses, sendError } from '../utils/response';
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

const centsToAmount = (value?: number | null): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number((value / 100).toFixed(2));
};

const resolveEventId = (
  candidate: string | null | undefined,
  fallback: string
): string => {
  const trimmed = typeof candidate === 'string' ? candidate.trim() : '';
  return trimmed || fallback;
};

const resolveOrderCurrency = (order: OrderWithItems): string => {
  const rawCurrency =
    order.display_currency ||
    order.currency ||
    order.items.find(item => item.currency)?.currency ||
    'USD';
  return rawCurrency.toUpperCase();
};

const resolveOrderValue = (order: OrderWithItems): number => {
  const totalCents =
    typeof order.display_total_cents === 'number'
      ? order.display_total_cents
      : typeof order.total_cents === 'number'
        ? order.total_cents
        : order.items.reduce(
            (sum, item) =>
              sum +
              (Number.isFinite(item.total_price_cents)
                ? item.total_price_cents
                : 0),
            0
          );
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

const serializePayopMethodQuote = (quote: PayopMethodQuote) => ({
  method_id: quote.methodId,
  title: quote.title,
  type: quote.type,
  form_type: quote.formType,
  logo_url: quote.logoUrl,
  supported_countries: quote.supportedCountries,
  supported_currencies: quote.supportedCurrencies,
  processing_currency: quote.processingCurrency,
  processing_subtotal_cents: quote.processingSubtotalCents,
  processing_fee_cents: quote.processingFeeCents,
  processing_total_cents: quote.processingTotalCents,
  converted_from_display_currency: quote.convertedFromDisplayCurrency,
  required_payer_fields: quote.requiredPayerFields,
  items: quote.items.map(item => ({
    order_item_id: item.orderItemId,
    label: item.label,
    total_cents: item.totalCents,
  })),
});

export async function checkoutRoutes(fastify: FastifyInstance): Promise<void> {
  const persistLegalConsentEvidence = async (params: {
    orderId: string;
    legalConsent: CheckoutLegalConsentPayload;
    request: FastifyRequest;
    checkoutSessionKey?: string | null;
    channel: 'card' | 'crypto' | 'credits';
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
                required: ['variant_id'],
                properties: {
                  variant_id: { type: 'string' },
                  term_months: { type: 'number' },
                  auto_renew: { type: 'boolean' },
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

        const draftResult = await guestCheckoutService.upsertDraftOrder(
          validation.data
        );

        if (!draftResult.success) {
          const error = draftResult.error || 'Failed to create draft order';
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

  const cardSessionHandler = async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
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
  ) => {
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

        const orderId = await resolveCheckoutOrderId({
          request,
          reply,
          checkoutSessionKey: validation.data.checkout_session_key ?? null,
          orderId: validation.data.order_id ?? null,
        });
        if (!orderId) {
          return reply;
        }

        const statusResult = await paymentService.getPayopCheckoutStatus({
          orderId,
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
          if (
            [
              'token_invalid_or_expired',
              'guest_identity_not_found',
              'guest_user_not_found',
              'already_claimed',
              'user_not_found',
            ].includes(error)
          ) {
            return ErrorResponses.badRequest(reply, error.replace(/_/g, ' '));
          }
          return ErrorResponses.internalError(reply, 'Failed to claim guest');
        }

        return SuccessResponses.ok(reply, {
          guest_identity_id: result.data.guestIdentityId,
          reassigned: result.data.reassigned,
        });
      } catch (error) {
        Logger.error('Guest claim failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to claim guest');
      }
    }
  );
}
