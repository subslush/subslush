import { catalogService } from './catalogService';
import { normalizeCurrencyCode } from '../utils/currency';
import {
  computeTermPricing,
  type TermPricingSnapshot,
} from '../utils/termPricing';
import type {
  Product,
  ProductVariant,
  ProductVariantTerm,
  PriceHistory,
} from '../types/catalog';

type PricingResolutionData = {
  product: Product;
  variant: ProductVariant;
  term: ProductVariantTerm;
  price: PriceHistory;
  currency: string;
  snapshot: TermPricingSnapshot;
  productVariantId: string | null;
  planCode: string;
  catalogMode: 'variant' | 'fixed_product';
};

type PricingResolutionError =
  | 'invalid_currency'
  | 'variant_not_found'
  | 'inactive'
  | 'term_unavailable'
  | 'price_unavailable';

export type PricingResolutionResult =
  | { ok: true; data: PricingResolutionData }
  | { ok: false; error: PricingResolutionError };

export async function resolveVariantPricing(params: {
  variantId: string;
  currency: string;
  termMonths: number;
  requireActive?: boolean;
  atDate?: Date;
}): Promise<PricingResolutionResult> {
  const normalizedCurrency = normalizeCurrencyCode(params.currency);
  if (!normalizedCurrency) {
    return { ok: false, error: 'invalid_currency' };
  }

  const listing = await catalogService.getVariantWithProduct(params.variantId);
  if (listing) {
    if (params.requireActive !== false) {
      if (listing.product.status !== 'active' || !listing.variant.is_active) {
        return { ok: false, error: 'inactive' };
      }
    }

    const term = await catalogService.getVariantTerm(
      params.variantId,
      params.termMonths,
      true
    );
    if (!term) {
      return { ok: false, error: 'term_unavailable' };
    }

    const price = await catalogService.getCurrentPriceForCurrency({
      variantId: params.variantId,
      currency: normalizedCurrency,
      ...(params.atDate ? { atDate: params.atDate } : {}),
    });
    if (!price) {
      return { ok: false, error: 'price_unavailable' };
    }

    const snapshot = computeTermPricing({
      basePriceCents: Number(price.price_cents),
      termMonths: term.months,
      discountPercent: term.discount_percent ?? 0,
    });

    const planCode =
      listing.variant.service_plan ||
      listing.variant.variant_code ||
      listing.product.slug;

    return {
      ok: true,
      data: {
        product: listing.product,
        variant: listing.variant,
        term,
        price,
        currency: normalizedCurrency,
        snapshot,
        productVariantId: listing.variant.id,
        planCode,
        catalogMode: 'variant',
      },
    };
  }

  const product = await catalogService.getProductById(params.variantId);
  if (!product) {
    return { ok: false, error: 'variant_not_found' };
  }

  if (params.requireActive !== false && product.status !== 'active') {
    return { ok: false, error: 'inactive' };
  }

  const durationMonths = Number(product.duration_months);
  const fixedPriceCents = Number(product.fixed_price_cents);
  const fixedPriceCurrency = normalizeCurrencyCode(product.fixed_price_currency);
  if (
    !Number.isInteger(durationMonths) ||
    durationMonths <= 0 ||
    !Number.isInteger(fixedPriceCents) ||
    fixedPriceCents < 0 ||
    !fixedPriceCurrency
  ) {
    return { ok: false, error: 'variant_not_found' };
  }

  if (params.termMonths !== durationMonths) {
    return { ok: false, error: 'term_unavailable' };
  }

  const now = params.atDate ?? new Date();
  const publishedPrice = await catalogService.getCurrentFixedProductPriceForCurrency(
    {
      productId: product.id,
      currency: normalizedCurrency,
      ...(params.atDate ? { atDate: params.atDate } : {}),
    }
  );
  const publishedPriceCents = publishedPrice
    ? Number(publishedPrice.price_cents)
    : Number.NaN;
  const publishedCurrency = normalizeCurrencyCode(publishedPrice?.currency);

  let resolvedPriceCents = Number.NaN;
  let resolvedCurrency = normalizedCurrency;
  let resolvedPriceMetadata: Record<string, unknown> | null = null;

  if (
    Number.isInteger(publishedPriceCents) &&
    publishedPriceCents >= 0 &&
    publishedCurrency === normalizedCurrency
  ) {
    resolvedPriceCents = publishedPriceCents;
    resolvedCurrency = publishedCurrency;
    resolvedPriceMetadata = {
      source: 'product_fixed_price_history',
      product_id: product.id,
      ...(publishedPrice?.metadata || {}),
    };
  } else if (fixedPriceCurrency === normalizedCurrency) {
    resolvedPriceCents = fixedPriceCents;
    resolvedCurrency = fixedPriceCurrency;
    resolvedPriceMetadata = {
      source: 'products.fixed_price',
      product_id: product.id,
    };
  } else {
    return { ok: false, error: 'price_unavailable' };
  }

  const syntheticVariant: ProductVariant = {
    id: product.id,
    product_id: product.id,
    name: product.name,
    variant_code: null,
    description: product.description ?? null,
    service_plan: product.slug,
    is_active: true,
    sort_order: 0,
    metadata: product.metadata ?? null,
    created_at: product.created_at,
    updated_at: product.updated_at,
  };
  const syntheticTerm: ProductVariantTerm = {
    id: product.id,
    product_variant_id: product.id,
    months: durationMonths,
    discount_percent: 0,
    is_active: true,
    is_recommended: true,
    sort_order: 0,
    metadata: null,
    created_at: product.created_at,
    updated_at: product.updated_at,
  };
  const syntheticPrice: PriceHistory = {
    id: product.id,
    product_variant_id: product.id,
    price_cents: resolvedPriceCents,
    currency: resolvedCurrency,
    starts_at: now,
    ends_at: null,
    metadata: resolvedPriceMetadata,
    created_at: now,
  };

  const snapshot = computeTermPricing({
    basePriceCents: resolvedPriceCents,
    termMonths: durationMonths,
    discountPercent: 0,
  });

  return {
    ok: true,
    data: {
      product,
      variant: syntheticVariant,
      term: syntheticTerm,
      price: syntheticPrice,
      currency: normalizedCurrency,
      snapshot,
      productVariantId: null,
      planCode: product.slug,
      catalogMode: 'fixed_product',
    },
  };
}
