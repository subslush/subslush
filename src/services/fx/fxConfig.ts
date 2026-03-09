export const FX_BASE_CURRENCY = 'USD' as const;

export const FX_DISPLAY_CURRENCIES = [
  'USD',
  'EUR',
  'AUD',
  'CAD',
  'CHF',
  'CNY',
  'CZK',
  'DKK',
  'GBP',
  'HKD',
  'HUF',
  'JPY',
  'MYR',
  'NOK',
  'PLN',
  'PHP',
  'RON',
  'SEK',
  'SGD',
  'THB',
] as const;

export type FxDisplayCurrency = (typeof FX_DISPLAY_CURRENCIES)[number];

export const FX_INTEGER_PROFILE_CURRENCIES = new Set<string>([
  'SEK',
  'JPY',
  'HUF',
  'CNY',
  'CZK',
  'DKK',
  'HKD',
  'MYR',
  'NOK',
  'PLN',
  'RON',
  'THB',
]);

export const FX_USD_SETTLEMENT_BUCKET = new Set<string>([
  'AUD',
  'CNY',
  'HKD',
  'JPY',
  'MYR',
  'PHP',
  'SGD',
]);

export const FX_EUR_SETTLEMENT_BUCKET = new Set<string>(['SEK']);

export const FX_ROUNDING_RULE_VERSION_DEFAULT = '2026-02-v1';
