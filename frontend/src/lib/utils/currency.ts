import { browser } from '$app/environment';

export const SUPPORTED_CURRENCIES = [
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
  'THB'
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
  TH: 'THB'
};

const EURO_ZONE_COUNTRY_CODES = new Set<string>([
  'AD', 'AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE',
  'IT', 'LT', 'LU', 'LV', 'MC', 'MT', 'NL', 'PT', 'SI', 'SK', 'SM', 'VA', 'EU'
]);

export const CURRENCY_OPTIONS: Array<{ value: SupportedCurrency; label: string }> = [
  { value: 'USD', label: 'EN / USD' },
  { value: 'EUR', label: 'EN / EUR' },
  { value: 'AUD', label: 'EN / AUD' },
  { value: 'CAD', label: 'EN / CAD' },
  { value: 'CHF', label: 'EN / CHF' },
  { value: 'CNY', label: 'EN / CNY' },
  { value: 'CZK', label: 'EN / CZK' },
  { value: 'DKK', label: 'EN / DKK' },
  { value: 'GBP', label: 'EN / GBP' },
  { value: 'HKD', label: 'EN / HKD' },
  { value: 'HUF', label: 'EN / HUF' },
  { value: 'JPY', label: 'EN / JPY' },
  { value: 'MYR', label: 'EN / MYR' },
  { value: 'NOK', label: 'EN / NOK' },
  { value: 'PLN', label: 'EN / PLN' },
  { value: 'PHP', label: 'EN / PHP' },
  { value: 'RON', label: 'EN / RON' },
  { value: 'SEK', label: 'EN / SEK' },
  { value: 'SGD', label: 'EN / SGD' },
  { value: 'THB', label: 'EN / THB' }
];

export const normalizeCurrencyCode = (
  value?: string | null
): SupportedCurrency | null => {
  if (!value) return null;
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

const extractCountryFromLocale = (locale?: string | null): string | null => {
  if (!locale) return null;
  const parts = locale.replace('_', '-').split('-');
  if (parts.length < 2) return null;
  return parts[1]?.toUpperCase() || null;
};

export const detectCurrencyFromLocale = (
  locale?: string | null
): SupportedCurrency | null => {
  const country = extractCountryFromLocale(locale || null);
  return resolveCurrencyForCountry(country);
};

export const resolveCurrencyFromHeaders = (
  headers: Headers
): SupportedCurrency | null => {
  const headerKeys = [
    'cf-ipcountry',
    'x-vercel-ip-country',
    'x-country-code',
    'x-geo-country',
    'cloudfront-viewer-country',
    'fastly-client-country',
    'x-appengine-country'
  ];

  for (const key of headerKeys) {
    const value = headers.get(key);
    if (value) {
      const resolved = resolveCurrencyForCountry(value);
      if (resolved) return resolved;
    }
  }

  return null;
};

export const getCurrencyCookie = (
  cookieString?: string | null
): SupportedCurrency | null => {
  if (!cookieString) return null;
  const match = cookieString.match(/(?:^|; )preferred_currency=([^;]+)/);
  return match ? normalizeCurrencyCode(decodeURIComponent(match[1])) : null;
};

export const setCurrencyCookie = (
  currency: SupportedCurrency,
  options?: { days?: number }
): void => {
  if (!browser) return;
  const days = options?.days ?? 365;
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `preferred_currency=${encodeURIComponent(currency)}; expires=${expires}; path=/; samesite=lax`;
};

export const resolvePreferredCurrency = (params: {
  serverCurrency?: string | null;
  cookieCurrency?: string | null;
  localeCurrency?: string | null;
  headerCurrency?: string | null;
  fallback?: SupportedCurrency;
}): SupportedCurrency => {
  const serverValue = normalizeCurrencyCode(params.serverCurrency || null);
  if (serverValue) return serverValue;

  const cookieValue = normalizeCurrencyCode(params.cookieCurrency || null);
  if (cookieValue) return cookieValue;

  const headerValue = normalizeCurrencyCode(params.headerCurrency || null);
  if (headerValue) return headerValue;

  const localeValue = normalizeCurrencyCode(params.localeCurrency || null);
  if (localeValue) return localeValue;

  return params.fallback || 'USD';
};

export const resolveCurrencyLocale = (currency: SupportedCurrency): string => {
  switch (currency) {
    case 'AUD':
      return 'en-AU';
    case 'CHF':
      return 'de-CH';
    case 'CNY':
      return 'zh-CN';
    case 'CZK':
      return 'cs-CZ';
    case 'DKK':
      return 'da-DK';
    case 'GBP':
      return 'en-GB';
    case 'HKD':
      return 'zh-HK';
    case 'HUF':
      return 'hu-HU';
    case 'JPY':
      return 'ja-JP';
    case 'MYR':
      return 'ms-MY';
    case 'NOK':
      return 'nb-NO';
    case 'PLN':
      return 'pl-PL';
    case 'PHP':
      return 'en-PH';
    case 'RON':
      return 'ro-RO';
    case 'SEK':
      return 'sv-SE';
    case 'SGD':
      return 'en-SG';
    case 'THB':
      return 'th-TH';
    case 'CAD':
      return 'en-CA';
    case 'EUR':
      return 'en-IE';
    case 'USD':
    default:
      return 'en-US';
  }
};

export const formatCurrency = (
  amount: number,
  currency: SupportedCurrency,
  options?: Intl.NumberFormatOptions
): string => {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const locale = resolveCurrencyLocale(currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    ...options
  }).format(safeAmount);
};
