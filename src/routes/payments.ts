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
import { resolveVariantPricing } from '../services/variantPricingService';
import { couponService, normalizeCouponCode } from '../services/couponService';
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

export async function paymentRoutes(fastify: FastifyInstance): Promise<void> {
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

        const { product, snapshot, currency } = pricingResult.data;
        const subtotalCents = snapshot.basePriceCents * snapshot.termMonths;
        const termDiscountCents = snapshot.discountCents;
        let couponDiscountCents = 0;
        let totalCents = snapshot.totalPriceCents;

        const normalizedCoupon = normalizeCouponCode(coupon_code);
        if (normalizedCoupon) {
          const couponResult = await couponService.validateCouponForOrder({
            couponCode: normalizedCoupon,
            userId: user.userId,
            product,
            subtotalCents: snapshot.totalPriceCents,
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

        return SuccessResponses.ok(reply, {
          subtotal_cents: subtotalCents,
          term_discount_cents: termDiscountCents,
          coupon_discount_cents: couponDiscountCents,
          total_cents: totalCents,
          currency,
        });
      } catch (error) {
        Logger.error('Error creating payment quote:', error);
        return ErrorResponses.internalError(reply, 'Failed to create quote');
      }
    }
  );

  // Unified checkout: Stripe (default) or credits
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
              enum: ['stripe', 'credits'],
              default: 'stripe',
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
          payment_method = 'stripe',
          auto_renew = false,
          currency: requestedCurrency,
          coupon_code,
        } = request.body as any;

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

        const { product, variant, snapshot, currency } = pricingResult.data;
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

        const termSubtotalCents = snapshot.basePriceCents * snapshot.termMonths;
        const termTotalCents = snapshot.totalPriceCents;
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
          term_months: snapshot.termMonths,
          paid_with_credits: payment_method === 'credits',
          auto_renew,
          payment_provider: payment_method === 'credits' ? 'credits' : 'stripe',
          metadata: {
            service_type: product.service_type,
            service_plan: planCode,
            duration_months: snapshot.termMonths,
            discount_percent: snapshot.discountPercent,
            base_price_cents: snapshot.basePriceCents,
            total_price_cents: finalTotalCents,
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
            currency,
            total_price_cents: finalTotalCents,
            description: orderDescription,
            metadata: {
              service_type: product.service_type,
              service_plan: planCode,
              duration_months: snapshot.termMonths,
              discount_percent: snapshot.discountPercent,
              base_price_cents: snapshot.basePriceCents,
              total_price_cents: finalTotalCents,
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

          return SuccessResponses.created(reply, {
            payment_method: 'credits',
            order_id: order.id,
            subscription: subResult.data,
            upgrade_options: upgradeOptions ?? null,
            transaction: {
              transaction_id: creditResult.transaction?.id,
              amount_debited: price,
              balance_after: creditResult.balance?.availableBalance,
            },
          });
        }

        // Default: Stripe direct payment
        const stripeResult = await paymentService.createStripePayment(
          user.userId,
          price,
          currency,
          orderDescription,
          'subscription',
          {
            service_type: product.service_type,
            service_plan: planCode,
            duration_months: snapshot.termMonths,
            discount_percent: snapshot.discountPercent,
            base_price_cents: snapshot.basePriceCents,
            total_price_cents: finalTotalCents,
            subscription_price_cents: termTotalCents,
            auto_renew,
            ...(upgradeOptions ? { upgrade_options: upgradeOptions } : {}),
            ...(coupon
              ? {
                  coupon_code: coupon.code,
                  coupon_percent_off: coupon.percent_off,
                  coupon_discount_cents: couponDiscountCents,
                }
              : {}),
          },
          {
            orderId: order.id,
            productVariantId: productVariantId ?? null,
            priceCents,
            basePriceCents: snapshot.basePriceCents,
            discountPercent: snapshot.discountPercent,
            termMonths: snapshot.termMonths,
            currency,
            autoRenew: auto_renew,
            nextBillingAt: nextBillingAt ?? null,
            renewalMethod: 'stripe',
            statusReason: 'checkout_started',
          }
        );

        if (!stripeResult.success) {
          await orderService.updateOrderStatus(
            order.id,
            'cancelled',
            stripeResult.error || 'stripe_checkout_failed'
          );
          if (coupon) {
            await couponService.voidRedemptionForOrder(order.id);
          }
          return ErrorResponses.internalError(
            reply,
            stripeResult.error || 'Failed to start Stripe checkout'
          );
        }

        await orderService.updateOrderPayment(order.id, {
          payment_provider: 'stripe',
          payment_reference: stripeResult.paymentId,
          auto_renew,
          status: 'pending_payment',
          status_reason: 'awaiting_payment',
        });

        return SuccessResponses.created(reply, {
          payment_method: 'stripe',
          order_id: order.id,
          paymentId: stripeResult.paymentId,
          clientSecret: stripeResult.clientSecret,
          amount: stripeResult.amount,
          currency: stripeResult.currency,
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

  // Stripe webhook (no auth)
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

        const success = await paymentService.processWebhook(payload);

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
    {
      preHandler: [authPreHandler],
    },
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
