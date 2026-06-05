import { normalizeCurrencyCode } from '../../utils/currency';

export type PayopMethodType = 'ewallet' | 'bank_transfer';

export type PayopFeeSchedule = {
  fixedEurCents: number;
  percentBasisPoints: number;
};

export type PayopConfiguredMethod = {
  identifier: number;
  title: string;
  type: PayopMethodType;
  supportsInternational: boolean;
  supportedCountries: readonly string[];
  processingCurrencies: readonly string[];
  fee: PayopFeeSchedule;
  sortOrder: number;
};

const normalizeCountryCode = (value?: string | null): string | null => {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return null;
  }
  return normalized === 'UK' ? 'GB' : normalized;
};

const normalizeCurrency = (value?: string | null): string | null => {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const normalized = normalizeCurrencyCode(value);
  if (normalized) {
    return normalized;
  }
  const fallback = value.trim().toUpperCase();
  return fallback.length > 0 ? fallback : null;
};

const resolvePayopFallbackCurrencyForCountry = (
  countryCode?: string | null
): string => {
  const normalizedCountry = normalizeCountryCode(countryCode);
  if (normalizedCountry === 'US') {
    return 'USD';
  }
  if (normalizedCountry === 'CA') {
    return 'CAD';
  }
  if (normalizedCountry === 'GB') {
    return 'GBP';
  }
  return 'EUR';
};

const countryList = (countries: readonly string[]): string[] =>
  countries
    .map(country => normalizeCountryCode(country))
    .filter((country): country is string => country !== null);

export const PAYOP_METHODS: readonly PayopConfiguredMethod[] = [
  {
    identifier: 700001,
    title: 'PayDo',
    type: 'ewallet',
    supportsInternational: true,
    supportedCountries: [],
    processingCurrencies: ['EUR', 'AUD', 'CAD', 'GBP', 'USD', 'DKK'],
    fee: {
      fixedEurCents: 30,
      percentBasisPoints: 400,
    },
    sortOrder: 10,
  },
  {
    identifier: 200002,
    title: 'PayDo (EPS)',
    type: 'bank_transfer',
    supportsInternational: false,
    supportedCountries: ['AT'],
    processingCurrencies: ['EUR'],
    fee: {
      fixedEurCents: 60,
      percentBasisPoints: 290,
    },
    sortOrder: 20,
  },
  {
    identifier: 30000018,
    title: 'Bank transfer',
    type: 'bank_transfer',
    supportsInternational: false,
    supportedCountries: [
      'AT',
      'BE',
      'EE',
      'FI',
      'FR',
      'DE',
      'IE',
      'IT',
      'LV',
      'LT',
      'NL',
      'PL',
      'PT',
      'ES',
      'GB',
    ],
    processingCurrencies: ['EUR'],
    fee: {
      fixedEurCents: 30,
      percentBasisPoints: 240,
    },
    sortOrder: 30,
  },
  {
    identifier: 30001000,
    title: 'Bank transfer (UK)',
    type: 'bank_transfer',
    supportsInternational: false,
    supportedCountries: ['GB'],
    processingCurrencies: ['GBP'],
    fee: {
      fixedEurCents: 30,
      percentBasisPoints: 240,
    },
    sortOrder: 40,
  },
  {
    identifier: 37000000,
    title: 'Revolut',
    type: 'bank_transfer',
    supportsInternational: false,
    supportedCountries: [
      'AT',
      'BE',
      'BG',
      'HR',
      'CY',
      'CZ',
      'DK',
      'EE',
      'FI',
      'FR',
      'DE',
      'GR',
      'HU',
      'IS',
      'IE',
      'IT',
      'LV',
      'LT',
      'LU',
      'MT',
      'NL',
      'NO',
      'PL',
      'PT',
      'RO',
      'SK',
      'SI',
      'ES',
      'SE',
      'GB',
    ],
    processingCurrencies: ['EUR'],
    fee: {
      fixedEurCents: 30,
      percentBasisPoints: 240,
    },
    sortOrder: 50,
  },
  {
    identifier: 38000000,
    title: 'Monzo',
    type: 'bank_transfer',
    supportsInternational: false,
    supportedCountries: ['GB'],
    processingCurrencies: ['GBP'],
    fee: {
      fixedEurCents: 30,
      percentBasisPoints: 240,
    },
    sortOrder: 60,
  },
  {
    identifier: 210013,
    title: 'PayDo (Interac)',
    type: 'ewallet',
    supportsInternational: false,
    supportedCountries: ['CA'],
    processingCurrencies: ['CAD'],
    fee: {
      fixedEurCents: 45,
      percentBasisPoints: 470,
    },
    sortOrder: 70,
  },
] as const;

