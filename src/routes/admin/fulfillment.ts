import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authPreHandler } from '../../middleware/authMiddleware';
import { adminPreHandler } from '../../middleware/adminMiddleware';
import { getDatabasePool } from '../../config/database';
import { ErrorResponses, SuccessResponses } from '../../utils/response';
import { Logger } from '../../utils/logger';
import { credentialsEncryptionService } from '../../utils/encryption';
import { logAdminAction } from '../../services/auditLogService';
import { subscriptionService } from '../../services/subscriptionService';
import { formatMmuCoverageLabel } from '../../utils/mmuSchedule';
import { parseJsonValue } from '../../utils/json';
import { normalizeUpgradeOptions } from '../../utils/upgradeOptions';

const decryptSubscriptionCredentials = async (
  request: FastifyRequest,
  subscriptionId: string,
  encrypted: string | null | undefined,
  context: string
): Promise<string | null> => {
  await logAdminAction(request, {
    action: 'subscriptions.credentials.view',
    entityType: 'subscription',
    entityId: subscriptionId,
    metadata: {
      context,
      credentialPresent: Boolean(encrypted),
    },
  });
  if (!encrypted) return null;
  const decrypted = credentialsEncryptionService.decryptFromString(encrypted);
  if (!decrypted.wasEncrypted && decrypted.migratedPayload) {
    await subscriptionService.updateSubscriptionCredentialsEncryptedValue({
      subscriptionId,
      encryptedValue: decrypted.migratedPayload,
    });
  }
  return decrypted.plaintext;
};

