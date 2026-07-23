import { normalizeCurrencyCode } from './currency';
import { FX_BASE_CURRENCY } from '../services/fx/fxConfig';

export type FixedCatalogFields = {
  duration_months?: unknown;
  fixed_price_cents?: unknown;
  fixed_price_currency?: unknown;
};

export type NormalizedFixedCatalogFields = {
  durationMonths: number | null;
  fixedPriceCents: number | null;
  fixedPriceCurrency: string | null;
};

const normalizeInteger = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
};

export const normalizeFixedCatalogFields = (
  fields: FixedCatalogFields
): NormalizedFixedCatalogFields => ({
  durationMonths: normalizeInteger(fields.duration_months),
  fixedPriceCents: normalizeInteger(fields.fixed_price_cents),
  fixedPriceCurrency: normalizeCurrencyCode(
    typeof fields.fixed_price_currency === 'string'
      ? fields.fixed_price_currency
      : null
  ),
});

export const validateFixedCatalogDraft = (
  fields: FixedCatalogFields
): { valid: boolean; message?: string } => {
  const normalized = normalizeFixedCatalogFields(fields);
  if (
    fields.duration_months !== null &&
    fields.duration_months !== undefined &&
    (normalized.durationMonths === null || normalized.durationMonths <= 0)
  ) {
    return {
      valid: false,
      message: 'Duration must be a positive whole number of months.',
    };
  }

  if (
    fields.fixed_price_cents !== null &&
    fields.fixed_price_cents !== undefined &&
    (normalized.fixedPriceCents === null || normalized.fixedPriceCents <= 0)
  ) {
    return {
      valid: false,
      message: 'Fixed price must be a positive whole number of cents.',
    };
  }

  const hasPrice =
    fields.fixed_price_cents !== null && fields.fixed_price_cents !== undefined;
  const hasCurrency =
    typeof fields.fixed_price_currency === 'string' &&
    fields.fixed_price_currency.trim().length > 0;
  if (hasPrice !== hasCurrency) {
    return {
      valid: false,
      message: 'Fixed price and fixed price currency must be set together.',
    };
  }
  if (hasCurrency && !normalized.fixedPriceCurrency) {
    return { valid: false, message: 'Fixed price currency is not supported.' };
  }
  if (hasCurrency && normalized.fixedPriceCurrency !== FX_BASE_CURRENCY) {
    return {
      valid: false,
      message: `Fixed price currency must be ${FX_BASE_CURRENCY}; regional display currencies are derived by the FX publisher.`,
    };
  }

  return { valid: true };
};

export const validatePublishableFixedCatalog = (
  fields: FixedCatalogFields
): { valid: boolean; message?: string } => {
  const draftValidation = validateFixedCatalogDraft(fields);
  if (!draftValidation.valid) return draftValidation;

  const normalized = normalizeFixedCatalogFields(fields);
  const missing: string[] = [];
  if (!normalized.durationMonths || normalized.durationMonths <= 0) {
    missing.push('duration');
  }
  if (!normalized.fixedPriceCents || normalized.fixedPriceCents <= 0) {
    missing.push('fixed price');
  }
  if (!normalized.fixedPriceCurrency) {
    missing.push('fixed price currency');
  }

  if (missing.length > 0) {
    return {
      valid: false,
      message: `Cannot publish product: complete Fixed Catalog Fields first (${missing.join(', ')}). A variant is not required.`,
    };
  }

  return { valid: true };
};

export const isPublishableFixedCatalog = (
  fields: FixedCatalogFields
): boolean => validatePublishableFixedCatalog(fields).valid;

export const validateFixedComparisonPrice = (
  fixedPriceCents: unknown,
  comparisonPriceCents: unknown
): { valid: boolean; message?: string } => {
  if (
    comparisonPriceCents === null ||
    comparisonPriceCents === undefined ||
    comparisonPriceCents === ''
  ) {
    return { valid: true };
  }
  const fixedPrice = Number(fixedPriceCents);
  const comparisonPrice = Number(comparisonPriceCents);
  if (
    !Number.isInteger(comparisonPrice) ||
    comparisonPrice <= 0 ||
    !Number.isInteger(fixedPrice) ||
    comparisonPrice <= fixedPrice
  ) {
    return {
      valid: false,
      message:
        'Comparison price must be a whole number of cents greater than the fixed price.',
    };
  }
  return { valid: true };
};
