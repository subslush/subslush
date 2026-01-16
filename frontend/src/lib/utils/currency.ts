import { browser } from '$app/environment';

export const SUPPORTED_CURRENCIES = ['USD', 'GBP', 'CAD', 'EUR'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

const EUROPE_COUNTRY_CODES = new Set<string>([
  'AL', 'AD', 'AM', 'AT', 'AZ', 'BY', 'BE', 'BA', 'BG', 'HR', 'CY', 'CZ',
  'DK', 'EE', 'FI', 'FR', 'GE', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'KZ',
  'XK', 'LV', 'LI', 'LT', 'LU', 'MT', 'MD', 'MC', 'ME', 'NL', 'MK', 'NO',
  'PL', 'PT', 'RO', 'RU', 'SM', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH', 'TR',
  'UA', 'VA', 'EU'
]);

export const CURRENCY_OPTIONS: Array<{ value: SupportedCurrency; label: string }> = [
  { value: 'USD', label: 'EN / USD' },
  { value: 'GBP', label: 'EN / GBP' },
  { value: 'CAD', label: 'EN / CAD' },
  { value: 'EUR', label: 'EN / EUR' }
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
  if (normalized === 'US') return 'USD';
  if (normalized === 'CA') return 'CAD';
  if (normalized === 'GB' || normalized === 'UK') return 'GBP';
  if (EUROPE_COUNTRY_CODES.has(normalized)) return 'EUR';
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
    case 'GBP':
      return 'en-GB';
    case 'CAD':
      return 'en-US';
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
