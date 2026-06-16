import { getDatabasePool } from '../../config/database';
import { env } from '../../config/environment';
import type { OrderWithItems } from '../../types/order';
import { normalizeCurrencyCode } from '../../utils/currency';

export type AntomPaymentOptionId = 'cards' | 'apple_pay' | 'google_pay';
export type AntomPaymentMethodType = 'CARD' | 'APPLEPAY' | 'GOOGLEPAY';

export type AntomResidence = {
  id: string;
  label: string;
  rateBps: number;
};

export type AntomPaymentOptionConfig = {
  id: AntomPaymentOptionId;
  title: string;
  description: string;
  methodTypes: AntomPaymentMethodType[];
  brandNames: string[];
};

export type AntomCheckoutBreakdown = {
  currency: string;
  subtotalCents: number;
  serviceFeeCents: number;
  serviceFeePercentBps: number;
  serviceFeeFixedCents: number;
  serviceFeeFixedUsdCents: number;
  serviceFeeFxRate: number | null;
  taxResidenceId: string;
  taxResidenceLabel: string;
  taxRateBps: number;
  taxBaseCents: number;
  taxCents: number;
  totalCents: number;
};

export type AntomQuoteItem = {
  orderItemId: string;
  label: string;
  logoKey: string | null;
  totalCents: number;
};

export type AntomCheckoutOptionQuote = AntomPaymentOptionConfig &
  AntomCheckoutBreakdown & {
    items: AntomQuoteItem[];
  };

const EU_VAT_RESIDENCES: readonly AntomResidence[] = [
  { id: 'AT', label: 'Austria', rateBps: 2000 },
  { id: 'BE', label: 'Belgium', rateBps: 2100 },
  { id: 'BG', label: 'Bulgaria', rateBps: 2000 },
  { id: 'HR', label: 'Croatia', rateBps: 2500 },
  { id: 'CY', label: 'Cyprus', rateBps: 1900 },
  { id: 'CZ', label: 'Czechia', rateBps: 2100 },
  { id: 'DK', label: 'Denmark', rateBps: 2500 },
  { id: 'EE', label: 'Estonia', rateBps: 2400 },
  { id: 'FI', label: 'Finland', rateBps: 2550 },
  { id: 'FR', label: 'France', rateBps: 2000 },
  { id: 'DE', label: 'Germany', rateBps: 1900 },
  { id: 'GR', label: 'Greece', rateBps: 2400 },
  { id: 'HU', label: 'Hungary', rateBps: 2700 },
  { id: 'IE', label: 'Ireland', rateBps: 2300 },
  { id: 'IT', label: 'Italy', rateBps: 2200 },
  { id: 'LV', label: 'Latvia', rateBps: 2100 },
  { id: 'LT', label: 'Lithuania', rateBps: 2100 },
  { id: 'LU', label: 'Luxembourg', rateBps: 1700 },
  { id: 'MT', label: 'Malta', rateBps: 1800 },
  { id: 'NL', label: 'Netherlands', rateBps: 2100 },
  { id: 'PL', label: 'Poland', rateBps: 2300 },
  { id: 'PT', label: 'Portugal', rateBps: 2300 },
  { id: 'RO', label: 'Romania', rateBps: 1900 },
  { id: 'SK', label: 'Slovakia', rateBps: 2300 },
  { id: 'SI', label: 'Slovenia', rateBps: 2200 },
  { id: 'ES', label: 'Spain', rateBps: 2100 },
  { id: 'SE', label: 'Sweden', rateBps: 2500 },
];

export const ANTOM_RESIDENCES: readonly AntomResidence[] = [
  { id: 'outside_eu', label: 'Outside the EU', rateBps: 0 },
  ...EU_VAT_RESIDENCES,
  { id: 'GB', label: 'United Kingdom', rateBps: 2000 },
];

export const ANTOM_PAYMENT_OPTIONS: readonly AntomPaymentOptionConfig[] = [
  {
    id: 'cards',
    title: 'Card',
    description:
      'Visa, Mastercard, American Express, Discover, Diners, UnionPay, JCB',
    methodTypes: ['CARD'],
    brandNames: [
      'Visa',
      'Mastercard',
      'American Express',
      'Discover',
      'Diners Club',
      'UnionPay',
      'JCB',
    ],
  },
  {
    id: 'apple_pay',
    title: 'Apple Pay',
    description: 'Pay with cards saved in Apple Wallet',
    methodTypes: ['APPLEPAY'],
    brandNames: ['Apple Pay'],
  },
  {
    id: 'google_pay',
    title: 'Google Pay',
    description: 'Pay with cards saved in Google Pay',
    methodTypes: ['GOOGLEPAY'],
    brandNames: ['Google Pay'],
  },
];

const parseNonNegativeInt = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
};

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const resolveItemMetadata = (
  item: OrderWithItems['items'][number]
): Record<string, unknown> =>
  item.metadata && typeof item.metadata === 'object'
    ? (item.metadata as Record<string, unknown>)
    : {};

const resolveItemLabel = (item: OrderWithItems['items'][number]): string => {
  const metadata = resolveItemMetadata(item);
  return (
    normalizeString(item.product_name) ||
    normalizeString(item.variant_name) ||
    normalizeString(metadata['product_name']) ||
    normalizeString(metadata['service_plan']) ||
    normalizeString(item.description) ||
    'Subscription'
  );
};

const resolveItemLogoKey = (
  item: OrderWithItems['items'][number]
): string | null => {
  const metadata = resolveItemMetadata(item);
  return (
    normalizeString(item.product_logo_key) ||
    normalizeString(metadata['product_logo_key']) ||
    normalizeString(metadata['logo_key']) ||
    normalizeString(metadata['logoKey']) ||
    normalizeString(metadata['service_type']) ||
    normalizeString(item.product_name) ||
    null
  );
};

