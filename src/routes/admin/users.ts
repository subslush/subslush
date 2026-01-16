import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authPreHandler } from '../../middleware/authMiddleware';
import { adminPreHandler } from '../../middleware/adminMiddleware';
import { getDatabasePool } from '../../config/database';
import { ErrorResponses, SuccessResponses } from '../../utils/response';
import { Logger } from '../../utils/logger';

export async function adminUserRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            search: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 100 },
            offset: { type: 'number', minimum: 0 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const {
          search = '',
          limit = 20,
          offset = 0,
        } = request.query as {
          search?: string;
          limit?: number;
          offset?: number;
        };

        const trimmedSearch = search.trim();
        if (!trimmedSearch) {
          return SuccessResponses.ok(reply, {
            users: [],
            pagination: { limit, offset, hasMore: false },
          });
        }

        const pool = getDatabasePool();
        const searchPattern = `%${trimmedSearch}%`;

        const result = await pool.query(
          `WITH matched_users AS (
             SELECT u.id,
                    u.email,
                    u.status,
                    u.created_at,
                    u.last_login,
                    u.display_name,
                    u.pre_registration_id,
                    pr.username,
                    pr.email AS pre_registration_email,
                    pr.referral_code,
                    pr.referred_by_code
             FROM users u
             LEFT JOIN pre_registrations pr
               ON pr.id = u.pre_registration_id OR pr.user_id = u.id
             WHERE u.status != 'deleted'
               AND (
                 u.id::text ILIKE $1
                 OR u.email ILIKE $1
                 OR COALESCE(u.display_name, '') ILIKE $1
                 OR COALESCE(pr.username, '') ILIKE $1
                 OR COALESCE(pr.email, '') ILIKE $1
                 OR COALESCE(pr.referral_code, '') ILIKE $1
               )
             ORDER BY u.created_at DESC
             LIMIT $2 OFFSET $3
           )
           SELECT
             mu.*,
             (SELECT COUNT(*) FROM user_vouchers uv WHERE uv.user_id = mu.id) AS voucher_count,
             (SELECT COALESCE(jsonb_agg(voucher_rows ORDER BY voucher_rows.issued_at DESC), '[]'::jsonb)
                FROM (
                  SELECT id, voucher_type, scope, amount, status, issued_at, redeemed_at, event_date
                  FROM user_vouchers
                  WHERE user_id = mu.id
                  ORDER BY issued_at DESC
                  LIMIT 5
                ) AS voucher_rows
             ) AS vouchers,
             (SELECT COUNT(*) FROM user_perks up WHERE up.user_id = mu.id) AS reward_count,
             (SELECT COALESCE(jsonb_agg(reward_rows ORDER BY reward_rows.awarded_at DESC), '[]'::jsonb)
                FROM (
                  SELECT id, reward_type, tier, applies_to, free_months, founder_status, prize_won,
                         notes, awarded_at, metadata
                  FROM user_perks
                  WHERE user_id = mu.id
                  ORDER BY awarded_at DESC NULLS LAST
                  LIMIT 5
                ) AS reward_rows
             ) AS rewards,
             (SELECT COUNT(*) FROM credit_transactions ct
               WHERE ct.user_id = mu.id AND ct.type = 'deposit') AS deposit_count,
             (SELECT COALESCE(SUM(ct.amount), 0) FROM credit_transactions ct
               WHERE ct.user_id = mu.id AND ct.type = 'deposit') AS deposit_total,
             (SELECT COALESCE(SUM(ct.amount), 0) FROM credit_transactions ct
               WHERE ct.user_id = mu.id AND ct.type = 'deposit' AND ct.amount > 0) AS deposit_confirmed_total,
             (SELECT COUNT(*) FROM credit_transactions ct
               WHERE ct.user_id = mu.id AND ct.type = 'deposit' AND ct.amount = 0) AS deposit_pending_count,
             (SELECT MAX(ct.created_at) FROM credit_transactions ct
               WHERE ct.user_id = mu.id AND ct.type = 'deposit') AS last_deposit_at,
             (SELECT COALESCE(SUM(ct.amount), 0) FROM credit_transactions ct
               WHERE ct.user_id = mu.id) AS credit_balance,
             (SELECT COALESCE(SUM(CASE WHEN ct.amount > 0 THEN ct.amount ELSE 0 END), 0)
                FROM credit_transactions ct
               WHERE ct.user_id = mu.id) AS credits_in,
             (SELECT COALESCE(SUM(CASE WHEN ct.amount < 0 THEN ABS(ct.amount) ELSE 0 END), 0)
                FROM credit_transactions ct
               WHERE ct.user_id = mu.id) AS credits_out,
             (SELECT COUNT(*) FROM credit_transactions ct
               WHERE ct.user_id = mu.id AND ct.type = 'purchase') AS purchase_count,
             (SELECT COALESCE(SUM(ABS(ct.amount)), 0) FROM credit_transactions ct
               WHERE ct.user_id = mu.id AND ct.type = 'purchase') AS purchase_total,
             (SELECT MAX(ct.created_at) FROM credit_transactions ct
               WHERE ct.user_id = mu.id AND ct.type = 'purchase') AS last_purchase_at,
             (SELECT COALESCE(jsonb_agg(deposit_rows ORDER BY deposit_rows.created_at DESC), '[]'::jsonb)
                FROM (
                  SELECT id, amount, currency, payment_provider, payment_status, payment_id, created_at
                  FROM credit_transactions
                  WHERE user_id = mu.id AND type = 'deposit'
                  ORDER BY created_at DESC
                  LIMIT 5
                ) AS deposit_rows
             ) AS deposits
            ,
             (SELECT COALESCE(jsonb_agg(purchase_rows ORDER BY purchase_rows.created_at DESC), '[]'::jsonb)
                FROM (
                  SELECT id, amount, order_id, description, price_cents, currency, created_at
                  FROM credit_transactions
                  WHERE user_id = mu.id AND type = 'purchase'
                  ORDER BY created_at DESC
                  LIMIT 5
                ) AS purchase_rows
             ) AS purchases
           FROM matched_users mu;`,
          [searchPattern, limit, offset]
        );

        return SuccessResponses.ok(reply, {
          users: result.rows,
          pagination: {
            limit,
            offset,
            hasMore: result.rows.length === limit,
          },
        });
      } catch (error) {
        Logger.error('Admin user search failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to search users');
      }
    }
  );
}
