import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authPreHandler } from '../middleware/authMiddleware';
import { createRateLimitHandler } from '../middleware/rateLimitMiddleware';
import { getDatabasePool } from '../config/database';
import { dashboardService } from '../services/dashboardService';
import { perkService } from '../services/perkService';
import { ErrorResponses, SuccessResponses } from '../utils/response';
import { Logger } from '../utils/logger';
import {
  resolvePreferredCurrency,
  resolveCountryFromHeaders,
  type SupportedCurrency,
} from '../utils/currency';
import { getSubscriptionDurationMonths } from '../utils/subscriptionHelpers';

const dashboardOverviewRateLimit = createRateLimitHandler({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `dashboard_overview:${userId}`;
  },
});

const prelaunchRewardsRateLimit = createRateLimitHandler({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `dashboard_prelaunch:${userId}`;
  },
});

const prelaunchClaimRateLimit = createRateLimitHandler({
  windowMs: 60 * 1000,
  maxRequests: 15,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `dashboard_prelaunch_claim:${userId}`;
  },
});

const resolveRequestCurrency = (request: FastifyRequest): SupportedCurrency => {
  const queryCurrency = (request.query as { currency?: string })?.currency;
  const headerCurrency = request.headers['x-currency'];
  const cookieCurrency = request.cookies?.['preferred_currency'];
  const headerCountry = resolveCountryFromHeaders(
    request.headers as Record<string, string | string[] | undefined>
  );

  return resolvePreferredCurrency({
    queryCurrency: queryCurrency ?? null,
    headerCurrency: typeof headerCurrency === 'string' ? headerCurrency : null,
    cookieCurrency: typeof cookieCurrency === 'string' ? cookieCurrency : null,
    headerCountry,
    fallback: 'USD',
  });
};

const parseRewardMetadata = (value: any): Record<string, any> | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
};

const isRewardRedeemed = (metadata: Record<string, any> | null): boolean => {
  if (!metadata) return false;
  return Boolean(
    metadata['redeemed_at'] ||
      metadata['redeemedAt'] ||
      metadata['redeemed_by'] ||
      metadata['redeemed_by_user_id'] ||
      metadata['redeemedByUserId'] ||
      metadata['is_redeemed'] === true ||
      metadata['isRedeemed'] === true
  );
};

const resolveSubscriptionTermMonths = (row: {
  term_months?: number | null;
  start_date?: Date | string | null;
  end_date?: Date | string | null;
}): number | null => {
  const termMonths = row.term_months;
  if (Number.isFinite(termMonths)) {
    return Number(termMonths);
  }
  if (!row.start_date || !row.end_date) return null;
  const start = new Date(row.start_date);
  const end = new Date(row.end_date);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null;
  }
  return Math.max(1, getSubscriptionDurationMonths(start, end));
};

