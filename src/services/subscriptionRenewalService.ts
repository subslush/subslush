import type { PoolClient } from 'pg';
import { getDatabasePool } from '../config/database';
import { Logger } from '../utils/logger';

export type RenewalLockStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'canceled';

type RenewalLockResult = {
  acquired: boolean;
  cycleEndDate: string;
  status: RenewalLockStatus;
  renewalId?: string;
  reason?: string;
};

const parseDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const toUtcDateOnly = (date: Date): Date =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );

export const toUtcDateKey = (date: Date): string =>
  date.toISOString().slice(0, 10);

export const resolveCycleEndDate = (params: {
  endDate?: Date | string | null;
  termStartAt?: Date | string | null;
  termMonths?: number | null;
  expectedEndDate?: Date | string | null;
}): Date | null => {
  const expected = parseDate(params.expectedEndDate);
  if (expected) return toUtcDateOnly(expected);

  const endDate = parseDate(params.endDate);
  if (endDate) return toUtcDateOnly(endDate);

  const termStartAt = parseDate(params.termStartAt);
  const termMonths =
    typeof params.termMonths === 'number' && Number.isFinite(params.termMonths)
      ? Math.max(1, Math.floor(params.termMonths))
      : null;
  if (!termStartAt || !termMonths) {
    return null;
  }

  const startUtc = toUtcDateOnly(termStartAt);
  const endUtc = new Date(startUtc);
  endUtc.setUTCMonth(endUtc.getUTCMonth() + termMonths);
  return endUtc;
};

