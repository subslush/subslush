import {
  isSupportedDisplayCurrency,
  resolveSettlementCurrency,
} from '../services/fx/fxSettlement';

describe('FX settlement mapping', () => {
  it('maps SEK display currency into EUR settlement bucket', () => {
    expect(resolveSettlementCurrency('SEK')).toBe('EUR');
  });

  it('maps USD settlement bucket currencies correctly', () => {
    for (const currency of ['AUD', 'CNY', 'HKD', 'JPY', 'MYR', 'PHP', 'SGD']) {
      expect(resolveSettlementCurrency(currency)).toBe('USD');
    }
  });

  it('settles other supported currencies in display currency', () => {
    expect(resolveSettlementCurrency('USD')).toBe('USD');
    expect(resolveSettlementCurrency('EUR')).toBe('EUR');
    expect(resolveSettlementCurrency('GBP')).toBe('GBP');
    expect(resolveSettlementCurrency('THB')).toBe('THB');
  });

  it('falls back to USD for unsupported currency values', () => {
    expect(isSupportedDisplayCurrency('XYZ')).toBe(false);
    expect(resolveSettlementCurrency('XYZ')).toBe('USD');
  });
});
