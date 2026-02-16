import { getDatabasePool } from '../../config/database';
import { env } from '../../config/environment';
import { Logger } from '../../utils/logger';
import {
  computeNextRenewalDates,
  formatSubscriptionDisplayName,
  formatSubscriptionShortId,
  getNextStripeRenewalAttemptDate,
  getSubscriptionDurationMonths,
} from '../../utils/subscriptionHelpers';
import { creditService } from '../creditService';
import { paymentService } from '../paymentService';
import { notificationService } from '../notificationService';
import { subscriptionService } from '../subscriptionService';
import { paymentMethodService } from '../paymentMethodService';
import { upgradeSelectionService } from '../upgradeSelectionService';
import {
  resolveCycleEndDate,
  subscriptionRenewalService,
} from '../subscriptionRenewalService';
import {
  ensureRenewalTask,
  notifyCreditsRenewalSuccess,
  notifyStripeRenewalFailure,
} from '../renewalNotificationService';
import { getMmuCycleInfo, shouldCreateMmuTask } from '../../utils/mmuSchedule';

interface RenewalCandidate {
  id: string;
  user_id: string;
  service_type: string;
  service_plan: string;
  start_date: Date;
  term_start_at?: Date | null;
  end_date: Date;
  renewal_date: Date;
  auto_renew: boolean;
  next_billing_at?: Date | null;
  renewal_method?: string | null;
  billing_payment_method_id?: string | null;
  price_cents?: number | null;
  base_price_cents?: number | null;
  discount_percent?: number | null;
  term_months?: number | null;
  currency?: string | null;
  order_id?: string | null;
  product_variant_id?: string | null;
  product_name?: string | null;
  variant_name?: string | null;
  metadata?: any;
  order_metadata?: any;
  order_currency?: string | null;
  order_total_cents?: number | null;
  order_term_months?: number | null;
  order_coupon_id?: string | null;
  order_coupon_code?: string | null;
  order_coupon_discount_cents?: number | null;
  item_price_cents?: number | null;
  item_currency?: string | null;
  item_term_months?: number | null;
  item_base_price_cents?: number | null;
  item_discount_percent?: number | null;
}

const STRIPE_PENDING_TIMEOUT_MINUTES = 120;

function parseJson(value: any): any | null {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseUpgradeOptionsSnapshot(value: any): {
  allow_new_account: boolean;
  allow_own_account: boolean;
  manual_monthly_upgrade: boolean;
} | null {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  const coerceBoolean = (input: any): boolean => {
    if (typeof input === 'boolean') return input;
    if (typeof input === 'number') return input > 0;
    if (typeof input === 'string') {
      const normalized = input.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false') return false;
      const numeric = Number(normalized);
      if (Number.isFinite(numeric)) return numeric > 0;
    }
    return false;
  };

  return {
    allow_new_account: coerceBoolean(
      parsed['allow_new_account'] ?? parsed['allowNewAccount']
    ),
    allow_own_account: coerceBoolean(
      parsed['allow_own_account'] ?? parsed['allowOwnAccount']
    ),
    manual_monthly_upgrade: coerceBoolean(
      parsed['manual_monthly_upgrade'] ?? parsed['manualMonthlyUpgrade']
    ),
  };
}

function parseDurationMonths(value: any): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.floor(parsed);
}

function parseNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function toDate(value: Date | string | null | undefined): Date {
  if (!value) {
    return new Date();
  }
  return value instanceof Date ? value : new Date(value);
}

async function updateSubscription(
  subscriptionId: string,
  updates: Parameters<typeof subscriptionService.updateSubscriptionForAdmin>[1],
  context: string
): Promise<boolean> {
  const result = await subscriptionService.updateSubscriptionForAdmin(
    subscriptionId,
    updates
  );

  if (!result.success) {
    Logger.warn('Failed to update subscription during renewal job', {
      subscriptionId,
      context,
      error: result.error,
    });
  }

  return result.success;
}

