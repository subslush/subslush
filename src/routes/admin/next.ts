import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authPreHandler } from '../../middleware/authMiddleware';
import { adminPreHandler } from '../../middleware/adminMiddleware';
import { getDatabasePool } from '../../config/database';
import { paymentFailureService } from '../../services/paymentFailureService';
import { ErrorResponses, SuccessResponses } from '../../utils/response';
import { Logger } from '../../utils/logger';
import { formatMmuCoverageLabel } from '../../utils/mmuSchedule';
import { parseJsonValue } from '../../utils/json';

type QueryParams = Record<string, string | number | boolean | undefined>;

const buildSearchPattern = (value?: string): string | null => {
  const trimmed = value?.trim();
  return trimmed ? `%${trimmed}%` : null;
};

const mapMoneyAmountToCents = (amount: unknown): number | null => {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100);
};

const resolveMmuCoverage = (row: any) => {
  if (row.task_type !== 'manual_monthly_upgrade') return null;
  const options = parseJsonValue<Record<string, any>>(
    row.upgrade_options_snapshot,
    {}
  );
  const label = formatMmuCoverageLabel({
    termMonths: Number(row.term_months),
    intervalMonths:
      Number(options?.['manual_monthly_upgrade_interval_months']) || 1,
    cycleIndex: Number(row.mmu_cycle_index),
  });
  return label;
};

const resolveMmuLabel = (row: any): string | null => {
  const label = resolveMmuCoverage(row);
  if (!label) return null;
  const due = row.due_date ? new Date(row.due_date) : null;
  const dueText =
    due && !Number.isNaN(due.getTime())
      ? `${due < new Date() ? 'overdue' : 'next'} ${due.toISOString()}`
      : null;
  return dueText ? `${label.label} · ${dueText}` : label.label;
};

const getRetryablePaymentIds = async (): Promise<Set<string>> => {
  try {
    const failures = await paymentFailureService.getFailedPayments(500, 0);
    const ids = new Set<string>();
    for (const failure of failures as any[]) {
      if (failure?.paymentId) ids.add(String(failure.paymentId));
      if (failure?.payment_id) ids.add(String(failure.payment_id));
      if (failure?.providerPaymentId)
        ids.add(String(failure.providerPaymentId));
    }
    return ids;
  } catch (error) {
    Logger.warn('Failed to load retryable payment failure records', { error });
    return new Set();
  }
};

