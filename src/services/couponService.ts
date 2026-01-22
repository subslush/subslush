import type { PoolClient } from 'pg';
import { getDatabasePool } from '../config/database';
import { env } from '../config/environment';
import { Logger } from '../utils/logger';
import {
  Coupon,
  CouponScope,
  CouponStatus,
  CouponRedemption,
  CreateCouponInput,
  UpdateCouponInput,
} from '../types/coupon';
import {
  ServiceResult,
  createSuccessResult,
  createErrorResult,
} from '../types/service';
import type { Product } from '../types/catalog';

const DEFAULT_RESERVATION_MINUTES = 30;
const PAID_ORDER_STATUSES = ['paid', 'in_process', 'delivered'];

const normalizeScopeValue = (
  value: string | null | undefined
): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
};

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
};

const computePercentDiscount = (
  amountCents: number,
  percent: number
): number => {
  const safeAmount = Math.max(0, Math.round(amountCents));
  const safePercent = clampPercent(percent);
  return Math.round(safeAmount * (safePercent / 100));
};

const mapCoupon = (row: any): Coupon => ({
  id: row.id,
  code: row.code,
  code_normalized: row.code_normalized,
  percent_off: row.percent_off !== null ? Number(row.percent_off) : 0,
  scope: row.scope,
  status: row.status,
  starts_at: row.starts_at ?? null,
  ends_at: row.ends_at ?? null,
  max_redemptions:
    row.max_redemptions !== null && row.max_redemptions !== undefined
      ? Number(row.max_redemptions)
      : null,
  redemptions_used:
    row.redemptions_used !== null && row.redemptions_used !== undefined
      ? Number(row.redemptions_used)
      : null,
  bound_user_id: row.bound_user_id ?? null,
  first_order_only: row.first_order_only ?? false,
  category: row.category ?? null,
  product_id: row.product_id ?? null,
  term_months:
    row.term_months !== null && row.term_months !== undefined
      ? Number(row.term_months)
      : null,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const mapRedemption = (row: any): CouponRedemption => ({
  id: row.id,
  coupon_id: row.coupon_id,
  user_id: row.user_id,
  order_id: row.order_id ?? null,
  status: row.status,
  reserved_at: row.reserved_at,
  redeemed_at: row.redeemed_at ?? null,
  expires_at: row.expires_at ?? null,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export const normalizeCouponCode = (code?: string | null): string | null => {
  if (!code) return null;
  const trimmed = code.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
};

const couponAppliesToProduct = (coupon: Coupon, product: Product): boolean => {
  if (coupon.scope === 'global') return true;
  if (coupon.scope === 'product') {
    return Boolean(coupon.product_id && coupon.product_id === product.id);
  }
  if (coupon.scope === 'category') {
    const couponCategory = normalizeScopeValue(coupon.category);
    const productCategory = normalizeScopeValue(product.category);
    return Boolean(
      couponCategory && productCategory && couponCategory === productCategory
    );
  }
  return false;
};

const couponAppliesToTerm = (
  coupon: Coupon,
  termMonths?: number | null
): boolean => {
  if (coupon.term_months === null || coupon.term_months === undefined) {
    return true;
  }
  if (!Number.isFinite(termMonths)) return false;
  return Number(coupon.term_months) === Number(termMonths);
};

const isCouponActiveAt = (coupon: Coupon, now: Date): boolean => {
  if (coupon.status !== 'active') return false;
  if (coupon.starts_at && now < new Date(coupon.starts_at)) return false;
  if (coupon.ends_at && now > new Date(coupon.ends_at)) return false;
  return true;
};

type CouponValidationData = {
  coupon: Coupon;
  discountCents: number;
  totalCents: number;
};

type CouponValidationParams = {
  couponCode: string;
  userId: string;
  product: Product;
  subtotalCents: number;
  termMonths?: number | null;
  now?: Date;
  client?: PoolClient;
};

type CouponReservationParams = {
  couponId: string;
  userId: string;
  orderId: string;
  product: Product;
  subtotalCents: number;
  termMonths?: number | null;
  now?: Date;
  client: PoolClient;
};

class CouponService {
  async listCoupons(filters?: {
    status?: CouponStatus;
    scope?: CouponScope;
    code?: string;
    limit?: number;
    offset?: number;
  }): Promise<Coupon[]> {
    try {
      const pool = getDatabasePool();
      const params: any[] = [];
      let paramCount = 0;
      let sql = `
        SELECT
          c.*,
          COALESCE(usage.used_count, 0) AS redemptions_used
        FROM coupons c
        LEFT JOIN (
          SELECT coupon_id, COUNT(*)::int AS used_count
          FROM coupon_redemptions
          WHERE status = 'redeemed'
          GROUP BY coupon_id
        ) usage ON usage.coupon_id = c.id
        WHERE 1=1
      `;

      if (filters?.status) {
        sql += ` AND c.status = $${++paramCount}`;
        params.push(filters.status);
      }
      if (filters?.scope) {
        sql += ` AND c.scope = $${++paramCount}`;
        params.push(filters.scope);
      }
      if (filters?.code) {
        const normalized = normalizeCouponCode(filters.code);
        if (normalized) {
          sql += ` AND c.code_normalized = $${++paramCount}`;
          params.push(normalized);
        }
      }
      sql += ' ORDER BY c.created_at DESC';

      if (filters?.limit !== undefined) {
        sql += ` LIMIT $${++paramCount}`;
        params.push(filters.limit);
      }
      if (filters?.offset !== undefined) {
        sql += ` OFFSET $${++paramCount}`;
        params.push(filters.offset);
      }

      const result = await pool.query(sql, params);
      return result.rows.map(mapCoupon);
    } catch (error) {
      Logger.error('Failed to list coupons:', error);
      return [];
    }
  }

  async getCouponById(id: string, client?: PoolClient): Promise<Coupon | null> {
    const db = client ?? getDatabasePool();
    const result = await db.query('SELECT * FROM coupons WHERE id = $1', [id]);
    if (result.rows.length === 0) return null;
    return mapCoupon(result.rows[0]);
  }

  async getCouponByNormalizedCode(
    codeNormalized: string,
    client?: PoolClient
  ): Promise<Coupon | null> {
    const db = client ?? getDatabasePool();
    const result = await db.query(
      'SELECT * FROM coupons WHERE code_normalized = $1',
      [codeNormalized]
    );
    if (result.rows.length === 0) return null;
    return mapCoupon(result.rows[0]);
  }

  async createCoupon(
    input: CreateCouponInput,
    client?: PoolClient
  ): Promise<ServiceResult<Coupon>> {
    try {
      const codeNormalized = normalizeCouponCode(input.code);
      if (!codeNormalized) {
        return createErrorResult('Coupon code is required');
      }

      const db = client ?? getDatabasePool();
      const result = await db.query(
        `INSERT INTO coupons (
          code, code_normalized, percent_off, scope, status, starts_at, ends_at,
          max_redemptions, bound_user_id, first_order_only, category, product_id,
          term_months
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12,
          $13
        )
        RETURNING *`,
        [
          input.code,
          codeNormalized,
          input.percent_off,
          input.scope,
          input.status ?? 'active',
          input.starts_at ?? null,
          input.ends_at ?? null,
          input.max_redemptions ?? null,
          input.bound_user_id ?? null,
          input.first_order_only ?? false,
          input.category ?? null,
          input.product_id ?? null,
          input.term_months ?? null,
        ]
      );

      if (result.rows.length === 0) {
        return createErrorResult('Failed to create coupon');
      }

      return createSuccessResult(mapCoupon(result.rows[0]));
    } catch (error) {
      Logger.error('Failed to create coupon:', error);
      return createErrorResult('Failed to create coupon');
    }
  }

  async updateCoupon(
    id: string,
    input: UpdateCouponInput
  ): Promise<ServiceResult<Coupon>> {
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 0;

      if (input.code !== undefined) {
        const normalized = normalizeCouponCode(input.code);
        if (!normalized) {
          return createErrorResult('Coupon code is required');
        }
        updates.push(`code = $${++paramCount}`);
        values.push(input.code);
        updates.push(`code_normalized = $${++paramCount}`);
        values.push(normalized);
      }

      const addField = (field: string, value: any): void => {
        updates.push(`${field} = $${++paramCount}`);
        values.push(value);
      };

      if (input.percent_off !== undefined) {
        addField('percent_off', input.percent_off);
      }
      if (input.scope !== undefined) {
        addField('scope', input.scope);
      }
      if (input.status !== undefined) {
        addField('status', input.status);
      }
      if (input.starts_at !== undefined) {
        addField('starts_at', input.starts_at ?? null);
      }
      if (input.ends_at !== undefined) {
        addField('ends_at', input.ends_at ?? null);
      }
      if (input.max_redemptions !== undefined) {
        addField('max_redemptions', input.max_redemptions ?? null);
      }
      if (input.bound_user_id !== undefined) {
        addField('bound_user_id', input.bound_user_id ?? null);
      }
      if (input.first_order_only !== undefined) {
        addField('first_order_only', input.first_order_only ?? false);
      }
      if (input.category !== undefined) {
        addField('category', input.category ?? null);
      }
      if (input.product_id !== undefined) {
        addField('product_id', input.product_id ?? null);
      }
      if (input.term_months !== undefined) {
        addField('term_months', input.term_months ?? null);
      }

      if (updates.length === 0) {
        return createErrorResult('No valid fields to update');
      }

      updates.push('updated_at = NOW()');
      values.push(id);

      const pool = getDatabasePool();
      const result = await pool.query(
        `UPDATE coupons
         SET ${updates.join(', ')}
         WHERE id = $${++paramCount}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return createErrorResult('Coupon not found');
      }

      return createSuccessResult(mapCoupon(result.rows[0]));
    } catch (error) {
      Logger.error('Failed to update coupon:', error);
      return createErrorResult('Failed to update coupon');
    }
  }

  async deleteCoupon(id: string): Promise<ServiceResult<boolean>> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        'DELETE FROM coupons WHERE id = $1 RETURNING id',
        [id]
      );

      if (result.rows.length === 0) {
        return createErrorResult('Coupon not found');
      }

      return createSuccessResult(true);
    } catch (error) {
      Logger.error('Failed to delete coupon:', error);
      return createErrorResult('Failed to delete coupon');
    }
  }

  async validateCouponForOrder(
    params: CouponValidationParams
  ): Promise<ServiceResult<CouponValidationData>> {
    const now = params.now ?? new Date();
    const normalized = normalizeCouponCode(params.couponCode);
    if (!normalized) {
      return createErrorResult('invalid_code');
    }

    const db = params.client ?? getDatabasePool();
    const coupon = await this.getCouponByNormalizedCode(
      normalized,
      params.client
    );
    if (!coupon) {
      return createErrorResult('not_found');
    }

    if (!isCouponActiveAt(coupon, now)) {
      return createErrorResult('inactive');
    }

    if (coupon.bound_user_id && coupon.bound_user_id !== params.userId) {
      return createErrorResult('bound_user');
    }

    if (!couponAppliesToProduct(coupon, params.product)) {
      return createErrorResult('scope_mismatch');
    }

    if (!couponAppliesToTerm(coupon, params.termMonths)) {
      return createErrorResult('term_mismatch');
    }

    if (coupon.first_order_only) {
      const hasPaid = await this.hasPaidOrder(params.userId, db);
      if (hasPaid) {
        return createErrorResult('first_order_only');
      }
    }

    await this.expireStaleReservations(coupon.id, db, now);

    if (!coupon.bound_user_id) {
      const userUsed = await this.hasUserRedemption(
        coupon.id,
        params.userId,
        db,
        now
      );
      if (userUsed) {
        return createErrorResult('already_redeemed');
      }
    }

    if (
      coupon.max_redemptions !== null &&
      coupon.max_redemptions !== undefined
    ) {
      const used = await this.countActiveRedemptions(coupon.id, db, now);
      if (used >= coupon.max_redemptions) {
        return createErrorResult('max_redemptions');
      }
    }

    const discountCents = computePercentDiscount(
      params.subtotalCents,
      coupon.percent_off
    );
    const totalCents = Math.max(
      0,
      Math.round(params.subtotalCents) - discountCents
    );
    if (totalCents <= 0) {
      return createErrorResult('zero_total');
    }

    return createSuccessResult({ coupon, discountCents, totalCents });
  }

  async reserveCouponRedemption(params: CouponReservationParams): Promise<
    ServiceResult<{
      coupon: Coupon;
      redemption: CouponRedemption;
      discountCents: number;
      totalCents: number;
    }>
  > {
    const now = params.now ?? new Date();
    const db = params.client;

    const couponResult = await db.query(
      'SELECT * FROM coupons WHERE id = $1 FOR UPDATE',
      [params.couponId]
    );

    if (couponResult.rows.length === 0) {
      return createErrorResult('not_found');
    }

    const coupon = mapCoupon(couponResult.rows[0]);

    if (!isCouponActiveAt(coupon, now)) {
      return createErrorResult('inactive');
    }

    if (coupon.bound_user_id && coupon.bound_user_id !== params.userId) {
      return createErrorResult('bound_user');
    }

    if (!couponAppliesToProduct(coupon, params.product)) {
      return createErrorResult('scope_mismatch');
    }

    if (!couponAppliesToTerm(coupon, params.termMonths)) {
      return createErrorResult('term_mismatch');
    }

    if (coupon.first_order_only) {
      const hasPaid = await this.hasPaidOrder(params.userId, db);
      if (hasPaid) {
        return createErrorResult('first_order_only');
      }
    }

    await this.expireStaleReservations(coupon.id, db, now);

    if (!coupon.bound_user_id) {
      const userUsed = await this.hasUserRedemption(
        coupon.id,
        params.userId,
        db,
        now
      );
      if (userUsed) {
        return createErrorResult('already_redeemed');
      }
    }

    if (
      coupon.max_redemptions !== null &&
      coupon.max_redemptions !== undefined
    ) {
      const used = await this.countActiveRedemptions(coupon.id, db, now);
      if (used >= coupon.max_redemptions) {
        return createErrorResult('max_redemptions');
      }
    }

    const discountCents = computePercentDiscount(
      params.subtotalCents,
      coupon.percent_off
    );
    const totalCents = Math.max(
      0,
      Math.round(params.subtotalCents) - discountCents
    );
    if (totalCents <= 0) {
      return createErrorResult('zero_total');
    }

    const reservationMinutes =
      env.COUPON_RESERVATION_MINUTES ?? DEFAULT_RESERVATION_MINUTES;
    const expiresAt = new Date(now.getTime() + reservationMinutes * 60 * 1000);

    const redemptionResult = await db.query(
      `INSERT INTO coupon_redemptions (
        coupon_id, user_id, order_id, status, reserved_at, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [coupon.id, params.userId, params.orderId, 'reserved', now, expiresAt]
    );

    if (redemptionResult.rows.length === 0) {
      return createErrorResult('reserve_failed');
    }

    return createSuccessResult({
      coupon,
      redemption: mapRedemption(redemptionResult.rows[0]),
      discountCents,
      totalCents,
    });
  }

  async finalizeRedemptionForOrder(
    orderId: string,
    client?: PoolClient
  ): Promise<boolean> {
    try {
      const db = client ?? getDatabasePool();
      const result = await db.query(
        `UPDATE coupon_redemptions
         SET status = 'redeemed', redeemed_at = NOW(), updated_at = NOW()
         WHERE order_id = $1 AND status = 'reserved'
         RETURNING id`,
        [orderId]
      );
      return result.rows.length > 0;
    } catch (error) {
      Logger.error('Failed to finalize coupon redemption:', error);
      return false;
    }
  }

  async voidRedemptionForOrder(
    orderId: string,
    client?: PoolClient
  ): Promise<boolean> {
    try {
      const db = client ?? getDatabasePool();
      const result = await db.query(
        `UPDATE coupon_redemptions
         SET status = 'voided', updated_at = NOW()
         WHERE order_id = $1 AND status = 'reserved'
         RETURNING id`,
        [orderId]
      );
      return result.rows.length > 0;
    } catch (error) {
      Logger.error('Failed to void coupon redemption:', error);
      return false;
    }
  }

  private async expireStaleReservations(
    couponId: string,
    db: PoolClient | ReturnType<typeof getDatabasePool>,
    now: Date
  ): Promise<void> {
    try {
      await db.query(
        `UPDATE coupon_redemptions
         SET status = 'expired', updated_at = NOW()
         WHERE coupon_id = $1
           AND status = 'reserved'
           AND expires_at IS NOT NULL
           AND expires_at <= $2`,
        [couponId, now]
      );
    } catch (error) {
      Logger.warn('Failed to expire stale coupon reservations', {
        couponId,
        error,
      });
    }
  }

  private async hasUserRedemption(
    couponId: string,
    userId: string,
    db: PoolClient | ReturnType<typeof getDatabasePool>,
    now: Date
  ): Promise<boolean> {
    const result = await db.query(
      `SELECT 1
       FROM coupon_redemptions
       WHERE coupon_id = $1
         AND user_id = $2
         AND (
           status = 'redeemed'
           OR (status = 'reserved' AND (expires_at IS NULL OR expires_at > $3))
         )
       LIMIT 1`,
      [couponId, userId, now]
    );
    return result.rows.length > 0;
  }

  private async countActiveRedemptions(
    couponId: string,
    db: PoolClient | ReturnType<typeof getDatabasePool>,
    now: Date
  ): Promise<number> {
    const result = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM coupon_redemptions
       WHERE coupon_id = $1
         AND (
           status = 'redeemed'
           OR (status = 'reserved' AND (expires_at IS NULL OR expires_at > $2))
         )`,
      [couponId, now]
    );
    const count = result.rows[0]?.count;
    return Number.isFinite(Number(count)) ? Number(count) : 0;
  }

  private async hasPaidOrder(
    userId: string,
    db: PoolClient | ReturnType<typeof getDatabasePool>
  ): Promise<boolean> {
    const result = await db.query(
      `SELECT 1
       FROM orders
       WHERE user_id = $1
         AND status = ANY($2::text[])
       LIMIT 1`,
      [userId, PAID_ORDER_STATUSES]
    );
    return result.rows.length > 0;
  }
}

export const couponService = new CouponService();
