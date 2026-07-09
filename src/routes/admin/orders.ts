import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authPreHandler } from '../../middleware/authMiddleware';
import { adminPreHandler } from '../../middleware/adminMiddleware';
import { orderService } from '../../services/orderService';
import { subscriptionService } from '../../services/subscriptionService';
import { orderRiskService } from '../../services/orderRiskService';
import { logAdminAction } from '../../services/auditLogService';
import { orderComplianceEvidenceService } from '../../services/orderComplianceEvidenceService';
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

const isValidUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

async function deliverOrderItem(params: {
  orderId: string;
  subscriptionId: string;
  adminUserId: string;
  reason?: string;
  skipEmail?: boolean;
}): Promise<{ success: boolean; error?: string; orderStatus?: OrderStatus }> {
  const pool = getDatabasePool();
  const orderResult = await pool.query(
    `SELECT id, user_id, status, contact_email, paid_with_credits
     FROM orders
     WHERE id = $1`,
    [params.orderId]
  );
  const order = orderResult.rows[0] || null;
  if (!order) return { success: false, error: 'Order not found' };
  if (!['paid', 'in_process', 'delivered'].includes(order.status)) {
    return { success: false, error: 'Order payment has not been verified' };
  }

  const paymentResult = await pool.query(
    `SELECT 1
     FROM payments
     WHERE order_id = $1
       AND status = 'succeeded'
     LIMIT 1`,
    [params.orderId]
  );
  if (!order.paid_with_credits && paymentResult.rows.length === 0) {
    return { success: false, error: 'Order payment has not been verified' };
  }

  const subscriptionResult = await pool.query(
    `SELECT id, status, credentials_encrypted, order_item_id
     FROM subscriptions
     WHERE order_id = $1
       AND id = $2`,
    [params.orderId, params.subscriptionId]
  );
  const subscription = subscriptionResult.rows[0] || null;
  if (!subscription) {
    return { success: false, error: 'Subscription not found for order' };
  }
  if (!subscription.credentials_encrypted) {
    return {
      success: false,
      error: 'Subscription credentials are required before delivery',
    };
  }

  const activation = await subscriptionService.activateSubscriptionForOrderItem(
    params.orderId,
    params.subscriptionId,
    params.adminUserId,
    {
      requireCredentials: true,
      reason: params.reason || 'order_item_delivered',
    }
  );
  if (!activation.updated && !activation.skipped) {
    return {
      success: false,
      error: activation.error || 'Failed to activate subscription',
    };
  }

  if (!params.skipEmail) {
    await orderService.sendItemDeliveredEmail({
      orderId: params.orderId,
      subscriptionId: params.subscriptionId,
    });
  }

  try {
    const note = `[${new Date().toISOString()}] Auto-completed on item delivery`;
    await pool.query(
      `UPDATE admin_tasks
       SET completed_at = COALESCE(completed_at, NOW()),
           assigned_admin = COALESCE(assigned_admin, $1),
           notes = CASE
             WHEN notes IS NULL OR notes = '' THEN $2
             ELSE notes || '\n' || $2
           END
       WHERE order_id = $3
         AND subscription_id = $4
         AND task_type = 'credential_provision'
         AND task_category = 'order_fulfillment'
         AND completed_at IS NULL`,
      [
        isValidUuid(params.adminUserId) ? params.adminUserId : null,
        note,
        params.orderId,
        params.subscriptionId,
      ]
    );
  } catch (error) {
    Logger.warn('Failed to auto-complete fulfillment task', {
      orderId: params.orderId,
      subscriptionId: params.subscriptionId,
      error,
    });
  }

  await orderComplianceEvidenceService.recordGenericEvidence({
    orderId: params.orderId,
    eventType: 'item_delivery',
    userId: order.user_id ?? null,
    customerEmail: order.contact_email ?? null,
    deliveryTimestamp: new Date(),
    metadata: {
      subscription_id: params.subscriptionId,
      order_item_id: subscription.order_item_id ?? null,
      source: 'admin.orders.item.deliver',
    },
  });

  const remainingResult = await pool.query(
    `SELECT COUNT(*)::int AS remaining
     FROM subscriptions
     WHERE order_id = $1
       AND status <> 'active'`,
    [params.orderId]
  );
  const remaining = Number(remainingResult.rows[0]?.remaining ?? 0);
  const nextStatus: OrderStatus = remaining === 0 ? 'delivered' : 'in_process';
  await orderService.updateOrderStatus(
    params.orderId,
    nextStatus,
    remaining === 0 ? 'order_delivered' : 'partial_delivery'
  );

  return { success: true, orderStatus: nextStatus };
}

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

  fastify.post(
    '/:orderId/items/:subscriptionId/deliver',
    {
      schema: {
        params: {
          type: 'object',
          required: ['orderId', 'subscriptionId'],
          properties: {
            orderId: { type: 'string' },
            subscriptionId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            reason: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orderId, subscriptionId } = request.params as {
          orderId: string;
          subscriptionId: string;
        };
        const body = request.body as { reason?: string };
        const result = await deliverOrderItem({
          orderId,
          subscriptionId,
          adminUserId: request.user?.userId || 'admin',
          reason: body?.reason || 'order_item_delivered',
        });

        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to deliver order item'
          );
        }

        await logAdminAction(request, {
          action: 'orders.item.deliver',
          entityType: 'subscription',
          entityId: subscriptionId,
          metadata: {
            order_id: orderId,
            order_status: result.orderStatus || null,
          },
        });

        return SuccessResponses.ok(
          reply,
          {
            order_id: orderId,
            subscription_id: subscriptionId,
            order_status: result.orderStatus,
          },
          'Order item delivered'
        );
      } catch (error) {
        Logger.error('Admin deliver order item failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to deliver order item'
        );
      }
    }
  );

  fastify.post(
    '/:orderId/items/:subscriptionId/activation-instructions',
    {
      schema: {
        params: {
          type: 'object',
          required: ['orderId', 'subscriptionId'],
          properties: {
            orderId: { type: 'string' },
            subscriptionId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['instructions'],
          properties: {
            instructions: { type: 'string', minLength: 1 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orderId, subscriptionId } = request.params as {
          orderId: string;
          subscriptionId: string;
        };
        const { instructions } = request.body as { instructions: string };
        const result = await subscriptionService.updateSubscriptionForAdmin(
          subscriptionId,
          {
            credentials_encrypted: instructions,
            activation_handshake_state: 'awaiting_customer',
            activation_instructions_delivered_at: new Date(),
          }
        );
        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to save activation instructions'
          );
        }
        await orderService.sendItemDeliveredEmail({
          orderId,
          subscriptionId,
        });
        await logAdminAction(request, {
          action: 'orders.item.activation_instructions.deliver',
          entityType: 'subscription',
          entityId: subscriptionId,
          metadata: { order_id: orderId },
        });
        return SuccessResponses.ok(reply, {
          order_id: orderId,
          subscription_id: subscriptionId,
          activation_handshake_state: 'awaiting_customer',
        });
      } catch (error) {
        Logger.error('Admin deliver activation instructions failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to deliver activation instructions'
        );
      }
    }
  );

  fastify.post(
    '/:orderId/items/:subscriptionId/activation-link',
    {
      schema: {
        params: {
          type: 'object',
          required: ['orderId', 'subscriptionId'],
          properties: {
            orderId: { type: 'string' },
            subscriptionId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['activation_link'],
          properties: {
            activation_link: { type: 'string', minLength: 1 },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orderId, subscriptionId } = request.params as {
          orderId: string;
          subscriptionId: string;
        };
        const { activation_link } = request.body as {
          activation_link: string;
        };
        const saveResult = await subscriptionService.updateSubscriptionForAdmin(
          subscriptionId,
          {
            credentials_encrypted: activation_link,
            activation_handshake_state: 'link_delivered',
            activation_link_delivered_at: new Date(),
          }
        );
        if (!saveResult.success) {
          return ErrorResponses.badRequest(
            reply,
            saveResult.error || 'Failed to save activation link'
          );
        }
        const delivery = await deliverOrderItem({
          orderId,
          subscriptionId,
          adminUserId: request.user?.userId || 'admin',
          reason: 'activation_link_delivered',
          skipEmail: true,
        });
        if (!delivery.success) {
          return ErrorResponses.badRequest(
            reply,
            delivery.error || 'Failed to deliver activation link'
          );
        }
        await orderService.sendItemDeliveredEmail({
          orderId,
          subscriptionId,
          variant: 'activation_link_ready',
        });
        await logAdminAction(request, {
          action: 'orders.item.activation_link.deliver',
          entityType: 'subscription',
          entityId: subscriptionId,
          metadata: {
            order_id: orderId,
            order_status: delivery.orderStatus || null,
          },
        });
        return SuccessResponses.ok(reply, {
          order_id: orderId,
          subscription_id: subscriptionId,
          activation_handshake_state: 'link_delivered',
          order_status: delivery.orderStatus,
        });
      } catch (error) {
        Logger.error('Admin deliver activation link failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to deliver activation link'
        );
      }
    }
  );

  fastify.post(
    '/:orderId/items/:subscriptionId/activation-restart',
    {
      schema: {
        params: {
          type: 'object',
          required: ['orderId', 'subscriptionId'],
          properties: {
            orderId: { type: 'string' },
            subscriptionId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          properties: {
            note: { type: 'string' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orderId, subscriptionId } = request.params as {
          orderId: string;
          subscriptionId: string;
        };
        const { note } = request.body as { note?: string };
        const result = await subscriptionService.updateSubscriptionForAdmin(
          subscriptionId,
          {
            activation_handshake_state: 'awaiting_customer',
            activation_handshake_restarted_at: new Date(),
          }
        );
        if (!result.success) {
          return ErrorResponses.badRequest(
            reply,
            result.error || 'Failed to restart activation step'
          );
        }
        await orderService.sendItemDeliveredEmail({
          orderId,
          subscriptionId,
          variant: 'activation_restart',
        });
        const order = await orderService.getOrderById(orderId);
        await orderComplianceEvidenceService.recordGenericEvidence({
          orderId,
          eventType: 'activation_restart',
          userId: order?.user_id ?? null,
          customerEmail: order?.contact_email ?? null,
          metadata: {
            subscription_id: subscriptionId,
            note: note || null,
          },
        });
        await logAdminAction(request, {
          action: 'orders.item.activation.restart',
          entityType: 'subscription',
          entityId: subscriptionId,
          metadata: { order_id: orderId, note: note || null },
        });
        return SuccessResponses.ok(reply, {
          order_id: orderId,
          subscription_id: subscriptionId,
          activation_handshake_state: 'awaiting_customer',
        });
      } catch (error) {
        Logger.error('Admin restart activation failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to restart activation step'
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

        if (status === 'delivered') {
          const pool = getDatabasePool();
          const subscriptionsResult = await pool.query(
            `SELECT id
             FROM subscriptions
             WHERE order_id = $1
               AND status = 'pending'
             ORDER BY created_at ASC`,
            [orderId]
          );

          if (subscriptionsResult.rows.length > 0) {
            let lastOrderStatus: OrderStatus | undefined;
            for (const row of subscriptionsResult.rows) {
              const delivery = await deliverOrderItem({
                orderId,
                subscriptionId: row.id as string,
                adminUserId: request.user?.userId || 'admin',
                reason: reason || 'order_delivered',
              });
              if (!delivery.success) {
                return ErrorResponses.badRequest(
                  reply,
                  delivery.error || 'Failed to deliver order item'
                );
              }
              lastOrderStatus = delivery.orderStatus;
            }

            const updatedOrder = await orderService.getOrderWithItems(orderId);
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
              after: updatedOrder
                ? {
                    status: updatedOrder.status,
                    status_reason: updatedOrder.status_reason,
                  }
                : { status: lastOrderStatus || null },
              metadata: {
                reason: reason || null,
                delivered_items: subscriptionsResult.rows.length,
              },
            });

            return SuccessResponses.ok(
              reply,
              updatedOrder,
              'Order status updated'
            );
          }
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

  fastify.post(
    '/:orderId/risk/recheck',
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
        if (!isValidUuid(orderId)) {
          return ErrorResponses.badRequest(reply, 'Invalid order ID format');
        }

        const order = await orderService.getOrderById(orderId);
        if (!order) {
          return ErrorResponses.notFound(reply, 'Order not found');
        }

        const riskResult = await orderRiskService.evaluateOrderRisk({
          orderId,
        });

        await logAdminAction(request, {
          action: 'orders.risk.recheck',
          entityType: 'order',
          entityId: orderId,
          metadata: {
            decision: riskResult.decision,
            should_run: riskResult.shouldRun,
            trigger_type: riskResult.triggerType,
            trigger_reasons: riskResult.triggerReasons,
            risk_score: riskResult.riskScore,
            risk_score_reason: riskResult.riskScoreReason,
            hold_fulfillment: riskResult.holdFulfillment,
            error: riskResult.error ?? null,
          },
        });

        return SuccessResponses.ok(reply, {
          order_id: orderId,
          decision: riskResult.decision,
          should_run: riskResult.shouldRun,
          trigger_type: riskResult.triggerType,
          trigger_reasons: riskResult.triggerReasons,
          risk_score: riskResult.riskScore,
          risk_score_reason: riskResult.riskScoreReason,
          hold_fulfillment: riskResult.holdFulfillment,
          success: riskResult.success,
          error: riskResult.error ?? null,
        });
      } catch (error) {
        Logger.error('Admin order risk recheck failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to recheck order risk'
        );
      }
    }
  );

  fastify.post(
    '/:orderId/replay-delivery',
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
          properties: {
            recalc_dates: { type: 'boolean' },
            resend_email: { type: 'boolean' },
            require_credentials: { type: 'boolean' },
          },
        },
      },
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orderId } = request.params as { orderId: string };
        const body = (request.body || {}) as {
          recalc_dates?: boolean;
          resend_email?: boolean;
          require_credentials?: boolean;
        };

        if (!isValidUuid(orderId)) {
          return ErrorResponses.badRequest(reply, 'Invalid order ID format');
        }

        const order = await orderService.getOrderById(orderId);
        if (!order) {
          return ErrorResponses.notFound(reply, 'Order not found');
        }
        if (order.status !== 'delivered') {
          return ErrorResponses.badRequest(
            reply,
            'Order must be delivered before replay'
          );
        }

        const recalcDates = body.recalc_dates !== false;
        const resendEmail = body.resend_email !== false;
        const requireCredentials = body.require_credentials ?? true;
        if (!recalcDates && !resendEmail) {
          return ErrorResponses.badRequest(reply, 'No replay action selected');
        }

        const adminUserId = request.user?.userId || 'admin';

        const dateResult = recalcDates
          ? await subscriptionService.replayDeliveryForOrder(
              orderId,
              adminUserId,
              {
                requireCredentials,
                reason: 'order_delivered_replay',
              }
            )
          : null;
        const emailResult = resendEmail
          ? await orderService.resendOrderDeliveredEmail(orderId)
          : null;

        await logAdminAction(request, {
          action: 'orders.delivery.replay',
          entityType: 'order',
          entityId: orderId,
          metadata: {
            recalc_dates: recalcDates,
            resend_email: resendEmail,
            require_credentials: requireCredentials,
            date_result: dateResult,
            email_result: emailResult,
          },
        });

        return SuccessResponses.ok(reply, {
          order_id: orderId,
          recalc_dates: dateResult,
          resend_email: emailResult,
        });
      } catch (error) {
        Logger.error('Admin order replay delivery failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to replay order delivery'
        );
      }
    }
  );
}
