import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authPreHandler } from '../../middleware/authMiddleware';
import { adminPreHandler } from '../../middleware/adminMiddleware';
import { getDatabasePool } from '../../config/database';
import { creditService } from '../../services/creditService';
import { logAdminAction } from '../../services/auditLogService';
import { ErrorResponses, SuccessResponses } from '../../utils/response';
import { Logger } from '../../utils/logger';

const deriveRewardStatus = (row: any): string => {
  if (row.redeemed_at || row.redeemed_by_user_id || row.is_redeemed) {
    return 'redeemed';
  }
  return 'pending';
};

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

export async function adminRewardRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.get(
    '/referral',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            is_redeemed: { type: 'string' },
            redeemed: { type: 'string' },
            user_id: { type: 'string' },
            search: { type: 'string' },
            reward_type: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 200 },
            offset: { type: 'number', minimum: 0 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const {
          is_redeemed,
          redeemed,
          user_id,
          search,
          reward_type,
          limit = 50,
          offset = 0,
        } = request.query as {
          is_redeemed?: string;
          redeemed?: string;
          user_id?: string;
          search?: string;
          reward_type?: string;
          limit?: number;
          offset?: number;
        };

        const pool = getDatabasePool();
        const params: any[] = [];
        let paramCount = 0;
        let sql = `
          SELECT rr.*, pr.referral_code, pr.referred_by_code,
                 pr.user_id as linked_user_id, pr.email as pre_registration_email,
                 u.email as user_email
          FROM referral_rewards rr
          LEFT JOIN pre_registrations pr ON pr.id = rr.user_id
          LEFT JOIN users u ON u.id = pr.user_id
          WHERE 1=1
        `;

        if (is_redeemed !== undefined) {
          sql += ` AND rr.is_redeemed = $${++paramCount}`;
          params.push(is_redeemed === 'true');
        }

        if (redeemed !== undefined) {
          const redeemedValue = redeemed === 'true';
          if (redeemedValue) {
            sql += ` AND (rr.is_redeemed = TRUE OR rr.redeemed_at IS NOT NULL OR rr.redeemed_by_user_id IS NOT NULL)`;
          } else {
            sql += ` AND (rr.is_redeemed = FALSE AND rr.redeemed_at IS NULL AND rr.redeemed_by_user_id IS NULL)`;
          }
        }

        if (user_id) {
          sql += ` AND pr.user_id = $${++paramCount}`;
          params.push(user_id);
        }

        if (search) {
          const trimmed = search.trim();
          if (trimmed) {
            if (isUuid(trimmed)) {
              const paramIndex = ++paramCount;
              params.push(trimmed);
              sql += ` AND (pr.user_id = $${paramIndex} OR rr.user_id = $${paramIndex})`;
            } else {
              const paramIndex = ++paramCount;
              params.push(`%${trimmed}%`);
              sql += ` AND (u.email ILIKE $${paramIndex} OR pr.email ILIKE $${paramIndex})`;
            }
          }
        }

        if (reward_type) {
          sql += ` AND rr.reward_type = $${++paramCount}`;
          params.push(reward_type);
        }

        sql += ' ORDER BY rr.earned_at DESC';

        sql += ` LIMIT $${++paramCount} OFFSET $${++paramCount}`;
        params.push(limit, offset);

        const result = await pool.query(sql, params);

        const rewards = result.rows.map(row => ({
          ...row,
          id: row.id,
          user_id: row.linked_user_id || row.user_id,
          pre_registration_id: row.user_id,
          referral_code: row.referral_code,
          referred_by_code: row.referred_by_code,
          user_email: row.user_email,
          pre_registration_email: row.pre_registration_email,
          status: deriveRewardStatus(row),
        }));

        return SuccessResponses.ok(reply, { rewards });
      } catch (error) {
        Logger.error('Admin list referral rewards failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to list referral rewards'
        );
      }
    }
  );

  fastify.get(
    '/prelaunch',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            user_id: { type: 'string' },
            search: { type: 'string' },
            redeemed: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 200 },
            offset: { type: 'number', minimum: 0 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const {
          user_id,
          search,
          redeemed,
          limit = 50,
          offset = 0,
        } = request.query as {
          user_id?: string;
          search?: string;
          redeemed?: string;
          limit?: number;
          offset?: number;
        };

        const pool = getDatabasePool();
        const params: any[] = [];
        let paramCount = 0;
        let sql = `
          SELECT pl.*, pr.referral_code, pr.referred_by_code,
                 pr.user_id as linked_user_id, pr.email as pre_registration_email,
                 u.email as user_email
          FROM pre_launch_rewards pl
          LEFT JOIN pre_registrations pr ON pr.id = pl.user_id
          LEFT JOIN users u ON u.id = pr.user_id
          WHERE 1=1
        `;

        if (user_id) {
          sql += ` AND pr.user_id = $${++paramCount}`;
          params.push(user_id);
        }

        if (search) {
          const trimmed = search.trim();
          if (trimmed) {
            if (isUuid(trimmed)) {
              const paramIndex = ++paramCount;
              params.push(trimmed);
              sql += ` AND (pr.user_id = $${paramIndex} OR pl.user_id = $${paramIndex})`;
            } else {
              const paramIndex = ++paramCount;
              params.push(`%${trimmed}%`);
              sql += ` AND (u.email ILIKE $${paramIndex} OR pr.email ILIKE $${paramIndex})`;
            }
          }
        }

        if (redeemed !== undefined) {
          const redeemedValue = redeemed === 'true';
          if (redeemedValue) {
            sql += ` AND (pl.redeemed_at IS NOT NULL OR pl.redeemed_by_user_id IS NOT NULL)`;
          } else {
            sql += ` AND (pl.redeemed_at IS NULL AND pl.redeemed_by_user_id IS NULL)`;
          }
        }

        sql += ' ORDER BY pl.awarded_at DESC';

        sql += ` LIMIT $${++paramCount} OFFSET $${++paramCount}`;
        params.push(limit, offset);

        const result = await pool.query(sql, params);

        const rewards = result.rows.map(row => ({
          ...row,
          id: row.user_id,
          user_id: row.linked_user_id || row.user_id,
          pre_registration_id: row.user_id,
          reward_type: 'pre_launch',
          user_email: row.user_email,
          pre_registration_email: row.pre_registration_email,
          status: deriveRewardStatus(row),
        }));

        return SuccessResponses.ok(reply, { rewards });
      } catch (error) {
        Logger.error('Admin list pre-launch rewards failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to list pre-launch rewards'
        );
      }
    }
  );

  fastify.post(
    '/referral/:rewardId/redeem',
    {
      schema: {
        params: {
          type: 'object',
          required: ['rewardId'],
          properties: {
            rewardId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string' },
            appliedValueCents: { type: 'number' },
            subscriptionId: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { rewardId } = request.params as { rewardId: string };
        const {
          userId,
          appliedValueCents,
          subscriptionId: rawSubscriptionId,
        } = request.body as {
          userId: string;
          appliedValueCents?: number;
          subscriptionId?: string;
        };
        const subscriptionId = rawSubscriptionId?.trim() || undefined;

        if (appliedValueCents !== undefined && appliedValueCents <= 0) {
          return ErrorResponses.badRequest(
            reply,
            'appliedValueCents must be greater than 0 when provided'
          );
        }

        if (!subscriptionId && appliedValueCents === undefined) {
          return ErrorResponses.badRequest(
            reply,
            'Provide subscriptionId or appliedValueCents to redeem'
          );
        }

        const pool = getDatabasePool();
        const rewardResult = await pool.query(
          `SELECT rr.*, pr.user_id as linked_user_id
           FROM referral_rewards rr
           LEFT JOIN pre_registrations pr ON pr.id = rr.user_id
           WHERE rr.id = $1`,
          [rewardId]
        );

        if (rewardResult.rows.length === 0) {
          return ErrorResponses.notFound(reply, 'Referral reward not found');
        }

        const reward = rewardResult.rows[0];
        const linkedUserId = reward.linked_user_id;

        if (!linkedUserId) {
          return ErrorResponses.badRequest(
            reply,
            'Reward is not linked to a user account'
          );
        }

        if (linkedUserId !== userId) {
          return ErrorResponses.badRequest(
            reply,
            'User ID does not match reward owner'
          );
        }

        if (
          reward.redeemed_at ||
          reward.redeemed_by_user_id ||
          reward.is_redeemed
        ) {
          return ErrorResponses.badRequest(reply, 'Reward already redeemed');
        }

        if (subscriptionId) {
          const freeMonths = Number(reward.free_months || 0);
          if (!freeMonths || freeMonths <= 0) {
            return ErrorResponses.badRequest(
              reply,
              'Reward does not include free months to apply'
            );
          }

          const client = await pool.connect();
          let transactionOpen = false;
          try {
            await client.query('BEGIN');
            transactionOpen = true;

            const rewardLock = await client.query(
              'SELECT is_redeemed, redeemed_at, redeemed_by_user_id FROM referral_rewards WHERE id = $1 FOR UPDATE',
              [rewardId]
            );

            if (
              rewardLock.rows[0]?.is_redeemed ||
              rewardLock.rows[0]?.redeemed_at ||
              rewardLock.rows[0]?.redeemed_by_user_id
            ) {
              await client.query('ROLLBACK');
              transactionOpen = false;
              return ErrorResponses.badRequest(
                reply,
                'Reward already redeemed'
              );
            }

            const subscriptionResult = await client.query(
              `SELECT id, user_id, end_date, renewal_date, auto_renew
               FROM subscriptions
               WHERE id = $1
               FOR UPDATE`,
              [subscriptionId]
            );

            if (subscriptionResult.rows.length === 0) {
              await client.query('ROLLBACK');
              transactionOpen = false;
              return ErrorResponses.notFound(reply, 'Subscription not found');
            }

            if (subscriptionResult.rows[0].user_id !== userId) {
              await client.query('ROLLBACK');
              transactionOpen = false;
              return ErrorResponses.badRequest(
                reply,
                'Subscription does not belong to user'
              );
            }

            const subscriptionUpdate = await client.query(
              `UPDATE subscriptions
               SET end_date = end_date + ($1 || ' months')::interval,
                   renewal_date = renewal_date + ($1 || ' months')::interval,
                   next_billing_at = CASE
                     WHEN auto_renew THEN renewal_date + ($1 || ' months')::interval
                     ELSE NULL
                   END,
                   status_reason = $2,
                   referral_reward_id = $3
               WHERE id = $4
               RETURNING id, end_date, renewal_date, next_billing_at`,
              [freeMonths, 'reward_redemption', rewardId, subscriptionId]
            );

            await client.query(
              `UPDATE referral_rewards
               SET is_redeemed = TRUE,
                   redeemed_by_user_id = $1,
                   redeemed_at = NOW(),
                   applied_value_cents = COALESCE($2, applied_value_cents),
                   subscription_id = $3
               WHERE id = $4`,
              [userId, appliedValueCents ?? null, subscriptionId, rewardId]
            );

            const redemptionMetadata = {
              redeemed_at: new Date().toISOString(),
              redeemed_by: userId,
              subscription_id: subscriptionId,
              redemption_type: 'subscription_extension',
              free_months: freeMonths,
            };
            await client.query(
              `UPDATE user_perks
               SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
               WHERE source_type = 'referral_reward' AND source_id = $2`,
              [JSON.stringify(redemptionMetadata), rewardId]
            );

            await client.query('COMMIT');
            transactionOpen = false;

            await logAdminAction(request, {
              action: 'rewards.referral.redeem',
              entityType: 'referral_reward',
              entityId: rewardId,
              before: {
                is_redeemed: reward.is_redeemed ?? null,
                redeemed_at: reward.redeemed_at ?? null,
                redeemed_by_user_id: reward.redeemed_by_user_id ?? null,
                applied_value_cents: reward.applied_value_cents ?? null,
              },
              after: {
                redeemed_by_user_id: userId,
                redeemed_at: new Date().toISOString(),
                applied_value_cents: appliedValueCents ?? null,
                subscription_id: subscriptionId,
              },
              metadata: {
                redemptionType: 'subscription',
                freeMonths,
              },
            });

            return SuccessResponses.ok(
              reply,
              {
                rewardId,
                userId,
                subscriptionId,
                freeMonths,
                subscription: subscriptionUpdate.rows[0],
              },
              'Referral reward redeemed'
            );
          } catch (error) {
            if (transactionOpen) {
              await client.query('ROLLBACK');
              transactionOpen = false;
            }
            Logger.error('Admin redeem referral reward failed:', error);
            return ErrorResponses.internalError(
              reply,
              'Failed to redeem referral reward'
            );
          } finally {
            if (transactionOpen) {
              try {
                await client.query('ROLLBACK');
              } catch (rollbackError) {
                Logger.error(
                  'Failed to rollback referral reward redemption',
                  rollbackError
                );
              }
            }
            client.release();
          }
        }

        if (appliedValueCents === undefined) {
          return ErrorResponses.badRequest(
            reply,
            'appliedValueCents is required for credit redemption'
          );
        }

        const creditAmount = appliedValueCents / 100;

        const creditResult = await creditService.addCredits(
          userId,
          creditAmount,
          'bonus',
          'Referral reward redemption',
          {
            rewardId,
            rewardType: reward.reward_type,
          },
          {
            referralRewardId: rewardId,
            priceCents: appliedValueCents,
            statusReason: 'reward_redemption',
          }
        );

        if (!creditResult.success) {
          return ErrorResponses.badRequest(
            reply,
            creditResult.error || 'Failed to apply credits'
          );
        }

        await pool.query(
          `UPDATE referral_rewards
           SET is_redeemed = TRUE,
               redeemed_by_user_id = $1,
               redeemed_at = NOW(),
               applied_value_cents = $2
           WHERE id = $3`,
          [userId, appliedValueCents, rewardId]
        );

        const redemptionMetadata = {
          redeemed_at: new Date().toISOString(),
          redeemed_by: userId,
          redemption_type: 'credits',
          applied_value_cents: appliedValueCents,
        };
        await pool.query(
          `UPDATE user_perks
           SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
           WHERE source_type = 'referral_reward' AND source_id = $2`,
          [JSON.stringify(redemptionMetadata), rewardId]
        );

        await logAdminAction(request, {
          action: 'rewards.referral.redeem',
          entityType: 'referral_reward',
          entityId: rewardId,
          before: {
            is_redeemed: reward.is_redeemed ?? null,
            redeemed_at: reward.redeemed_at ?? null,
            redeemed_by_user_id: reward.redeemed_by_user_id ?? null,
            applied_value_cents: reward.applied_value_cents ?? null,
          },
          after: {
            redeemed_by_user_id: userId,
            redeemed_at: new Date().toISOString(),
            applied_value_cents: appliedValueCents,
          },
          metadata: {
            redemptionType: 'credits',
            creditTransactionId: creditResult.transaction?.id || null,
          },
        });

        return SuccessResponses.ok(
          reply,
          {
            rewardId,
            userId,
            appliedValueCents,
            creditTransaction: creditResult.transaction,
          },
          'Referral reward redeemed'
        );
      } catch (error) {
        Logger.error('Admin redeem referral reward failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to redeem referral reward'
        );
      }
    }
  );

  fastify.post(
    '/prelaunch/:rewardId/redeem',
    {
      schema: {
        params: {
          type: 'object',
          required: ['rewardId'],
          properties: {
            rewardId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string' },
            appliedValueCents: { type: 'number' },
            subscriptionId: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { rewardId } = request.params as { rewardId: string };
        const {
          userId,
          appliedValueCents,
          subscriptionId: rawSubscriptionId,
        } = request.body as {
          userId: string;
          appliedValueCents?: number;
          subscriptionId?: string;
        };
        const subscriptionId = rawSubscriptionId?.trim() || undefined;

        if (appliedValueCents !== undefined && appliedValueCents <= 0) {
          return ErrorResponses.badRequest(
            reply,
            'appliedValueCents must be greater than 0 when provided'
          );
        }

        if (!subscriptionId && appliedValueCents === undefined) {
          return ErrorResponses.badRequest(
            reply,
            'Provide subscriptionId or appliedValueCents to redeem'
          );
        }

        const pool = getDatabasePool();
        const rewardResult = await pool.query(
          `SELECT pl.*, pr.user_id as linked_user_id
           FROM pre_launch_rewards pl
           LEFT JOIN pre_registrations pr ON pr.id = pl.user_id
           WHERE pl.user_id = $1`,
          [rewardId]
        );

        if (rewardResult.rows.length === 0) {
          return ErrorResponses.notFound(reply, 'Pre-launch reward not found');
        }

        const reward = rewardResult.rows[0];
        const linkedUserId = reward.linked_user_id;

        if (!linkedUserId) {
          return ErrorResponses.badRequest(
            reply,
            'Reward is not linked to a user account'
          );
        }

        if (linkedUserId !== userId) {
          return ErrorResponses.badRequest(
            reply,
            'User ID does not match reward owner'
          );
        }

        if (reward.redeemed_at || reward.redeemed_by_user_id) {
          return ErrorResponses.badRequest(reply, 'Reward already redeemed');
        }

        if (subscriptionId) {
          const freeMonths = Number(reward.free_months || 0);
          if (!freeMonths || freeMonths <= 0) {
            return ErrorResponses.badRequest(
              reply,
              'Reward does not include free months to apply'
            );
          }

          const client = await pool.connect();
          let transactionOpen = false;
          try {
            await client.query('BEGIN');
            transactionOpen = true;

            const rewardLock = await client.query(
              'SELECT redeemed_at, redeemed_by_user_id FROM pre_launch_rewards WHERE user_id = $1 FOR UPDATE',
              [rewardId]
            );

            if (
              rewardLock.rows[0]?.redeemed_at ||
              rewardLock.rows[0]?.redeemed_by_user_id
            ) {
              await client.query('ROLLBACK');
              transactionOpen = false;
              return ErrorResponses.badRequest(
                reply,
                'Reward already redeemed'
              );
            }

            const subscriptionResult = await client.query(
              `SELECT id, user_id, end_date, renewal_date, auto_renew
               FROM subscriptions
               WHERE id = $1
               FOR UPDATE`,
              [subscriptionId]
            );

            if (subscriptionResult.rows.length === 0) {
              await client.query('ROLLBACK');
              transactionOpen = false;
              return ErrorResponses.notFound(reply, 'Subscription not found');
            }

            if (subscriptionResult.rows[0].user_id !== userId) {
              await client.query('ROLLBACK');
              transactionOpen = false;
              return ErrorResponses.badRequest(
                reply,
                'Subscription does not belong to user'
              );
            }

            const subscriptionUpdate = await client.query(
              `UPDATE subscriptions
               SET end_date = end_date + ($1 || ' months')::interval,
                   renewal_date = renewal_date + ($1 || ' months')::interval,
                   next_billing_at = CASE
                     WHEN auto_renew THEN renewal_date + ($1 || ' months')::interval
                     ELSE NULL
                   END,
                   status_reason = $2,
                   pre_launch_reward_id = $3
               WHERE id = $4
               RETURNING id, end_date, renewal_date, next_billing_at`,
              [freeMonths, 'reward_redemption', rewardId, subscriptionId]
            );

            await client.query(
              `UPDATE pre_launch_rewards
               SET redeemed_by_user_id = $1,
                   redeemed_at = NOW(),
                   applied_value_cents = COALESCE($2, applied_value_cents)
               WHERE user_id = $3`,
              [userId, appliedValueCents ?? null, rewardId]
            );

            const redemptionMetadata = {
              redeemed_at: new Date().toISOString(),
              redeemed_by: userId,
              subscription_id: subscriptionId,
              redemption_type: 'subscription_extension',
              free_months: freeMonths,
            };
            await client.query(
              `UPDATE user_perks
               SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
               WHERE source_type = 'pre_launch_reward' AND source_id = $2`,
              [JSON.stringify(redemptionMetadata), rewardId]
            );

            await client.query('COMMIT');
            transactionOpen = false;

            await logAdminAction(request, {
              action: 'rewards.prelaunch.redeem',
              entityType: 'pre_launch_reward',
              entityId: rewardId,
              before: {
                redeemed_at: reward.redeemed_at ?? null,
                redeemed_by_user_id: reward.redeemed_by_user_id ?? null,
                applied_value_cents: reward.applied_value_cents ?? null,
              },
              after: {
                redeemed_by_user_id: userId,
                redeemed_at: new Date().toISOString(),
                applied_value_cents: appliedValueCents ?? null,
                subscription_id: subscriptionId,
              },
              metadata: {
                redemptionType: 'subscription',
                freeMonths,
              },
            });

            return SuccessResponses.ok(
              reply,
              {
                rewardId,
                userId,
                subscriptionId,
                freeMonths,
                subscription: subscriptionUpdate.rows[0],
              },
              'Pre-launch reward redeemed'
            );
          } catch (error) {
            if (transactionOpen) {
              await client.query('ROLLBACK');
              transactionOpen = false;
            }
            Logger.error('Admin redeem pre-launch reward failed:', error);
            return ErrorResponses.internalError(
              reply,
              'Failed to redeem pre-launch reward'
            );
          } finally {
            if (transactionOpen) {
              try {
                await client.query('ROLLBACK');
              } catch (rollbackError) {
                Logger.error(
                  'Failed to rollback pre-launch reward redemption',
                  rollbackError
                );
              }
            }
            client.release();
          }
        }

        if (appliedValueCents === undefined) {
          return ErrorResponses.badRequest(
            reply,
            'appliedValueCents is required for credit redemption'
          );
        }

        const creditAmount = appliedValueCents / 100;

        const creditResult = await creditService.addCredits(
          userId,
          creditAmount,
          'bonus',
          'Pre-launch reward redemption',
          {
            rewardId,
            rewardType: 'pre_launch',
          },
          {
            preLaunchRewardId: rewardId,
            priceCents: appliedValueCents,
            statusReason: 'reward_redemption',
          }
        );

        if (!creditResult.success) {
          return ErrorResponses.badRequest(
            reply,
            creditResult.error || 'Failed to apply credits'
          );
        }

        await pool.query(
          `UPDATE pre_launch_rewards
           SET redeemed_by_user_id = $1,
               redeemed_at = NOW(),
               applied_value_cents = $2
           WHERE user_id = $3`,
          [userId, appliedValueCents, rewardId]
        );

        const redemptionMetadata = {
          redeemed_at: new Date().toISOString(),
          redeemed_by: userId,
          redemption_type: 'credits',
          applied_value_cents: appliedValueCents,
        };
        await pool.query(
          `UPDATE user_perks
           SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
           WHERE source_type = 'pre_launch_reward' AND source_id = $2`,
          [JSON.stringify(redemptionMetadata), rewardId]
        );

        await logAdminAction(request, {
          action: 'rewards.prelaunch.redeem',
          entityType: 'pre_launch_reward',
          entityId: rewardId,
          before: {
            redeemed_at: reward.redeemed_at ?? null,
            redeemed_by_user_id: reward.redeemed_by_user_id ?? null,
            applied_value_cents: reward.applied_value_cents ?? null,
          },
          after: {
            redeemed_by_user_id: userId,
            redeemed_at: new Date().toISOString(),
            applied_value_cents: appliedValueCents,
          },
          metadata: {
            redemptionType: 'credits',
            creditTransactionId: creditResult.transaction?.id || null,
          },
        });

        return SuccessResponses.ok(
          reply,
          {
            rewardId,
            userId,
            appliedValueCents,
            creditTransaction: creditResult.transaction,
          },
          'Pre-launch reward redeemed'
        );
      } catch (error) {
        Logger.error('Admin redeem pre-launch reward failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to redeem pre-launch reward'
        );
      }
    }
  );
}
