import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { couponService, normalizeCouponCode } from '../services/couponService';
import { getDatabasePool } from '../config/database';
import type { Coupon } from '../types/coupon';

jest.mock('../config/database', () => ({
  getDatabasePool: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  Logger: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;

const buildCouponRow = (overrides: Partial<Coupon> = {}): Coupon => ({
  id: 'coupon-1',
  code: 'SAVE10',
  code_normalized: 'save10',
  percent_off: 10,
  scope: 'global',
  apply_scope: 'highest_eligible_item',
  status: 'active',
  starts_at: null,
  ends_at: null,
  max_redemptions: null,
  bound_user_id: null,
  first_order_only: false,
  category: null,
  product_id: null,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides,
});

const baseProduct = {
  id: 'product-1',
  name: 'Test',
  slug: 'test',
  description: null,
  service_type: 'streaming',
  logo_key: null,
  category: 'streaming',
  default_currency: null,
  max_subscriptions: null,
  status: 'active',
  metadata: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const buildMockPool = (
  options: {
    coupon?: Coupon | null;
    hasUserRedemption?: boolean;
    activeRedemptions?: number;
    hasPaidOrder?: boolean;
  } = {}
) => {
  const couponRow = options.coupon ?? buildCouponRow();
  const pool = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM coupons')) {
        return { rows: couponRow ? [couponRow] : [] };
      }
      if (sql.includes('UPDATE coupon_redemptions')) {
        return { rows: [] };
      }
      if (sql.includes('FROM coupon_redemptions') && sql.includes('LIMIT 1')) {
        return { rows: options.hasUserRedemption ? [{}] : [] };
      }
      if (sql.includes('COUNT(*)')) {
        return {
          rows: [{ count: options.activeRedemptions ?? 0 }],
        };
      }
      if (sql.includes('FROM orders')) {
        return { rows: options.hasPaidOrder ? [{}] : [] };
      }
      return { rows: [] };
    }),
  };

  return pool;
};

describe('couponService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('normalizes coupon codes', () => {
    expect(normalizeCouponCode(' SAVE10 ')).toBe('save10');
    expect(normalizeCouponCode('')).toBeNull();
    expect(normalizeCouponCode('   ')).toBeNull();
  });

  it('validates coupons and computes discounts', async () => {
    const pool = buildMockPool();
    mockGetDatabasePool.mockReturnValue(pool as any);

    const result = await couponService.validateCouponForOrder({
      couponCode: 'SAVE10',
      userId: 'user-1',
      product: baseProduct as any,
      subtotalCents: 10000,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.discountCents).toBe(1000);
      expect(result.data.totalCents).toBe(9000);
    }
  });

  it('rejects coupons that zero out totals', async () => {
    const coupon = buildCouponRow({ percent_off: 100 });
    const pool = buildMockPool({ coupon });
    mockGetDatabasePool.mockReturnValue(pool as any);

    const result = await couponService.validateCouponForOrder({
      couponCode: 'SAVE100',
      userId: 'user-1',
      product: baseProduct as any,
      subtotalCents: 10000,
    });

    expect(result.success).toBe(false);
  });

  it('blocks public coupons for users who already redeemed', async () => {
    const pool = buildMockPool({ hasUserRedemption: true });
    mockGetDatabasePool.mockReturnValue(pool as any);

    const result = await couponService.validateCouponForOrder({
      couponCode: 'SAVE10',
      userId: 'user-1',
      product: baseProduct as any,
      subtotalCents: 10000,
    });

    expect(result.success).toBe(false);
  });

  it('rejects coupons when term duration does not match', async () => {
    const coupon = buildCouponRow({ term_months: 12 });
    const pool = buildMockPool({ coupon });
    mockGetDatabasePool.mockReturnValue(pool as any);

    const result = await couponService.validateCouponForOrder({
      couponCode: 'SAVE10',
      userId: 'user-1',
      product: baseProduct as any,
      subtotalCents: 10000,
      termMonths: 6,
    });

    expect(result.success).toBe(false);
  });
});
