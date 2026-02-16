import { getDatabasePool } from '../../config/database';
import { Logger } from '../../utils/logger';
import { auditLogService } from '../auditLogService';

const PIN_LOCKOUT_TASK_CATEGORY = 'pin_lockout';
const DATA_QUALITY_TASK_CATEGORY = 'data_quality_missing_billing_fields';
const FALLBACK_DUE_HOURS = 24;
const PIN_LOCKOUT_BATCH_SIZE = 200;
const DATA_QUALITY_BATCH_SIZE = 200;
const ORDER_ALLOCATION_BATCH_SIZE = 200;

type AdminTaskPriority = 'low' | 'medium' | 'high' | 'urgent';

interface PinLockoutCandidate {
  id: string;
  pin_failed_attempts: number | null;
  pin_locked_until: Date | string | null;
}

interface SubscriptionQualityCandidate {
  id: string;
  user_id: string;
  order_id: string | null;
  service_type: string | null;
  service_plan: string | null;
  renewal_method: string | null;
  price_cents: number | null;
  next_billing_at: Date | string | null;
  renewal_date: Date | string | null;
  end_date: Date | string | null;
}

interface OrderAllocationDriftRow {
  id: string;
  status: string;
  order_coupon: number;
  order_total: number;
  items_coupon: number;
  item_count: number;
  payment_total: number;
  payment_count: number;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function resolveSubscriptionDueDate(
  candidate: SubscriptionQualityCandidate
): Date {
  const nextBilling = toDate(candidate.next_billing_at);
  if (nextBilling) return nextBilling;

  const renewalDate = toDate(candidate.renewal_date);
  if (renewalDate) return renewalDate;

  const endDate = toDate(candidate.end_date);
  if (endDate) return endDate;

  return new Date(Date.now() + FALLBACK_DUE_HOURS * 60 * 60 * 1000);
}

function formatServiceLabel(
  serviceType: string | null,
  servicePlan: string | null
): string {
  const parts = [serviceType, servicePlan].filter(Boolean);
  return parts.join(' ').replace(/_/g, ' ').trim();
}

async function ensureUserTask(params: {
  userId: string;
  taskType: string;
  dueDate: Date;
  priority: AdminTaskPriority;
  notes: string;
  category: string;
}): Promise<boolean> {
  const pool = getDatabasePool();
  const result = await pool.query(
    `INSERT INTO admin_tasks
      (subscription_id, user_id, order_id, task_type, due_date, priority, notes, task_category, sla_due_at)
     SELECT NULL, $1, NULL, $2::varchar(50), $3, $4, $5, $6::varchar(50), $7
     WHERE NOT EXISTS (
       SELECT 1
       FROM admin_tasks
       WHERE user_id = $1
         AND task_type = $2::varchar(50)
         AND task_category = $6::varchar(50)
         AND completed_at IS NULL
     )
     RETURNING id`,
    [
      params.userId,
      params.taskType,
      params.dueDate,
      params.priority,
      params.notes,
      params.category,
      params.dueDate,
    ]
  );

  return (result.rowCount ?? 0) > 0;
}

async function ensureSubscriptionTask(params: {
  subscriptionId: string;
  userId: string;
  orderId: string | null;
  taskType: string;
  dueDate: Date;
  priority: AdminTaskPriority;
  notes: string;
  category: string;
}): Promise<boolean> {
  const pool = getDatabasePool();
  const result = await pool.query(
    `INSERT INTO admin_tasks
      (subscription_id, user_id, order_id, task_type, due_date, priority, notes, task_category, sla_due_at)
     SELECT $1, $2, $3, $4::varchar(50), $5, $6, $7, $8::varchar(50), $9
     WHERE NOT EXISTS (
       SELECT 1
       FROM admin_tasks
       WHERE subscription_id = $1
         AND task_type = $4::varchar(50)
         AND task_category = $8::varchar(50)
         AND completed_at IS NULL
     )
     RETURNING id`,
    [
      params.subscriptionId,
      params.userId,
      params.orderId,
      params.taskType,
      params.dueDate,
      params.priority,
      params.notes,
      params.category,
      params.dueDate,
    ]
  );

  return (result.rowCount ?? 0) > 0;
}

export async function runPinLockoutMonitor(): Promise<void> {
  Logger.info('PIN lockout monitor started');
  const pool = getDatabasePool();
  let created = 0;

  try {
    const lockedResult = await pool.query(
      `
      SELECT id, pin_failed_attempts, pin_locked_until
      FROM users
      WHERE pin_locked_until IS NOT NULL
        AND pin_locked_until > NOW()
      ORDER BY pin_locked_until ASC
      LIMIT $1
    `,
      [PIN_LOCKOUT_BATCH_SIZE]
    );

    const candidates = lockedResult.rows as PinLockoutCandidate[];

    for (const candidate of candidates) {
      const lockedUntil = toDate(candidate.pin_locked_until);
      if (!lockedUntil) {
        continue;
      }

      const attempts = Number(candidate.pin_failed_attempts || 0);
      const notes = `PIN lockout active until ${lockedUntil.toISOString()} (${attempts} failed attempt${attempts === 1 ? '' : 's'}).`;

      const inserted = await ensureUserTask({
        userId: candidate.id,
        taskType: 'support',
        dueDate: lockedUntil,
        priority: 'high',
        notes,
        category: PIN_LOCKOUT_TASK_CATEGORY,
      });

      if (inserted) {
        created += 1;
      }
    }

    const resolvedResult = await pool.query(
      `
      UPDATE admin_tasks t
      SET completed_at = NOW()
      FROM users u
      WHERE t.task_category = $1
        AND t.completed_at IS NULL
        AND t.user_id = u.id
        AND (u.pin_locked_until IS NULL OR u.pin_locked_until <= NOW())
      RETURNING t.id
      `,
      [PIN_LOCKOUT_TASK_CATEGORY]
    );

    Logger.info('PIN lockout monitor complete', {
      candidates: candidates.length,
      created,
      resolved: resolvedResult.rowCount,
    });
  } catch (error) {
    Logger.error('PIN lockout monitor failed:', error);
  }
}

export async function runSubscriptionDataQualityMonitor(): Promise<void> {
  Logger.info('Subscription data-quality monitor started');
  const pool = getDatabasePool();
  let created = 0;

  try {
    const result = await pool.query(
      `
      SELECT id, user_id, order_id, service_type, service_plan,
             renewal_method, price_cents, next_billing_at, renewal_date, end_date
      FROM subscriptions
      WHERE status = 'active'
        AND auto_renew = true
        AND (
          renewal_method IS NULL OR renewal_method = ''
          OR price_cents IS NULL OR price_cents <= 0
          OR next_billing_at IS NULL
        )
      ORDER BY COALESCE(next_billing_at, renewal_date, end_date) ASC
      LIMIT $1
    `,
      [DATA_QUALITY_BATCH_SIZE]
    );

    const candidates = result.rows as SubscriptionQualityCandidate[];

    for (const candidate of candidates) {
      const missingFields: string[] = [];
      const renewalMethod =
        typeof candidate.renewal_method === 'string'
          ? candidate.renewal_method.trim()
          : null;
      const priceCents =
        candidate.price_cents !== null && candidate.price_cents !== undefined
          ? Number(candidate.price_cents)
          : null;

      if (!renewalMethod) {
        missingFields.push('renewal_method');
      }
      if (!priceCents || priceCents <= 0) {
        missingFields.push('price_cents');
      }
      if (!candidate.next_billing_at) {
        missingFields.push('next_billing_at');
      }

      if (missingFields.length === 0) {
        continue;
      }

      const dueDate = resolveSubscriptionDueDate(candidate);
      const serviceLabel = formatServiceLabel(
        candidate.service_type,
        candidate.service_plan
      );
      const notes = `Auto-renew subscription missing ${missingFields.join(', ')}.${serviceLabel ? ` Service: ${serviceLabel}.` : ''}`;

      const inserted = await ensureSubscriptionTask({
        subscriptionId: candidate.id,
        userId: candidate.user_id,
        orderId: candidate.order_id,
        taskType: 'renewal',
        dueDate,
        priority: 'medium',
        notes,
        category: DATA_QUALITY_TASK_CATEGORY,
      });

      if (inserted) {
        created += 1;
      }
    }

    const resolvedResult = await pool.query(
      `
      UPDATE admin_tasks t
      SET completed_at = NOW()
      FROM subscriptions s
      WHERE t.task_category = $1
        AND t.completed_at IS NULL
        AND t.subscription_id = s.id
        AND NOT (
          s.status = 'active'
          AND s.auto_renew = true
          AND (
            s.renewal_method IS NULL OR s.renewal_method = ''
            OR s.price_cents IS NULL OR s.price_cents <= 0
            OR s.next_billing_at IS NULL
          )
        )
      RETURNING t.id
      `,
      [DATA_QUALITY_TASK_CATEGORY]
    );

    Logger.info('Subscription data-quality monitor complete', {
      candidates: candidates.length,
      created,
      resolved: resolvedResult.rowCount,
    });
  } catch (error) {
    Logger.error('Subscription data-quality monitor failed:', error);
  }
}

export async function runOrderAllocationReconciliation(): Promise<void> {
  Logger.info('Order allocation reconciliation started');
  const pool = getDatabasePool();
  let repaired = 0;
  let flagged = 0;

  try {
    const tablesResult = await pool.query(
      `SELECT to_regclass('public.payment_items') AS payment_items_table`
    );
    if (!tablesResult.rows[0]?.payment_items_table) {
      Logger.warn(
        'Order allocation reconciliation skipped: payment_items missing'
      );
      return;
    }

    const result = await pool.query(
      `
      WITH item_sums AS (
        SELECT
          order_id,
          COALESCE(SUM(COALESCE(coupon_discount_cents, 0)), 0) AS items_coupon,
          COUNT(*) AS item_count
        FROM order_items
        GROUP BY order_id
      ),
      payment_sums AS (
        SELECT
          oi.order_id,
          COALESCE(SUM(COALESCE(pi.allocated_total_cents, 0)), 0) AS payment_total,
          COUNT(pi.payment_id) AS payment_count
        FROM payment_items pi
        JOIN order_items oi ON oi.id = pi.order_item_id
        GROUP BY oi.order_id
      )
      SELECT
        o.id,
        o.status,
        COALESCE(o.coupon_discount_cents, 0) AS order_coupon,
        COALESCE(o.total_cents, 0) AS order_total,
        COALESCE(i.items_coupon, 0) AS items_coupon,
        COALESCE(i.item_count, 0) AS item_count,
        COALESCE(p.payment_total, 0) AS payment_total,
        COALESCE(p.payment_count, 0) AS payment_count
      FROM orders o
      LEFT JOIN item_sums i ON i.order_id = o.id
      LEFT JOIN payment_sums p ON p.order_id = o.id
      WHERE o.status <> 'cart'
        AND (
          COALESCE(i.items_coupon, 0) <> COALESCE(o.coupon_discount_cents, 0)
          OR (COALESCE(p.payment_count, 0) > 0
              AND COALESCE(p.payment_total, 0) <> COALESCE(o.total_cents, 0))
        )
      ORDER BY o.updated_at DESC
      LIMIT $1
      `,
      [ORDER_ALLOCATION_BATCH_SIZE]
    );

    const rows = result.rows as OrderAllocationDriftRow[];

    for (const row of rows) {
      let updatedCoupon = false;

      if (row.item_count > 0 && row.items_coupon !== row.order_coupon) {
        await pool.query(
          `UPDATE orders
           SET coupon_discount_cents = $1, updated_at = NOW()
           WHERE id = $2`,
          [row.items_coupon, row.id]
        );
        updatedCoupon = true;
        repaired += 1;
      } else {
        flagged += 1;
      }

      await auditLogService.recordAdminAction({
        action: updatedCoupon
          ? 'order_allocation_reconciled'
          : 'order_allocation_drift',
        entityType: 'order',
        entityId: row.id,
        before: {
          coupon_discount_cents: row.order_coupon,
          total_cents: row.order_total,
        },
        after: {
          coupon_discount_cents: updatedCoupon
            ? row.items_coupon
            : row.order_coupon,
          total_cents: row.order_total,
        },
        metadata: {
          status: row.status,
          items_coupon: row.items_coupon,
          payment_total: row.payment_total,
          payment_count: row.payment_count,
          repaired_coupon: updatedCoupon,
        },
      });
    }

    Logger.info('Order allocation reconciliation complete', {
      scanned: rows.length,
      repaired,
      flagged,
    });
  } catch (error) {
    Logger.error('Order allocation reconciliation failed:', error);
  }
}