const resolveAntomQuoteItems = (order: OrderWithItems): AntomQuoteItem[] =>
  order.items.map(item => ({
    orderItemId: item.id,
    label: resolveItemLabel(item),
    logoKey: resolveItemLogoKey(item),
    totalCents: parseNonNegativeInt(item.total_price_cents) ?? 0,
  }));

const normalizeResidenceId = (value?: string | null): string => {
  if (typeof value !== 'string') return 'outside_eu';
  const normalized = value.trim();
  if (!normalized) return 'outside_eu';
  if (normalized.toLowerCase() === 'uk') return 'GB';
  if (normalized.toLowerCase() === 'outside_eu') return 'outside_eu';
  return normalized.toUpperCase();
};

export const findAntomResidence = (value?: string | null): AntomResidence => {
  const normalized = normalizeResidenceId(value);
  const fallback = ANTOM_RESIDENCES[0];
  if (!fallback) {
    throw new Error('Antom tax residences are not configured');
  }
  return (
    ANTOM_RESIDENCES.find(residence => residence.id === normalized) ?? fallback
  );
};

export const findAntomPaymentOption = (
  value?: string | null
): AntomPaymentOptionConfig | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return ANTOM_PAYMENT_OPTIONS.find(option => option.id === normalized) ?? null;
};

const resolveOrderCurrency = (order: OrderWithItems): string => {
  const metadata =
    order.metadata && typeof order.metadata === 'object' ? order.metadata : {};
  const currency =
    normalizeCurrencyCode(metadata['display_currency'] as string | undefined) ||
    normalizeCurrencyCode(order.display_currency) ||
    normalizeCurrencyCode(order.currency) ||
    normalizeCurrencyCode(order.items.find(item => item.currency)?.currency) ||
    'USD';
  return currency;
};

export const resolveAntomOrderSubtotalCents = (
  order: OrderWithItems
): number | null => {
  const metadata =
    order.metadata && typeof order.metadata === 'object' ? order.metadata : {};
  const total =
    parseNonNegativeInt(metadata['display_total_cents']) ??
    parseNonNegativeInt(order.display_total_cents) ??
    parseNonNegativeInt(order.total_cents);
  if (total !== null && total > 0) {
    return total;
  }

  const itemTotal = order.items.reduce(
    (sum, item) => sum + (parseNonNegativeInt(item.total_price_cents) ?? 0),
    0
  );
  return itemTotal > 0 ? itemTotal : null;
};

const getUsdToCurrencyRate = async (
  currency: string
): Promise<number | null> => {
  const normalized = normalizeCurrencyCode(currency);
  if (!normalized) return null;
  if (normalized === 'USD') return 1;

  const result = await getDatabasePool().query(
    `SELECT rate
     FROM fx_rate_cache
     WHERE base_currency = 'USD'
       AND quote_currency = $1
     ORDER BY is_lkg ASC, fetched_at DESC
     LIMIT 1`,
    [normalized]
  );

  const rawRate = result.rows[0]?.rate;
  const parsed = rawRate !== undefined ? Number(rawRate) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const calculateAntomCheckoutBreakdown = async (params: {
  order: OrderWithItems;
  residenceId?: string | null;
}): Promise<AntomCheckoutBreakdown | null> => {
  const currency = resolveOrderCurrency(params.order);
  const subtotalCents = resolveAntomOrderSubtotalCents(params.order);
  if (subtotalCents === null || subtotalCents <= 0) {
    return null;
  }

  const residence = findAntomResidence(params.residenceId);
  const fxRate = await getUsdToCurrencyRate(currency);
  const fixedFeeCents =
    fxRate === null
      ? env.ANTOM_SERVICE_FEE_FIXED_USD_CENTS
      : Math.round(env.ANTOM_SERVICE_FEE_FIXED_USD_CENTS * fxRate);
  const variableFeeCents = Math.round(
    (subtotalCents * env.ANTOM_SERVICE_FEE_BPS) / 10000
  );
  const serviceFeeCents = Math.max(0, variableFeeCents + fixedFeeCents);
  const taxBaseCents =
    subtotalCents + (env.ANTOM_TAX_INCLUDES_SERVICE_FEE ? serviceFeeCents : 0);
  const taxCents = Math.round((taxBaseCents * residence.rateBps) / 10000);

  return {
    currency,
    subtotalCents,
    serviceFeeCents,
    serviceFeePercentBps: env.ANTOM_SERVICE_FEE_BPS,
    serviceFeeFixedCents: fixedFeeCents,
    serviceFeeFixedUsdCents: env.ANTOM_SERVICE_FEE_FIXED_USD_CENTS,
    serviceFeeFxRate: fxRate,
    taxResidenceId: residence.id,
    taxResidenceLabel: residence.label,
    taxRateBps: residence.rateBps,
    taxBaseCents,
    taxCents,
    totalCents: subtotalCents + serviceFeeCents + taxCents,
  };
};

export const buildAntomCheckoutOptionQuotes = async (params: {
  order: OrderWithItems;
  residenceId?: string | null;
}): Promise<AntomCheckoutOptionQuote[] | null> => {
  const breakdown = await calculateAntomCheckoutBreakdown(params);
  if (!breakdown) {
    return null;
  }
  const items = resolveAntomQuoteItems(params.order);

  return ANTOM_PAYMENT_OPTIONS.map(option => ({
    ...option,
    ...breakdown,
    items,
  }));
};
