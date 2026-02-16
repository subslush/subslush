import { describe, it, expect } from '@jest/globals';
import { computeCouponAllocation } from '../utils/couponAllocation';

describe('computeCouponAllocation', () => {
  it('allocates order_total discounts proportionally', () => {
    const result = computeCouponAllocation({
      applyScope: 'order_total',
      percentOff: 10,
      items: [
        { totalCents: 1000, eligible: true },
        { totalCents: 500, eligible: true },
      ],
    });

    expect(result.totalDiscountCents).toBe(150);
    expect(result.itemDiscounts).toEqual([100, 50]);
  });

  it('allocates highest eligible item only', () => {
    const result = computeCouponAllocation({
      applyScope: 'highest_eligible_item',
      percentOff: 10,
      items: [
        { totalCents: 300, eligible: true },
        { totalCents: 500, eligible: true },
        { totalCents: 400, eligible: true },
      ],
    });

    expect(result.totalDiscountCents).toBe(50);
    expect(result.itemDiscounts).toEqual([0, 50, 0]);
  });

  it('skips ineligible items when allocating', () => {
    const result = computeCouponAllocation({
      applyScope: 'order_total',
      percentOff: 10,
      items: [
        { totalCents: 1000, eligible: true },
        { totalCents: 1000, eligible: false },
      ],
    });

    expect(result.totalDiscountCents).toBe(100);
    expect(result.itemDiscounts).toEqual([100, 0]);
  });

  it('distributes rounding remainder deterministically', () => {
    const result = computeCouponAllocation({
      applyScope: 'order_total',
      percentOff: 10,
      items: [
        { totalCents: 333, eligible: true },
        { totalCents: 333, eligible: true },
        { totalCents: 334, eligible: true },
      ],
    });

    expect(result.totalDiscountCents).toBe(100);
    expect(result.itemDiscounts).toEqual([33, 33, 34]);
  });
});
