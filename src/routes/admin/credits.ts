import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authPreHandler } from '../../middleware/authMiddleware';
import { adminPreHandler } from '../../middleware/adminMiddleware';
import { creditService } from '../../services/creditService';
import { getDatabasePool } from '../../config/database';
import { logAdminAction } from '../../services/auditLogService';
import { ErrorResponses, SuccessResponses } from '../../utils/response';
import { Logger } from '../../utils/logger';

export async function adminCreditRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.get(
    '/balances',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', minimum: 1, maximum: 200 },
            offset: { type: 'number', minimum: 0 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { limit = 50, offset = 0 } = request.query as {
          limit?: number;
          offset?: number;
        };

        const balances = await creditService.getAllUserBalances(limit, offset);

        return SuccessResponses.ok(reply, {
          balances,
          pagination: {
            limit,
            offset,
            hasMore: balances.length === limit,
          },
        });
      } catch (error) {
        Logger.error('Admin list balances failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to retrieve balances'
        );
      }
    }
  );

  fastify.get(
    '/transactions',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            user_id: { type: 'string' },
            type: { type: 'string' },
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
          type,
          limit = 50,
          offset = 0,
        } = request.query as {
          user_id?: string;
          type?: string;
          limit?: number;
          offset?: number;
        };

        const pool = getDatabasePool();
        const params: any[] = [];
        let paramCount = 0;
        let sql = `
          SELECT id, user_id, type, amount, balance_before, balance_after,
                 description, metadata, created_at, updated_at, order_id,
                 product_variant_id, price_cents, currency, auto_renew,
                 next_billing_at, renewal_method, status_reason,
                 referral_reward_id, pre_launch_reward_id
          FROM credit_transactions
          WHERE 1=1
        `;

        if (user_id) {
          sql += ` AND user_id = $${++paramCount}`;
          params.push(user_id);
        }

        if (type) {
          sql += ` AND type = $${++paramCount}`;
          params.push(type);
        }

        sql += ' ORDER BY created_at DESC';

        if (limit) {
          sql += ` LIMIT $${++paramCount}`;
          params.push(limit);
        }

        if (offset) {
          sql += ` OFFSET $${++paramCount}`;
          params.push(offset);
        }

        const result = await pool.query(sql, params);

        return SuccessResponses.ok(reply, {
          transactions: result.rows,
          pagination: {
            limit,
            offset,
            hasMore: result.rows.length === limit,
          },
        });
      } catch (error) {
        Logger.error('Admin list credit transactions failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to retrieve transactions'
        );
      }
    }
  );

  fastify.post(
    '/add',
    {
      schema: {
        body: {
          type: 'object',
          required: ['userId', 'amount', 'type', 'description'],
          properties: {
            userId: { type: 'string' },
            amount: { type: 'number', minimum: 0.01 },
            type: { type: 'string', enum: ['bonus', 'deposit'] },
            description: { type: 'string', minLength: 1 },
            metadata: { type: 'object' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { userId, amount, type, description, metadata } =
          request.body as {
            userId: string;
            amount: number;
            type: 'bonus' | 'deposit';
            description: string;
            metadata?: Record<string, any>;
          };

        const result = await creditService.addCredits(
          userId,
          amount,
          type,
          description,
          {
            ...metadata,
            adminUserId: request.user?.userId,
            adminEmail: request.user?.email,
          }
        );

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to add credits'
          );
        }

        await logAdminAction(request, {
          action: 'credits.add',
          entityType: 'credit_transaction',
          entityId: result.transaction?.id || null,
          before: result.transaction
            ? { balance: result.transaction.balanceBefore }
            : null,
          after: result.transaction
            ? { balance: result.transaction.balanceAfter }
            : null,
          metadata: {
            targetUserId: userId,
            amount,
            type,
            description,
          },
        });

        return SuccessResponses.created(
          reply,
          {
            transaction: result.transaction,
            newBalance: result.balance,
          },
          'Credits added'
        );
      } catch (error) {
        Logger.error('Admin add credits failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to add credits');
      }
    }
  );

  fastify.post(
    '/withdraw',
    {
      schema: {
        body: {
          type: 'object',
          required: ['userId', 'amount', 'description'],
          properties: {
            userId: { type: 'string' },
            amount: { type: 'number', minimum: 0.01 },
            description: { type: 'string', minLength: 1 },
            metadata: { type: 'object' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { userId, amount, description, metadata } = request.body as {
          userId: string;
          amount: number;
          description: string;
          metadata?: Record<string, any>;
        };

        const result = await creditService.spendCredits(
          userId,
          amount,
          description,
          {
            ...metadata,
            adminUserId: request.user?.userId,
            adminEmail: request.user?.email,
            operationType: 'admin_withdrawal',
          }
        );

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to withdraw credits'
          );
        }

        await logAdminAction(request, {
          action: 'credits.withdraw',
          entityType: 'credit_transaction',
          entityId: result.transaction?.id || null,
          before: result.transaction
            ? { balance: result.transaction.balanceBefore }
            : null,
          after: result.transaction
            ? { balance: result.transaction.balanceAfter }
            : null,
          metadata: {
            targetUserId: userId,
            amount,
            description,
          },
        });

        return SuccessResponses.ok(
          reply,
          {
            transaction: result.transaction,
            newBalance: result.balance,
          },
          'Credits withdrawn'
        );
      } catch (error) {
        Logger.error('Admin withdraw credits failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to withdraw credits'
        );
      }
    }
  );
}
