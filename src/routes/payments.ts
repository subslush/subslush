import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authPreHandler } from '../middleware/authMiddleware';
import { paymentService } from '../services/paymentService';
import { paymentMonitoringService } from '../services/paymentMonitoringService';
import { creditAllocationService } from '../services/creditAllocationService';
import { paymentFailureService } from '../services/paymentFailureService';
import { refundService } from '../services/refundService';
import { subscriptionService } from '../services/subscriptionService';
import { creditService } from '../services/creditService';
import { orderService } from '../services/orderService';
import { orderEntitlementService } from '../services/orderEntitlementService';
import { resolveVariantPricing } from '../services/variantPricingService';
import { resolvePricingLockContext } from '../services/pricingLockService';
import { couponService, normalizeCouponCode } from '../services/couponService';
import {
  buildTikTokProductProperties,
  buildTikTokRequestContext,
  tiktokEventsService,
} from '../services/tiktokEventsService';
import {
  SuccessResponses,
  ErrorResponses,
  sendError,
  HttpStatus,
} from '../utils/response';
import { Logger } from '../utils/logger';
import {
  NOWPaymentsError,
  nowpaymentsClient,
} from '../utils/nowpaymentsClient';
import { getDatabasePool } from '../config/database';
import { env } from '../config/environment';
import {
  normalizeUpgradeOptions,
  validateUpgradeOptions,
} from '../utils/upgradeOptions';
import {
  resolveCountryFromHeaders,
  resolvePreferredCurrency,
  type SupportedCurrency,
} from '../utils/currency';
import {
  computeFixedTermPricing,
  computeTermPricing,
} from '../utils/termPricing';
import {
  createPaymentRequestJsonSchema,
  minAmountRequestJsonSchema,
  paymentHistoryQueryJsonSchema,
  webhookPayloadJsonSchema,
} from '../schemas/payment';
import {
  paymentRateLimit,
  paymentQuoteRateLimit,
  paymentRefreshRateLimit,
  paymentRetryRateLimit,
  webhookRateLimit,
} from '../middleware/paymentMiddleware';
import {
  CreatePaymentRequest,
  PaymentHistoryQuery,
  WebhookPayload,
} from '../types/payment';

const isNowPaymentsFailure = (error: unknown): boolean =>
  error instanceof NOWPaymentsError ||
  (error instanceof Error && error.message.includes('NOWPayments'));

const resolveRequestCurrency = (
  request: FastifyRequest,
  bodyCurrency?: string | null
): SupportedCurrency => {
  const headerCurrency = request.headers['x-currency'];
  const cookieCurrency = request.cookies?.['preferred_currency'];
  const headerCountry = resolveCountryFromHeaders(
    request.headers as Record<string, string | string[] | undefined>
  );

  return resolvePreferredCurrency({
    queryCurrency: bodyCurrency || null,
    headerCurrency: typeof headerCurrency === 'string' ? headerCurrency : null,
    cookieCurrency: typeof cookieCurrency === 'string' ? cookieCurrency : null,
    headerCountry,
    fallback: 'USD',
  });
};

const buildCheckoutKey = (params: {
  variantId: string;
  durationMonths: number;
  currency: string;
  autoRenew: boolean;
  couponCode?: string | null;
}): string => {
  const duration = Number.isFinite(params.durationMonths)
    ? Math.max(1, Math.floor(params.durationMonths))
    : 1;
  const normalizedCoupon = normalizeCouponCode(params.couponCode) || '';
  const normalizedCurrency = params.currency.trim().toUpperCase();
  const autoRenewFlag = params.autoRenew ? '1' : '0';
  return [
    params.variantId,
    duration.toString(),
    normalizedCurrency,
    autoRenewFlag,
    normalizedCoupon,
  ].join('|');
};

const readPay4bitParam = (
  source: Record<string, unknown>,
  key: string
): string | null => {
  const nestedParams =
    source['params'] && typeof source['params'] === 'object'
      ? (source['params'] as Record<string, unknown>)[key]
      : undefined;
  const candidates = [source[key], source[`params[${key}]`], nestedParams];

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const normalized = candidate.trim();
      if (normalized.length > 0) {
        return normalized;
      }
    }
    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        if (typeof entry !== 'string') {
          continue;
        }
        const normalized = entry.trim();
        if (normalized.length > 0) {
          return normalized;
        }
      }
    }
  }

  return null;
};

const parseUrlEncodedBody = (
  rawBody: string | Buffer
): Record<string, string | string[]> => {
  const parsed: Record<string, string | string[]> = {};
  const normalizedBody =
    typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const params = new globalThis.URLSearchParams(normalizedBody);

  params.forEach((value, key) => {
    const existing = parsed[key];
    if (existing === undefined) {
      parsed[key] = value;
      return;
    }

    if (Array.isArray(existing)) {
      existing.push(value);
      return;
    }

    parsed[key] = [existing, value];
  });

  return parsed;
};

const parsePay4bitCallbackBody = (
  request: FastifyRequest
):
  | {
      ok: true;
      data: {
        method: 'check' | 'pay' | 'error';
        localpayId: string;
        account: string;
        sum: string;
        amount: string;
        currency: string;
        description: string;
        sign: string;
        checkSign: string;
        projectId?: string | null;
        paymentType?: string | null;
        revenue?: string | null;
      };
    }
  | { ok: false; message: string } => {
  const querySource =
    request.query && typeof request.query === 'object'
      ? (request.query as Record<string, unknown>)
      : {};
  const bodySource =
    request.body && typeof request.body === 'object'
      ? (request.body as Record<string, unknown>)
      : {};
  const merged = { ...querySource, ...bodySource };

  const rawMethod =
    readPay4bitParam(merged, 'method') ||
    readPay4bitParam(querySource, 'method') ||
    readPay4bitParam(bodySource, 'method');
  if (!rawMethod) {
    return { ok: false, message: 'method_missing' };
  }
  const method = rawMethod.toLowerCase();
  if (!['check', 'pay', 'error'].includes(method)) {
    return { ok: false, message: 'method_invalid' };
  }

  const localpayId =
    readPay4bitParam(merged, 'localpayId') ||
    readPay4bitParam(merged, 'paymentId');
  const account = readPay4bitParam(merged, 'account');
  const sum = readPay4bitParam(merged, 'sum');
  const amount = readPay4bitParam(merged, 'amount');
  const currency = readPay4bitParam(merged, 'currency');
  const description = readPay4bitParam(merged, 'desc');
  const sign = readPay4bitParam(merged, 'sign');
  const checkSign = readPay4bitParam(merged, 'check_sign');

  if (
    !localpayId ||
    !account ||
    !sum ||
    !amount ||
    !currency ||
    !description ||
    !sign ||
    !checkSign
  ) {
    return { ok: false, message: 'params_missing' };
  }

  return {
    ok: true,
    data: {
      method: method as 'check' | 'pay' | 'error',
      localpayId,
      account,
      sum,
      amount,
      currency,
      description,
      sign,
      checkSign,
      projectId: readPay4bitParam(merged, 'projectId'),
      paymentType: readPay4bitParam(merged, 'paymentType'),
      revenue: readPay4bitParam(merged, 'revenue'),
    },
  };
};

