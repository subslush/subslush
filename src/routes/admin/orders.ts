import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authPreHandler } from '../../middleware/authMiddleware';
import { adminPreHandler } from '../../middleware/adminMiddleware';
import { orderService } from '../../services/orderService';
import { subscriptionService } from '../../services/subscriptionService';
import { logAdminAction } from '../../services/auditLogService';
import { getDatabasePool } from '../../config/database';
import { ErrorResponses, SuccessResponses } from '../../utils/response';
import { Logger } from '../../utils/logger';
import type { OrderStatus } from '../../types/order';

const allowedStatuses: OrderStatus[] = [
  'cart',
  'pending_payment',
  'paid',
  'in_process',
  'delivered',
  'cancelled',
];

const parseNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function adminOrderRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.get(
    '/',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            payment_provider: { type: 'string' },
            user_id: { type: 'string' },
            search: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 200 },
            offset: { type: 'number', minimum: 0 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const filters = request.query as {
          status?: OrderStatus;
          payment_provider?: string;
          user_id?: string;
          search?: string;
          limit?: number;
          offset?: number;
        };

        const orders = await orderService.listOrders(filters);

        return SuccessResponses.ok(reply, { orders });
      } catch (error) {
        Logger.error('Admin list orders failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to list orders');
      }
    }
  );

  fastify.get(
    '/:orderId/items',
    {
      schema: {
        params: {
          type: 'object',
          required: ['orderId'],
          properties: {
            orderId: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orderId } = request.params as { orderId: string };
        const items = await orderService.listOrderItems(orderId);
        return SuccessResponses.ok(reply, { items });
      } catch (error) {
        Logger.error('Admin list order items failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to list order items'
        );
      }
    }
  );

  fastify.get(
    '/:orderId/fulfillment',
    {
      schema: {
        params: {
          type: 'object',
          required: ['orderId'],
          properties: {
            orderId: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orderId } = request.params as { orderId: string };

        const baseOrder = await orderService.getOrderWithItems(orderId);
        if (!baseOrder) {
          return ErrorResponses.notFound(reply, 'Order not found');
        }
        const detailedItems = await orderService.listOrderItems(orderId);
        const order = {
          ...baseOrder,
          items: detailedItems.length > 0 ? detailedItems : baseOrder.items,
        };

        const pool = getDatabasePool();
        const userResult = await pool.query(
          'SELECT id, email, status, created_at, last_login FROM users WHERE id = $1',
          [order.user_id]
        );
        const user = userResult.rows[0] || null;

        const subscriptionsResult = await pool.query(
          `SELECT s.id, s.user_id, s.service_type, s.service_plan, s.status, s.start_date,
                  s.term_start_at, s.end_date, s.renewal_date, s.auto_renew, s.next_billing_at,
                  s.renewal_method, s.price_cents, s.currency, s.order_id, s.product_variant_id,
                  s.credentials_encrypted, s.created_at,
                  sel.selection_type, sel.account_identifier, sel.manual_monthly_acknowledged_at,
                  sel.submitted_at, sel.locked_at, sel.upgrade_options_snapshot,
                  (sel.credentials_encrypted IS NOT NULL) AS has_user_credentials
           FROM subscriptions s
           LEFT JOIN subscription_upgrade_selections sel
             ON sel.subscription_id = s.id
           WHERE s.order_id = $1
           ORDER BY s.created_at ASC`,
          [orderId]
        );
        const subscriptions = subscriptionsResult.rows.map(row => ({
          ...row,
          has_credentials: Boolean(row.credentials_encrypted),
          has_user_credentials: row.has_user_credentials ?? false,
        }));

        const paymentsResult = await pool.query(
          'SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC',
          [orderId]
        );
        const payments = paymentsResult.rows.map(row => ({
          ...row,
          payment_id: row.provider_payment_id,
          amount_cents: row.amount
            ? Math.round(parseFloat(row.amount) * 100)
            : null,
        }));

        const tasksResult = await pool.query(
          `SELECT t.*,
                  CASE
                    WHEN t.completed_at IS NOT NULL THEN 'completed'
                    WHEN t.is_issue = TRUE THEN 'issue'
                    WHEN t.assigned_admin IS NOT NULL THEN 'in_progress'
                    ELSE 'pending'
                  END as status
           FROM admin_tasks t
           WHERE t.order_id = $1
           ORDER BY t.created_at ASC`,
          [orderId]
        );

        let creditSummary = null;
        let recentDeposits: any[] = [];
        let recentPurchases: any[] = [];
        let orderCreditsSpent = 0;

        if (order.user_id) {
          const summaryResult = await pool.query(
            `SELECT
               COALESCE(SUM(amount), 0) AS balance,
               COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS credits_in,
               COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS credits_out,
               COALESCE(SUM(CASE WHEN type = 'deposit' AND amount > 0 THEN amount ELSE 0 END), 0) AS deposits_confirmed,
               COALESCE(SUM(CASE WHEN type = 'deposit' AND amount = 0 THEN 1 ELSE 0 END), 0) AS pending_deposits,
               COALESCE(SUM(CASE WHEN type = 'bonus' THEN amount ELSE 0 END), 0) AS bonuses,
               COALESCE(SUM(CASE WHEN type = 'refund' THEN amount ELSE 0 END), 0) AS refunds,
               COALESCE(SUM(CASE WHEN type = 'purchase' AND amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS purchases,
               COALESCE(SUM(CASE WHEN type = 'withdrawal' AND amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS withdrawals,
               MAX(created_at) FILTER (WHERE type = 'deposit') AS last_deposit_at,
               MAX(created_at) FILTER (WHERE type = 'purchase') AS last_purchase_at
             FROM credit_transactions
             WHERE user_id = $1`,
            [order.user_id]
          );

          const summaryRow = summaryResult.rows[0] || {};
          const creditsIn = parseNumber(summaryRow.credits_in);
          const creditsOut = parseNumber(summaryRow.credits_out);

          creditSummary = {
            balance: parseNumber(summaryRow.balance),
            creditsIn,
            creditsOut,
            depositsConfirmed: parseNumber(summaryRow.deposits_confirmed),
            pendingDeposits: Number(summaryRow.pending_deposits || 0),
            bonuses: parseNumber(summaryRow.bonuses),
            refunds: parseNumber(summaryRow.refunds),
            purchases: parseNumber(summaryRow.purchases),
            withdrawals: parseNumber(summaryRow.withdrawals),
            lastDepositAt: summaryRow.last_deposit_at || null,
            lastPurchaseAt: summaryRow.last_purchase_at || null,
            flags: {
              spendExceedsCreditsIn: creditsOut - creditsIn > 0.0001,
              hasPendingDeposits: Number(summaryRow.pending_deposits || 0) > 0,
            },
          };

          const depositsResult = await pool.query(
            `SELECT id, amount, currency, payment_provider, payment_status, payment_id, created_at
             FROM credit_transactions
             WHERE user_id = $1 AND type = 'deposit'
             ORDER BY created_at DESC
             LIMIT 5`,
            [order.user_id]
          );
          recentDeposits = depositsResult.rows;

          const purchasesResult = await pool.query(
            `SELECT id, amount, order_id, description, created_at, price_cents, currency
             FROM credit_transactions
             WHERE user_id = $1 AND type = 'purchase'
             ORDER BY created_at DESC
             LIMIT 5`,
            [order.user_id]
          );
          recentPurchases = purchasesResult.rows;

          const orderCreditsResult = await pool.query(
            `SELECT COALESCE(SUM(ABS(amount)), 0) AS spent
             FROM credit_transactions
             WHERE order_id = $1 AND amount < 0`,
            [orderId]
          );
          orderCreditsSpent = parseNumber(orderCreditsResult.rows[0]?.spent);
        }

        return SuccessResponses.ok(reply, {
          order,
          user,
          subscriptions,
          payments,
          tasks: tasksResult.rows,
          credit: {
            summary: creditSummary,
            recentDeposits,
            recentPurchases,
            orderCreditsSpent,
          },
        });
      } catch (error) {
        Logger.error('Admin order fulfillment fetch failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to load fulfillment data'
        );
      }
    }
  );

  fastify.patch(
    '/:orderId/status',
    {
      schema: {
        params: {
          type: 'object',
          required: ['orderId'],
          properties: {
            orderId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string' },
            reason: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orderId } = request.params as { orderId: string };
        const { status, reason } = request.body as {
          status: OrderStatus;
          reason?: string;
        };
        const before = await orderService.getOrderWithItems(orderId);

        if (!allowedStatuses.includes(status)) {
          return ErrorResponses.badRequest(reply, 'Invalid order status');
        }

        const result = await orderService.updateOrderStatus(
          orderId,
          status,
          reason
        );

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to update order status'
          );
        }

        if (status === 'delivered') {
          const adminUserId = request.user?.userId || 'admin';
          await subscriptionService.activateSubscriptionsForOrder(
            orderId,
            adminUserId,
            {
              requireCredentials: true,
              reason: reason || 'order_delivered',
            }
          );
          try {
            const pool = getDatabasePool();
            const assignedAdmin = request.user?.userId || null;
            const note = `[${new Date().toISOString()}] Auto-completed on delivery`;
            await pool.query(
              `UPDATE admin_tasks
               SET completed_at = COALESCE(completed_at, NOW()),
                   assigned_admin = COALESCE(assigned_admin, $1),
                   notes = CASE
                     WHEN notes IS NULL OR notes = '' THEN $2
                     ELSE notes || '\n' || $2
                   END
               WHERE order_id = $3
                 AND task_type = 'credential_provision'
                 AND task_category = 'order_fulfillment'
                 AND completed_at IS NULL`,
              [assignedAdmin, note, orderId]
            );
          } catch (error) {
            Logger.warn('Failed to auto-complete fulfillment tasks', {
              orderId,
              error,
            });
          }
        }

        await logAdminAction(request, {
          action: 'orders.status.update',
          entityType: 'order',
          entityId: orderId,
          before: before
            ? {
                status: before.status,
                status_reason: before.status_reason,
              }
            : null,
          after: result.data
            ? {
                status: result.data.status,
                status_reason: result.data.status_reason,
              }
            : null,
          metadata: {
            reason: reason || null,
          },
        });

        return SuccessResponses.ok(reply, result.data, 'Order status updated');
      } catch (error) {
        Logger.error('Admin update order status failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to update order status'
        );
      }
    }
  );
}
