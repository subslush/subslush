import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  validateGuestIdentityInput,
  validateGuestDraftInput,
  validateGuestClaimInput,
  validateCheckoutStripeSessionInput,
  validateCheckoutNowPaymentsInvoiceInput,
  validateCheckoutNowPaymentsMinimumInput,
  validateCheckoutStripeConfirmInput,
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
import {
  paymentQuoteRateLimit,
  paymentRateLimit,
} from '../middleware/paymentMiddleware';
import {
  authPreHandler,
  optionalAuthPreHandler,
} from '../middleware/authMiddleware';
import type { OrderWithItems } from '../types/order';

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

export async function checkoutRoutes(fastify: FastifyInstance): Promise<void> {
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

  fastify.post(
    '/stripe/session',
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
            initiate_checkout_event_id: { type: 'string' },
            add_payment_info_event_id: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validation = validateCheckoutStripeSessionInput(request.body);
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
          add_payment_info_event_id,
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

        const sessionResult = await paymentService.createStripeCheckoutSession({
          orderId,
          successUrl: success_url ?? null,
          cancelUrl: cancel_url ?? null,
        });

        if (!sessionResult.success) {
          const error = sessionResult.error || 'stripe_session_failed';
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
              'Stripe provider misconfigured while creating checkout session'
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
            ].includes(error)
          ) {
            return ErrorResponses.badRequest(reply, error.replace(/_/g, ' '));
          }
          return ErrorResponses.internalError(
            reply,
            'Failed to create Stripe session'
          );
        }

        const orderForTracking = await orderService.getOrderWithItems(
          sessionResult.orderId
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
                `order_${sessionResult.orderId}_add_payment_info_stripe`
              ),
              properties: {
                ...properties,
                payment_type: 'card',
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
        });
      } catch (error) {
        Logger.error('Stripe session creation failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to create Stripe session'
        );
      }
    }
  );

  fastify.post(
    '/stripe/confirm',
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
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validation = validateCheckoutStripeConfirmInput(request.body);
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

        const confirmResult = await paymentService.confirmStripeCheckoutSession(
          {
            orderId: validation.data.order_id,
            sessionId: validation.data.session_id,
          }
        );

        if (!confirmResult.success) {
          const error = confirmResult.error || 'stripe_session_confirm_failed';
          if (
            [
              'checkout_session_mismatch',
              'payment_not_completed',
              'fulfillment_failed',
            ].includes(error)
          ) {
            return ErrorResponses.badRequest(reply, error.replace(/_/g, ' '));
          }
          return ErrorResponses.internalError(
            reply,
            'Failed to confirm Stripe session'
          );
        }

        return SuccessResponses.ok(reply, {
          order_id: confirmResult.orderId,
          session_id: confirmResult.sessionId,
          order_status: confirmResult.orderStatus,
          fulfilled: confirmResult.fulfilled,
        });
      } catch (error) {
        Logger.error('Stripe session confirmation failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to confirm Stripe session'
        );
      }
    }
  );

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
