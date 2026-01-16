const SUPPORTED_CURRENCIES = ['USD', 'GBP', 'CAD', 'EUR'] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

const EUROPE_COUNTRY_CODES = new Set<string>([
  'AL',
  'AD',
  'AM',
  'AT',
  'AZ',
  'BY',
  'BE',
  'BA',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'GE',
  'DE',
  'GR',
  'HU',
  'IS',
  'IE',
  'IT',
  'KZ',
  'XK',
  'LV',
  'LI',
  'LT',
  'LU',
  'MT',
  'MD',
  'MC',
  'ME',
  'NL',
  'MK',
  'NO',
  'PL',
  'PT',
  'RO',
  'RU',
  'SM',
  'RS',
  'SK',
  'SI',
  'ES',
  'SE',
  'CH',
  'TR',
  'UA',
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
  if (normalized === 'US') return 'USD';
  if (normalized === 'CA') return 'CAD';
  if (normalized === 'GB' || normalized === 'UK') return 'GBP';
  if (EUROPE_COUNTRY_CODES.has(normalized)) return 'EUR';
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
  'GBP',
  'CAD',
  'EUR',
];
