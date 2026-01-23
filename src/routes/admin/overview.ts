import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authPreHandler } from '../../middleware/authMiddleware';
import { adminPreHandler } from '../../middleware/adminMiddleware';
import { getDatabasePool } from '../../config/database';
import { ErrorResponses, SuccessResponses } from '../../utils/response';
import { Logger } from '../../utils/logger';

const parseCount = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number.parseInt(String(value ?? '0'), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function adminOverviewRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.get(
    '/',
    {
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const pool = getDatabasePool();

        const [
          productsResult,
          ordersResult,
          paymentsResult,
          subscriptionsResult,
          tasksResult,
        ] = await Promise.all([
          pool.query('SELECT COUNT(*)::int AS count FROM products'),
          pool.query('SELECT COUNT(*)::int AS count FROM orders'),
          pool.query('SELECT COUNT(*)::int AS count FROM payments'),
          pool.query('SELECT COUNT(*)::int AS count FROM subscriptions'),
          pool.query(
            `SELECT COUNT(*)::int AS count
             FROM admin_tasks
             WHERE completed_at IS NULL
               AND assigned_admin IS NULL
               AND is_issue = FALSE`
          ),
        ]);

        const metrics = {
          products: parseCount(productsResult.rows[0]?.count),
          orders: parseCount(ordersResult.rows[0]?.count),
          payments: parseCount(paymentsResult.rows[0]?.count),
          subscriptions: parseCount(subscriptionsResult.rows[0]?.count),
          tasks: parseCount(tasksResult.rows[0]?.count),
        };

        return SuccessResponses.ok(reply, { metrics });
      } catch (error) {
        Logger.error('Admin overview metrics failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to load admin overview metrics'
        );
      }
    }
  );
}
