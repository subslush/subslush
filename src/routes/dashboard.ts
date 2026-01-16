import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authPreHandler } from '../middleware/authMiddleware';
import { createRateLimitHandler } from '../middleware/rateLimitMiddleware';
import { getDatabasePool } from '../config/database';
import { dashboardService } from '../services/dashboardService';
import { ErrorResponses, SuccessResponses } from '../utils/response';
import { Logger } from '../utils/logger';
import {
  resolvePreferredCurrency,
  resolveCountryFromHeaders,
  type SupportedCurrency,
} from '../utils/currency';

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
        const [rewardsResult, vouchersResult, raffleResult] = await Promise.all(
          [
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
          ]
        );

        return SuccessResponses.ok(reply, {
          rewards: rewardsResult.rows || [],
          vouchers: vouchersResult.rows || [],
          raffleEntries: raffleResult.rows || [],
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
}