const PAYOP_METHOD_MAP = new Map<number, PayopConfiguredMethod>(
  PAYOP_METHODS.map(method => [
    method.identifier,
    {
      ...method,
      supportedCountries: countryList(method.supportedCountries),
      processingCurrencies: method.processingCurrencies
        .map(currency => normalizeCurrency(currency))
        .filter((currency): currency is string => currency !== null),
    },
  ])
);

export const normalizePayopMethodId = (
  value: string | number | null | undefined
): number | null => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = Number.parseInt(value.trim(), 10);
    if (Number.isInteger(normalized) && normalized > 0) {
      return normalized;
    }
  }
  return null;
};

export const getPayopMethodConfig = (
  value: string | number | null | undefined
): PayopConfiguredMethod | null => {
  const identifier = normalizePayopMethodId(value);
  if (identifier === null) {
    return null;
  }
  return PAYOP_METHOD_MAP.get(identifier) ?? null;
};

export const listPayopMethodCountryOptions = (): string[] => {
  const countries = new Set<string>();
  for (const method of PAYOP_METHODS) {
    for (const country of method.supportedCountries) {
      const normalized = normalizeCountryCode(country);
      if (normalized) {
        countries.add(normalized);
      }
    }
  }
  return Array.from(countries).sort((left, right) => left.localeCompare(right));
};

export const isPayopCountryEligible = (
  method: PayopConfiguredMethod,
  countryCode?: string | null
): boolean => {
  const normalizedCountry = normalizeCountryCode(countryCode);
  if (method.supportsInternational) {
    return true;
  }
  if (!normalizedCountry) {
    return false;
  }
  return method.supportedCountries.includes(normalizedCountry);
};

export const selectPayopProcessingCurrency = (params: {
  method: Pick<PayopConfiguredMethod, 'processingCurrencies'>;
  liveCurrencies?: readonly string[] | null;
  displayCurrency?: string | null;
  paymentCountry?: string | null;
}): string | null => {
  const methodCurrencySet = new Set(
    params.method.processingCurrencies
      .map(currency => normalizeCurrency(currency))
      .filter((currency): currency is string => currency !== null)
  );
  if (methodCurrencySet.size === 0) {
    return null;
  }

  const candidateOrder: string[] = [];
  const displayCurrency = normalizeCurrency(params.displayCurrency);
  if (displayCurrency) {
    candidateOrder.push(displayCurrency);
  }

  candidateOrder.push(
    resolvePayopFallbackCurrencyForCountry(params.paymentCountry ?? null)
  );

  const liveCurrencySet =
    params.liveCurrencies && params.liveCurrencies.length > 0
      ? new Set(
          params.liveCurrencies
            .map(currency => normalizeCurrency(currency))
            .filter((currency): currency is string => currency !== null)
        )
      : null;

  const supportsCandidate = (candidate: string): boolean =>
    methodCurrencySet.has(candidate) &&
    (liveCurrencySet === null || liveCurrencySet.has(candidate));

  for (const candidate of candidateOrder) {
    if (supportsCandidate(candidate)) {
      return candidate;
    }
  }

  for (const currency of params.method.processingCurrencies) {
    const normalized = normalizeCurrency(currency);
    if (normalized && supportsCandidate(normalized)) {
      return normalized;
    }
  }

  if (liveCurrencySet) {
    for (const currency of liveCurrencySet) {
      if (methodCurrencySet.has(currency)) {
        return currency;
      }
    }
  }

  return Array.from(methodCurrencySet)[0] ?? null;
};
