import { catalogService } from './catalogService';
import { fxDisplayPricingService } from './fx/fxDisplayPricingService';
import { normalizeCurrencyCode } from '../utils/currency';
import {
  computeFixedTermPricing,
  computeTermPricing,
  type TermPricingSnapshot,
} from '../utils/termPricing';
import {
  recordLegacyVariantConflict,
  recordLegacyVariantUsage,
} from '../utils/catalogApiCompatibility';
import type {
  PriceHistory,
  Product,
  ProductVariant,
  ProductVariantTerm,
} from '../types/catalog';

export type SellableProductErrorCode =
  | 'PRODUCT_ID_REQUIRED'
  | 'PRODUCT_UNAVAILABLE'
  | 'INVALID_FIXED_CONFIGURATION'
  | 'STALE_PRICE'
  | 'UNSUPPORTED_CURRENCY'
  | 'LEGACY_IDENTIFIER_CONFLICT'
  | 'INVALID_DURATION'
  | 'PRICE_UNAVAILABLE';

export type SellableProductOffer = {
  product: Product;
  legacyVariant: ProductVariant | null;
  legacyTerm: ProductVariantTerm | null;
  price: PriceHistory;
  productId: string;
  legacyVariantId: string | null;
  durationMonths: number;
  priceCents: number;
  comparisonPriceCents: number | null;
  currency: string;
  pricingSnapshotId: string;
  snapshot: TermPricingSnapshot;
  itemCode: string;
  catalogMode: 'fixed_product' | 'legacy_variant';
  availability: 'available';
  legacyIdentifierUsed: boolean;
};

export type SellableProductResult =
  | { ok: true; data: SellableProductOffer }
  | {
      ok: false;
      code: SellableProductErrorCode;
      message: string;
      details?: Record<string, unknown>;
    };

const messages: Record<SellableProductErrorCode, string> = {
  PRODUCT_ID_REQUIRED: 'A product_id is required.',
  PRODUCT_UNAVAILABLE: 'The requested product is unavailable.',
  INVALID_FIXED_CONFIGURATION:
    'The product has an invalid fixed duration or price configuration.',
  STALE_PRICE: 'The product price changed. Refresh pricing and try again.',
  UNSUPPORTED_CURRENCY: 'The requested currency is not supported.',
  LEGACY_IDENTIFIER_CONFLICT:
    'product_id and variant_id identify different products.',
  INVALID_DURATION: 'The requested duration does not match this product.',
  PRICE_UNAVAILABLE: 'No current price is available in the requested currency.',
};

const failure = (
  code: SellableProductErrorCode,
  details?: Record<string, unknown>
): SellableProductResult => ({
  ok: false,
  code,
  message: messages[code],
  ...(details ? { details } : {}),
});

const normalizeId = (value?: string | null): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const readPositiveInteger = (value: unknown): number | null => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

const readMetadataInteger = (
  metadata: Record<string, unknown> | null | undefined,
  keys: string[]
): number | null => {
  for (const key of keys) {
    const parsed = readPositiveInteger(metadata?.[key]);
    if (parsed !== null) return parsed;
  }
  return null;
};

