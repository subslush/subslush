export type CouponApplyScope = 'highest_eligible_item' | 'order_total';

export type CouponAllocationItem = {
  totalCents: number;
  eligible: boolean;
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

const normalizeScope = (value?: CouponApplyScope | null): CouponApplyScope =>
  value === 'order_total' ? 'order_total' : 'highest_eligible_item';

export const computeCouponAllocation = (params: {
  applyScope?: CouponApplyScope | null;
  percentOff: number;
  items: CouponAllocationItem[];
}): {
  itemDiscounts: number[];
  totalDiscountCents: number;
  eligibleTotalCents: number;
} => {
  const scope = normalizeScope(params.applyScope);
  const percentOff = clampPercent(params.percentOff);
  const itemDiscounts = params.items.map(() => 0);

  const eligibleItems = params.items
    .map((item, index) =>
      item.eligible && item.totalCents > 0 ? { index, item } : null
    )
    .filter(
      (value): value is { index: number; item: CouponAllocationItem } =>
        value !== null
    );

  const eligibleTotalCents = eligibleItems.reduce(
    (sum, entry) => sum + Math.max(0, Math.round(entry.item.totalCents)),
    0
  );

  if (
    eligibleItems.length === 0 ||
    eligibleTotalCents <= 0 ||
    percentOff <= 0
  ) {
    return { itemDiscounts, totalDiscountCents: 0, eligibleTotalCents };
  }

  if (scope === 'highest_eligible_item') {
    const first = eligibleItems[0];
    if (!first) {
      return { itemDiscounts, totalDiscountCents: 0, eligibleTotalCents };
    }

    let selectedIndex = first.index;
    let highestTotal = first.item.totalCents;
    for (const entry of eligibleItems.slice(1)) {
      const total = entry.item.totalCents;
      if (total > highestTotal) {
        highestTotal = total;
        selectedIndex = entry.index;
      }
    }

    const discountCents = computePercentDiscount(highestTotal, percentOff);
    itemDiscounts[selectedIndex] = Math.min(
      discountCents,
      Math.max(0, Math.round(highestTotal))
    );
    const selectedDiscount = itemDiscounts[selectedIndex] ?? 0;
    return {
      itemDiscounts,
      totalDiscountCents: selectedDiscount,
      eligibleTotalCents,
    };
  }

  const totalDiscountCents = Math.min(
    computePercentDiscount(eligibleTotalCents, percentOff),
    eligibleTotalCents
  );

  const allocations = eligibleItems.map(entry => {
    const total = Math.max(0, Math.round(entry.item.totalCents));
    const exact = (totalDiscountCents * total) / eligibleTotalCents;
    const base = Math.floor(exact);
    return {
      index: entry.index,
      base,
      remainder: exact - base,
    };
  });

  let distributed = allocations.reduce((sum, entry) => sum + entry.base, 0);
  let remaining = totalDiscountCents - distributed;

  allocations
    .sort((a, b) => {
      if (b.remainder !== a.remainder) {
        return b.remainder - a.remainder;
      }
      return a.index - b.index;
    })
    .forEach(entry => {
      if (remaining <= 0) return;
      entry.base += 1;
      remaining -= 1;
    });

  for (const entry of allocations) {
    const target = params.items[entry.index];
    if (!target) {
      continue;
    }
    itemDiscounts[entry.index] = Math.min(
      entry.base,
      Math.max(0, Math.round(target.totalCents))
    );
  }

  distributed = itemDiscounts.reduce((sum, value) => sum + value, 0);
  return {
    itemDiscounts,
    totalDiscountCents: distributed,
    eligibleTotalCents,
  };
};
