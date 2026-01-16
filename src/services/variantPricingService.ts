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
  if (!listing) {
    return { ok: false, error: 'variant_not_found' };
  }

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

  return {
    ok: true,
    data: {
      product: listing.product,
      variant: listing.variant,
      term,
      price,
      currency: normalizedCurrency,
      snapshot,
    },
  };
}