export async function dashboardRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/overview',
    {
      preHandler: [dashboardOverviewRateLimit, authPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        const preferredCurrency = resolveRequestCurrency(request);
        const result = await dashboardService.getOverview(
          userId,
          preferredCurrency
        );
        if (!result.success) {
          return ErrorResponses.internalError(
            reply,
            result.error || 'Failed to build dashboard overview'
          );
        }

        return SuccessResponses.ok(reply, result.data);
      } catch (error) {
        Logger.error('Dashboard overview failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to build dashboard overview'
        );
      }
    }
  );

  fastify.get(
    '/prelaunch-rewards',
    {
      preHandler: [prelaunchRewardsRateLimit, authPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        const pool = getDatabasePool();
        const [
          rewardsResult,
          vouchersResult,
          raffleResult,
          subscriptionsResult,
        ] = await Promise.all([
          pool.query(
            `SELECT id, source_type, source_id, reward_type, tier, applies_to,
                    free_months, founder_status, prize_won, notes, awarded_at,
                    metadata, created_at
             FROM user_perks
             WHERE user_id = $1
             ORDER BY awarded_at DESC NULLS LAST, created_at DESC`,
            [userId]
          ),
          pool.query(
            `SELECT id, voucher_type, scope, amount, status, event_date,
                    issued_at, redeemed_at, metadata
             FROM user_vouchers
             WHERE user_id = $1
             ORDER BY issued_at DESC`,
            [userId]
          ),
          pool.query(
            `SELECT id, raffle_id, source, event_date, count,
                    metadata, created_at, updated_at
             FROM user_raffle_entries
             WHERE user_id = $1
             ORDER BY event_date DESC, created_at DESC`,
            [userId]
          ),
          pool.query(
            `SELECT s.id, s.status, s.term_months, s.created_at,
                    s.term_start_at, s.start_date,
                    s.product_variant_id, p.name AS product_name,
                    pv.name AS variant_name
             FROM subscriptions s
             LEFT JOIN product_variants pv ON pv.id = s.product_variant_id
             LEFT JOIN products p ON p.id = pv.product_id
             WHERE s.user_id = $1
             ORDER BY s.created_at ASC`,
            [userId]
          ),
        ]);

        const subscriptions = subscriptionsResult.rows || [];
        const activeSubscriptions = subscriptions.filter(
          (subscription: { status?: string }) =>
            subscription.status === 'active'
        );
        const resolveActivationTime = (subscription: {
          term_start_at?: Date | string | null;
          start_date?: Date | string | null;
          created_at?: Date | string | null;
        }): number | null => {
          const candidate =
            subscription.term_start_at ||
            subscription.start_date ||
            subscription.created_at;
          if (!candidate) return null;
          const time = new Date(candidate).getTime();
          return Number.isNaN(time) ? null : time;
        };
        let firstActivatedSubscription: any | null = null;
        let firstActivationTime = Number.POSITIVE_INFINITY;
        for (const subscription of subscriptions) {
          if (subscription.status === 'pending') {
            continue;
          }
          const activationTime = resolveActivationTime(subscription);
          if (activationTime === null) {
            continue;
          }
          if (activationTime < firstActivationTime) {
            firstActivationTime = activationTime;
            firstActivatedSubscription = subscription;
          }
        }

        const rewards = (rewardsResult.rows || [])
          .map(row => ({
            ...row,
            metadata: parseRewardMetadata(row.metadata),
          }))
          .filter(row => {
            if (row.source_type !== 'referral_reward') {
              return true;
            }
            if (row.applies_to !== 'first_purchase') {
              return true;
            }
            if (isRewardRedeemed(row.metadata)) {
              return true;
            }
            if (!firstActivatedSubscription) {
              return true;
            }
            return !['expired', 'cancelled'].includes(
              String(firstActivatedSubscription.status || '').toLowerCase()
            );
          });

        return SuccessResponses.ok(reply, {
          rewards,
          vouchers: vouchersResult.rows || [],
          raffleEntries: raffleResult.rows || [],
          subscriptions: activeSubscriptions,
          firstSubscription: firstActivatedSubscription,
        });
      } catch (error) {
        Logger.error('Prelaunch rewards fetch failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to load prelaunch rewards'
        );
      }
    }
  );

  fastify.post(
    '/prelaunch-rewards/claim',
    {
      preHandler: [prelaunchClaimRateLimit, authPreHandler],
      schema: {
        body: {
          type: 'object',
          required: ['perkId'],
          properties: {
            perkId: { type: 'string' },
            subscriptionId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user?.userId;
        if (!userId) {
          return ErrorResponses.unauthorized(reply, 'Authentication required');
        }

        const { perkId, subscriptionId: rawSubscriptionId } = request.body as {
          perkId: string;
          subscriptionId?: string;
        };
        const subscriptionId = rawSubscriptionId?.trim() || undefined;

        if (!perkId || !perkId.trim()) {
          return ErrorResponses.badRequest(reply, 'perkId is required');
        }

        const pool = getDatabasePool();
        const perkResult = await pool.query(
          `SELECT id, user_id, source_type, source_id, reward_type, tier,
                  applies_to, free_months, metadata
           FROM user_perks
           WHERE id = $1 AND user_id = $2`,
          [perkId.trim(), userId]
        );

        if (perkResult.rows.length === 0) {
          return ErrorResponses.notFound(reply, 'Reward not found');
        }

        const perk = perkResult.rows[0];
        const perkMetadata = parseRewardMetadata(perk.metadata);
        if (isRewardRedeemed(perkMetadata)) {
          return ErrorResponses.badRequest(reply, 'Reward already redeemed');
        }

        if (perk.source_type !== 'referral_reward') {
          return ErrorResponses.badRequest(
            reply,
            'Only referral rewards can be claimed'
          );
        }

        if (!perk.free_months || perk.free_months <= 0) {
          return ErrorResponses.badRequest(
            reply,
            'Reward has no free months to apply'
          );
        }

        const appliesTo = perk.applies_to;
        let targetSubscriptionId: string | undefined;

        if (appliesTo === 'first_purchase') {
          const firstSubResult = await pool.query(
            `SELECT id, status, term_start_at, start_date, created_at
             FROM subscriptions
             WHERE user_id = $1
               AND status <> 'pending'
             ORDER BY COALESCE(term_start_at, start_date, created_at) ASC
             LIMIT 1`,
            [userId]
          );

          if (firstSubResult.rows.length === 0) {
            return ErrorResponses.badRequest(
              reply,
              'Subscription is not active yet'
            );
          }

          const firstSubscription = firstSubResult.rows[0];
          const status = String(firstSubscription.status || '').toLowerCase();
          if (status !== 'active') {
            const message =
              status === 'expired' || status === 'cancelled'
                ? 'Reward is no longer eligible for your first subscription'
                : 'Subscription is not active yet';
            return ErrorResponses.badRequest(reply, message);
          }

          if (
            subscriptionId &&
            subscriptionId !== String(firstSubscription.id)
          ) {
            return ErrorResponses.badRequest(
              reply,
              'Reward must be applied to your first subscription'
            );
          }

          targetSubscriptionId = String(firstSubscription.id);
        } else {
          if (!subscriptionId) {
            return ErrorResponses.badRequest(
              reply,
              'subscriptionId is required to claim this reward'
            );
          }

          const subscriptionResult = await pool.query(
            `SELECT id, status, term_months, start_date, end_date
             FROM subscriptions
             WHERE id = $1 AND user_id = $2`,
            [subscriptionId, userId]
          );

          if (subscriptionResult.rows.length === 0) {
            return ErrorResponses.notFound(reply, 'Subscription not found');
          }

          const subscription = subscriptionResult.rows[0];
          if (String(subscription.status || '').toLowerCase() !== 'active') {
            return ErrorResponses.badRequest(
              reply,
              'Subscription must be active to claim this reward'
            );
          }

          const termMonths = resolveSubscriptionTermMonths(subscription);
          if (!termMonths) {
            return ErrorResponses.badRequest(
              reply,
              'Subscription term is unavailable for this reward'
            );
          }

          if (appliesTo === 'min_1_year' && termMonths < 12) {
            return ErrorResponses.badRequest(
              reply,
              'Reward requires a minimum 12-month subscription'
            );
          }

          if (appliesTo === 'min_2_years' && termMonths < 24) {
            return ErrorResponses.badRequest(
              reply,
              'Reward requires a minimum 24-month subscription'
            );
          }

          targetSubscriptionId = String(subscription.id);
        }

        if (!targetSubscriptionId) {
          return ErrorResponses.badRequest(
            reply,
            'No eligible subscription found for this reward'
          );
        }

        const applyResult = await perkService.applyPerkToSubscription(
          perkId.trim(),
          targetSubscriptionId,
          userId
        );

        if (!applyResult.success) {
          return ErrorResponses.badRequest(
            reply,
            applyResult.error || 'Failed to claim reward'
          );
        }

        if (!applyResult.data) {
          return ErrorResponses.badRequest(reply, 'Failed to claim reward');
        }

        return SuccessResponses.ok(
          reply,
          {
            rewardId: perkId.trim(),
            subscriptionId: targetSubscriptionId,
            newEndDate: applyResult.data.new_end_date.toISOString(),
            newRenewalDate: applyResult.data.new_renewal_date.toISOString(),
          },
          'Reward applied to subscription'
        );
      } catch (error) {
        Logger.error('Prelaunch reward claim failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to claim reward');
      }
    }
  );
}