export async function paymentRoutes(fastify: FastifyInstance): Promise<void> {
  if (!fastify.hasContentTypeParser('application/x-www-form-urlencoded')) {
    fastify.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string' },
      (_request, body, done) => {
        try {
          const parsed = parseUrlEncodedBody(body);
          done(null, parsed);
        } catch (error) {
          done(error as Error);
        }
      }
    );
  }

  // Quote pricing without creating an order or reserving inventory
  fastify.post(
    '/quote',
    {
      preHandler: [authPreHandler, paymentQuoteRateLimit],
      schema: {
        body: {
          type: 'object',
          required: ['variant_id', 'duration_months'],
          properties: {
            variant_id: {
              type: 'string',
              minLength: 1,
            },
            duration_months: {
              type: 'number',
              minimum: 1,
              default: 1,
            },
            currency: {
              type: 'string',
              minLength: 1,
            },
            coupon_code: {
              type: 'string',
              minLength: 1,
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user;
        if (!user?.userId) {
          return ErrorResponses.unauthorized(reply, 'User not authenticated');
        }

        const {
          variant_id,
          duration_months = 1,
          currency: requestedCurrency,
          coupon_code,
        } = request.body as any;

        const preferredCurrency = resolveRequestCurrency(
          request,
          requestedCurrency
        );

        const pricingResult = await resolveVariantPricing({
          variantId: variant_id,
          currency: preferredCurrency,
          termMonths: duration_months,
        });

        if (!pricingResult.ok) {
          if (pricingResult.error === 'term_unavailable') {
            return ErrorResponses.badRequest(
              reply,
              'Selected duration is not available for this plan'
            );
          }
          return ErrorResponses.badRequest(
            reply,
            'Subscription plan is not available'
          );
        }

        const { product, variant, price, snapshot, currency, catalogMode } =
          pricingResult.data;
        const lockContext = await resolvePricingLockContext({
          variantId: variant.id,
          displayCurrency: currency,
          displayPrice: price,
        });
        if (!lockContext) {
          return ErrorResponses.badRequest(
            reply,
            'Unable to lock pricing snapshot for checkout.'
          );
        }
        const subtotalCents = snapshot.termSubtotalCents;
        const termDiscountCents = snapshot.discountCents;
        let couponDiscountCents = 0;
        let totalCents = snapshot.totalPriceCents;
        const settlementPricing =
          catalogMode === 'fixed_product'
            ? computeFixedTermPricing({
                termTotalCents: lockContext.settlementBasePriceCents,
                termMonths: snapshot.termMonths,
                basePriceCents: lockContext.settlementBasePriceCents,
              })
            : computeTermPricing({
                basePriceCents: lockContext.settlementBasePriceCents,
                termMonths: snapshot.termMonths,
                discountPercent: snapshot.discountPercent,
              });

        const normalizedCoupon = normalizeCouponCode(coupon_code);
        if (normalizedCoupon) {
          const couponResult = await couponService.validateCouponForOrder({
            couponCode: normalizedCoupon,
            userId: user.userId,
            product,
            subtotalCents: snapshot.totalPriceCents,
            termMonths: snapshot.termMonths,
          });

          if (!couponResult.success) {
            return ErrorResponses.badRequest(
              reply,
              'Coupon not valid for this order.'
            );
          }

          couponDiscountCents = couponResult.data.discountCents;
          totalCents = couponResult.data.totalCents;
        }
        const settlementCouponDiscountCents =
          snapshot.totalPriceCents > 0
            ? Math.min(
                settlementPricing.totalPriceCents,
                Math.round(
                  (couponDiscountCents * settlementPricing.totalPriceCents) /
                    snapshot.totalPriceCents
                )
              )
            : 0;
        const settlementTotalCents = Math.max(
          0,
          settlementPricing.totalPriceCents - settlementCouponDiscountCents
        );

        return SuccessResponses.ok(reply, {
          pricing_snapshot_id: lockContext.snapshotId,
          display_currency: lockContext.displayCurrency,
          settlement_currency: lockContext.settlementCurrency,
          subtotal_cents: subtotalCents,
          term_discount_cents: termDiscountCents,
          coupon_discount_cents: couponDiscountCents,
          total_cents: totalCents,
          settlement_total_cents: settlementTotalCents,
          currency,
        });
      } catch (error) {
        Logger.error('Error creating payment quote:', error);
        return ErrorResponses.internalError(reply, 'Failed to create quote');
      }
    }
  );

  // Unified checkout: Card hosted checkout (Pay4bit/Stripe fallback) or credits
  fastify.post(
    '/checkout',
    {
      preHandler: [authPreHandler, paymentRateLimit],
      schema: {
        body: {
          type: 'object',
          required: ['variant_id', 'duration_months'],
          properties: {
            variant_id: {
              type: 'string',
              minLength: 1,
            },
            duration_months: {
              type: 'number',
              minimum: 1,
              default: 1,
            },
            payment_method: {
              type: 'string',
              enum: ['card', 'stripe', 'pay4bit', 'credits'],
              default: 'card',
            },
            auto_renew: {
              type: 'boolean',
              default: false,
            },
            currency: {
              type: 'string',
              minLength: 1,
            },
            coupon_code: {
              type: 'string',
              minLength: 1,
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user;
        if (!user?.userId) {
          return ErrorResponses.unauthorized(reply, 'User not authenticated');
        }

        const {
          variant_id,
          duration_months = 1,
          payment_method = 'card',
          auto_renew = false,
          currency: requestedCurrency,
          coupon_code,
        } = request.body as any;

        const requestedPaymentMethod =
          payment_method === 'pay4bit'
            ? 'pay4bit'
            : payment_method === 'card'
              ? 'card'
              : payment_method;
        const cardProvider = env.PAY4BIT_ENABLED ? 'pay4bit' : 'stripe';

        if (requestedPaymentMethod === 'pay4bit' && !env.PAY4BIT_ENABLED) {
          return ErrorResponses.badRequest(
            reply,
            'Pay4bit checkout is not enabled'
          );
        }

        if (
          ['card', 'stripe'].includes(requestedPaymentMethod) &&
          !env.STRIPE_ENABLED &&
          !env.PAY4BIT_ENABLED
        ) {
          return ErrorResponses.serviceUnavailable(
            reply,
            'Card checkout is temporarily unavailable. Please try again later.'
          );
        }

        const preferredCurrency = resolveRequestCurrency(
          request,
          requestedCurrency
        );
        const pricingCurrency: SupportedCurrency =
          payment_method === 'credits' ? 'USD' : preferredCurrency;

        const pricingResult = await resolveVariantPricing({
          variantId: variant_id,
          currency: pricingCurrency,
          termMonths: duration_months,
        });

        if (!pricingResult.ok) {
          if (pricingResult.error === 'term_unavailable') {
            return ErrorResponses.badRequest(
              reply,
              'Selected duration is not available for this plan'
            );
          }
          return ErrorResponses.badRequest(
            reply,
            'Subscription plan is not available'
          );
        }

        const {
          product,
          variant,
          price: displayPrice,
          snapshot,
          currency,
          catalogMode,
        } = pricingResult.data;
        const lockContext = await resolvePricingLockContext({
          variantId: variant.id,
          displayCurrency: currency,
          displayPrice,
        });
        if (!lockContext) {
          return ErrorResponses.badRequest(
            reply,
            'Unable to lock pricing snapshot for checkout.'
          );
        }
        const upgradeOptionsRaw = normalizeUpgradeOptions(product.metadata);
        const upgradeValidation = validateUpgradeOptions(upgradeOptionsRaw);
        if (!upgradeValidation.valid) {
          Logger.error('Invalid upgrade options configuration', {
            productId: product.id,
            reason: upgradeValidation.reason,
          });
          return ErrorResponses.internalError(
            reply,
            'Subscription plan is not available'
          );
        }
        const upgradeOptions = upgradeOptionsRaw;
        const planCode = variant.service_plan || variant.variant_code;
        if (!planCode || !product.service_type) {
          return ErrorResponses.badRequest(
            reply,
            'Subscription plan is not available'
          );
        }

        if (payment_method === 'credits' && currency !== 'USD') {
          return ErrorResponses.badRequest(
            reply,
            'Credit payments are only supported for USD pricing'
          );
        }

        const termSubtotalCents = snapshot.termSubtotalCents;
        const termTotalCents = snapshot.totalPriceCents;
        const settlementTermPricing =
          catalogMode === 'fixed_product'
            ? computeFixedTermPricing({
                termTotalCents: lockContext.settlementBasePriceCents,
                termMonths: snapshot.termMonths,
                basePriceCents: lockContext.settlementBasePriceCents,
              })
            : computeTermPricing({
                basePriceCents: lockContext.settlementBasePriceCents,
                termMonths: snapshot.termMonths,
                discountPercent: snapshot.discountPercent,
              });
        let couponDiscountCents = 0;
        let coupon: { id: string; code: string; percent_off: number } | null =
          null;

        const normalizedCoupon = normalizeCouponCode(coupon_code);
        if (normalizedCoupon) {
          const couponResult = await couponService.validateCouponForOrder({
            couponCode: normalizedCoupon,
            userId: user.userId,
            product,
            subtotalCents: termTotalCents,
            termMonths: snapshot.termMonths,
          });

          if (!couponResult.success) {
            return ErrorResponses.badRequest(
              reply,
              'Coupon not valid for this order.'
            );
          }

          coupon = couponResult.data.coupon;
          couponDiscountCents = couponResult.data.discountCents;
        }

        const checkoutKey = buildCheckoutKey({
          variantId: variant.id,
          durationMonths: snapshot.termMonths,
          currency,
          autoRenew: auto_renew,
          couponCode: normalizedCoupon,
        });
        const finalTotalCents = Math.max(
          0,
          termTotalCents - couponDiscountCents
        );
        const settlementCouponDiscountCents =
          termTotalCents > 0
            ? Math.min(
                settlementTermPricing.totalPriceCents,
                Math.round(
                  (couponDiscountCents *
                    settlementTermPricing.totalPriceCents) /
                    termTotalCents
                )
              )
            : 0;
        const settlementFinalTotalCents = Math.max(
          0,
          settlementTermPricing.totalPriceCents - settlementCouponDiscountCents
        );
        const priceCents = finalTotalCents;
        const price = priceCents / 100;
        const orderDescription = `Subscription: ${product.service_type} ${planCode} (${snapshot.termMonths} month${snapshot.termMonths > 1 ? 's' : ''})`;
        const productVariantId = variant.id;
        const orderInput = {
          user_id: user.userId,
          status: 'pending_payment' as const,
          status_reason: 'checkout_started',
          currency,
          subtotal_cents: termSubtotalCents,
          discount_cents: snapshot.discountCents,
          coupon_id: coupon?.id ?? null,
          coupon_code: coupon?.code ?? null,
          coupon_discount_cents: couponDiscountCents,
          total_cents: finalTotalCents,
          pricing_snapshot_id: lockContext.snapshotId,
          settlement_currency: lockContext.settlementCurrency,
          settlement_total_cents: settlementFinalTotalCents,
          term_months: snapshot.termMonths,
          paid_with_credits: payment_method === 'credits',
          auto_renew,
          payment_provider:
            payment_method === 'credits' ? 'credits' : cardProvider,
          metadata: {
            service_type: product.service_type,
            service_plan: planCode,
            duration_months: snapshot.termMonths,
            discount_percent: snapshot.discountPercent,
            base_price_cents: snapshot.basePriceCents,
            term_subtotal_cents: termSubtotalCents,
            term_discount_cents: snapshot.discountCents,
            term_total_cents: termTotalCents,
            total_price_cents: finalTotalCents,
            display_currency: lockContext.displayCurrency,
            display_total_cents: finalTotalCents,
            pricing_snapshot_id: lockContext.snapshotId,
            settlement_currency: lockContext.settlementCurrency,
            settlement_total_cents: settlementFinalTotalCents,
            catalog_mode: catalogMode,
            checkout_key: checkoutKey,
            checkout_context: {
              variant_id: variant.id,
              duration_months: snapshot.termMonths,
              currency,
              auto_renew,
              coupon_code: normalizedCoupon,
            },
            ...(upgradeOptions ? { upgrade_options: upgradeOptions } : {}),
            ...(coupon
              ? {
                  coupon_code: coupon.code,
                  coupon_percent_off: coupon.percent_off,
                  coupon_discount_cents: couponDiscountCents,
                }
              : {}),
          },
        };

        const orderItems = [
          {
            product_variant_id: productVariantId,
            quantity: 1,
            unit_price_cents: finalTotalCents,
            base_price_cents: snapshot.basePriceCents,
            discount_percent: snapshot.discountPercent,
            term_months: snapshot.termMonths,
            auto_renew,
            coupon_discount_cents: couponDiscountCents,
            currency,
            total_price_cents: finalTotalCents,
            settlement_currency: lockContext.settlementCurrency,
            settlement_unit_price_cents: settlementFinalTotalCents,
            settlement_base_price_cents: lockContext.settlementBasePriceCents,
            settlement_coupon_discount_cents: settlementCouponDiscountCents,
            settlement_total_price_cents: settlementFinalTotalCents,
            description: orderDescription,
            metadata: {
              service_type: product.service_type,
              service_plan: planCode,
              duration_months: snapshot.termMonths,
              discount_percent: snapshot.discountPercent,
              base_price_cents: snapshot.basePriceCents,
              term_subtotal_cents: termSubtotalCents,
              term_discount_cents: snapshot.discountCents,
              term_total_cents: termTotalCents,
              total_price_cents: finalTotalCents,
              settlement_currency: lockContext.settlementCurrency,
              settlement_base_price_cents: lockContext.settlementBasePriceCents,
              settlement_coupon_discount_cents: settlementCouponDiscountCents,
              settlement_total_cents: settlementFinalTotalCents,
              catalog_mode: catalogMode,
              ...(upgradeOptions ? { upgrade_options: upgradeOptions } : {}),
              ...(coupon
                ? {
                    coupon_code: coupon.code,
                    coupon_percent_off: coupon.percent_off,
                    coupon_discount_cents: couponDiscountCents,
                  }
                : {}),
            },
          },
        ];

        let orderResult:
          | Awaited<ReturnType<typeof orderService.createOrderWithItems>>
          | Awaited<
              ReturnType<typeof orderService.createOrderWithItemsInTransaction>
            >;

        if (coupon) {
          const pool = getDatabasePool();
          const client = await pool.connect();
          let transactionOpen = false;
          try {
            await client.query('BEGIN');
            transactionOpen = true;
            orderResult = await orderService.createOrderWithItemsInTransaction(
              client,
              orderInput,
              orderItems
            );

            if (!orderResult.success || !orderResult.data) {
              await client.query('ROLLBACK');
              transactionOpen = false;
              return ErrorResponses.internalError(
                reply,
                'Failed to create order for checkout'
              );
            }

            const reservation = await couponService.reserveCouponRedemption({
              couponId: coupon.id,
              userId: user.userId,
              orderId: orderResult.data.id,
              product,
              subtotalCents: termTotalCents,
              termMonths: snapshot.termMonths,
              client,
            });

            if (!reservation.success) {
              await client.query('ROLLBACK');
              transactionOpen = false;
              return ErrorResponses.badRequest(
                reply,
                'Coupon not valid for this order.'
              );
            }

            await client.query('COMMIT');
            transactionOpen = false;
          } catch (error) {
            if (transactionOpen) {
              await client.query('ROLLBACK');
              transactionOpen = false;
            }
            Logger.error('Failed to reserve coupon during checkout:', error);
            return ErrorResponses.internalError(
              reply,
              'Failed to create order for checkout'
            );
          } finally {
            if (transactionOpen) {
              try {
                await client.query('ROLLBACK');
              } catch (rollbackError) {
                Logger.error(
                  'Failed to rollback checkout coupon reservation',
                  rollbackError
                );
              }
            }
            client.release();
          }
        } else {
          orderResult = await orderService.createOrderWithItems(
            orderInput,
            orderItems
          );
        }

        if (!orderResult.success || !orderResult.data) {
          return ErrorResponses.internalError(
            reply,
            'Failed to create order for checkout'
          );
        }

        const order = orderResult.data;
        const contentId =
          product.slug?.trim() ||
          productVariantId ||
          product.id ||
          planCode ||
          product.service_type ||
          null;
        const checkoutProperties = buildTikTokProductProperties({
          value: price,
          currency,
          contentId,
          contentName: product.name || product.service_type || planCode,
          contentCategory: product.category || product.service_type || null,
          price,
          brand: product.service_type || null,
        });
        void tiktokEventsService.trackInitiateCheckout({
          userId: user.userId,
          email: user.email,
          eventId: `order_${order.id}_checkout`,
          properties: checkoutProperties,
          context: buildTikTokRequestContext(request),
        });
        const startDate = new Date();
        const endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + snapshot.termMonths);
        const renewalDate = new Date(endDate);
        renewalDate.setDate(renewalDate.getDate() - 7);
        const nextBillingAt = auto_renew ? renewalDate : null;

        if (payment_method === 'credits') {
          // Reuse existing credit purchase flow
          const validation = await subscriptionService.canPurchaseSubscription(
            user.userId,
            productVariantId
          );

          if (!validation.canPurchase) {
            await orderService.updateOrderStatus(
              order.id,
              'cancelled',
              validation.reason || 'purchase_not_allowed'
            );
            if (coupon) {
              await couponService.voidRedemptionForOrder(order.id);
            }
            return ErrorResponses.badRequest(
              reply,
              validation.reason || 'Purchase not allowed'
            );
          }

          const creditResult = await creditService.spendCredits(
            user.userId,
            price,
            `Subscription purchase: ${product.service_type} ${planCode}`,
            {
              service_type: product.service_type,
              service_plan: planCode,
              duration_months: snapshot.termMonths,
              purchase_type: 'subscription',
            },
            {
              orderId: order.id,
              ...(productVariantId ? { productVariantId } : {}),
              priceCents,
              basePriceCents: snapshot.basePriceCents,
              discountPercent: snapshot.discountPercent,
              termMonths: snapshot.termMonths,
              currency,
              autoRenew: auto_renew,
              ...(nextBillingAt ? { nextBillingAt } : {}),
              renewalMethod: 'credits',
              statusReason: 'paid_with_credits',
            }
          );

          if (!creditResult.success) {
            await orderService.updateOrderStatus(
              order.id,
              'cancelled',
              creditResult.error || 'credit_payment_failed'
            );
            if (coupon) {
              await couponService.voidRedemptionForOrder(order.id);
            }
            return ErrorResponses.badRequest(
              reply,
              creditResult.error || 'Insufficient credits'
            );
          }

          const subResult = await subscriptionService.createSubscription(
            user.userId,
            {
              service_type: product.service_type,
              service_plan: planCode,
              start_date: startDate,
              end_date: endDate,
              renewal_date: renewalDate,
              auto_renew,
              order_id: order.id,
              product_variant_id: productVariantId,
              price_cents: termTotalCents,
              base_price_cents: snapshot.basePriceCents,
              discount_percent: snapshot.discountPercent,
              term_months: snapshot.termMonths,
              currency,
              next_billing_at: nextBillingAt,
              renewal_method: 'credits',
              status_reason: 'paid_with_credits',
              upgrade_options_snapshot: upgradeOptions ?? null,
            }
          );

          if (!subResult.success) {
            // refund credits on failure
            await creditService.refundCredits(
              user.userId,
              price,
              'Subscription creation failed - automatic refund',
              creditResult.transaction?.id,
              { service_type: product.service_type, service_plan: planCode },
              {
                orderId: order.id,
                ...(productVariantId ? { productVariantId } : {}),
                priceCents,
                basePriceCents: snapshot.basePriceCents,
                discountPercent: snapshot.discountPercent,
                termMonths: snapshot.termMonths,
                currency,
                autoRenew: auto_renew,
                ...(nextBillingAt ? { nextBillingAt } : {}),
                renewalMethod: 'credits',
                statusReason: 'subscription_create_failed',
              }
            );
            await orderService.updateOrderStatus(
              order.id,
              'cancelled',
              'subscription_create_failed'
            );
            if (coupon) {
              await couponService.voidRedemptionForOrder(order.id);
            }
            return ErrorResponses.internalError(
              reply,
              'Subscription creation failed, credits refunded'
            );
          }

          const createdSubscription = subResult.data!;
          const orderItemId =
            Array.isArray(order.items) && order.items.length > 0
              ? (order.items[0]?.id ?? null)
              : null;
          const subscriptionStartAt =
            createdSubscription.term_start_at ?? createdSubscription.start_date;
          const mmuCycleTotal =
            snapshot.termMonths > 1 ? snapshot.termMonths : null;
          const mmuCycleIndex = mmuCycleTotal ? 1 : null;

          const entitlement = await orderEntitlementService.upsertEntitlement({
            order_id: order.id,
            order_item_id: orderItemId,
            user_id: user.userId,
            status: createdSubscription.status,
            starts_at: subscriptionStartAt,
            ends_at: createdSubscription.end_date,
            duration_months_snapshot: snapshot.termMonths,
            credentials_encrypted: null,
            mmu_cycle_index: mmuCycleIndex,
            mmu_cycle_total: mmuCycleTotal,
            source_subscription_id: createdSubscription.id,
            metadata: {
              source: 'payments.create_payment.credits',
              renewal_method: 'credits',
            },
          });
          if (!entitlement) {
            Logger.warn(
              'Failed to upsert order entitlement after payment credit purchase',
              {
                orderId: order.id,
                subscriptionId: createdSubscription.id,
              }
            );
          }

          await orderService.updateOrderPayment(order.id, {
            payment_provider: 'credits',
            payment_reference: creditResult.transaction?.id || null,
            paid_with_credits: true,
            auto_renew,
            status: 'in_process',
            status_reason: 'paid_with_credits',
          });
          if (coupon) {
            await couponService.finalizeRedemptionForOrder(order.id);
          }
          try {
            const confirmationResult =
              await orderService.sendOrderPaymentConfirmationEmail(order.id);
            if (
              !confirmationResult.success &&
              confirmationResult.reason &&
              !['already_sent', 'renewal_order'].includes(
                confirmationResult.reason
              )
            ) {
              Logger.warn('Failed to send order payment confirmation email', {
                orderId: order.id,
                reason: confirmationResult.reason,
              });
            }
          } catch (emailError) {
            Logger.warn('Order payment confirmation email call failed', {
              orderId: order.id,
              error: emailError,
            });
          }
          void tiktokEventsService.trackPurchase({
            userId: user.userId,
            email: user.email,
            eventId: `order_${order.id}_purchase`,
            properties: checkoutProperties,
            context: buildTikTokRequestContext(request),
          });

          return SuccessResponses.created(reply, {
            payment_method: 'credits',
            order_id: order.id,
            pricing_snapshot_id: lockContext.snapshotId,
            display_currency: lockContext.displayCurrency,
            display_total_cents: finalTotalCents,
            settlement_currency: lockContext.settlementCurrency,
            settlement_total_cents: settlementFinalTotalCents,
            subscription: subResult.data,
            upgrade_options: upgradeOptions ?? null,
            transaction: {
              transaction_id: creditResult.transaction?.id,
              amount_debited: price,
              balance_after: creditResult.balance?.availableBalance,
            },
          });
        }

        // Default: hosted card checkout
        const cardResult =
          cardProvider === 'pay4bit'
            ? await paymentService.createPay4bitCheckoutSession({
                orderId: order.id,
              })
            : await paymentService.createStripeCheckoutSession({
                orderId: order.id,
              });

        if (!cardResult.success) {
          const isProviderTemporarilyUnavailable = [
            'payment_provider_unavailable',
            'payment_provider_rate_limited',
            'payment_provider_misconfigured',
          ].includes(cardResult.error || '');
          const isValidationError = [
            'order_not_found',
            'order_not_pending',
            'payment_provider_mismatch',
            'order_missing_items',
            'invalid_currency',
            'missing_app_base_url',
            'own_account_credentials_required',
            'invalid_settlement',
          ].includes(cardResult.error || '');

          if (isProviderTemporarilyUnavailable) {
            return ErrorResponses.serviceUnavailable(
              reply,
              'Card checkout is temporarily unavailable. Please try again later.'
            );
          }

          if (isValidationError) {
            return ErrorResponses.badRequest(
              reply,
              (cardResult.error || 'invalid_checkout').replace(/_/g, ' ')
            );
          }

          await orderService.updateOrderStatus(
            order.id,
            'cancelled',
            cardResult.error || 'card_checkout_failed'
          );
          if (coupon) {
            await couponService.voidRedemptionForOrder(order.id);
          }
          return ErrorResponses.internalError(
            reply,
            cardResult.error || 'Failed to start card checkout'
          );
        }

        return SuccessResponses.created(reply, {
          payment_method: 'card',
          payment_provider: cardProvider,
          order_id: order.id,
          paymentId: cardResult.paymentId,
          sessionId: cardResult.sessionId,
          sessionUrl: cardResult.sessionUrl,
          amount: price,
          currency,
          pricing_snapshot_id: lockContext.snapshotId,
          display_currency: lockContext.displayCurrency,
          display_total_cents: finalTotalCents,
          settlement_currency: lockContext.settlementCurrency,
          settlement_total_cents: settlementFinalTotalCents,
          checkoutKey,
          upgrade_options: upgradeOptions ?? null,
        });
      } catch (error) {
        Logger.error('Error creating checkout:', error);
        return ErrorResponses.internalError(reply, 'Failed to create checkout');
      }
    }
  );

  // Cancel checkout
  fastify.post(
    '/checkout/cancel',
    {
      preHandler: [authPreHandler, paymentRateLimit],
      schema: {
        body: {
          type: 'object',
          required: ['order_id'],
          properties: {
            order_id: { type: 'string', minLength: 1 },
            payment_id: { type: 'string', minLength: 1 },
            reason: { type: 'string', minLength: 1 },
            checkout_key: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user;
        if (!user?.userId) {
          return ErrorResponses.unauthorized(reply, 'User not authenticated');
        }

        const { order_id, payment_id, reason } = request.body as {
          order_id: string;
          payment_id?: string;
          reason?: string;
          checkout_key?: string;
        };

        const existingOrder = await orderService.getOrderById(order_id);
        if (existingOrder?.payment_provider === 'pay4bit') {
          if (existingOrder.user_id !== user.userId) {
            return ErrorResponses.forbidden(reply, 'Access denied');
          }
          if (existingOrder.status !== 'pending_payment') {
            return SuccessResponses.ok(reply, {
              cancelled: false,
              status: 'already_processed',
            });
          }

          await orderService.updateOrderStatus(
            order_id,
            'cancelled',
            reason || 'checkout_cancelled'
          );
          await couponService.voidRedemptionForOrder(order_id);
          return SuccessResponses.ok(reply, {
            cancelled: true,
            status: 'cancelled',
          });
        }

        const result = await paymentService.cancelStripeCheckout({
          orderId: order_id,
          paymentId: payment_id ?? null,
          userId: user.userId,
          reason: reason || 'checkout_cancelled',
        });

        if (result.status === 'forbidden') {
          return ErrorResponses.forbidden(reply, 'Access denied');
        }
        if (result.status === 'order_not_found') {
          return ErrorResponses.notFound(reply, 'Order not found');
        }
        if (result.status === 'payment_mismatch') {
          return ErrorResponses.badRequest(
            reply,
            'Payment does not match order'
          );
        }

        return SuccessResponses.ok(reply, {
          cancelled: result.cancelled,
          status: result.status,
        });
      } catch (error) {
        Logger.error('Error cancelling checkout:', error);
        return ErrorResponses.internalError(reply, 'Failed to cancel checkout');
      }
    }
  );

  // Create payment
  fastify.post(
    '/create-payment',
    {
      schema: {
        body: createPaymentRequestJsonSchema,
      },
      preHandler: [authPreHandler, paymentRateLimit],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user;

        if (!user || !user.userId) {
          return ErrorResponses.unauthorized(reply, 'User not authenticated');
        }

        const body = request.body as CreatePaymentRequest;

        Logger.info(`Creating payment for user ${user.userId}`, {
          userId: user.userId,
          creditAmount: body.creditAmount,
          price_currency: body.price_currency,
          pay_currency: body.pay_currency,
          currency: body.currency,
        });

        const result = await paymentService.createPayment(user.userId, body);

        if (!result.success) {
          Logger.error(
            `Payment creation failed for user ${user.userId}:`,
            result.error
          );
          if (result.errorCode === 'PAYMENT_PROVIDER_UNAVAILABLE') {
            return ErrorResponses.serviceUnavailable(
              reply,
              result.error || 'Payment provider unavailable'
            );
          }
          if (result.errorCode) {
            return sendError(
              reply,
              HttpStatus.BAD_REQUEST,
              'Bad Request',
              result.error || 'Payment creation failed',
              result.errorCode
            );
          }
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Payment creation failed'
          );
        }

        const response = {
          paymentId: result.payment!.paymentId, // Use NOWPayments payment_id, not local id
          payAddress: result.payment!.payAddress,
          payAmount: result.payment!.amount,
          payCurrency: result.payment!.currency,
          expiresAt: result.payment!.expiresAt,
          status: result.payment!.status,
        };

        return SuccessResponses.created(
          reply,
          response,
          'Payment created successfully'
        );
      } catch (error) {
        Logger.error('Error creating payment:', error);
        return ErrorResponses.internalError(reply, 'Failed to create payment');
      }
    }
  );

  // Pay4bit callback (no auth)
  fastify.route({
    method: ['GET', 'POST'],
    url: '/pay4bit/callback',
    preHandler: [webhookRateLimit],
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!env.PAY4BIT_ENABLED) {
          return ErrorResponses.notFound(reply, 'Callback route is disabled');
        }

        const parsed = parsePay4bitCallbackBody(request);
        if (!parsed.ok) {
          Logger.warn('Invalid Pay4bit callback payload', {
            message: parsed.message,
            ip: request.ip,
          });
          return reply.code(400).send({
            result: {
              message: parsed.message,
            },
          });
        }

        const callbackResult = await paymentService.handlePay4bitCallback(
          parsed.data
        );
        return reply.code(callbackResult.statusCode).send(callbackResult.body);
      } catch (error) {
        Logger.error('Pay4bit callback error:', error);
        return reply.code(500).send({
          result: {
            message: 'callback_failed',
          },
        });
      }
    },
  });

  // Stripe webhook (no auth, feature-flagged)
  fastify.post(
    '/stripe/webhook',
    {
      config: {
        rawBody: true,
      },
      preHandler: [webhookRateLimit],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        if (!env.STRIPE_ENABLED) {
          return ErrorResponses.notFound(reply, 'Stripe webhook is disabled');
        }

        const signature = request.headers['stripe-signature'] as
          | string
          | undefined;
        // rawBody added via fastify-raw-body
        const rawBody =
          (request as any).rawBody || JSON.stringify(request.body);

        const success = await paymentService.handleStripeWebhook(
          { rawBody, parsed: request.body },
          signature
        );

        if (!success) {
          return ErrorResponses.badRequest(reply, 'Webhook handling failed');
        }

        return reply.code(200).send({ received: true });
      } catch (error) {
        Logger.error('Stripe webhook error:', error);
        return ErrorResponses.internalError(reply, 'Failed to handle webhook');
      }
    }
  );

  // Get payment status
  fastify.get(
    '/status/:paymentId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['paymentId'],
          properties: {
            paymentId: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler, paymentRefreshRateLimit],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user;

        if (!user || !user.userId) {
          return ErrorResponses.unauthorized(reply, 'User not authenticated');
        }

        const { paymentId } = request.params as { paymentId: string };

        const status = await paymentService.getPaymentStatus(
          paymentId,
          user.userId
        );

        if (!status) {
          return ErrorResponses.notFound(reply, 'Payment not found');
        }

        return SuccessResponses.ok(reply, status);
      } catch (error) {
        Logger.error('Error getting payment status:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to get payment status'
        );
      }
    }
  );

  // Process webhook from NOWPayments
  fastify.post(
    '/webhook',
    {
      config: {
        rawBody: true,
      },
      schema: {
        body: webhookPayloadJsonSchema,
      },
      preHandler: [webhookRateLimit],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const signature = request.headers['x-nowpayments-sig'] as
          | string
          | undefined;
        const rawBody = (request as any).rawBody as Buffer | undefined;

        if (!signature) {
          Logger.error('Missing NOWPayments webhook signature');
          return ErrorResponses.unauthorized(
            reply,
            'Missing webhook signature'
          );
        }

        if (!rawBody) {
          Logger.error('Missing NOWPayments webhook raw body');
          return ErrorResponses.internalError(
            reply,
            'Webhook validation failed'
          );
        }

        const isValidSignature = nowpaymentsClient.verifyIPNSignature(
          rawBody.toString('utf8'),
          signature
        );

        if (!isValidSignature) {
          Logger.error('Invalid NOWPayments webhook signature', {
            ip: request.ip,
          });
          return ErrorResponses.unauthorized(
            reply,
            'Invalid webhook signature'
          );
        }

        const payload = request.body as WebhookPayload;

        Logger.info(`Received webhook for payment ${payload.payment_id}`, {
          paymentId: payload.payment_id,
          status: payload.payment_status,
          orderId: payload.order_id,
        });

        const success = await paymentService.processWebhook(payload, rawBody);

        if (!success) {
          Logger.error(
            `Failed to process webhook for payment ${payload.payment_id}`
          );
          return ErrorResponses.badRequest(reply, 'Failed to process webhook');
        }

        return SuccessResponses.ok(reply, { received: true });
      } catch (error) {
        Logger.error('Error processing webhook:', error);
        return ErrorResponses.internalError(reply, 'Failed to process webhook');
      }
    }
  );

  // Get supported currencies
  fastify.get(
    '/currencies',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const currencies = await paymentService.getSupportedCurrencies();
        return SuccessResponses.ok(reply, currencies);
      } catch (error) {
        Logger.error('Error getting supported currencies:', error);
        if (isNowPaymentsFailure(error)) {
          return ErrorResponses.serviceUnavailable(
            reply,
            'Payment provider unavailable'
          );
        }
        return ErrorResponses.internalError(
          reply,
          'Failed to get supported currencies'
        );
      }
    }
  );

  // Get user's payment/transaction history
  fastify.get(
    '/history',
    {
      preHandler: [authPreHandler],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
            offset: { type: 'number', minimum: 0, default: 0 },
            status: {
              type: 'string',
              enum: ['all', 'waiting', 'finished', 'failed', 'expired'],
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user;
        if (!user || !user.userId) {
          return ErrorResponses.unauthorized(reply, 'User not authenticated');
        }

        const { limit = 20, offset = 0, status = 'all' } = request.query as any;

        const history = await paymentService.getPaymentHistory({
          userId: user.userId,
          limit,
          offset,
          ...(status !== 'all' && { status }),
        });

        Logger.info(
          `[PAYMENT HISTORY] Retrieved ${history.length} transactions for user ${user.userId}`
        );
        Logger.info('[PAYMENT HISTORY] First transaction:', history[0]);

        return SuccessResponses.ok(reply, {
          transactions: history,
          pagination: {
            limit,
            offset,
            total: history.length,
          },
        });
      } catch (error) {
        Logger.error('Error fetching payment history:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to fetch payment history'
        );
      }
    }
  );

  // Get payment amount estimate
  fastify.get(
    '/estimate',
    {
      preHandler: [authPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { amount, currency_to } = request.query as {
          amount: string;
          currency_to: string;
        };

        const numericAmount = parseFloat(amount);

        const estimate = await paymentService.getEstimate(
          numericAmount,
          currency_to
        );

        return SuccessResponses.ok(reply, estimate);
      } catch (error) {
        Logger.error('Error getting payment estimate:', error);
        if (isNowPaymentsFailure(error)) {
          return ErrorResponses.serviceUnavailable(
            reply,
            'Payment provider unavailable'
          );
        }
        return ErrorResponses.internalError(
          reply,
          'Failed to get payment estimate'
        );
      }
    }
  );

  // Get minimum deposit amount for a currency
  fastify.get(
    '/min-amount',
    {
      preHandler: [authPreHandler],
      schema: {
        querystring: minAmountRequestJsonSchema,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { currency } = request.query as { currency: string };
        const minAmount = await paymentService.getMinimumDeposit(currency);
        return SuccessResponses.ok(reply, minAmount);
      } catch (error) {
        Logger.error('Error getting minimum deposit amount:', error);
        if (isNowPaymentsFailure(error)) {
          return ErrorResponses.serviceUnavailable(
            reply,
            'Payment provider unavailable'
          );
        }
        return ErrorResponses.internalError(
          reply,
          'Failed to get minimum deposit amount'
        );
      }
    }
  );

  // Get user payment history
  fastify.get(
    '/history/:userId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string' },
          },
        },
        querystring: paymentHistoryQueryJsonSchema,
      },
      preHandler: [authPreHandler, paymentRetryRateLimit],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user;

        if (!user || !user.userId) {
          return ErrorResponses.unauthorized(reply, 'User not authenticated');
        }

        const { userId } = request.params as { userId: string };
        const query = request.query as PaymentHistoryQuery;

        // Users can only access their own payment history
        if (user.userId !== userId) {
          return ErrorResponses.forbidden(reply, 'Access denied');
        }

        query.userId = userId;
        const history = await paymentService.getPaymentHistory(query);

        return SuccessResponses.ok(reply, {
          payments: history,
          count: history.length,
        });
      } catch (error) {
        Logger.error('Error getting payment history:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to get payment history'
        );
      }
    }
  );

  // Refresh payment status from NOWPayments API
  fastify.post(
    '/refresh/:paymentId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['paymentId'],
          properties: {
            paymentId: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { paymentId } = request.params as { paymentId: string };
        const user = request.user;

        if (!user || !user.userId) {
          return ErrorResponses.unauthorized(reply, 'User not authenticated');
        }

        // Verify user owns this payment
        const currentStatus = await paymentService.getPaymentStatus(
          paymentId,
          user.userId
        );
        if (!currentStatus) {
          return ErrorResponses.notFound(reply, 'Payment not found');
        }

        const success = await paymentService.refreshPaymentStatus(paymentId);

        if (!success) {
          return ErrorResponses.internalError(
            reply,
            'Failed to refresh payment status'
          );
        }

        // Get updated status
        const updatedStatus = await paymentService.getPaymentStatus(
          paymentId,
          user.userId
        );

        return SuccessResponses.ok(
          reply,
          updatedStatus,
          'Payment status refreshed'
        );
      } catch (error) {
        Logger.error('Error refreshing payment status:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to refresh payment status'
        );
      }
    }
  );

  // Manual retry failed payment (user action)
  fastify.post(
    '/retry/:paymentId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['paymentId'],
          properties: {
            paymentId: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { paymentId } = request.params as { paymentId: string };
        const user = request.user;

        if (!user || !user.userId) {
          return ErrorResponses.unauthorized(reply, 'User not authenticated');
        }

        // Verify user owns this payment
        const currentStatus = await paymentService.getPaymentStatus(
          paymentId,
          user.userId
        );
        if (!currentStatus) {
          return ErrorResponses.notFound(reply, 'Payment not found');
        }

        const success =
          await paymentMonitoringService.triggerPaymentCheck(paymentId);

        if (!success) {
          return ErrorResponses.internalError(
            reply,
            'Failed to retry payment monitoring'
          );
        }

        return SuccessResponses.ok(
          reply,
          { retried: true },
          'Payment retry initiated'
        );
      } catch (error) {
        Logger.error('Error retrying payment:', error);
        return ErrorResponses.internalError(reply, 'Failed to retry payment');
      }
    }
  );

  // Get monitoring service status
  fastify.get(
    '/monitor-status',
    {
      preHandler: [authPreHandler],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const isActive = paymentMonitoringService.isMonitoringActive();
        const metrics = paymentMonitoringService.getMetrics();

        return SuccessResponses.ok(reply, {
          active: isActive,
          metrics,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        Logger.error('Error getting monitoring status:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to get monitoring status'
        );
      }
    }
  );

  // Initiate refund request
  fastify.post(
    '/refund',
    {
      schema: {
        body: {
          type: 'object',
          required: ['paymentId', 'amount', 'reason'],
          properties: {
            paymentId: { type: 'string' },
            amount: { type: 'number', minimum: 0.01 },
            reason: {
              type: 'string',
              enum: [
                'user_request',
                'payment_error',
                'service_issue',
                'overpayment',
                'admin_decision',
                'dispute',
              ],
            },
            description: { type: 'string', maxLength: 500 },
          },
        },
      },
      preHandler: [authPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user;

        if (!user || !user.userId) {
          return ErrorResponses.unauthorized(reply, 'User not authenticated');
        }

        const { paymentId, amount, reason, description } = request.body as {
          paymentId: string;
          amount: number;
          reason: string;
          description?: string;
        };

        const result = await refundService.initiateRefund(
          user.userId,
          paymentId,
          amount,
          reason as any,
          description
        );

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to initiate refund'
          );
        }

        return SuccessResponses.created(
          reply,
          result.refund,
          'Refund request created successfully'
        );
      } catch (error) {
        Logger.error('Error initiating refund:', error);
        return ErrorResponses.internalError(reply, 'Failed to initiate refund');
      }
    }
  );

  // Get user refunds
  fastify.get(
    '/refunds',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
            offset: { type: 'number', minimum: 0, default: 0 },
          },
        },
      },
      preHandler: [authPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user;

        if (!user || !user.userId) {
          return ErrorResponses.unauthorized(reply, 'User not authenticated');
        }

        const { limit = 20, offset = 0 } = request.query as {
          limit?: number;
          offset?: number;
        };

        const refunds = await refundService.getUserRefunds(
          user.userId,
          limit,
          offset
        );

        return SuccessResponses.ok(reply, {
          refunds,
          count: refunds.length,
        });
      } catch (error) {
        Logger.error('Error getting user refunds:', error);
        return ErrorResponses.internalError(reply, 'Failed to get refunds');
      }
    }
  );

  // Get refund by ID
  fastify.get(
    '/refunds/:refundId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['refundId'],
          properties: {
            refundId: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = request.user;

        if (!user || !user.userId) {
          return ErrorResponses.unauthorized(reply, 'User not authenticated');
        }

        const { refundId } = request.params as { refundId: string };
        const refund = await refundService.getRefundById(refundId);

        if (!refund) {
          return ErrorResponses.notFound(reply, 'Refund not found');
        }

        // Verify user owns this refund
        if (refund.userId !== user.userId) {
          return ErrorResponses.forbidden(reply, 'Access denied');
        }

        return SuccessResponses.ok(reply, refund);
      } catch (error) {
        Logger.error('Error getting refund:', error);
        return ErrorResponses.internalError(reply, 'Failed to get refund');
      }
    }
  );

  // Health check endpoint
  fastify.get(
    '/health',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const paymentHealthy = await paymentService.healthCheck();
        const monitoringHealthy = await paymentMonitoringService.healthCheck();
        const allocationHealthy = await creditAllocationService.healthCheck();
        const failureHealthy = await paymentFailureService.healthCheck();
        const refundHealthy = await refundService.healthCheck();

        const isHealthy =
          paymentHealthy &&
          monitoringHealthy &&
          allocationHealthy &&
          failureHealthy &&
          refundHealthy;

        if (!isHealthy) {
          return ErrorResponses.internalError(
            reply,
            'Payment workflow services unhealthy'
          );
        }

        return SuccessResponses.ok(reply, {
          status: 'healthy',
          services: {
            payment: paymentHealthy,
            monitoring: monitoringHealthy,
            allocation: allocationHealthy,
            failure: failureHealthy,
            refund: refundHealthy,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        Logger.error('Payment health check failed:', error);
        return ErrorResponses.internalError(reply, 'Health check failed');
      }
    }
  );
}
