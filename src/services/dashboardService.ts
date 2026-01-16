import { getDatabasePool } from '../config/database';
import { Logger } from '../utils/logger';
import { creditService } from './creditService';
import { orderService } from './orderService';
import { subscriptionService } from './subscriptionService';
import { catalogService } from './catalogService';
import { getRenewalState } from '../utils/subscriptionHelpers';
import { getPaymentMethodBadge } from '../utils/orderHelpers';
import {
  createErrorResult,
  createSuccessResult,
  ServiceResult,
} from '../types/service';
import type { OrderListItem } from '../types/order';
import type { PriceHistory } from '../types/catalog';
import { computeTermPricing } from '../utils/termPricing';
import {
  normalizeCurrencyCode,
  type SupportedCurrency,
} from '../utils/currency';

const UPCOMING_RENEWAL_WINDOW_DAYS = 7;
const DUE_SOON_DAYS = 3;

export interface DashboardAlert {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  count?: number;
  metadata?: Record<string, unknown>;
}

export interface DashboardUpcomingRenewal {
  id: string;
  service_type: string;
  service_plan: string;
  price_cents: number | null;
  currency: string | null;
  display_price_cents?: number | null;
  display_currency?: string | null;
  next_billing_at: Date | null;
  renewal_date: Date | null;
  renewal_method: string | null;
  renewal_state: string;
  days_until_renewal: number | null;
}

export interface DashboardOrderSummary extends OrderListItem {
  payment_method_badge: {
    type: string;
    label: string;
  };
  display_total_cents?: number | null;
  display_currency?: string | null;
}

export interface DashboardOverview {
  counts: {
    active_subscriptions: number;
    upcoming_renewals: number;
  };
  credits: {
    available_balance: number;
    pending_balance: number;
    currency: string;
  };
  alerts: DashboardAlert[];
  upcoming_renewals: DashboardUpcomingRenewal[];
  recent_orders: DashboardOrderSummary[];
}

export type DashboardOverviewResult = ServiceResult<DashboardOverview>;