export async function adminFulfillmentRoutes(
  fastify: FastifyInstance
): Promise<void> {
  fastify.get(
    '/queue',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            tab: { type: 'string' },
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
          tab = 'new_orders',
          limit = 50,
          offset = 0,
        } = request.query as {
          tab?: string;
          limit?: number;
          offset?: number;
        };
        const pool = getDatabasePool();
        const params: any[] = [];
        let sql = `
          SELECT o.id AS order_id,
                 o.contact_email,
                 o.user_id,
                 o.status AS order_status,
                 o.payment_provider,
                 o.payment_reference,
                 o.total_cents,
                 o.currency,
                 o.updated_at AS paid_at,
                 u.email AS account_email,
                 u.is_guest,
                 s.id AS subscription_id,
                 s.status AS subscription_status,
                 s.activation_handshake_state,
                 s.delivered_at,
                 oi.product_name,
                 oi.variant_name,
                 oi.term_months,
                 p.metadata AS product_metadata,
                 t.id AS task_id,
                 t.task_type,
                 t.due_date,
                 t.is_issue,
                 t.completed_at,
                 t.mmu_cycle_index,
                 t.mmu_cycle_total,
                 sel.upgrade_options_snapshot
          FROM orders o
          JOIN subscriptions s ON s.order_id = o.id
          LEFT JOIN order_items oi ON oi.id = s.order_item_id
          LEFT JOIN product_variants pv ON pv.id = s.product_variant_id
          LEFT JOIN products p ON p.id = pv.product_id
          LEFT JOIN users u ON u.id = o.user_id
          LEFT JOIN admin_tasks t ON t.subscription_id = s.id AND t.completed_at IS NULL
          LEFT JOIN subscription_upgrade_selections sel ON sel.subscription_id = s.id
          WHERE o.status IN ('paid', 'in_process', 'delivered')
        `;
        if (tab === 'mmu') {
          sql += ` AND t.task_type = 'manual_monthly_upgrade'`;
        } else if (tab === 'awaiting_customer') {
          sql += ` AND s.activation_handshake_state IN ('awaiting_customer', 'customer_ready')`;
        } else if (tab === 'issues') {
          sql += ` AND t.is_issue = TRUE`;
        } else if (tab === 'completed') {
          sql += ` AND s.delivered_at IS NOT NULL`;
        } else {
          sql += ` AND s.status <> 'active' AND COALESCE(t.task_type, 'credential_provision') <> 'manual_monthly_upgrade'`;
        }
        sql += ` ORDER BY o.updated_at DESC LIMIT $1 OFFSET $2`;
        params.push(limit, offset);
        const result = await pool.query(sql, params);

        const orders = new Map<string, any>();
        for (const row of result.rows) {
          const order = orders.get(row.order_id) || {
            id: row.order_id,
            short_id: String(row.order_id).slice(0, 8),
            customer_email: row.contact_email || row.account_email,
            guest: row.is_guest === true,
            paid_at: row.paid_at,
            payment: {
              provider: row.payment_provider,
              reference: row.payment_reference,
              total_cents: row.total_cents,
              currency: row.currency,
            },
            delivered_count: 0,
            items: [],
          };
          const productOptions = normalizeUpgradeOptions(row.product_metadata);
          const selectionOptions = parseJsonValue<Record<string, any>>(
            row.upgrade_options_snapshot,
            {}
          );
          const mmuLabel =
            row.task_type === 'manual_monthly_upgrade'
              ? formatMmuCoverageLabel({
                  termMonths: Number(row.term_months),
                  intervalMonths:
                    Number(
                      selectionOptions?.[
                        'manual_monthly_upgrade_interval_months'
                      ]
                    ) || 1,
                  cycleIndex: Number(row.mmu_cycle_index),
                })
              : null;
          if (row.subscription_status === 'active') {
            order.delivered_count += 1;
          }
          order.items.push({
            subscription_id: row.subscription_id,
            product_name: row.product_name,
            variant_name: row.variant_name,
            term_months: row.term_months,
            status:
              row.subscription_status === 'active'
                ? 'delivered'
                : row.activation_handshake_state === 'customer_ready'
                  ? 'customer_ready'
                  : row.activation_handshake_state === 'awaiting_customer'
                    ? 'awaiting_customer'
                    : row.is_issue
                      ? 'issue'
                      : 'awaiting_fulfillment',
            delivery_method: {
              manual_monthly_upgrade:
                productOptions?.manual_monthly_upgrade === true,
              activation_link_handshake:
                productOptions?.activation_link_handshake === true,
              strict_rules: productOptions?.strict_rules === true,
            },
            task_id: row.task_id,
            task_type: row.task_type,
            due_date: row.due_date,
            overdue: row.due_date ? new Date(row.due_date) < new Date() : false,
            mmu_label: mmuLabel?.label ?? null,
            mmu_covers_months_from: mmuLabel?.coversMonthsFrom ?? null,
            mmu_covers_months_to: mmuLabel?.coversMonthsTo ?? null,
            mmu_term_months: mmuLabel?.termMonths ?? null,
          });
          orders.set(row.order_id, order);
        }

        return SuccessResponses.ok(reply, {
          orders: Array.from(orders.values()),
        });
      } catch (error) {
        Logger.error('Admin fulfillment queue failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to load fulfillment queue'
        );
      }
    }
  );

  fastify.get(
    '/orders/:orderId',
    {
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orderId } = request.params as { orderId: string };
        const pool = getDatabasePool();
        const orderResult = await pool.query(
          `SELECT o.*, u.email AS account_email, u.status AS account_status,
                  u.last_login, u.is_guest, u.guest_claimed_at
           FROM orders o
           LEFT JOIN users u ON u.id = o.user_id
           WHERE o.id = $1`,
          [orderId]
        );
        const order = orderResult.rows[0] || null;
        if (!order) return ErrorResponses.notFound(reply, 'Order not found');

        const itemsResult = await pool.query(
          `SELECT s.*, oi.product_name, oi.variant_name, oi.term_months,
                  oi.metadata AS item_metadata, p.metadata AS product_metadata,
                  EXISTS (
                    SELECT 1 FROM credential_reveal_audit_logs cr
                    WHERE cr.subscription_id = s.id AND cr.success = TRUE
                  ) AS revealed_by_customer,
                  (
                    SELECT jsonb_build_object('at', e.created_at, 'ip', e.ip_address, 'version', e.metadata->>'rules_version')
                    FROM order_compliance_evidence_logs e
                    WHERE e.order_id = s.order_id
                      AND e.event_type = 'strict_rules_acceptance'
                      AND e.metadata->>'subscription_id' = s.id::text
                    ORDER BY e.created_at DESC
                    LIMIT 1
                  ) AS rules_acknowledged
           FROM subscriptions s
           LEFT JOIN order_items oi ON oi.id = s.order_item_id
           LEFT JOIN product_variants pv ON pv.id = s.product_variant_id
           LEFT JOIN products p ON p.id = pv.product_id
           WHERE s.order_id = $1
           ORDER BY s.created_at ASC`,
          [orderId]
        );

        const items = [];
        for (const row of itemsResult.rows) {
          items.push({
            subscription_id: row.id,
            order_item_id: row.order_item_id,
            product_name: row.product_name,
            variant_name: row.variant_name,
            term_months: row.term_months,
            status: row.status,
            credentials_on_file: Boolean(row.credentials_encrypted),
            credentials: await decryptSubscriptionCredentials(
              request,
              row.id,
              row.credentials_encrypted,
              'fulfillment_order_detail'
            ),
            handshake_state: row.activation_handshake_state,
            delivered_at: row.delivered_at,
            delivered_by: row.delivered_by,
            delivery_email_sent_at: row.delivery_email_sent_at,
            customer_revealed: row.revealed_by_customer === true,
            rulesAcknowledged: row.rules_acknowledged ?? null,
            product_options: normalizeUpgradeOptions(row.product_metadata),
          });
        }

        return SuccessResponses.ok(reply, {
          customer: {
            account_email: order.account_email,
            delivery_email: order.contact_email,
            status: order.account_status,
            last_login: order.last_login,
            guest: order.is_guest === true,
            guest_claimed_at: order.guest_claimed_at,
          },
          order: {
            id: order.id,
            total_cents: order.total_cents,
            currency: order.currency,
            coupon_id: order.coupon_id,
            coupon_code: order.coupon_code,
            provider: order.payment_provider,
            payment_ref: order.payment_reference,
            paid_at: order.updated_at,
            payment_status: order.status,
          },
          items,
        });
      } catch (error) {
        Logger.error('Admin fulfillment order detail failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to load fulfillment order detail'
        );
      }
    }
  );

  fastify.get(
    '/mmu-tasks/:taskId',
    {
      preHandler: [authPreHandler, adminPreHandler],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { taskId } = request.params as { taskId: string };
        const pool = getDatabasePool();
        const result = await pool.query(
          `SELECT t.*, s.credentials_encrypted, s.term_months, s.service_type,
                  s.service_plan, s.order_id, o.contact_email, u.email AS account_email,
                  sel.upgrade_options_snapshot
           FROM admin_tasks t
           JOIN subscriptions s ON s.id = t.subscription_id
           LEFT JOIN orders o ON o.id = s.order_id
           LEFT JOIN users u ON u.id = s.user_id
           LEFT JOIN subscription_upgrade_selections sel ON sel.subscription_id = s.id
           WHERE t.id = $1
             AND t.task_type = 'manual_monthly_upgrade'`,
          [taskId]
        );
        const task = result.rows[0] || null;
        if (!task) return ErrorResponses.notFound(reply, 'MMU task not found');
        const options = parseJsonValue<Record<string, any>>(
          task.upgrade_options_snapshot,
          {}
        );
        const mmuLabel = formatMmuCoverageLabel({
          termMonths: Number(task.term_months),
          intervalMonths:
            Number(options?.['manual_monthly_upgrade_interval_months']) || 1,
          cycleIndex: Number(task.mmu_cycle_index),
        });
        const history = await pool.query(
          `SELECT id, due_date, completed_at, mmu_cycle_index, mmu_cycle_total
           FROM admin_tasks
           WHERE subscription_id = $1
             AND task_type = 'manual_monthly_upgrade'
           ORDER BY due_date ASC`,
          [task.subscription_id]
        );
        return SuccessResponses.ok(reply, {
          task: {
            ...task,
            mmu_label: mmuLabel?.label ?? null,
            mmu_covers_months_from: mmuLabel?.coversMonthsFrom ?? null,
            mmu_covers_months_to: mmuLabel?.coversMonthsTo ?? null,
            mmu_term_months: mmuLabel?.termMonths ?? null,
          },
          credentials: await decryptSubscriptionCredentials(
            request,
            task.subscription_id,
            task.credentials_encrypted,
            'mmu_task_detail'
          ),
          cycle_history: history.rows,
          order: {
            id: task.order_id,
            customer_email: task.contact_email || task.account_email,
          },
        });
      } catch (error) {
        Logger.error('Admin MMU detail failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to load MMU detail');
      }
    }
  );

  fastify.get(
    '/overview',
    { preHandler: [authPreHandler, adminPreHandler] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const pool = getDatabasePool();
        const result = await pool.query(
          `SELECT
             (SELECT COUNT(DISTINCT o.id)
              FROM orders o
              JOIN subscriptions s ON s.order_id = o.id
              WHERE o.status IN ('paid', 'in_process') AND s.status <> 'active') AS orders_needing_fulfillment,
             (SELECT COUNT(*) FROM admin_tasks WHERE task_type = 'manual_monthly_upgrade' AND completed_at IS NULL AND due_date < NOW()) AS open_mmu_overdue,
             (SELECT COUNT(*) FROM admin_tasks WHERE task_type = 'manual_monthly_upgrade' AND completed_at IS NULL AND due_date >= NOW() AND due_date <= NOW() + INTERVAL '7 days') AS open_mmu_due_soon,
             (SELECT COUNT(*) FROM subscriptions WHERE activation_handshake_state IN ('awaiting_customer', 'instructions_delivered')) AS awaiting_customer,
             (SELECT COUNT(*) FROM subscriptions WHERE activation_handshake_state = 'customer_ready') AS customer_ready,
             (SELECT COUNT(*) FROM admin_tasks WHERE is_issue = TRUE AND completed_at IS NULL) AS issue_tasks,
             (SELECT COUNT(*) FROM subscriptions WHERE delivered_at >= NOW() - INTERVAL '7 days') AS delivered_items_last_7d,
             (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'succeeded' AND updated_at >= NOW() - INTERVAL '7 days') AS revenue_last_7d,
             (SELECT COUNT(*) FROM payments WHERE status IN ('failed', 'canceled', 'expired') AND updated_at >= NOW() - INTERVAL '24 hours') AS failed_payments_last_24h`
        );
        return SuccessResponses.ok(reply, result.rows[0] || {});
      } catch (error) {
        Logger.error('Admin fulfillment overview failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to load overview');
      }
    }
  );
}
