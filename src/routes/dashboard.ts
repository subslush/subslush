import { randomInt } from 'crypto';
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authPreHandler } from '../middleware/authMiddleware';
import { createRateLimitHandler } from '../middleware/rateLimitMiddleware';
import { getDatabasePool } from '../config/database';
import { dashboardService } from '../services/dashboardService';
import { couponService, normalizeCouponCode } from '../services/couponService';
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

const prelaunchVoucherClaimRateLimit = createRateLimitHandler({
  windowMs: 60 * 1000,
  maxRequests: 10,
  keyGenerator: (request: FastifyRequest) => {
    const userId = request.user?.userId || request.ip;
    return `dashboard_prelaunch_voucher_claim:${userId}`;
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

const parseVoucherMetadata = (value: any): Record<string, any> | null => {
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

const hasValidTermMonths = (value: any): boolean => {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0;
  }
  return true;
};

const normalizeVoucherScopeValue = (value?: string | null): string => {
  if (!value) return '';
  return value.trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ');
};

const isFreeMonthVoucher = (voucherType?: string | null): boolean => {
  const normalized = (voucherType || '').toLowerCase();
  return normalized === 'free_months' || normalized === 'free_month';
};

const parseVoucherAmount = (value?: number | string | null): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(parsed) ? parsed : null;
};

type VoucherClaimAction =
  | 'claim'
  | 'choose_category'
  | 'unavailable'
  | 'removed';

type VoucherClaimCoupon = {
  scope: 'global' | 'category' | 'product';
  percentOff: number;
  productId?: string;
  category?: string;
  termMonths?: number | null;
};

type VoucherClaimRule = {
  action: VoucherClaimAction;
  coupon?: VoucherClaimCoupon;
};

const COUPON_PRODUCTS = {
  netflix4k: '96b3f6c5-3b57-4d98-9e1b-41c247ee4e29',
  crunchyroll: '667ba844-fda0-4361-b6e7-953c7ef4302e',
  amazonPrimeVideo: '2765d5a6-568b-4ea1-bb4a-7805b8c6c717',
  youtubePremium: 'dc2f9f4b-a312-498f-a304-62430d1c4150',
  chatgpt: '8ef91840-db73-4e54-8935-452beae322a3',
  perplexity: 'fca68807-2615-400f-a200-a9d313d7f772',
  adobeAllApps: 'be8312fe-d347-4629-a94f-dcf6849bfab2',
} as const;

const resolveVoucherClaimRule = (voucher: {
  scope?: string | null;
  voucher_type?: string | null;
  amount?: number | string | null;
}): VoucherClaimRule => {
  const scope = normalizeVoucherScopeValue(voucher.scope);
  const voucherType = (voucher.voucher_type || '').toLowerCase();
  const amount = parseVoucherAmount(voucher.amount);
  const freeMonthVoucher = isFreeMonthVoucher(voucher.voucher_type);

  if (scope === 'premium entertainment' || scope === 'spotify premium') {
    return { action: 'removed' };
  }
  if (scope === 'chatgpt plus' && freeMonthVoucher) {
    return { action: 'removed' };
  }
  if (scope === 'tradingview' && freeMonthVoucher) {
    return { action: 'removed' };
  }

  const unavailableScopes = new Set([
    'paramount+ with showtime',
    'hbo max premium',
    'disney+ premium',
    'google ai pro',
    'chatprd',
    'linear business',
    'tradingview',
    'productivity lane',
    'canva pro',
    'linkedin business premium',
    'duolingo super',
    'premium annual choice',
  ]);

  if (unavailableScopes.has(scope) || scope.startsWith('xbox game pass')) {
    return { action: 'unavailable' };
  }

  if (scope === 'entertainment lane') {
    return {
      action: 'choose_category',
      coupon: { scope: 'category', percentOff: 5 },
    };
  }

  if (scope === 'ai lane') {
    return {
      action: 'claim',
      coupon: { scope: 'category', category: 'ai', percentOff: 10 },
    };
  }

  if (scope === 'netflix 4k') {
    return {
      action: 'claim',
      coupon: {
        scope: 'product',
        productId: COUPON_PRODUCTS.netflix4k,
        percentOff: 10,
        termMonths: 12,
      },
    };
  }

  if (scope.includes('crunchyroll')) {
    const yearly = scope.includes('1y') || scope.includes('12 month');
    return {
      action: 'claim',
      coupon: {
        scope: 'product',
        productId: COUPON_PRODUCTS.crunchyroll,
        percentOff: 10,
        termMonths: yearly ? 12 : null,
      },
    };
  }

  if (scope === 'amazon prime video') {
    return {
      action: 'claim',
      coupon: {
        scope: 'product',
        productId: COUPON_PRODUCTS.amazonPrimeVideo,
        percentOff: 10,
      },
    };
  }

  if (scope === 'youtube premium') {
    return {
      action: 'claim',
      coupon: {
        scope: 'product',
        productId: COUPON_PRODUCTS.youtubePremium,
        percentOff: 15,
      },
    };
  }

  if (scope === 'chatgpt plus' || scope === 'chatgpt') {
    if (voucherType !== 'percent_off' || amount === null) {
      return { action: 'unavailable' };
    }
    if (amount !== 10 && amount !== 20) {
      return { action: 'unavailable' };
    }
    return {
      action: 'claim',
      coupon: {
        scope: 'product',
        productId: COUPON_PRODUCTS.chatgpt,
        percentOff: amount,
      },
    };
  }

  if (scope === 'perplexity pro') {
    return {
      action: 'claim',
      coupon: {
        scope: 'product',
        productId: COUPON_PRODUCTS.perplexity,
        percentOff: 15,
      },
    };
  }

  if (scope === 'adobe creative cloud all apps') {
    return {
      action: 'claim',
      coupon: {
        scope: 'product',
        productId: COUPON_PRODUCTS.adobeAllApps,
        percentOff: 10,
      },
    };
  }

  if (scope === 'any subscription') {
    return {
      action: 'claim',
      coupon: { scope: 'global', percentOff: 25 },
    };
  }

  if (
    scope === 'any 1y plan' ||
    scope === 'any annual subscription' ||
    scope === 'any 12 month subscription plan'
  ) {
    return {
      action: 'claim',
      coupon: { scope: 'global', percentOff: 15, termMonths: 12 },
    };
  }

  return { action: 'unavailable' };
};

const buildCouponWindow = (now: Date): { startsAt: Date; endsAt: Date } => {
  const startsAt = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endsAt = new Date(startsAt);
  endsAt.setMonth(endsAt.getMonth() + 12);
  endsAt.setHours(23, 59, 59, 999);
  return { startsAt, endsAt };
};

const COUPON_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const COUPON_CODE_LENGTH = 9;
const COUPON_CODE_ATTEMPTS = 5;

const generateCouponCode = (): string => {
  let code = '';
  for (let i = 0; i < COUPON_CODE_LENGTH; i += 1) {
    const index = randomInt(0, COUPON_CODE_CHARS.length);
    code += COUPON_CODE_CHARS[index];
  }
  return code;
};

const normalizeVoucherMetadata = (value: any): Record<string, any> => {
  const parsed = parseVoucherMetadata(value) ?? {};
  const normalized = { ...parsed };

  if ('app_examples' in normalized) {
    delete normalized['app_examples'];
  }

  if (typeof normalized['notes'] === 'string') {
    const trimmedNotes = normalized['notes'].trim().toLowerCase();
    if (trimmedNotes.includes('christmas eve fallback')) {
      delete normalized['notes'];
    }
  }

  if (!hasValidTermMonths(normalized['term_months'])) {
    normalized['term_months'] = 12;
  }

  return normalized;
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

        const voucherRows = vouchersResult.rows || [];
        const voucherCandidates = voucherRows
          .map(row => ({
            ...row,
            metadata: normalizeVoucherMetadata(row.metadata),
          }))
          .map(row => {
            const claimRule = resolveVoucherClaimRule(row);
            return { ...row, claim_action: claimRule.action };
          })
          .filter(row => row.claim_action !== 'removed');

        const couponIds = voucherCandidates
          .map(row => {
            const metadata = parseVoucherMetadata(row.metadata) || {};
            const couponId =
              metadata['coupon_id'] ??
              metadata['couponId'] ??
              row['coupon_id'] ??
              null;
            return typeof couponId === 'string' && couponId ? couponId : null;
          })
          .filter((couponId): couponId is string => Boolean(couponId));

        const redeemedCouponIds = new Set<string>();
        if (couponIds.length > 0) {
          const redeemedResult = await pool.query(
            `SELECT DISTINCT coupon_id
             FROM coupon_redemptions
             WHERE coupon_id = ANY($1::uuid[])
               AND status = 'redeemed'`,
            [couponIds]
          );
          redeemedResult.rows.forEach(row => {
            if (row.coupon_id) {
              redeemedCouponIds.add(row.coupon_id);
            }
          });
        }

        const vouchers = voucherCandidates.map(row => {
          const metadata = parseVoucherMetadata(row.metadata) || {};
          const couponId =
            metadata['coupon_id'] ??
            metadata['couponId'] ??
            row['coupon_id'] ??
            null;
          const couponCode =
            metadata['coupon_code'] ??
            metadata['couponCode'] ??
            row['coupon_code'] ??
            null;
          const couponStatus = couponId
            ? redeemedCouponIds.has(couponId)
              ? 'used'
              : 'active'
            : null;
          return {
            ...row,
            coupon_id: couponId,
            coupon_code: couponCode,
            coupon_status: couponStatus,
          };
        });

        return SuccessResponses.ok(reply, {
          rewards,
          vouchers,
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

  fastify.post(
    '/prelaunch-rewards/vouchers/claim',
    {
      preHandler: [prelaunchVoucherClaimRateLimit, authPreHandler],
      schema: {
        body: {
          type: 'object',
          required: ['voucherId'],
          properties: {
            voucherId: { type: 'string' },
            category: {
              type: 'string',
              enum: ['streaming', 'music', 'gaming'],
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.user?.userId;
      if (!userId) {
        return ErrorResponses.unauthorized(reply, 'Authentication required');
      }

      const { voucherId, category } = request.body as {
        voucherId: string;
        category?: string;
      };

      if (!voucherId || !voucherId.trim()) {
        return ErrorResponses.badRequest(reply, 'voucherId is required');
      }

      const pool = getDatabasePool();
      const client = await pool.connect();
      let transactionOpen = false;
      try {
        await client.query('BEGIN');
        transactionOpen = true;

        const voucherResult = await client.query(
          `SELECT id, voucher_type, scope, amount, status, metadata
           FROM user_vouchers
           WHERE id = $1 AND user_id = $2
           FOR UPDATE`,
          [voucherId.trim(), userId]
        );

        if (voucherResult.rows.length === 0) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return ErrorResponses.notFound(reply, 'Voucher not found');
        }

        const voucher = voucherResult.rows[0];
        const voucherMetadata = parseVoucherMetadata(voucher.metadata) || {};
        const existingCouponId =
          voucherMetadata['coupon_id'] ?? voucherMetadata['couponId'];
        const existingCouponCode =
          voucherMetadata['coupon_code'] ?? voucherMetadata['couponCode'];

        if (
          existingCouponId ||
          existingCouponCode ||
          ['claimed', 'redeemed'].includes(
            String(voucher.status || '').toLowerCase()
          )
        ) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return ErrorResponses.badRequest(reply, 'Voucher already claimed');
        }

        const claimRule = resolveVoucherClaimRule(voucher);
        if (claimRule.action === 'removed') {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return ErrorResponses.badRequest(
            reply,
            'Voucher is no longer available'
          );
        }

        if (claimRule.action === 'unavailable') {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return ErrorResponses.badRequest(
            reply,
            'Voucher is temporarily unavailable'
          );
        }

        if (claimRule.action === 'choose_category') {
          if (!category) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return ErrorResponses.badRequest(
              reply,
              'Category selection is required'
            );
          }
          if (!claimRule.coupon) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return ErrorResponses.internalError(
              reply,
              'Voucher configuration missing'
            );
          }
          claimRule.coupon = {
            ...claimRule.coupon,
            category,
          };
        }

        const couponConfig = claimRule.coupon;
        if (!couponConfig) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return ErrorResponses.badRequest(reply, 'Voucher cannot be claimed');
        }
        if (couponConfig.scope === 'product') {
          if (!couponConfig.productId) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return ErrorResponses.internalError(
              reply,
              'Voucher configuration missing'
            );
          }
          const productResult = await client.query(
            `SELECT id, status
             FROM products
             WHERE id = $1`,
            [couponConfig.productId]
          );
          if (productResult.rows.length === 0) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return ErrorResponses.badRequest(
              reply,
              'Voucher is temporarily unavailable'
            );
          }
          const productStatus = String(
            productResult.rows[0].status || ''
          ).toLowerCase();
          if (productStatus && productStatus !== 'active') {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return ErrorResponses.badRequest(
              reply,
              'Voucher is temporarily unavailable'
            );
          }
        }
        if (couponConfig.scope === 'category' && !couponConfig.category) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return ErrorResponses.internalError(
            reply,
            'Voucher configuration missing'
          );
        }

        const now = new Date();
        const { startsAt, endsAt } = buildCouponWindow(now);

        let couponCode: string | null = null;
        for (let attempt = 0; attempt < COUPON_CODE_ATTEMPTS; attempt += 1) {
          const candidate = generateCouponCode();
          const normalized = normalizeCouponCode(candidate);
          if (!normalized) continue;
          const existing = await couponService.getCouponByNormalizedCode(
            normalized,
            client
          );
          if (!existing) {
            couponCode = candidate;
            break;
          }
        }

        if (!couponCode) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return ErrorResponses.internalError(
            reply,
            'Failed to generate coupon code'
          );
        }

        const couponResult = await couponService.createCoupon(
          {
            code: couponCode,
            percent_off: couponConfig.percentOff,
            scope: couponConfig.scope,
            status: 'active',
            starts_at: startsAt,
            ends_at: endsAt,
            max_redemptions: 1,
            bound_user_id: userId,
            first_order_only: false,
            category: couponConfig.category ?? null,
            product_id: couponConfig.productId ?? null,
            term_months: couponConfig.termMonths ?? null,
          },
          client
        );

        if (!couponResult.success) {
          await client.query('ROLLBACK');
          transactionOpen = false;
          return ErrorResponses.badRequest(
            reply,
            couponResult.error || 'Failed to create coupon'
          );
        }

        const coupon = couponResult.data;
        const updatedMetadata = {
          ...voucherMetadata,
          coupon_id: coupon.id,
          coupon_code: coupon.code,
          coupon_percent_off: coupon.percent_off,
          coupon_scope: coupon.scope,
          coupon_category: coupon.category ?? null,
          coupon_product_id: coupon.product_id ?? null,
          coupon_term_months: coupon.term_months ?? null,
          claimed_at: now.toISOString(),
          ...(category ? { claim_category: category } : {}),
        };

        await client.query(
          `UPDATE user_vouchers
           SET status = $1,
               metadata = $2
           WHERE id = $3`,
          ['claimed', updatedMetadata, voucher.id]
        );

        await client.query('COMMIT');
        transactionOpen = false;

        return SuccessResponses.ok(reply, {
          coupon_id: coupon.id,
          coupon_code: coupon.code,
          coupon_status: 'active',
        });
      } catch (error) {
        if (transactionOpen) {
          try {
            await client.query('ROLLBACK');
          } catch (rollbackError) {
            Logger.error('Failed to rollback voucher claim', rollbackError);
          }
        }
        Logger.error('Voucher claim failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to claim voucher');
      } finally {
        client.release();
      }
    }
  );
}
