import { resolveSellableProduct } from './sellableProductService';
import type {
  PriceHistory,
  Product,
  ProductVariant,
  ProductVariantTerm,
} from '../types/catalog';
import type { TermPricingSnapshot } from '../utils/termPricing';

/**
 * Legacy pricing adapter. Canonical callers must use resolveSellableProduct.
 * This remains only for callers that still provide one overloaded variant_id.
 */
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

const mapError = (code: string): PricingResolutionError => {
  if (code === 'UNSUPPORTED_CURRENCY') return 'invalid_currency';
  if (code === 'INVALID_DURATION') return 'term_unavailable';
  if (code === 'PRICE_UNAVAILABLE' || code === 'STALE_PRICE') {
    return 'price_unavailable';
  }
  return 'variant_not_found';
};

export async function resolveVariantPricing(params: {
  variantId: string;
  currency: string;
  termMonths: number;
  requireActive?: boolean;
  atDate?: Date;
}): Promise<PricingResolutionResult> {
  const result = await resolveSellableProduct({
    context: 'legacy_variant_pricing_adapter',
    legacyVariantId: params.variantId,
    currency: params.currency,
    durationMonths: params.termMonths,
    ...(params.requireActive !== undefined
      ? { requireActive: params.requireActive }
      : {}),
    ...(params.atDate ? { atDate: params.atDate } : {}),
  });
  if (!result.ok) return { ok: false, error: mapError(result.code) };

  const { data } = result;
  const now = params.atDate ?? new Date();
  const variant: ProductVariant = data.legacyVariant ?? {
    id: data.product.id,
    product_id: data.product.id,
    name: data.product.name,
    variant_code: null,
    description: data.product.description ?? null,
    service_plan: data.product.slug,
    is_active: true,
    sort_order: 0,
    metadata: data.product.metadata ?? null,
    created_at: data.product.created_at,
    updated_at: data.product.updated_at,
  };
  const term: ProductVariantTerm = data.legacyTerm ?? {
    id: data.product.id,
    product_variant_id: data.product.id,
    months: data.durationMonths,
    discount_percent: 0,
    is_active: true,
    is_recommended: true,
    sort_order: 0,
    metadata: null,
    created_at: data.product.created_at ?? now,
    updated_at: data.product.updated_at ?? now,
  };
  return {
    ok: true,
    data: {
      product: data.product,
      variant,
      term,
      price: data.price,
      currency: data.currency,
      snapshot: data.snapshot,
      productVariantId: data.legacyVariantId,
      planCode: data.itemCode,
      catalogMode:
        data.catalogMode === 'fixed_product' ? 'fixed_product' : 'variant',
    },
  };
}