export async function adminNextRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/orders',
    {
      preHandler: [authPreHandler, adminPreHandler],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            search: { type: 'string' },
            status: { type: 'string' },
            provider: { type: 'string' },
            date_from: { type: 'string' },
            date_to: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 200 },
            offset: { type: 'number', minimum: 0 },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const {
          search,
          status,
          provider,
          date_from,
          date_to,
          limit = 50,
          offset = 0,
        } = request.query as QueryParams;
        const params: any[] = [];
        let sql = `
          SELECT o.id,
                 o.user_id,
                 o.status,
                 o.contact_email,
                 o.payment_provider,
                 o.payment_reference,
                 o.subtotal_cents,
                 o.discount_cents,
                 o.coupon_code,
                 o.coupon_discount_cents,
                 o.total_cents,
                 o.currency,
                 o.created_at,
                 o.updated_at,
                 u.email AS account_email,
                 u.is_guest,
                 COUNT(DISTINCT oi.id)::int AS item_count,
                 COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'active' OR s.delivered_at IS NOT NULL)::int AS delivered_count
          FROM orders o
          LEFT JOIN users u ON u.id = o.user_id
          LEFT JOIN order_items oi ON oi.order_id = o.id
          LEFT JOIN subscriptions s ON s.order_id = o.id
          WHERE o.status <> 'cart'
        `;

        const searchPattern = buildSearchPattern(String(search || ''));
        if (searchPattern) {
          params.push(searchPattern);
          sql += ` AND (o.id::text ILIKE $${params.length}
                    OR COALESCE(o.contact_email, '') ILIKE $${params.length}
                    OR COALESCE(u.email, '') ILIKE $${params.length}
                    OR COALESCE(o.payment_reference, '') ILIKE $${params.length})`;
        }
        if (status && status !== 'all') {
          params.push(status);
          sql += ` AND o.status = $${params.length}`;
        }
        if (provider && provider !== 'all') {
          params.push(provider);
          sql += ` AND o.payment_provider = $${params.length}`;
        }
        if (date_from) {
          params.push(date_from);
          sql += ` AND o.created_at >= $${params.length}`;
        }
        if (date_to) {
          params.push(date_to);
          sql += ` AND o.created_at < ($${params.length}::date + INTERVAL '1 day')`;
        }

        sql += `
          GROUP BY o.id, u.email, u.is_guest
          ORDER BY o.created_at DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;
        params.push(limit, offset);
        const result = await getDatabasePool().query(sql, params);
        return SuccessResponses.ok(reply, { orders: result.rows });
      } catch (error) {
        Logger.error('Admin-next orders list failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to load orders');
      }
    }
  );

  fastify.get(
    '/orders/:orderId',
    { preHandler: [authPreHandler, adminPreHandler] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { orderId } = request.params as { orderId: string };
        const pool = getDatabasePool();
        const orderResult = await pool.query(
          `SELECT o.*, u.email AS account_email, u.status AS account_status,
                  u.display_name, u.last_login, u.is_guest, u.guest_claimed_at
           FROM orders o
           LEFT JOIN users u ON u.id = o.user_id
           WHERE o.id = $1`,
          [orderId]
        );
        const order = orderResult.rows[0] || null;
        if (!order) return ErrorResponses.notFound(reply, 'Order not found');

        const [
          items,
          payments,
          paymentEvents,
          evidence,
          guestTokens,
          openWork,
        ] = await Promise.all([
          pool.query(
            `SELECT oi.id AS order_item_id,
                      COALESCE(p.name, oi.metadata->>'product_name') AS product_name,
                      COALESCE(pv.name, oi.metadata->>'variant_name') AS variant_name,
                      oi.term_months,
                      oi.total_price_cents,
                      oi.currency,
                      oi.coupon_discount_cents,
                      s.id AS subscription_id,
                      s.status,
                      s.delivered_at,
                      s.delivery_email_sent_at,
                      s.activation_handshake_state,
                      p.metadata AS product_metadata
               FROM order_items oi
               LEFT JOIN subscriptions s ON s.order_item_id = oi.id
               LEFT JOIN product_variants pv ON pv.id = oi.product_variant_id
               LEFT JOIN products p ON p.id::text = COALESCE(pv.product_id::text, oi.metadata->>'product_id')
               WHERE oi.order_id = $1
               ORDER BY oi.created_at ASC, oi.id ASC`,
            [orderId]
          ),
          pool.query(
            `SELECT id, provider, provider_payment_id, status, provider_status,
                      amount, currency, created_at, updated_at, expires_at
               FROM payments
               WHERE order_id = $1
               ORDER BY created_at ASC`,
            [orderId]
          ),
          pool.query(
            `SELECT id, provider, event_id, event_type, payment_id, created_at
               FROM payment_events
               WHERE order_id = $1
               ORDER BY created_at ASC`,
            [orderId]
          ),
          pool.query(
            `SELECT 'credential_reveal' AS source,
                      cr.created_at,
                      CASE WHEN cr.success THEN 'credential_reveal' ELSE 'credential_reveal_failed' END AS event_type,
                      cr.ip_address,
                      cr.user_agent,
                      cr.subscription_id::text AS subject_id,
                      cr.metadata
               FROM credential_reveal_audit_logs cr
               JOIN subscriptions s ON s.id = cr.subscription_id
               WHERE s.order_id = $1
               UNION ALL
               SELECT 'compliance' AS source,
                      e.created_at,
                      e.event_type,
                      e.ip_address,
                      NULL AS user_agent,
                      e.order_id::text AS subject_id,
                      e.metadata
               FROM order_compliance_evidence_logs e
               WHERE e.order_id = $1
               ORDER BY created_at DESC`,
            [orderId]
          ),
          pool.query(
            `SELECT gct.id, gct.expires_at, gct.used_at, gct.created_at
               FROM guest_claim_tokens gct
               JOIN guest_identities gi ON gi.id = gct.guest_identity_id
               WHERE gi.email = $1
               ORDER BY gct.created_at DESC`,
            [order.contact_email]
          ),
          pool.query(
            `SELECT t.id, t.subscription_id, t.task_type, t.due_date, t.is_issue
               FROM admin_tasks t
               WHERE t.order_id = $1 AND t.completed_at IS NULL
               ORDER BY t.created_at ASC`,
            [orderId]
          ),
        ]);

        const safeItems = items.rows.map(row => {
          const { credentials_encrypted: _credentialsEncrypted, ...item } = row;
          return item;
        });

        return SuccessResponses.ok(reply, {
          order,
          customer: {
            account_email: order.account_email,
            delivery_email: order.contact_email,
            status: order.account_status,
            display_name: order.display_name,
            last_login: order.last_login,
            guest: order.is_guest === true,
            guest_claimed_at: order.guest_claimed_at,
          },
          items: safeItems,
          payments: payments.rows.map(row => ({
            ...row,
            payment_ref: row.provider_payment_id,
            amount_cents: mapMoneyAmountToCents(row.amount),
          })),
          payment_events: paymentEvents.rows,
          evidence: evidence.rows,
          emails: {
            order_delivery_sent_at: order.delivery_email_sent_at ?? null,
            item_delivery_sent: safeItems
              .filter(row => row.delivery_email_sent_at)
              .map(row => ({
                subscription_id: row.subscription_id,
                product_name: row.product_name,
                sent_at: row.delivery_email_sent_at,
              })),
          },
          guest_claim: {
            needed:
              order.is_guest === true ||
              /^guest\+.+@guest\.local$/i.test(order.contact_email || ''),
            claimed_at: order.guest_claimed_at ?? null,
            tokens: guestTokens.rows,
          },
          open_fulfillment: openWork.rows,
        });
      } catch (error) {
        Logger.error('Admin-next order detail failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to load order detail'
        );
      }
    }
  );

  fastify.get(
    '/subscriptions',
    { preHandler: [authPreHandler, adminPreHandler] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const {
          search,
          status,
          limit = 50,
          offset = 0,
        } = request.query as QueryParams;
        const params: any[] = [];
        let sql = `
          SELECT s.id, s.order_id, s.user_id, s.status, s.service_type, s.service_plan,
                 s.term_months, s.term_start_at, s.start_date, s.end_date, s.renewal_date,
                 s.created_at, s.delivered_at, s.activation_handshake_state,
                 u.email AS customer_email,
                 COALESCE(p.name, oi.metadata->>'product_name') AS product_name,
                 COALESCE(pv.name, oi.metadata->>'variant_name') AS variant_name,
                 t.id AS task_id, t.task_type, t.due_date, t.completed_at, t.is_issue,
                 t.mmu_cycle_index, t.mmu_cycle_total,
                 sel.selection_type, sel.account_identifier, sel.upgrade_options_snapshot,
                 (s.credentials_encrypted IS NOT NULL) AS credentials_on_file,
                 (sel.credentials_encrypted IS NOT NULL) AS own_account_credentials_on_file
          FROM subscriptions s
          LEFT JOIN users u ON u.id = s.user_id
          LEFT JOIN order_items oi ON oi.id = s.order_item_id
          LEFT JOIN product_variants pv ON pv.id = COALESCE(oi.product_variant_id, s.product_variant_id)
          LEFT JOIN products p ON p.id::text = COALESCE(pv.product_id::text, oi.metadata->>'product_id')
          LEFT JOIN LATERAL (
            SELECT *
            FROM admin_tasks at
            WHERE at.subscription_id = s.id AND at.completed_at IS NULL
            ORDER BY at.is_issue DESC, at.due_date ASC NULLS LAST, at.created_at ASC
            LIMIT 1
          ) t ON TRUE
          LEFT JOIN subscription_upgrade_selections sel ON sel.subscription_id = s.id
          WHERE 1=1
        `;
        const searchPattern = buildSearchPattern(String(search || ''));
        if (searchPattern) {
          params.push(searchPattern);
          sql += ` AND (s.id::text ILIKE $${params.length}
                    OR s.order_id::text ILIKE $${params.length}
                    OR COALESCE(u.email, '') ILIKE $${params.length}
                    OR COALESCE(p.name, oi.metadata->>'product_name', '') ILIKE $${params.length}
                    OR COALESCE(pv.name, oi.metadata->>'variant_name', '') ILIKE $${params.length})`;
        }
        if (status && status !== 'all') {
          params.push(status);
          sql += ` AND s.status = $${params.length}`;
        }
        sql += ` ORDER BY s.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);
        const result = await getDatabasePool().query(sql, params);
        return SuccessResponses.ok(reply, {
          subscriptions: result.rows.map(row => {
            const {
              credentials_encrypted: _credentialsEncrypted,
              ...subscription
            } = row;
            return {
              ...subscription,
              mmu_label: resolveMmuLabel(row),
            };
          }),
        });
      } catch (error) {
        Logger.error('Admin-next subscriptions failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to load subscriptions'
        );
      }
    }
  );

  fastify.get(
    '/subscriptions/:subscriptionId',
    { preHandler: [authPreHandler, adminPreHandler] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { subscriptionId } = request.params as { subscriptionId: string };
        const pool = getDatabasePool();
        const detail = await pool.query(
          `SELECT s.id, s.user_id, s.order_id, s.order_item_id, s.product_variant_id,
                  s.service_type, s.service_plan, s.status, s.term_months,
                  s.term_start_at, s.start_date, s.end_date, s.renewal_date,
                  s.auto_renew, s.next_billing_at, s.renewal_method,
                  s.price_cents, s.currency, s.created_at, s.updated_at,
                  s.delivered_at, s.delivered_by, s.delivery_email_sent_at,
                  s.activation_handshake_state,
                  u.email AS customer_email, o.contact_email,
                  COALESCE(p.name, oi.metadata->>'product_name') AS product_name,
                  COALESCE(pv.name, oi.metadata->>'variant_name') AS variant_name,
                  sel.selection_type, sel.account_identifier,
                  sel.submitted_at, sel.locked_at, sel.upgrade_options_snapshot,
                  (s.credentials_encrypted IS NOT NULL) AS credentials_on_file,
                  (sel.credentials_encrypted IS NOT NULL) AS own_account_credentials_on_file
           FROM subscriptions s
           LEFT JOIN users u ON u.id = s.user_id
           LEFT JOIN orders o ON o.id = s.order_id
           LEFT JOIN order_items oi ON oi.id = s.order_item_id
           LEFT JOIN product_variants pv ON pv.id = COALESCE(oi.product_variant_id, s.product_variant_id)
           LEFT JOIN products p ON p.id::text = COALESCE(pv.product_id::text, oi.metadata->>'product_id')
           LEFT JOIN subscription_upgrade_selections sel ON sel.subscription_id = s.id
           WHERE s.id = $1`,
          [subscriptionId]
        );
        const subscriptionRow = detail.rows[0] || null;
        if (!subscriptionRow) {
          return ErrorResponses.notFound(reply, 'Subscription not found');
        }
        const {
          credentials_encrypted: _credentialsEncrypted,
          ...subscription
        } = subscriptionRow;
        const tasks = await pool.query(
          `SELECT id, task_type, due_date, completed_at, is_issue, notes,
                  mmu_cycle_index, mmu_cycle_total
           FROM admin_tasks
           WHERE subscription_id = $1
           ORDER BY due_date ASC NULLS LAST, created_at ASC`,
          [subscriptionId]
        );
        return SuccessResponses.ok(reply, {
          subscription,
          tasks: tasks.rows.map(row => {
            const label = resolveMmuCoverage({
              ...row,
              term_months: subscription.term_months,
              upgrade_options_snapshot: subscription.upgrade_options_snapshot,
            });
            return {
              ...row,
              mmu_label: label?.label ?? null,
              month_label: label?.label ?? null,
              mmu_covers_months_from: label?.coversMonthsFrom ?? null,
              covers_months_from: label?.coversMonthsFrom ?? null,
              mmu_covers_months_to: label?.coversMonthsTo ?? null,
              covers_months_to: label?.coversMonthsTo ?? null,
              mmu_term_months: label?.termMonths ?? null,
              term_months:
                subscription.term_months ?? label?.termMonths ?? null,
              term_start: subscription.term_start_at ?? null,
            };
          }),
        });
      } catch (error) {
        Logger.error('Admin-next subscription detail failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to load subscription'
        );
      }
    }
  );

  fastify.get(
    '/payments',
    { preHandler: [authPreHandler, adminPreHandler] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const {
          search,
          provider,
          status,
          limit = 50,
          offset = 0,
        } = request.query as QueryParams;
        const retryableIds = await getRetryablePaymentIds();
        const params: any[] = [];
        let sql = `
          SELECT p.id, p.order_id, p.provider, p.provider_payment_id, p.status,
                 p.provider_status, p.amount, p.currency, p.created_at, p.updated_at,
                 o.contact_email
          FROM payments p
          LEFT JOIN orders o ON o.id = p.order_id
          WHERE 1=1
        `;
        const searchPattern = buildSearchPattern(String(search || ''));
        if (searchPattern) {
          params.push(searchPattern);
          sql += ` AND (p.id::text ILIKE $${params.length}
                    OR p.order_id::text ILIKE $${params.length}
                    OR p.provider_payment_id ILIKE $${params.length}
                    OR COALESCE(o.contact_email, '') ILIKE $${params.length})`;
        }
        if (provider && provider !== 'all') {
          params.push(provider);
          sql += ` AND p.provider = $${params.length}`;
        }
        if (status && status !== 'all') {
          params.push(status);
          sql += ` AND p.status = $${params.length}`;
        }
        sql += ` ORDER BY p.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);
        const result = await getDatabasePool().query(sql, params);
        return SuccessResponses.ok(reply, {
          payments: result.rows.map(row => ({
            ...row,
            payment_ref: row.provider_payment_id,
            amount_cents: mapMoneyAmountToCents(row.amount),
            retryable:
              retryableIds.has(String(row.id)) ||
              retryableIds.has(String(row.provider_payment_id)),
          })),
        });
      } catch (error) {
        Logger.error('Admin-next payments failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to load payments');
      }
    }
  );

  fastify.get(
    '/payments/:paymentId',
    { preHandler: [authPreHandler, adminPreHandler] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { paymentId } = request.params as { paymentId: string };
        const pool = getDatabasePool();
        const paymentResult = await pool.query(
          `SELECT p.*, o.contact_email
           FROM payments p
           LEFT JOIN orders o ON o.id = p.order_id
           WHERE p.id::text = $1 OR p.provider_payment_id = $1
           LIMIT 1`,
          [paymentId]
        );
        const payment = paymentResult.rows[0] || null;
        if (!payment)
          return ErrorResponses.notFound(reply, 'Payment not found');
        const events = await pool.query(
          `SELECT id, provider, event_id, event_type, order_id, payment_id, created_at
           FROM payment_events
           WHERE payment_id = $1 OR order_id = $2
           ORDER BY created_at ASC`,
          [payment.id, payment.order_id]
        );
        const retryableIds = await getRetryablePaymentIds();
        return SuccessResponses.ok(reply, {
          payment: {
            ...payment,
            payment_ref: payment.provider_payment_id,
            amount_cents: mapMoneyAmountToCents(payment.amount),
            retryable:
              retryableIds.has(String(payment.id)) ||
              retryableIds.has(String(payment.provider_payment_id)),
          },
          events: events.rows,
        });
      } catch (error) {
        Logger.error('Admin-next payment detail failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to load payment');
      }
    }
  );

  fastify.get(
    '/users/slim',
    { preHandler: [authPreHandler, adminPreHandler] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { search, limit = 10 } = request.query as QueryParams;
        const searchPattern = buildSearchPattern(String(search || ''));
        if (!searchPattern) {
          return SuccessResponses.ok(reply, { users: [] });
        }
        const pool = getDatabasePool();
        const users = await pool.query(
          `SELECT u.id, u.email, u.status, u.display_name, u.created_at,
                  u.last_login, u.email_verified_at, u.is_guest, u.guest_claimed_at
           FROM users u
           WHERE u.status <> 'deleted'
             AND (u.id::text ILIKE $1 OR u.email ILIKE $1 OR COALESCE(u.display_name, '') ILIKE $1)
           ORDER BY u.created_at DESC
           LIMIT $2`,
          [searchPattern, limit]
        );
        const userIds = users.rows.map(row => row.id);
        if (userIds.length === 0) {
          return SuccessResponses.ok(reply, { users: [] });
        }
        const [orders, subscriptions, evidence] = await Promise.all([
          pool.query(
            `SELECT id, user_id, status, total_cents, currency, payment_provider,
                    payment_reference, created_at
             FROM orders
             WHERE user_id = ANY($1::uuid[]) AND status <> 'cart'
             ORDER BY created_at DESC
             LIMIT 50`,
            [userIds]
          ),
          pool.query(
            `SELECT s.id, s.user_id, s.order_id, s.status, s.term_months,
                    s.start_date, s.end_date,
                    COALESCE(p.name, oi.metadata->>'product_name') AS product_name,
                    COALESCE(pv.name, oi.metadata->>'variant_name') AS variant_name
             FROM subscriptions s
             LEFT JOIN order_items oi ON oi.id = s.order_item_id
             LEFT JOIN product_variants pv ON pv.id = COALESCE(oi.product_variant_id, s.product_variant_id)
             LEFT JOIN products p ON p.id::text = COALESCE(pv.product_id::text, oi.metadata->>'product_id')
             WHERE s.user_id = ANY($1::uuid[])
             ORDER BY s.created_at DESC
             LIMIT 50`,
            [userIds]
          ),
          pool.query(
            `SELECT user_id, event_type, created_at, ip_address, user_agent, metadata
             FROM (
               SELECT cr.user_id, 'credential_reveal' AS event_type, cr.created_at,
                      cr.ip_address, cr.user_agent, cr.metadata
               FROM credential_reveal_audit_logs cr
               WHERE cr.user_id = ANY($1::uuid[])
               UNION ALL
               SELECT e.user_id, e.event_type, e.created_at, e.ip_address, NULL AS user_agent, e.metadata
               FROM order_compliance_evidence_logs e
               WHERE e.user_id = ANY($1::uuid[])
             ) recent
             ORDER BY created_at DESC
             LIMIT 50`,
            [userIds]
          ),
        ]);
        return SuccessResponses.ok(reply, {
          users: users.rows.map(user => ({
            account: user,
            orders: orders.rows.filter(row => row.user_id === user.id),
            subscriptions: subscriptions.rows.filter(
              row => row.user_id === user.id
            ),
            evidence: evidence.rows.filter(row => row.user_id === user.id),
          })),
        });
      } catch (error) {
        Logger.error('Admin-next slim users failed:', error);
        return ErrorResponses.internalError(reply, 'Failed to search users');
      }
    }
  );

  fastify.get(
    '/coupons/newsletter',
    { preHandler: [authPreHandler, adminPreHandler] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await getDatabasePool().query(
          `SELECT ns.id, ns.email, ns.coupon_code, ns.coupon_sent_at,
                  ns.subscribed_at, c.percent_off, c.starts_at, c.ends_at,
                  c.status AS coupon_status,
                  EXISTS (
                    SELECT 1 FROM coupon_redemptions cr
                    WHERE cr.coupon_id = c.id AND cr.status = 'redeemed'
                  ) AS redeemed
           FROM newsletter_subscriptions ns
           LEFT JOIN coupons c ON c.id = ns.coupon_id
           WHERE ns.coupon_id IS NOT NULL
           ORDER BY ns.subscribed_at DESC
           LIMIT 200`
        );
        const issued = result.rows.length;
        const redeemed = result.rows.filter(row => row.redeemed).length;
        return SuccessResponses.ok(reply, {
          stats: {
            issued,
            redeemed,
            conversion_percent:
              issued > 0 ? Math.round((redeemed / issued) * 1000) / 10 : 0,
          },
          coupons: result.rows,
        });
      } catch (error) {
        Logger.error('Admin-next newsletter coupons failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to load newsletter coupons'
        );
      }
    }
  );

  fastify.get(
    '/announcements',
    { preHandler: [authPreHandler, adminPreHandler] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await getDatabasePool().query(
          `SELECT metadata->>'announcement_id' AS announcement_id,
                  MAX(title) AS title,
                  MAX(message) AS message,
                  MIN(created_at) AS published_at,
                  COUNT(*)::int AS recipient_count
           FROM notifications
           WHERE type = 'announcement'
           GROUP BY metadata->>'announcement_id'
           ORDER BY MIN(created_at) DESC
           LIMIT 50`
        );
        return SuccessResponses.ok(reply, { announcements: result.rows });
      } catch (error) {
        Logger.error('Admin-next announcements history failed:', error);
        return ErrorResponses.internalError(
          reply,
          'Failed to load announcements'
        );
      }
    }
  );

  fastify.get(
    '/search',
    { preHandler: [authPreHandler, adminPreHandler] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { q } = request.query as { q?: string };
        const pattern = buildSearchPattern(q);
        if (!pattern) return SuccessResponses.ok(reply, { results: [] });
        const pool = getDatabasePool();
        const [orders, payments, users, subscriptions] = await Promise.all([
          pool.query(
            `SELECT id::text AS id, 'order' AS type, id::text AS label,
                    COALESCE(contact_email, '') AS description,
                    '/admin-next/orders/' || id::text AS href
             FROM orders
             WHERE id::text ILIKE $1 OR COALESCE(contact_email, '') ILIKE $1
             ORDER BY created_at DESC
             LIMIT 5`,
            [pattern]
          ),
          pool.query(
            `SELECT id::text AS id, 'payment' AS type, provider_payment_id AS label,
                    COALESCE(order_id::text, provider) AS description,
                    '/admin-next/payments?payment=' || id::text AS href
             FROM payments
             WHERE id::text ILIKE $1 OR provider_payment_id ILIKE $1 OR COALESCE(order_id::text, '') ILIKE $1
             ORDER BY created_at DESC
             LIMIT 5`,
            [pattern]
          ),
          pool.query(
            `SELECT id::text AS id, 'user' AS type, email AS label,
                    id::text AS description,
                    '/admin-next/users?search=' || email AS href
             FROM users
             WHERE status <> 'deleted' AND (id::text ILIKE $1 OR email ILIKE $1)
             ORDER BY created_at DESC
             LIMIT 5`,
            [pattern]
          ),
          pool.query(
            `SELECT s.id::text AS id, 'subscription' AS type,
                    COALESCE(p.name, oi.metadata->>'product_name', s.service_type, s.id::text) AS label,
                    COALESCE(u.email, s.order_id::text, '') AS description,
                    '/admin-next/subscriptions?subscription=' || s.id::text AS href
             FROM subscriptions s
             LEFT JOIN users u ON u.id = s.user_id
             LEFT JOIN order_items oi ON oi.id = s.order_item_id
             LEFT JOIN product_variants pv ON pv.id = COALESCE(oi.product_variant_id, s.product_variant_id)
             LEFT JOIN products p ON p.id::text = COALESCE(pv.product_id::text, oi.metadata->>'product_id')
             WHERE s.id::text ILIKE $1
                OR COALESCE(u.email, '') ILIKE $1
                OR COALESCE(s.order_id::text, '') ILIKE $1
                OR COALESCE(p.name, oi.metadata->>'product_name', '') ILIKE $1
                OR COALESCE(pv.name, oi.metadata->>'variant_name', '') ILIKE $1
             ORDER BY s.created_at DESC
             LIMIT 5`,
            [pattern]
          ),
        ]);
        return SuccessResponses.ok(reply, {
          results: [
            ...orders.rows,
            ...payments.rows,
            ...users.rows,
            ...subscriptions.rows,
          ].slice(0, 12),
        });
      } catch (error) {
        Logger.error('Admin-next search failed:', error);
        return ErrorResponses.internalError(reply, 'Search failed');
      }
    }
  );
}
