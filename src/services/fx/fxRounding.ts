export type FxRoundingProfile = 'standard_2dp';

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function roundToTwoDecimals(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function resolveRoundingProfile(_currency: string): FxRoundingProfile {
  return 'standard_2dp';
}

export function applyPsychologicalRounding(params: {
  amount: number;
  currency: string;
}): {
  roundedAmount: number;
  profile: FxRoundingProfile;
} {
  const { amount } = params;
  const profile = resolveRoundingProfile(params.currency);

  if (!isFinitePositive(amount)) {
    return {
      roundedAmount: 0,
      profile,
    };
  }

  const rounded = roundToTwoDecimals(amount);
  return {
    roundedAmount: Number(rounded.toFixed(2)),
    profile,
  };
}

export function roundedAmountToCents(params: {
  roundedAmount: number;
  profile: FxRoundingProfile;
}): number {
  void params.profile;
  return Math.max(0, Math.round(params.roundedAmount * 100));
}
