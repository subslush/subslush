import {
  getPayopMethodConfig,
  listPayopMethodCountryOptions,
  selectPayopProcessingCurrency,
} from '../services/payments/payopCatalog';

describe('Payop catalog currency selection', () => {
  it('prefers the active display currency when the method supports it', () => {
    const method = getPayopMethodConfig(700001);

    expect(method).not.toBeNull();
    expect(
      selectPayopProcessingCurrency({
        method: method!,
        displayCurrency: 'GBP',
        paymentCountry: 'SE',
      })
    ).toBe('GBP');
  });

  it('falls back to USD for United States when the display currency is unsupported', () => {
    const method = getPayopMethodConfig(700001);

    expect(method).not.toBeNull();
    expect(
      selectPayopProcessingCurrency({
        method: method!,
        displayCurrency: 'SEK',
        paymentCountry: 'US',
      })
    ).toBe('USD');
  });

  it('always offers the United States as a selectable PayDo country', () => {
    expect(listPayopMethodCountryOptions()).toContain('US');
  });

  it('falls back to CAD for Canada and GBP for United Kingdom', () => {
    const method = getPayopMethodConfig(700001);

    expect(method).not.toBeNull();
    expect(
      selectPayopProcessingCurrency({
        method: method!,
        displayCurrency: 'SEK',
        paymentCountry: 'CA',
      })
    ).toBe('CAD');
    expect(
      selectPayopProcessingCurrency({
        method: method!,
        displayCurrency: 'SEK',
        paymentCountry: 'UK',
      })
    ).toBe('GBP');
  });

  it('falls back to EUR for all other countries when the display currency is unsupported', () => {
    const method = getPayopMethodConfig(700001);

    expect(method).not.toBeNull();
    expect(
      selectPayopProcessingCurrency({
        method: method!,
        displayCurrency: 'SEK',
        paymentCountry: 'SE',
      })
    ).toBe('EUR');
  });

  it('honors live currency availability before selecting a supported fallback', () => {
    const method = getPayopMethodConfig(700001);

    expect(method).not.toBeNull();
    expect(
      selectPayopProcessingCurrency({
        method: method!,
        liveCurrencies: ['USD'],
        displayCurrency: 'GBP',
        paymentCountry: 'US',
      })
    ).toBe('USD');
  });

  it('keeps single-currency methods on their required processing currency', () => {
    const method = getPayopMethodConfig(37000000);

    expect(method).not.toBeNull();
    expect(
      selectPayopProcessingCurrency({
        method: method!,
        displayCurrency: 'GBP',
        paymentCountry: 'GB',
      })
    ).toBe('EUR');
  });
});