class DashboardService {
  async getOverview(
    userId: string,
    preferredCurrency: SupportedCurrency
  ): Promise<DashboardOverviewResult> {
    try {
      const pool = getDatabasePool();
      const upcomingParams = [userId, UPCOMING_RENEWAL_WINDOW_DAYS];
      const dueSoonParams = [userId, DUE_SOON_DAYS];

      const [
        activeCount,
        upcomingCountResult,
        upcomingListResult,
        dueSoonCountResult,
        overdueCountResult,
        failureCountResult,
        creditDueResult,
        recentOrdersResult,
      ] = await Promise.all([
        subscriptionService.getActiveSubscriptionsCount(userId),
        pool.query(
          `
          SELECT COUNT(*) as count
          FROM subscriptions
          WHERE user_id = $1
            AND status = 'active'
            AND auto_renew = true
            AND COALESCE(next_billing_at, renewal_date) IS NOT NULL
            AND COALESCE(next_billing_at, renewal_date) <= NOW() + ($2 * INTERVAL '1 day')
          `,
          upcomingParams
        ),
        pool.query(
          `
          SELECT id, service_type, service_plan, price_cents, currency,
                 auto_renew, next_billing_at, renewal_date, renewal_method,
                 product_variant_id, term_months, discount_percent
          FROM subscriptions
          WHERE user_id = $1
            AND status = 'active'
            AND auto_renew = true
            AND COALESCE(next_billing_at, renewal_date) IS NOT NULL
            AND COALESCE(next_billing_at, renewal_date) <= NOW() + ($2 * INTERVAL '1 day')
          ORDER BY COALESCE(next_billing_at, renewal_date) ASC
          LIMIT 3
          `,
          upcomingParams
        ),
        pool.query(
          `
          SELECT COUNT(*) as count
          FROM subscriptions
          WHERE user_id = $1
            AND status = 'active'
            AND auto_renew = true
            AND COALESCE(next_billing_at, renewal_date) IS NOT NULL
            AND COALESCE(next_billing_at, renewal_date) <= NOW() + ($2 * INTERVAL '1 day')
          `,
          dueSoonParams
        ),
        pool.query(
          `
          SELECT COUNT(*) as count
          FROM subscriptions
          WHERE user_id = $1
            AND status = 'active'
            AND auto_renew = true
            AND COALESCE(next_billing_at, renewal_date) IS NOT NULL
            AND COALESCE(next_billing_at, renewal_date) < NOW()
          `,
          [userId]
        ),
        pool.query(
          `
          SELECT COUNT(*) as count
          FROM subscriptions
          WHERE user_id = $1
            AND status = 'active'
            AND status_reason = ANY($2::text[])
          `,
          [
            userId,
            [
              'renewal_payment_failed',
              'auto_renew_credit_failed',
              'auto_renew_missing_payment_method',
            ],
          ]
        ),
        pool.query(
          `
          SELECT COALESCE(SUM(price_cents), 0) as total_cents
          FROM subscriptions
          WHERE user_id = $1
            AND status = 'active'
            AND auto_renew = true
            AND renewal_method = 'credits'
            AND COALESCE(next_billing_at, renewal_date) IS NOT NULL
            AND COALESCE(next_billing_at, renewal_date) <= NOW() + ($2 * INTERVAL '1 day')
          `,
          upcomingParams
        ),
        orderService.listOrdersForUser({
          userId,
          limit: 3,
          offset: 0,
          includeItems: true,
          includeCart: false,
        }),
      ]);

      const upcomingCount = parseInt(
        upcomingCountResult.rows[0]?.count || '0',
        10
      );
      const dueSoonCount = parseInt(
        dueSoonCountResult.rows[0]?.count || '0',
        10
      );
      const overdueCount = parseInt(
        overdueCountResult.rows[0]?.count || '0',
        10
      );
      const failureCount = parseInt(
        failureCountResult.rows[0]?.count || '0',
        10
      );
      const creditDueCents = parseInt(
        creditDueResult.rows[0]?.total_cents || '0',
        10
      );

      let balance = null;
      try {
        balance = await creditService.getUserBalance(userId);
      } catch (error) {
        Logger.error('Failed to fetch credit balance for dashboard:', error);
      }

      const availableCredits = balance?.availableBalance ?? 0;
      const pendingCredits = balance?.pendingBalance ?? 0;
      const creditDueAmount = creditDueCents / 100;

      const upcomingRows = upcomingListResult.rows || [];
      const orderRows = recentOrdersResult.orders || [];

      const variantIds = new Set<string>();
      for (const row of upcomingRows) {
        if (row.product_variant_id) {
          variantIds.add(row.product_variant_id);
        }
      }
      for (const order of orderRows) {
        for (const item of order.items || []) {
          if (item.product_variant_id) {
            variantIds.add(item.product_variant_id);
          }
        }
      }

      const preferredCurrencyNormalized =
        normalizeCurrencyCode(preferredCurrency);
      const preferredPriceMap: Map<string, PriceHistory> =
        variantIds.size > 0
          ? await catalogService.listCurrentPricesForCurrency({
              variantIds: Array.from(variantIds),
              currency: preferredCurrency,
            })
          : new Map<string, PriceHistory>();

      const upcomingRenewals: DashboardUpcomingRenewal[] = upcomingRows.map(
        row => {
          const priceCents =
            row.price_cents !== null && row.price_cents !== undefined
              ? parseInt(row.price_cents, 10)
              : null;
          const { state, daysUntil } = getRenewalState({
            autoRenew: row.auto_renew,
            nextBillingAt: row.next_billing_at,
            renewalDate: row.renewal_date,
          });

          let displayPriceCents: number | null = null;
          let displayCurrency: string | null = null;
          const currentPrice = row.product_variant_id
            ? preferredPriceMap.get(row.product_variant_id)
            : null;
          const basePriceCents = currentPrice
            ? Number(currentPrice.price_cents)
            : Number.NaN;
          const resolvedCurrency = normalizeCurrencyCode(
            currentPrice?.currency
          );
          if (Number.isFinite(basePriceCents) && resolvedCurrency) {
            const termMonths = row.term_months ?? 1;
            const discountPercent = row.discount_percent ?? 0;
            const snapshot = computeTermPricing({
              basePriceCents,
              termMonths,
              discountPercent,
            });
            displayPriceCents = snapshot.totalPriceCents;
            displayCurrency = resolvedCurrency;
          }

          return {
            id: row.id,
            service_type: row.service_type,
            service_plan: row.service_plan,
            price_cents: priceCents,
            currency: row.currency ?? null,
            display_price_cents: displayPriceCents,
            display_currency: displayCurrency,
            next_billing_at: row.next_billing_at ?? null,
            renewal_date: row.renewal_date ?? null,
            renewal_method: row.renewal_method ?? null,
            renewal_state: state,
            days_until_renewal: daysUntil,
          };
        }
      );

      const orderCurrencies = new Set<string>();
      if (preferredCurrencyNormalized) {
        for (const order of orderRows) {
          const orderCurrency = normalizeCurrencyCode(order.currency);
          if (orderCurrency && orderCurrency !== preferredCurrencyNormalized) {
            orderCurrencies.add(orderCurrency);
          }
        }
      }

      const orderCurrencyMaps = new Map<string, Map<string, PriceHistory>>();
      for (const currency of orderCurrencies) {
        orderCurrencyMaps.set(
          currency,
          await catalogService.listCurrentPricesForCurrency({
            variantIds: Array.from(variantIds),
            currency,
          })
        );
      }

      const recentOrders: DashboardOrderSummary[] = orderRows.map(order => {
        let displayTotalCents: number | null = null;
        let displayCurrency: string | null = null;
        const orderCurrency = normalizeCurrencyCode(order.currency);

        if (
          preferredCurrencyNormalized &&
          orderCurrency &&
          orderCurrency !== preferredCurrencyNormalized
        ) {
          const orderPriceMap = orderCurrencyMaps.get(orderCurrency);
          const items = order.items || [];

          if (orderPriceMap && items.length > 0) {
            let canDisplay = true;
            let weightedRatioSum = 0;
            let weightSum = 0;

            for (const item of items) {
              if (!item.product_variant_id) {
                canDisplay = false;
                break;
              }
              const preferredPrice = preferredPriceMap.get(
                item.product_variant_id
              );
              const orderPrice = orderPriceMap.get(item.product_variant_id);
              const preferredBase = preferredPrice
                ? Number(preferredPrice.price_cents)
                : Number.NaN;
              const orderBase = orderPrice
                ? Number(orderPrice.price_cents)
                : Number.NaN;
              if (
                !Number.isFinite(preferredBase) ||
                !Number.isFinite(orderBase) ||
                orderBase <= 0
              ) {
                canDisplay = false;
                break;
              }

              const itemTotal = Number(item.total_price_cents);
              if (!Number.isFinite(itemTotal)) {
                canDisplay = false;
                break;
              }

              const weight = itemTotal > 0 ? itemTotal : 1;
              weightedRatioSum += (preferredBase / orderBase) * weight;
              weightSum += weight;
            }

            const baseTotal = order.total_cents ?? order.subtotal_cents;
            if (
              canDisplay &&
              weightSum > 0 &&
              baseTotal !== null &&
              baseTotal !== undefined
            ) {
              displayTotalCents = Math.round(
                Number(baseTotal) * (weightedRatioSum / weightSum)
              );
              displayCurrency = preferredCurrencyNormalized;
            }
          }
        }

        return {
          ...order,
          payment_method_badge: getPaymentMethodBadge(order),
          display_total_cents: displayTotalCents,
          display_currency: displayCurrency,
        };
      });

      const alerts: DashboardAlert[] = [];

      if (overdueCount > 0) {
        alerts.push({
          type: 'renewal_overdue',
          severity: 'critical',
          message: `${overdueCount} renewal${overdueCount > 1 ? 's' : ''} overdue`,
          count: overdueCount,
        });
      }

      if (dueSoonCount > 0) {
        alerts.push({
          type: 'renewal_due_soon',
          severity: 'warning',
          message: `${dueSoonCount} renewal${dueSoonCount > 1 ? 's' : ''} due soon`,
          count: dueSoonCount,
        });
      }

      if (failureCount > 0) {
        alerts.push({
          type: 'renewal_payment_failed',
          severity: 'critical',
          message: `${failureCount} renewal payment${failureCount > 1 ? 's' : ''} failed`,
          count: failureCount,
        });
      }

      if (creditDueAmount > 0 && availableCredits < creditDueAmount) {
        alerts.push({
          type: 'low_credits',
          severity: 'warning',
          message: 'Credits may be insufficient for upcoming renewals',
          metadata: {
            available_credits: availableCredits,
            required_credits: creditDueAmount,
          },
        });
      }

      return createSuccessResult({
        counts: {
          active_subscriptions: activeCount,
          upcoming_renewals: upcomingCount,
        },
        credits: {
          available_balance: availableCredits,
          pending_balance: pendingCredits,
          currency: 'USD',
        },
        alerts,
        upcoming_renewals: upcomingRenewals,
        recent_orders: recentOrders,
      });
    } catch (error) {
      Logger.error('Failed to build dashboard overview:', error);
      return createErrorResult('Failed to build dashboard overview');
    }
  }
}

export const dashboardService = new DashboardService();