async function findPendingStripeRenewal(subscriptionId: string): Promise<{
  paymentId: string;
  recordId: string;
  status: string;
  createdAt: Date;
} | null> {
  const pool = getDatabasePool();
  const result = await pool.query(
    `
      SELECT id, provider_payment_id, status, created_at
      FROM payments
      WHERE provider = 'stripe'
        AND (metadata->>'subscription_id') = $1
        AND status IN ('pending', 'processing')
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [subscriptionId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return {
    paymentId: result.rows[0].provider_payment_id,
    recordId: result.rows[0].id,
    status: result.rows[0].status,
    createdAt: result.rows[0].created_at,
  };
}

type TermResolutionSource = 'stored' | 'item' | 'order' | 'metadata' | 'date';

function resolveDurationMonths(candidate: RenewalCandidate): {
  termMonths: number;
  source: TermResolutionSource;
} {
  const subscriptionMetadata = parseJson(candidate.metadata) || {};
  const orderMetadata = parseJson(candidate.order_metadata) || {};

  const metadataDuration =
    parseDurationMonths(subscriptionMetadata.duration_months) ??
    parseDurationMonths(subscriptionMetadata.term_months) ??
    parseDurationMonths(subscriptionMetadata.durationMonths) ??
    parseDurationMonths(subscriptionMetadata.termMonths);
  const orderDuration =
    parseDurationMonths(orderMetadata.duration_months) ??
    parseDurationMonths(orderMetadata.term_months) ??
    parseDurationMonths(orderMetadata.durationMonths) ??
    parseDurationMonths(orderMetadata.termMonths);

  const storedDuration = parseDurationMonths(candidate.term_months);
  if (storedDuration) {
    return { termMonths: storedDuration, source: 'stored' };
  }

  const itemDuration = parseDurationMonths(candidate.item_term_months);
  if (itemDuration) {
    return { termMonths: itemDuration, source: 'item' };
  }

  const orderTermDuration = parseDurationMonths(candidate.order_term_months);
  if (orderTermDuration) {
    return { termMonths: orderTermDuration, source: 'order' };
  }

  const metadataResolved = metadataDuration ?? orderDuration;
  if (metadataResolved) {
    return { termMonths: metadataResolved, source: 'metadata' };
  }

  const fallbackDuration = getSubscriptionDurationMonths(
    toDate(candidate.start_date),
    toDate(candidate.end_date)
  );

  return { termMonths: Math.max(1, fallbackDuration), source: 'date' };
}

function resolvePriceCents(candidate: RenewalCandidate): number | null {
  if (candidate.price_cents !== null && candidate.price_cents !== undefined) {
    return Number(candidate.price_cents);
  }
  if (
    candidate.item_price_cents !== null &&
    candidate.item_price_cents !== undefined
  ) {
    return Number(candidate.item_price_cents);
  }
  const orderHasCoupon = Boolean(
    candidate.order_coupon_id ||
      candidate.order_coupon_code ||
      (candidate.order_coupon_discount_cents !== null &&
        candidate.order_coupon_discount_cents !== undefined)
  );
  if (!orderHasCoupon) {
    if (
      candidate.order_total_cents !== null &&
      candidate.order_total_cents !== undefined
    ) {
      return Number(candidate.order_total_cents);
    }
  }
  return null;
}

function resolveBasePriceCents(candidate: RenewalCandidate): number | null {
  if (
    candidate.base_price_cents !== null &&
    candidate.base_price_cents !== undefined
  ) {
    return Number(candidate.base_price_cents);
  }
  if (
    candidate.item_base_price_cents !== null &&
    candidate.item_base_price_cents !== undefined
  ) {
    return Number(candidate.item_base_price_cents);
  }

  const subscriptionMetadata = parseJson(candidate.metadata) || {};
  const orderMetadata = parseJson(candidate.order_metadata) || {};

  const metadataBase =
    parseNumber(
      subscriptionMetadata.base_price_cents ??
        subscriptionMetadata.basePriceCents
    ) ??
    parseNumber(orderMetadata.base_price_cents ?? orderMetadata.basePriceCents);

  return metadataBase !== null ? Math.max(0, Math.round(metadataBase)) : null;
}

function resolveDiscountPercent(candidate: RenewalCandidate): number | null {
  if (
    candidate.discount_percent !== null &&
    candidate.discount_percent !== undefined
  ) {
    return Number(candidate.discount_percent);
  }
  if (
    candidate.item_discount_percent !== null &&
    candidate.item_discount_percent !== undefined
  ) {
    return Number(candidate.item_discount_percent);
  }

  const subscriptionMetadata = parseJson(candidate.metadata) || {};
  const orderMetadata = parseJson(candidate.order_metadata) || {};
  const metadataDiscount =
    subscriptionMetadata.discount_percent ??
    subscriptionMetadata.discountPercent ??
    orderMetadata.discount_percent ??
    orderMetadata.discountPercent;
  const parsed = parseNumber(metadataDiscount);
  if (parsed === null || parsed < 0 || parsed > 100) {
    return null;
  }
  return parsed;
}

function resolveCurrency(candidate: RenewalCandidate): string {
  return (
    candidate.currency ||
    candidate.order_currency ||
    candidate.item_currency ||
    'usd'
  ).toLowerCase();
}

function resolveDueDate(candidate: RenewalCandidate): Date {
  return toDate(
    candidate.next_billing_at || candidate.renewal_date || candidate.end_date
  );
}

export async function runSubscriptionRenewalSweep(): Promise<void> {
  const pool = getDatabasePool();
  const lookaheadMinutes = env.SUBSCRIPTION_RENEWAL_LOOKAHEAD_MINUTES;
  const batchSize = env.SUBSCRIPTION_RENEWAL_BATCH_SIZE;

  Logger.info('Subscription renewal sweep started', {
    lookaheadMinutes,
    batchSize,
  });

  const result = await pool.query(
    `
      SELECT
        s.*,
        p.name as product_name,
        pv.name as variant_name,
        o.metadata as order_metadata,
        o.currency as order_currency,
        o.total_cents as order_total_cents,
        o.term_months as order_term_months,
        o.coupon_id as order_coupon_id,
        o.coupon_code as order_coupon_code,
        o.coupon_discount_cents as order_coupon_discount_cents,
        oi.unit_price_cents as item_price_cents,
        oi.currency as item_currency,
        oi.term_months as item_term_months,
        oi.base_price_cents as item_base_price_cents,
        oi.discount_percent as item_discount_percent
      FROM subscriptions s
      LEFT JOIN product_variants pv ON pv.id = s.product_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      LEFT JOIN orders o ON o.id = s.order_id
      LEFT JOIN LATERAL (
        SELECT unit_price_cents, currency, term_months, base_price_cents, discount_percent
        FROM order_items
        WHERE order_id = s.order_id
        ORDER BY created_at ASC
        LIMIT 1
      ) oi ON true
      WHERE s.status = 'active'
        AND s.auto_renew = true
        AND s.cancellation_requested_at IS NULL
        AND COALESCE(s.status_reason, '') <> 'cancelled_by_user'
        AND (
          (s.next_billing_at IS NOT NULL AND s.next_billing_at <= NOW())
          OR (s.next_billing_at IS NULL AND s.end_date <= NOW() + ($1 || ' minutes')::interval)
        )
      ORDER BY COALESCE(s.next_billing_at, s.end_date) ASC
      LIMIT $2
    `,
    [lookaheadMinutes.toString(), batchSize]
  );

  const candidates = result.rows as RenewalCandidate[];
  if (candidates.length === 0) {
    Logger.info('Subscription renewal sweep complete (no candidates)');
    return;
  }

  for (const candidate of candidates) {
    const subscriptionId = candidate.id;
    const userId = candidate.user_id;
    const renewalMethod = candidate.renewal_method
      ? candidate.renewal_method.toLowerCase()
      : null;
    const priceCents = resolvePriceCents(candidate);
    const basePriceCents = resolveBasePriceCents(candidate);
    const discountPercent = resolveDiscountPercent(candidate);
    const currency = resolveCurrency(candidate);
    const durationResolution = resolveDurationMonths(candidate);
    const durationMonths = durationResolution.termMonths;

    if (!parseDurationMonths(candidate.term_months) && durationMonths > 0) {
      await updateSubscription(
        subscriptionId,
        { term_months: durationMonths },
        'term_months_backfill'
      );
      if (durationResolution.source === 'date') {
        Logger.warn('Auto-renew term resolved from date delta', {
          subscriptionId,
          durationMonths,
        });
      }
    }

    const cycleEndDate = resolveCycleEndDate({
      endDate: candidate.end_date,
      termStartAt: candidate.term_start_at ?? null,
      termMonths: durationMonths,
    });

    if (!cycleEndDate) {
      await updateSubscription(
        subscriptionId,
        {
          auto_renew: false,
          auto_renew_disabled_at: new Date(),
          next_billing_at: null,
          status_reason: 'auto_renew_missing_cycle_end',
        },
        'missing_cycle_end'
      );
      Logger.warn('Auto-renew disabled due to missing cycle end date', {
        subscriptionId,
      });
      continue;
    }

    subscriptionRenewalService.logCycleResolution({
      subscriptionId,
      cycleEndDate,
      source: 'auto_renew_sweep',
    });

    if (!renewalMethod) {
      await updateSubscription(
        subscriptionId,
        {
          status_reason: 'auto_renew_missing_method',
          next_billing_at: new Date(
            Date.now() + env.SUBSCRIPTION_RENEWAL_RETRY_MINUTES * 60 * 1000
          ),
        },
        'missing_method'
      );
      continue;
    }

    if (!priceCents || priceCents <= 0) {
      await updateSubscription(
        subscriptionId,
        {
          status_reason: 'auto_renew_missing_price',
          next_billing_at: new Date(
            Date.now() + env.SUBSCRIPTION_RENEWAL_RETRY_MINUTES * 60 * 1000
          ),
        },
        'missing_price'
      );
      continue;
    }

    if (renewalMethod === 'credits' && currency?.toUpperCase() !== 'USD') {
      await updateSubscription(
        subscriptionId,
        {
          status_reason: 'auto_renew_currency_mismatch',
          next_billing_at: new Date(
            Date.now() + env.SUBSCRIPTION_RENEWAL_RETRY_MINUTES * 60 * 1000
          ),
        },
        'currency_mismatch'
      );
      continue;
    }

    if (renewalMethod === 'credits') {
      const renewalLock = await subscriptionRenewalService.acquireRenewalLock({
        subscriptionId,
        cycleEndDate,
      });
      if (!renewalLock.acquired) {
        Logger.info('Skipping credit renewal due to active lock', {
          subscriptionId,
          cycleEndDate: renewalLock.cycleEndDate,
          status: renewalLock.status,
        });
        continue;
      }

      const amountUsd = priceCents / 100;
      const now = new Date();
      const currentEndDate = toDate(candidate.end_date);
      const termStartAt = currentEndDate > now ? currentEndDate : now;
      const nextDates = computeNextRenewalDates({
        endDate: currentEndDate,
        termMonths: durationMonths,
        autoRenew: true,
        now,
      });

      const creditResult = await creditService.spendCredits(
        userId,
        amountUsd,
        `Auto-renew subscription ${candidate.service_type} ${candidate.service_plan}`,
        {
          renewal: true,
          subscription_id: subscriptionId,
          service_type: candidate.service_type,
          service_plan: candidate.service_plan,
          duration_months: durationMonths,
          term_months: durationMonths,
          base_price_cents: basePriceCents ?? undefined,
          discount_percent: discountPercent ?? undefined,
        },
        {
          ...(candidate.order_id ? { orderId: candidate.order_id } : {}),
          ...(candidate.product_variant_id
            ? { productVariantId: candidate.product_variant_id }
            : {}),
          ...(nextDates.nextBillingAt
            ? { nextBillingAt: nextDates.nextBillingAt }
            : {}),
          priceCents,
          ...(basePriceCents !== null && basePriceCents !== undefined
            ? { basePriceCents }
            : {}),
          ...(discountPercent !== null && discountPercent !== undefined
            ? { discountPercent }
            : {}),
          termMonths: durationMonths,
          currency,
          autoRenew: true,
          renewalMethod: 'credits',
          statusReason: 'auto_renew_paid_with_credits',
        }
      );

      if (!creditResult.success) {
        await subscriptionRenewalService.markRenewalFailed({
          subscriptionId,
          cycleEndDate,
        });
        const retryAt = new Date(
          Date.now() + env.SUBSCRIPTION_RENEWAL_RETRY_MINUTES * 60 * 1000
        );
        const endDate = toDate(candidate.end_date);
        const endDateLabel = endDate.toISOString().slice(0, 10);
        const endDateKey = endDate.toISOString();
        const serviceLabel = formatSubscriptionDisplayName({
          productName: candidate.product_name ?? null,
          variantName: candidate.variant_name ?? null,
          serviceType: candidate.service_type,
          servicePlan: candidate.service_plan,
          termMonths: durationMonths,
        });
        const subscriptionShort = formatSubscriptionShortId(subscriptionId);
        const failureMessage = creditResult.error || 'Auto-renewal failed';
        const needsTopUp = failureMessage
          .toLowerCase()
          .includes('insufficient');

        try {
          await notificationService.createNotification({
            userId,
            type: 'subscription_renewal_failed',
            title: 'Auto-renewal failed',
            message: needsTopUp
              ? `We couldn't auto-renew your ${serviceLabel} subscription (${subscriptionShort}) because your credit balance is too low. Please top up before ${endDateLabel} to avoid expiration. We'll retry automatically.`
              : `We couldn't auto-renew your ${serviceLabel} subscription (${subscriptionShort}). Please ensure you have enough credits before ${endDateLabel} to avoid expiration. We'll retry automatically.`,
            metadata: {
              subscription_id: subscriptionId,
              renewal_method: 'credits',
              next_retry_at: retryAt.toISOString(),
              end_date: endDateKey,
              reason: failureMessage,
              link: '/dashboard/credits',
            },
            subscriptionId,
            dedupeKey: `subscription_renewal_failed:${subscriptionId}:${endDateKey}`,
          });
        } catch (error) {
          Logger.warn('Failed to create renewal failure notification', {
            subscriptionId,
            error,
          });
        }

        await updateSubscription(
          subscriptionId,
          {
            status_reason: 'auto_renew_credit_failed',
            next_billing_at: retryAt,
          },
          'credit_failed'
        );
        continue;
      }

      await subscriptionRenewalService.markRenewalSucceeded({
        subscriptionId,
        cycleEndDate,
      });

      const updateOk = await updateSubscription(
        subscriptionId,
        {
          term_start_at: termStartAt,
          end_date: nextDates.endDate,
          renewal_date: nextDates.renewalDate,
          next_billing_at: nextDates.nextBillingAt,
          status_reason: 'auto_renewed_credits',
          price_cents: priceCents,
          ...(basePriceCents !== null
            ? { base_price_cents: basePriceCents }
            : {}),
          ...(discountPercent !== null
            ? { discount_percent: discountPercent }
            : {}),
          term_months: durationMonths,
          currency,
          renewal_method: 'credits',
        },
        'credits_renewed'
      );

      const renewalNotes = `Renewal paid. Manual renewal required for ${candidate.service_type} ${candidate.service_plan}.`;
      const fulfillmentDueDate = new Date(Date.now() + 72 * 60 * 60 * 1000);
      await ensureRenewalTask({
        subscriptionId,
        userId,
        orderId: candidate.order_id ?? null,
        dueDate: fulfillmentDueDate,
        notes: renewalNotes,
        priority: 'high',
      });

      if (updateOk) {
        try {
          await notifyCreditsRenewalSuccess({
            userId,
            subscriptionId,
            serviceType: candidate.service_type,
            servicePlan: candidate.service_plan,
            productName: candidate.product_name ?? null,
            variantName: candidate.variant_name ?? null,
            termMonths: durationMonths,
          });
        } catch (error) {
          Logger.warn('Credits renewal success notification failed', {
            subscriptionId,
            error,
          });
        }
      }

      Logger.info('Auto-renewed subscription with credits', {
        subscriptionId,
        userId,
      });
      continue;
    }

    if (renewalMethod === 'stripe') {
      const amount = priceCents / 100;
      const currentAttemptAt = resolveDueDate(candidate);
      const endDate = toDate(candidate.end_date);
      const nextAttemptAt = getNextStripeRenewalAttemptDate(
        endDate,
        currentAttemptAt
      );

      const pendingPayment = await findPendingStripeRenewal(subscriptionId);

      if (pendingPayment) {
        const renewalLock = await subscriptionRenewalService.acquireRenewalLock(
          {
            subscriptionId,
            cycleEndDate,
          }
        );
        if (!renewalLock.acquired) {
          Logger.info('Skipping Stripe renewal due to active lock', {
            subscriptionId,
            cycleEndDate: renewalLock.cycleEndDate,
            status: renewalLock.status,
          });
          continue;
        }

        await subscriptionRenewalService.attachPaymentToRenewal({
          subscriptionId,
          cycleEndDate,
          paymentId: pendingPayment.recordId,
          status: 'processing',
        });
        const pendingCreatedAt =
          pendingPayment.createdAt instanceof Date
            ? pendingPayment.createdAt
            : new Date(pendingPayment.createdAt);
        const pendingAgeMs = Number.isNaN(pendingCreatedAt.getTime())
          ? 0
          : Date.now() - pendingCreatedAt.getTime();

        if (pendingAgeMs >= STRIPE_PENDING_TIMEOUT_MINUTES * 60 * 1000) {
          const reconcile = await paymentService.reconcileStripePaymentIntent(
            pendingPayment.paymentId
          );

          if (!reconcile.handled) {
            Logger.warn('Stripe renewal pending reconciliation failed', {
              subscriptionId,
              paymentId: pendingPayment.paymentId,
              error: reconcile.error,
            });
          }

          if (
            reconcile.status === 'processing' ||
            reconcile.status === 'pending'
          ) {
            await updateSubscription(
              subscriptionId,
              {
                status_reason: 'renewal_payment_created',
                next_billing_at: currentAttemptAt,
                renewal_method: 'stripe',
              },
              'stripe_pending_reconciled'
            );
          }

          continue;
        }

        await updateSubscription(
          subscriptionId,
          {
            status_reason: 'renewal_payment_created',
            next_billing_at: currentAttemptAt,
            renewal_method: 'stripe',
          },
          'stripe_pending_existing'
        );
        continue;
      }

      let paymentMethodId = candidate.billing_payment_method_id ?? null;
      let paymentMethod = paymentMethodId
        ? await paymentMethodService.getPaymentMethodById(
            paymentMethodId,
            userId
          )
        : null;

      if (!paymentMethod) {
        const fallback = await paymentMethodService.getDefaultPaymentMethod(
          userId,
          'stripe'
        );
        if (fallback) {
          paymentMethod = fallback;
          paymentMethodId = fallback.id;
        }
      }

      if (!paymentMethod || paymentMethod.status !== 'active') {
        const disableAutoRenew = !nextAttemptAt;
        await updateSubscription(
          subscriptionId,
          {
            status_reason: 'auto_renew_missing_payment_method',
            next_billing_at: nextAttemptAt ?? null,
            renewal_method: 'stripe',
            ...(disableAutoRenew
              ? {
                  auto_renew: false,
                  auto_renew_disabled_at: new Date(),
                }
              : {}),
          },
          'stripe_missing_payment_method'
        );

        try {
          await notifyStripeRenewalFailure({
            userId,
            subscriptionId,
            serviceType: candidate.service_type,
            servicePlan: candidate.service_plan,
            productName: candidate.product_name ?? null,
            variantName: candidate.variant_name ?? null,
            termMonths: durationMonths,
            endDate,
            renewalDate: candidate.renewal_date ?? null,
            priceCents,
            currency,
            reason: 'missing_payment_method',
            nextRetryAt: nextAttemptAt ?? null,
          });
        } catch (error) {
          Logger.warn('Stripe renewal missing method notification failed', {
            subscriptionId,
            error,
          });
        }
        continue;
      }

      if (!paymentMethod.provider_customer_id) {
        const disableAutoRenew = !nextAttemptAt;
        await updateSubscription(
          subscriptionId,
          {
            status_reason: 'auto_renew_missing_payment_method',
            next_billing_at: nextAttemptAt ?? null,
            renewal_method: 'stripe',
            ...(disableAutoRenew
              ? {
                  auto_renew: false,
                  auto_renew_disabled_at: new Date(),
                }
              : {}),
          },
          'stripe_missing_customer'
        );

        try {
          await notifyStripeRenewalFailure({
            userId,
            subscriptionId,
            serviceType: candidate.service_type,
            servicePlan: candidate.service_plan,
            productName: candidate.product_name ?? null,
            variantName: candidate.variant_name ?? null,
            termMonths: durationMonths,
            endDate,
            renewalDate: candidate.renewal_date ?? null,
            priceCents,
            currency,
            reason: 'missing_customer',
            nextRetryAt: nextAttemptAt ?? null,
          });
        } catch (error) {
          Logger.warn('Stripe renewal missing customer notification failed', {
            subscriptionId,
            error,
          });
        }
        continue;
      }

      const renewalLock = await subscriptionRenewalService.acquireRenewalLock({
        subscriptionId,
        cycleEndDate,
      });
      if (!renewalLock.acquired) {
        Logger.info('Skipping Stripe renewal due to active lock', {
          subscriptionId,
          cycleEndDate: renewalLock.cycleEndDate,
          status: renewalLock.status,
        });
        continue;
      }

      const paymentResult =
        await paymentService.createStripeOffSessionRenewalPayment({
          userId,
          amount,
          currency: currency || 'USD',
          description: `Subscription renewal: ${candidate.service_type} ${candidate.service_plan}`,
          paymentMethodId: paymentMethod.provider_payment_method_id,
          customerId: paymentMethod.provider_customer_id || '',
          subscriptionId,
          metadata: {
            renewal: true,
            subscription_id: subscriptionId,
            service_type: candidate.service_type,
            service_plan: candidate.service_plan,
            duration_months: durationMonths,
            term_months: durationMonths,
            base_price_cents: basePriceCents ?? undefined,
            discount_percent: discountPercent ?? undefined,
            payment_method_id: paymentMethod.provider_payment_method_id,
            user_payment_method_id: paymentMethod.id,
            expected_end_date: endDate.toISOString(),
            ...(candidate.renewal_date
              ? {
                  expected_renewal_date: toDate(
                    candidate.renewal_date
                  ).toISOString(),
                }
              : {}),
            off_session: true,
          },
          orderContext: {
            priceCents,
            currency,
            productVariantId: candidate.product_variant_id ?? null,
            ...(basePriceCents !== null && basePriceCents !== undefined
              ? { basePriceCents }
              : {}),
            ...(discountPercent !== null && discountPercent !== undefined
              ? { discountPercent }
              : {}),
            termMonths: durationMonths,
            autoRenew: true,
            nextBillingAt: currentAttemptAt,
            renewalMethod: 'stripe',
            statusReason: 'renewal_payment_created',
          },
        });

      if (!paymentResult.success && !paymentResult.paymentId) {
        await subscriptionRenewalService.markRenewalFailed({
          subscriptionId,
          cycleEndDate,
        });
        const disableAutoRenew = !nextAttemptAt;
        await updateSubscription(
          subscriptionId,
          {
            status_reason: 'renewal_payment_failed',
            next_billing_at: nextAttemptAt ?? null,
            ...(disableAutoRenew
              ? {
                  auto_renew: false,
                  auto_renew_disabled_at: new Date(),
                }
              : {}),
          },
          'stripe_payment_failed'
        );

        try {
          await notifyStripeRenewalFailure({
            userId,
            subscriptionId,
            serviceType: candidate.service_type,
            servicePlan: candidate.service_plan,
            productName: candidate.product_name ?? null,
            variantName: candidate.variant_name ?? null,
            termMonths: durationMonths,
            endDate,
            renewalDate: candidate.renewal_date ?? null,
            priceCents,
            currency,
            reason: paymentResult.error || 'stripe_payment_failed',
            nextRetryAt: nextAttemptAt ?? null,
          });
        } catch (error) {
          Logger.warn('Stripe renewal failure notification failed', {
            subscriptionId,
            error,
          });
        }
        continue;
      }

      if (paymentResult.paymentRecordId) {
        await subscriptionRenewalService.attachPaymentToRenewal({
          subscriptionId,
          cycleEndDate,
          paymentId: paymentResult.paymentRecordId,
          status: 'processing',
        });
      } else {
        await subscriptionRenewalService.beginRenewalProcessing({
          subscriptionId,
          cycleEndDate,
        });
      }

      await updateSubscription(
        subscriptionId,
        {
          status_reason: 'renewal_payment_created',
          next_billing_at: currentAttemptAt,
          renewal_method: 'stripe',
          ...(paymentMethodId
            ? { billing_payment_method_id: paymentMethodId }
            : {}),
        },
        'stripe_payment_created'
      );

      Logger.info('Stripe renewal payment created', {
        subscriptionId,
        paymentId: paymentResult.paymentId,
      });
      continue;
    }

    await updateSubscription(
      subscriptionId,
      {
        status_reason: 'auto_renew_manual_review',
        next_billing_at: new Date(
          Date.now() + env.SUBSCRIPTION_RENEWAL_RETRY_MINUTES * 60 * 1000
        ),
      },
      'manual_review'
    );
  }

  Logger.info('Subscription renewal sweep complete', {
    candidates: candidates.length,
  });
}

export async function runSubscriptionExpirySweep(): Promise<void> {
  Logger.info('Subscription expiry sweep started');
  const result = await subscriptionService.updateExpiredSubscriptions();

  if (!result.success) {
    Logger.warn('Subscription expiry sweep failed', {
      error: result.error,
    });
    return;
  }

  const expiredSubscriptionIds = result.data?.subscription_ids || [];
  if (expiredSubscriptionIds.length > 0) {
    try {
      const cleanup = await paymentService.cancelPendingStripeRenewalPayments(
        expiredSubscriptionIds
      );
      Logger.info('Expired subscription Stripe renewal cleanup', {
        expired: expiredSubscriptionIds.length,
        cancelled: cleanup.cancelled,
        skipped: cleanup.skipped,
        errors: cleanup.errors,
      });
    } catch (error) {
      Logger.warn('Expired subscription Stripe renewal cleanup failed', {
        error,
      });
    }
  }

  Logger.info('Subscription expiry sweep complete', {
    updated: result.data?.updated || 0,
  });
}

const REMINDER_WINDOW_HOURS = 2;

const SUBSCRIPTION_REMINDERS = [
  {
    hours: 168,
    title: 'Subscription expiring soon',
    messageSuffix: 'expires in 7 days.',
  },
  {
    hours: 72,
    title: 'Subscription expiring in 3 days',
    messageSuffix: 'expires in 3 days.',
  },
];

export async function runSubscriptionReminderSweep(): Promise<void> {
  Logger.info('Subscription reminder sweep started');
  const pool = getDatabasePool();
  const notifications: {
    userId: string;
    type: 'subscription_expiring';
    title: string;
    message: string;
    metadata: Record<string, unknown>;
    subscriptionId: string;
    dedupeKey: string;
  }[] = [];

  try {
    for (const reminder of SUBSCRIPTION_REMINDERS) {
      const result = await pool.query(
        `
        SELECT s.id,
               s.user_id,
               s.service_type,
               s.service_plan,
               s.end_date,
               s.term_months,
               p.name AS product_name,
               pv.name AS variant_name
        FROM subscriptions s
        LEFT JOIN product_variants pv ON pv.id = s.product_variant_id
        LEFT JOIN products p ON p.id = pv.product_id
        WHERE s.status = 'active'
          AND COALESCE(s.auto_renew, FALSE) = FALSE
          AND s.cancellation_requested_at IS NULL
          AND COALESCE(s.status_reason, '') <> 'cancelled_by_user'
          AND s.end_date IS NOT NULL
          AND s.end_date > NOW()
          AND s.end_date <= NOW() + ($1 * INTERVAL '1 hour')
          AND s.end_date > NOW() + ($1 * INTERVAL '1 hour') - ($2 * INTERVAL '1 hour')
        `,
        [reminder.hours, REMINDER_WINDOW_HOURS]
      );

      for (const row of result.rows) {
        const endDate =
          row.end_date instanceof Date ? row.end_date : new Date(row.end_date);
        const serviceLabel = formatSubscriptionDisplayName({
          productName: row.product_name ?? null,
          variantName: row.variant_name ?? null,
          serviceType: row.service_type,
          servicePlan: row.service_plan,
          termMonths: row.term_months ?? null,
        });
        const subscriptionShort = formatSubscriptionShortId(row.id);
        const message = `Your ${serviceLabel} subscription (${subscriptionShort}) ${reminder.messageSuffix}`;
        notifications.push({
          userId: row.user_id,
          type: 'subscription_expiring',
          title: reminder.title,
          message,
          metadata: {
            subscription_id: row.id,
            service_type: row.service_type,
            service_plan: row.service_plan,
            expires_at: endDate.toISOString(),
            reminder_hours: reminder.hours,
            link: '/dashboard/subscriptions',
          },
          subscriptionId: row.id,
          dedupeKey: `subscription_expiring:${row.id}:${reminder.hours}:${endDate.toISOString()}`,
        });
      }
    }

    const createResult =
      await notificationService.createNotifications(notifications);

    if (!createResult.success) {
      Logger.warn(
        'Subscription reminder sweep failed to create notifications',
        {
          error: createResult.error,
        }
      );
      return;
    }

    Logger.info('Subscription reminder sweep complete', {
      created: createResult.data.created,
      candidates: notifications.length,
    });
  } catch (error) {
    Logger.error('Subscription reminder sweep failed:', error);
  }
}

const SELECTION_REMINDER_HOURS = [24, 48];
const SELECTION_AUTO_SELECT_HOURS = 72;
const MMU_TASK_LEAD_DAYS = 7;

async function ensureSelectionIssueTask(params: {
  subscriptionId: string;
  userId: string;
  orderId?: string | null;
  notes: string;
}): Promise<void> {
  const pool = getDatabasePool();
  const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const updateResult = await pool.query(
    `UPDATE admin_tasks
     SET is_issue = TRUE,
         assigned_admin = COALESCE(assigned_admin, NULL),
         notes = CASE
           WHEN notes IS NULL OR notes = '' THEN $2
           ELSE notes || '\n' || $2
         END
     WHERE subscription_id = $1
       AND task_category = 'selection_pending'
       AND completed_at IS NULL
     RETURNING id`,
    [params.subscriptionId, params.notes]
  );

  if ((updateResult.rowCount ?? 0) > 0) {
    return;
  }

  await pool.query(
    `INSERT INTO admin_tasks
      (subscription_id, user_id, order_id, task_type, due_date, priority, notes, task_category, sla_due_at, is_issue)
     SELECT $1, $2, $3, 'support', $4, 'high', $5, 'selection_pending', $6, TRUE
     WHERE NOT EXISTS (
       SELECT 1
       FROM admin_tasks
       WHERE subscription_id = $1
         AND task_category = 'selection_pending'
         AND is_issue = TRUE
         AND completed_at IS NULL
     )`,
    [
      params.subscriptionId,
      params.userId,
      params.orderId ?? null,
      dueDate,
      params.notes,
      dueDate,
    ]
  );
}

export async function runUpgradeSelectionReminderSweep(): Promise<void> {
  Logger.info('Upgrade selection reminder sweep started');
  const pool = getDatabasePool();
  const now = new Date();

  try {
    const result = await pool.query(
      `SELECT s.id AS subscription_id,
              s.user_id,
              s.order_id,
              s.service_type,
              s.service_plan,
              s.created_at AS subscription_created_at,
              sel.created_at AS selection_created_at,
              sel.reminder_24h_at,
              sel.reminder_48h_at,
              sel.upgrade_options_snapshot
       FROM subscriptions s
       JOIN subscription_upgrade_selections sel
         ON sel.subscription_id = s.id
       WHERE s.status = 'pending'
         AND sel.submitted_at IS NULL
         AND sel.locked_at IS NULL`
    );

    for (const row of result.rows) {
      const createdAtRaw =
        row.selection_created_at || row.subscription_created_at;
      const createdAt =
        createdAtRaw instanceof Date ? createdAtRaw : new Date(createdAtRaw);
      if (Number.isNaN(createdAt.getTime())) {
        continue;
      }

      const ageHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
      const subscriptionId = row.subscription_id as string;
      const shortId = formatSubscriptionShortId(subscriptionId);

      const options = parseUpgradeOptionsSnapshot(row.upgrade_options_snapshot);
      const selectionOptionsEnabled =
        options?.allow_new_account === true ||
        options?.allow_own_account === true;
      if (!selectionOptionsEnabled) {
        if (!options?.manual_monthly_upgrade) {
          await upgradeSelectionService.markSelectionResolved({
            subscriptionId,
          });
        }
        continue;
      }

      for (const reminderHours of SELECTION_REMINDER_HOURS) {
        const reminderAt =
          reminderHours === 24 ? row.reminder_24h_at : row.reminder_48h_at;
        if (ageHours >= reminderHours && !reminderAt) {
          await notificationService.createNotification({
            userId: row.user_id,
            type: 'upgrade_selection_reminder',
            title: 'Complete your upgrade selection',
            message: `Please choose your upgrade option for ${shortId}.`,
            metadata: {
              subscription_id: subscriptionId,
              reminder_hours: reminderHours,
              link: `/dashboard/subscriptions/${subscriptionId}`,
            },
            subscriptionId,
            dedupeKey: `selection_reminder_${reminderHours}:${subscriptionId}`,
          });

          await upgradeSelectionService.markReminder({
            subscriptionId,
            reminder: reminderHours === 24 ? '24h' : '48h',
          });
        }
      }

      if (ageHours < SELECTION_AUTO_SELECT_HOURS) {
        continue;
      }

      if (options?.allow_new_account) {
        const manualMonthly = options.manual_monthly_upgrade === true;
        const autoSelection = await upgradeSelectionService.submitSelection({
          subscriptionId,
          selectionType: 'upgrade_new_account',
          manualMonthlyAcknowledgedAt: manualMonthly ? now : null,
          autoSelectedAt: now,
        });

        if (autoSelection) {
          const noteParts = [
            'Auto-selected Upgrade New Account after 72h with no user response.',
            `Subscription ${subscriptionId}.`,
          ];

          await subscriptionService.createCredentialProvisionTask({
            subscriptionId,
            userId: row.user_id,
            orderId: row.order_id ?? null,
            notes: noteParts.join(' '),
          });

          await subscriptionService.completeSelectionPendingTasks({
            subscriptionId,
            note: `[${new Date().toISOString()}] Auto-selected upgrade`,
          });

          await subscriptionService.updateSubscriptionForAdmin(subscriptionId, {
            status_reason: 'selection_auto_submitted',
          });
        }
      } else {
        const issueNotes = [
          'No upgrade selection after 72h and new-account option is disabled.',
          `Subscription ${subscriptionId}.`,
          `Order ${row.order_id ?? 'n/a'}.`,
          `Service ${row.service_type} ${row.service_plan}.`,
        ].join(' ');
        await ensureSelectionIssueTask({
          subscriptionId,
          userId: row.user_id,
          orderId: row.order_id ?? null,
          notes: issueNotes,
        });
      }
    }
  } catch (error) {
    Logger.error('Upgrade selection reminder sweep failed:', error);
  }
}

export async function runManualMonthlyUpgradeSweep(): Promise<void> {
  Logger.info('Manual monthly upgrade sweep started');
  const pool = getDatabasePool();
  const now = new Date();

  try {
    const result = await pool.query(
      `SELECT s.id AS subscription_id,
              s.user_id,
              s.order_id,
              s.service_type,
              s.service_plan,
              s.term_start_at,
              s.term_months,
              s.end_date,
              sel.upgrade_options_snapshot
       FROM subscriptions s
       JOIN subscription_upgrade_selections sel
         ON sel.subscription_id = s.id
       WHERE s.status = 'active'
         AND s.term_start_at IS NOT NULL
         AND s.term_months IS NOT NULL
         AND s.term_months > 1
         AND sel.submitted_at IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM admin_tasks t
           WHERE t.subscription_id = s.id
             AND t.task_type = 'renewal'
             AND t.completed_at IS NULL
         )`
    );

    let created = 0;

    for (const row of result.rows) {
      const options = parseUpgradeOptionsSnapshot(row.upgrade_options_snapshot);
      if (!options?.manual_monthly_upgrade) {
        continue;
      }

      const termStartAt =
        row.term_start_at instanceof Date
          ? row.term_start_at
          : new Date(row.term_start_at);
      if (Number.isNaN(termStartAt.getTime())) {
        continue;
      }

      const termMonths = Number(row.term_months);
      if (!Number.isFinite(termMonths) || termMonths <= 1) {
        continue;
      }

      const effectiveTermMonths = Math.max(0, termMonths - 1);
      if (effectiveTermMonths <= 0) {
        continue;
      }

      const cycleInfo = getMmuCycleInfo({
        termStartAt,
        termMonths: effectiveTermMonths,
        now,
      });

      if (!cycleInfo) {
        continue;
      }

      if (!shouldCreateMmuTask(cycleInfo.cycleEnd, now, MMU_TASK_LEAD_DAYS)) {
        continue;
      }

      const legacyTotal = cycleInfo.cycleTotal + 1;
      const existing = await pool.query(
        `SELECT 1
         FROM admin_tasks
         WHERE subscription_id = $1
           AND task_type = 'manual_monthly_upgrade'
           AND mmu_cycle_index = $2
           AND (mmu_cycle_total = $3 OR mmu_cycle_total = $4)
           AND created_at >= $5
         LIMIT 1`,
        [
          row.subscription_id,
          cycleInfo.cycleIndex,
          cycleInfo.cycleTotal,
          legacyTotal,
          termStartAt,
        ]
      );

      if (existing.rows.length > 0) {
        continue;
      }

      const dueDate = cycleInfo.cycleEnd;
      const note = `MMU ${cycleInfo.cycleIndex}/${cycleInfo.cycleTotal} for ${row.service_type} ${row.service_plan}.`;

      await pool.query(
        `INSERT INTO admin_tasks
          (subscription_id, user_id, order_id, task_type, due_date, priority, notes, task_category, sla_due_at, mmu_cycle_index, mmu_cycle_total)
         VALUES ($1, $2, $3, 'manual_monthly_upgrade', $4, 'medium', $5, 'manual_monthly_upgrade', $6, $7, $8)`,
        [
          row.subscription_id,
          row.user_id,
          row.order_id ?? null,
          dueDate,
          note,
          dueDate,
          cycleInfo.cycleIndex,
          cycleInfo.cycleTotal,
        ]
      );

      created += 1;
    }

    Logger.info('Manual monthly upgrade sweep complete', {
      candidates: result.rows.length,
      created,
    });
  } catch (error) {
    Logger.error('Manual monthly upgrade sweep failed:', error);
  }
}
