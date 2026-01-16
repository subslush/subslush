export type TermPricingSnapshot = {
  basePriceCents: number;
  termMonths: number;
  discountPercent: number;
  totalPriceCents: number;
  discountCents: number;
};

const clampPercent = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 100) {
    return 100;
  }
  return value;
};

export const computeTermPricing = (params: {
  basePriceCents: number;
  termMonths: number;
  discountPercent?: number | null;
}): TermPricingSnapshot => {
  const basePriceCents = Math.max(0, Math.round(params.basePriceCents));
  const termMonths = Math.max(1, Math.floor(params.termMonths));
  const discountPercent = clampPercent(
    params.discountPercent !== null && params.discountPercent !== undefined
      ? Number(params.discountPercent)
      : 0
  );

  const totalBeforeDiscount = basePriceCents * termMonths;
  const discountCents = Math.round(
    totalBeforeDiscount * (discountPercent / 100)
  );
  const totalPriceCents = Math.max(0, totalBeforeDiscount - discountCents);

  return {
    basePriceCents,
    termMonths,
    discountPercent,
    totalPriceCents,
    discountCents,
  };
};

export const computeEffectiveMonthlyCents = (params: {
  totalPriceCents: number;
  termMonths: number;
}): number => {
  const termMonths = Math.max(1, Math.floor(params.termMonths));
  return Math.round(params.totalPriceCents / termMonths);
};
