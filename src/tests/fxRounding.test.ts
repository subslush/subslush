import {
  applyPsychologicalRounding,
  roundedAmountToCents,
  resolveRoundingProfile,
} from '../services/fx/fxRounding';

describe('FX two-decimal rounding', () => {
  it('uses the same profile for all currencies', () => {
    expect(resolveRoundingProfile('USD')).toBe('standard_2dp');
    expect(resolveRoundingProfile('JPY')).toBe('standard_2dp');
    expect(resolveRoundingProfile('SEK')).toBe('standard_2dp');
  });

  it('rounds converted amounts to nearest cent', () => {
    const gbp = applyPsychologicalRounding({
      amount: 3.69731108,
      currency: 'GBP',
    });
    expect(gbp.roundedAmount).toBe(3.7);
    expect(roundedAmountToCents(gbp)).toBe(370);

    const usd = applyPsychologicalRounding({
      amount: 3.694,
      currency: 'USD',
    });
    expect(usd.roundedAmount).toBe(3.69);
    expect(roundedAmountToCents(usd)).toBe(369);
  });

  it('applies the same two-decimal precision to currencies previously integer-profiled', () => {
    const sek = applyPsychologicalRounding({
      amount: 41.237,
      currency: 'SEK',
    });
    expect(sek.roundedAmount).toBe(41.24);
    expect(roundedAmountToCents(sek)).toBe(4124);
  });

  it('clamps invalid amounts to zero', () => {
    const invalid = applyPsychologicalRounding({
      amount: Number.NaN,
      currency: 'EUR',
    });
    expect(invalid.roundedAmount).toBe(0);
    expect(roundedAmountToCents(invalid)).toBe(0);
  });
});