const readMetadataString = (
  metadata: Record<string, unknown> | null | undefined,
  keys: string[]
): string | null => {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

export async function resolveComparisonPriceCents(params: {
  metadata: Record<string, unknown> | null | undefined;
  displayCurrency: string;
}): Promise<number | null> {
  const comparisonPriceCents = readMetadataInteger(params.metadata, [
    'comparison_price_cents',
    'comparisonPriceCents',
    'compare_at_price_cents',
    'compareAtPriceCents',
  ]);
  if (comparisonPriceCents === null) return null;

  const displayCurrency = normalizeCurrencyCode(params.displayCurrency);
  const comparisonCurrency = normalizeCurrencyCode(
    readMetadataString(params.metadata, [
      'comparison_price_currency',
      'comparisonPriceCurrency',
      'compare_at_price_currency',
      'compareAtPriceCurrency',
    ]) ?? 'USD'
  );
  if (!displayCurrency || !comparisonCurrency) return null;
  if (comparisonCurrency === displayCurrency) return comparisonPriceCents;
  if (comparisonCurrency !== 'USD') return null;

  const converted =
    await fxDisplayPricingService.convertUsdCentsToDisplayCurrency({
      usdCents: comparisonPriceCents,
      currency: displayCurrency,
    });
  return converted?.priceCents ?? null;
}

const resolvePublishedPrice = async (params: {
  product: Product;
  currency: string;
  atDate?: Date;
}): Promise<PriceHistory | null> => {
  const fixedPriceCents = readPositiveInteger(params.product.fixed_price_cents);
  const fixedCurrency = normalizeCurrencyCode(
    params.product.fixed_price_currency
  );
  if (!fixedPriceCents || !fixedCurrency) return null;
  const updatedAtValue = new Date(params.product.updated_at);
  const updatedAt = Number.isNaN(updatedAtValue.getTime())
    ? 'unknown'
    : updatedAtValue.toISOString();
  const fallbackSnapshotId = [
    'fixed',
    params.product.id,
    fixedCurrency,
    fixedPriceCents,
    updatedAt,
  ].join(':');

  const published = await catalogService.getCurrentFixedProductPriceForCurrency(
    {
      productId: params.product.id,
      currency: params.currency,
      ...(params.atDate ? { atDate: params.atDate } : {}),
    }
  );
  if (published) {
    return {
      ...published,
      product_variant_id: published.product_id,
    };
  }

  const now = params.atDate ?? new Date();
  if (fixedCurrency === params.currency) {
    return {
      id: params.product.id,
      product_variant_id: params.product.id,
      price_cents: fixedPriceCents,
      currency: fixedCurrency,
      starts_at: now,
      ends_at: null,
      metadata: {
        source: 'products.fixed_price',
        catalog_mode: 'fixed_product',
        product_id: params.product.id,
        snapshot_id: fallbackSnapshotId,
      },
      created_at: now,
    };
  }
  if (fixedCurrency !== 'USD') return null;

  const converted =
    await fxDisplayPricingService.convertUsdCentsToDisplayCurrency({
      usdCents: fixedPriceCents,
      currency: params.currency,
    });
  if (!converted) return null;
  return {
    id: params.product.id,
    product_variant_id: params.product.id,
    price_cents: converted.priceCents,
    currency: converted.currency,
    starts_at: now,
    ends_at: null,
    metadata: {
      ...converted.metadata,
      source: 'products.fixed_price_fx_fallback',
      catalog_mode: 'fixed_product',
      product_id: params.product.id,
      base_currency: fixedCurrency,
      base_price_cents: fixedPriceCents,
      snapshot_id: fallbackSnapshotId,
    },
    created_at: now,
  };
};

const snapshotIdFromPrice = (price: PriceHistory): string =>
  readMetadataString(price.metadata, ['snapshot_id']) ?? price.id;

export async function resolveSellableProduct(params: {
  context: string;
  productId?: string | null;
  legacyVariantId?: string | null;
  currency: string;
  durationMonths?: number | null;
  expectedPricingSnapshotId?: string | null;
  requireActive?: boolean;
  atDate?: Date;
}): Promise<SellableProductResult> {
  const productId = normalizeId(params.productId);
  const legacyVariantId = normalizeId(params.legacyVariantId);
  if (!productId && !legacyVariantId) return failure('PRODUCT_ID_REQUIRED');

  const currency = normalizeCurrencyCode(params.currency);
  if (!currency) return failure('UNSUPPORTED_CURRENCY');
  const durationWasSupplied =
    params.durationMonths !== null && params.durationMonths !== undefined;
  const requestedDurationMonths = readPositiveInteger(params.durationMonths);
  if (durationWasSupplied && requestedDurationMonths === null) {
    return failure('INVALID_DURATION', {
      received_duration_months: params.durationMonths,
    });
  }

  let legacyListing = legacyVariantId
    ? await catalogService.getVariantWithProduct(legacyVariantId)
    : null;
  if (productId && legacyVariantId) {
    const resolvedProductId = legacyListing?.product.id ?? null;
    if (!legacyListing || resolvedProductId !== productId) {
      recordLegacyVariantConflict({
        context: params.context,
        variantId: legacyVariantId,
        productId,
        resolvedProductId,
      });
      return failure('LEGACY_IDENTIFIER_CONFLICT', {
        product_id: productId,
        variant_id: legacyVariantId,
        resolved_product_id: resolvedProductId,
      });
    }
  }
  if (legacyVariantId && legacyListing) {
    recordLegacyVariantUsage({
      context: params.context,
      variantId: legacyVariantId,
      productId,
    });
  }

  if (productId) {
    const product = await catalogService.getProductById(productId);
    if (
      !product ||
      (params.requireActive !== false && product.status !== 'active')
    ) {
      return failure('PRODUCT_UNAVAILABLE', { product_id: productId });
    }
    const durationMonths = readPositiveInteger(product.duration_months);
    const fixedPriceCents = readPositiveInteger(product.fixed_price_cents);
    const fixedCurrency = normalizeCurrencyCode(product.fixed_price_currency);
    if (!durationMonths || !fixedPriceCents || !fixedCurrency) {
      if (!legacyListing) {
        return failure('INVALID_FIXED_CONFIGURATION', {
          product_id: product.id,
        });
      }
    } else {
      if (
        requestedDurationMonths !== null &&
        requestedDurationMonths !== durationMonths
      ) {
        return failure('INVALID_DURATION', {
          product_id: product.id,
          expected_duration_months: durationMonths,
          received_duration_months: requestedDurationMonths,
        });
      }

      const price = await resolvePublishedPrice({
        product,
        currency,
        ...(params.atDate ? { atDate: params.atDate } : {}),
      });
      if (!price) {
        return failure('PRICE_UNAVAILABLE', { product_id: product.id });
      }
      const priceCents = readPositiveInteger(price.price_cents);
      if (!priceCents) {
        return failure('PRICE_UNAVAILABLE', { product_id: product.id });
      }
      const pricingSnapshotId = snapshotIdFromPrice(price);
      if (
        params.expectedPricingSnapshotId &&
        params.expectedPricingSnapshotId !== pricingSnapshotId
      ) {
        return failure('STALE_PRICE', {
          product_id: product.id,
          expected_pricing_snapshot_id: params.expectedPricingSnapshotId,
          current_pricing_snapshot_id: pricingSnapshotId,
        });
      }
      const comparisonPriceCents = await resolveComparisonPriceCents({
        metadata: product.metadata,
        displayCurrency: price.currency,
      });
      return {
        ok: true,
        data: {
          product,
          legacyVariant: null,
          legacyTerm: null,
          price,
          productId: product.id,
          legacyVariantId: null,
          durationMonths,
          priceCents,
          comparisonPriceCents:
            comparisonPriceCents && comparisonPriceCents > priceCents
              ? comparisonPriceCents
              : null,
          currency: price.currency,
          pricingSnapshotId,
          snapshot: computeFixedTermPricing({
            termTotalCents: priceCents,
            termMonths: durationMonths,
            basePriceCents: priceCents,
          }),
          itemCode: product.slug,
          catalogMode: 'fixed_product',
          availability: 'available',
          legacyIdentifierUsed: Boolean(legacyVariantId),
        },
      };
    }
  }

  if (!legacyListing || !legacyVariantId) {
    return failure('PRODUCT_UNAVAILABLE', { variant_id: legacyVariantId });
  }
  if (
    params.requireActive !== false &&
    (legacyListing.product.status !== 'active' ||
      !legacyListing.variant.is_active)
  ) {
    return failure('PRODUCT_UNAVAILABLE', { variant_id: legacyVariantId });
  }
  const durationMonths = requestedDurationMonths ?? 1;
  const term = await catalogService.getVariantTerm(
    legacyVariantId,
    durationMonths,
    true
  );
  if (!term) {
    return failure('INVALID_DURATION', {
      variant_id: legacyVariantId,
      received_duration_months: durationMonths,
    });
  }
  let price = await catalogService.getCurrentPriceForCurrency({
    variantId: legacyVariantId,
    currency,
    ...(params.atDate ? { atDate: params.atDate } : {}),
  });
  if (!price && currency !== 'USD') {
    const usdPrice = await catalogService.getCurrentPriceForCurrency({
      variantId: legacyVariantId,
      currency: 'USD',
      ...(params.atDate ? { atDate: params.atDate } : {}),
    });
    const usdCents = readPositiveInteger(usdPrice?.price_cents);
    if (usdPrice && usdCents) {
      const converted =
        await fxDisplayPricingService.convertUsdCentsToDisplayCurrency({
          usdCents,
          currency,
        });
      if (converted) {
        price = {
          ...usdPrice,
          price_cents: converted.priceCents,
          currency: converted.currency,
          metadata: {
            ...(usdPrice.metadata || {}),
            ...converted.metadata,
            source: 'price_history_usd_fx_fallback',
            base_currency: 'USD',
            base_price_cents: usdCents,
          },
        };
      }
    }
  }
  const priceCents = readPositiveInteger(price?.price_cents);
  if (!price || !priceCents) {
    return failure('PRICE_UNAVAILABLE', { variant_id: legacyVariantId });
  }
  const pricingSnapshotId = snapshotIdFromPrice(price);
  if (
    params.expectedPricingSnapshotId &&
    params.expectedPricingSnapshotId !== pricingSnapshotId
  ) {
    return failure('STALE_PRICE', {
      variant_id: legacyVariantId,
      expected_pricing_snapshot_id: params.expectedPricingSnapshotId,
      current_pricing_snapshot_id: pricingSnapshotId,
    });
  }
  const comparisonPriceCents = await resolveComparisonPriceCents({
    metadata: price.metadata,
    displayCurrency: price.currency,
  });
  const variant = legacyListing.variant;
  return {
    ok: true,
    data: {
      product: legacyListing.product,
      legacyVariant: variant,
      legacyTerm: term,
      price,
      productId: legacyListing.product.id,
      legacyVariantId: variant.id,
      durationMonths: term.months,
      priceCents,
      comparisonPriceCents,
      currency: price.currency,
      pricingSnapshotId,
      snapshot: computeTermPricing({
        basePriceCents: priceCents,
        termMonths: term.months,
        discountPercent: term.discount_percent ?? 0,
      }),
      itemCode:
        variant.service_plan ||
        variant.variant_code ||
        legacyListing.product.slug,
      catalogMode: 'legacy_variant',
      availability: 'available',
      legacyIdentifierUsed: true,
    },
  };
}
