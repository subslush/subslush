const SUPPORTED_CURRENCIES = [
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

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

const COUNTRY_CURRENCY_OVERRIDES: Record<string, SupportedCurrency> = {
  US: 'USD',
  AU: 'AUD',
  CA: 'CAD',
  CH: 'CHF',
  CN: 'CNY',
  CZ: 'CZK',
  DK: 'DKK',
  GB: 'GBP',
  UK: 'GBP',
  HK: 'HKD',
  HU: 'HUF',
  JP: 'JPY',
  MY: 'MYR',
  NO: 'NOK',
  PL: 'PLN',
  PH: 'PHP',
  RO: 'RON',
  SE: 'SEK',
  SG: 'SGD',
  TH: 'THB',
};

const EURO_ZONE_COUNTRY_CODES = new Set<string>([
  'AD',
  'AT',
  'BE',
  'CY',
  'DE',
  'EE',
  'ES',
  'FI',
  'FR',
  'GR',
  'HR',
  'IE',
  'IT',
  'LT',
  'LU',
  'LV',
  'MC',
  'MT',
  'NL',
  'PT',
  'SI',
  'SK',
  'SM',
  'VA',
  'EU',
]);

const normalizeHeaderValue = (
  value: string | string[] | undefined
): string | null => {
  if (!value) return null;
  if (Array.isArray(value)) {
    return (
      value.find(item => typeof item === 'string' && item.trim().length > 0) ||
      null
    );
  }
  return value.trim() || null;
};

export const normalizeCurrencyCode = (
  value?: string | null
): SupportedCurrency | null => {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(normalized)
    ? (normalized as SupportedCurrency)
    : null;
};

export const resolveCurrencyForCountry = (
  countryCode?: string | null
): SupportedCurrency | null => {
  if (!countryCode) return null;
  const normalized = countryCode.trim().toUpperCase();
  if (COUNTRY_CURRENCY_OVERRIDES[normalized]) {
    return COUNTRY_CURRENCY_OVERRIDES[normalized];
  }
  if (EURO_ZONE_COUNTRY_CODES.has(normalized)) return 'EUR';
  return null;
};

export const resolveCountryFromHeaders = (
  headers: Record<string, string | string[] | undefined>
): string | null => {
  const candidates = [
    'cf-ipcountry',
    'x-vercel-ip-country',
    'x-country-code',
    'x-geo-country',
    'cloudfront-viewer-country',
    'fastly-client-country',
    'x-appengine-country',
  ];

  for (const key of candidates) {
    const value = normalizeHeaderValue(headers[key]);
    if (value) return value;
  }

  return null;
};

export const resolveCurrencyFromHeaders = (
  headers: Record<string, string | string[] | undefined>
): SupportedCurrency | null => {
  const countryCode = resolveCountryFromHeaders(headers);
  return resolveCurrencyForCountry(countryCode);
};

export const resolvePreferredCurrency = (options: {
  queryCurrency?: string | null;
  headerCurrency?: string | null;
  cookieCurrency?: string | null;
  headerCountry?: string | null;
  fallback?: SupportedCurrency;
}): SupportedCurrency => {
  const fromQuery = normalizeCurrencyCode(options.queryCurrency);
  if (fromQuery) return fromQuery;

  const fromHeader = normalizeCurrencyCode(options.headerCurrency);
  if (fromHeader) return fromHeader;

  const fromCookie = normalizeCurrencyCode(options.cookieCurrency);
  if (fromCookie) return fromCookie;

  const fromCountry = resolveCurrencyForCountry(options.headerCountry || null);
  if (fromCountry) return fromCountry;

  return options.fallback || 'USD';
};

export const getSupportedCurrencies = (): SupportedCurrency[] => [
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
];