export const subscriptionRenewalService = {
  async acquireRenewalLock(params: {
    subscriptionId: string;
    cycleEndDate: Date;
    paymentId?: string | null;
    client?: PoolClient;
  }): Promise<RenewalLockResult> {
    const db = params.client ?? getDatabasePool();
    const cycleKey = toUtcDateKey(params.cycleEndDate);

    const insertResult = await db.query(
      `INSERT INTO subscription_renewals
        (subscription_id, cycle_end_date, status, invoice_payment_id)
       VALUES ($1, $2, 'pending', $3)
       ON CONFLICT (subscription_id, cycle_end_date) DO NOTHING
       RETURNING id, status`,
      [params.subscriptionId, cycleKey, params.paymentId ?? null]
    );

    if (insertResult.rows.length > 0) {
      return {
        acquired: true,
        cycleEndDate: cycleKey,
        status: 'pending',
        renewalId: insertResult.rows[0].id,
      };
    }

    const existing = await db.query(
      `SELECT id, status
       FROM subscription_renewals
       WHERE subscription_id = $1 AND cycle_end_date = $2`,
      [params.subscriptionId, cycleKey]
    );

    const existingRow = existing.rows[0];
    const existingStatus =
      (existingRow?.status as RenewalLockStatus) ?? 'pending';

    if (existingStatus === 'succeeded' || existingStatus === 'processing') {
      return {
        acquired: false,
        cycleEndDate: cycleKey,
        status: existingStatus,
        renewalId: existingRow?.id,
        reason: 'already_locked',
      };
    }

    if (existingStatus === 'failed' || existingStatus === 'canceled') {
      const retry = await db.query(
        `UPDATE subscription_renewals
         SET status = 'pending',
             invoice_payment_id = COALESCE(invoice_payment_id, $3),
             updated_at = NOW()
         WHERE subscription_id = $1 AND cycle_end_date = $2
         RETURNING id, status`,
        [params.subscriptionId, cycleKey, params.paymentId ?? null]
      );

      if (retry.rows.length > 0) {
        return {
          acquired: true,
          cycleEndDate: cycleKey,
          status: 'pending',
          renewalId: retry.rows[0].id,
        };
      }
    }

    return {
      acquired: false,
      cycleEndDate: cycleKey,
      status: existingStatus,
      renewalId: existingRow?.id,
      reason: 'lock_exists',
    };
  },

  async beginRenewalProcessing(params: {
    subscriptionId: string;
    cycleEndDate: Date;
    paymentId?: string | null;
    client?: PoolClient;
  }): Promise<RenewalLockResult> {
    const db = params.client ?? getDatabasePool();
    const cycleKey = toUtcDateKey(params.cycleEndDate);

    const updateResult = await db.query(
      `UPDATE subscription_renewals
       SET status = 'processing',
           invoice_payment_id = COALESCE(invoice_payment_id, $3),
           updated_at = NOW()
       WHERE subscription_id = $1
         AND cycle_end_date = $2
         AND status <> 'succeeded'
       RETURNING id, status`,
      [params.subscriptionId, cycleKey, params.paymentId ?? null]
    );

    if (updateResult.rows.length > 0) {
      return {
        acquired: true,
        cycleEndDate: cycleKey,
        status: 'processing',
        renewalId: updateResult.rows[0].id,
      };
    }

    const insertResult = await db.query(
      `INSERT INTO subscription_renewals
        (subscription_id, cycle_end_date, status, invoice_payment_id)
       VALUES ($1, $2, 'processing', $3)
       ON CONFLICT (subscription_id, cycle_end_date) DO NOTHING
       RETURNING id, status`,
      [params.subscriptionId, cycleKey, params.paymentId ?? null]
    );

    if (insertResult.rows.length > 0) {
      return {
        acquired: true,
        cycleEndDate: cycleKey,
        status: 'processing',
        renewalId: insertResult.rows[0].id,
      };
    }

    const existing = await db.query(
      `SELECT id, status
       FROM subscription_renewals
       WHERE subscription_id = $1 AND cycle_end_date = $2`,
      [params.subscriptionId, cycleKey]
    );
    const existingRow = existing.rows[0];
    const existingStatus =
      (existingRow?.status as RenewalLockStatus) ?? 'pending';

    if (existingStatus === 'succeeded') {
      return {
        acquired: false,
        cycleEndDate: cycleKey,
        status: existingStatus,
        renewalId: existingRow?.id,
        reason: 'already_succeeded',
      };
    }

    return {
      acquired: true,
      cycleEndDate: cycleKey,
      status: existingStatus,
      renewalId: existingRow?.id,
      reason: 'existing_lock',
    };
  },

  async markRenewalSucceeded(params: {
    subscriptionId: string;
    cycleEndDate: Date;
    paymentId?: string | null;
    client?: PoolClient;
  }): Promise<void> {
    const db = params.client ?? getDatabasePool();
    const cycleKey = toUtcDateKey(params.cycleEndDate);
    await db.query(
      `UPDATE subscription_renewals
       SET status = 'succeeded',
           invoice_payment_id = COALESCE(invoice_payment_id, $3),
           updated_at = NOW()
       WHERE subscription_id = $1 AND cycle_end_date = $2`,
      [params.subscriptionId, cycleKey, params.paymentId ?? null]
    );
  },

  async markRenewalFailed(params: {
    subscriptionId: string;
    cycleEndDate: Date;
    client?: PoolClient;
  }): Promise<void> {
    const db = params.client ?? getDatabasePool();
    const cycleKey = toUtcDateKey(params.cycleEndDate);
    await db.query(
      `UPDATE subscription_renewals
       SET status = 'failed',
           updated_at = NOW()
       WHERE subscription_id = $1 AND cycle_end_date = $2`,
      [params.subscriptionId, cycleKey]
    );
  },

  async attachPaymentToRenewal(params: {
    subscriptionId: string;
    cycleEndDate: Date;
    paymentId: string;
    status?: RenewalLockStatus;
    client?: PoolClient;
  }): Promise<void> {
    const db = params.client ?? getDatabasePool();
    const cycleKey = toUtcDateKey(params.cycleEndDate);
    const nextStatus = params.status ?? 'processing';
    await db.query(
      `UPDATE subscription_renewals
       SET invoice_payment_id = COALESCE(invoice_payment_id, $3),
           status = $4,
           updated_at = NOW()
       WHERE subscription_id = $1 AND cycle_end_date = $2`,
      [params.subscriptionId, cycleKey, params.paymentId, nextStatus]
    );
  },

  logCycleResolution(params: {
    subscriptionId: string;
    cycleEndDate: Date;
    source: string;
  }): void {
    Logger.info('Renewal cycle resolved', {
      subscriptionId: params.subscriptionId,
      cycleEndDate: toUtcDateKey(params.cycleEndDate),
      source: params.source,
    });
  },
};
