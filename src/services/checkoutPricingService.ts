import { couponService, normalizeCouponCode } from './couponService';
import { resolveSellableProduct } from './sellableProductService';
import { resolvePricingLockContext } from './pricingLockService';
import {
  createErrorResult,
  createSuccessResult,
  ServiceResult,
} from '../types/service';
import { normalizeCurrencyCode } from '../utils/currency';
import { computeCouponAllocation } from '../utils/couponAllocation';
import {
  computeFixedTermPricing,
  computeTermPricing,
} from '../utils/termPricing';
import type { Coupon } from '../types/coupon';
import type { Product, ProductVariant } from '../types/catalog';
import type { PoolClient } from 'pg';

export type CheckoutPricingItemInput = {
  variant_id?: string | null | undefined;
  product_id?: string | null | undefined;
  pricing_snapshot_id?: string | null | undefined;
  term_months?: number | null | undefined;
  auto_renew?: boolean | null | undefined;
  selection_type?:
    | 'upgrade_new_account'
    | 'upgrade_own_account'
    | null
    | undefined;
  account_identifier?: string | null | undefined;
  credentials?: string | null | undefined;
  manual_monthly_acknowledged?: boolean | null | undefined;
};

export type CheckoutPricingItem = {
  input: CheckoutPricingItemInput;
  product: Product;
  variant: ProductVariant;
  productVariantId: string | null;
  planCode: string;
  catalogMode: 'legacy_variant' | 'fixed_product';
  pricingSnapshotId: string;
  catalogPricingSnapshotId: string;
  termMonths: number;
  currency: string;
  basePriceCents: number;
  discountPercent: number;
  termSubtotalCents: number;
  termDiscountCents: number;
  termTotalCents: number;
  couponEligible: boolean;
  couponDiscountCents: number;
  finalTotalCents: number;
  settlementCurrency: string;
  settlementBasePriceCents: number;
  settlementTermSubtotalCents: number;
  settlementTermDiscountCents: number;
  settlementTermTotalCents: number;
  settlementCouponDiscountCents: number;
  settlementFinalTotalCents: number;
};

export type CheckoutPricingResult = {
  items: CheckoutPricingItem[];
  // Retained for legacy consumers. Independent, valid line locks do not have
  // a single cart-level snapshot when they originate from different runs.
  pricingSnapshotId: string | null;
  displayCurrency: string;
  settlementCurrency: string;
  orderSubtotalCents: number;
  orderDiscountCents: number;
  orderCouponDiscountCents: number;
  orderTotalCents: number;
  orderSettlementTotalCents: number;
  coupon?: Coupon;
  normalizedCouponCode?: string | null;
};

export class CheckoutPricingService {
  async priceDraft(params: {
    items: CheckoutPricingItemInput[];
    currency: string;
    couponCode?: string | null;
    userId: string;
    client?: PoolClient;
  }): Promise<ServiceResult<CheckoutPricingResult>> {
    const normalizedCurrency = normalizeCurrencyCode(params.currency);
    if (!normalizedCurrency) {
      return createErrorResult('invalid_currency');
    }

    const pricingItems: CheckoutPricingItem[] = [];

    for (const item of params.items) {
      const requestedProductId =
        typeof item.product_id === 'string' ? item.product_id.trim() : null;
      const legacyVariantId =
        typeof item.variant_id === 'string' ? item.variant_id.trim() : null;
      const pricingResult = await resolveSellableProduct({
        context: 'checkout_pricing_item',
        productId: requestedProductId,
        legacyVariantId,
        currency: normalizedCurrency,
        durationMonths: item.term_months ?? null,
        expectedPricingSnapshotId: item.pricing_snapshot_id ?? null,
      });

      if (!pricingResult.ok) {
        return createErrorResult(pricingResult.code);
      }

      const { product, snapshot } = pricingResult.data;
      const variant: ProductVariant = pricingResult.data.legacyVariant ?? {
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
      const isFixedProductPricing =
        pricingResult.data.catalogMode === 'fixed_product';
      const lockContext = await resolvePricingLockContext({
        variantId:
          pricingResult.data.legacyVariantId || pricingResult.data.productId,
        displayCurrency: normalizedCurrency,
        displayPrice: pricingResult.data.price,
      });
      if (!lockContext) {
        return createErrorResult('price_unavailable');
      }
      const termSubtotalCents = snapshot.termSubtotalCents;
      const termDiscountCents = snapshot.discountCents;
      const termTotalCents = snapshot.totalPriceCents;
      const settlementSnapshot = isFixedProductPricing
        ? computeFixedTermPricing({
            termTotalCents: lockContext.settlementBasePriceCents,
            termMonths: snapshot.termMonths,
            basePriceCents: lockContext.settlementBasePriceCents,
          })
        : computeTermPricing({
            basePriceCents: lockContext.settlementBasePriceCents,
            termMonths: snapshot.termMonths,
            discountPercent: snapshot.discountPercent,
          });

      pricingItems.push({
        input: item,
        product,
        variant,
        productVariantId: pricingResult.data.legacyVariantId,
        planCode: pricingResult.data.itemCode,
        catalogMode:
          pricingResult.data.catalogMode === 'fixed_product'
            ? 'fixed_product'
            : 'legacy_variant',
        pricingSnapshotId: lockContext.snapshotId,
        catalogPricingSnapshotId: pricingResult.data.pricingSnapshotId,
        termMonths: snapshot.termMonths,
        currency: normalizedCurrency,
        basePriceCents: snapshot.basePriceCents,
        discountPercent: snapshot.discountPercent,
        termSubtotalCents,
        termDiscountCents,
        termTotalCents,
        couponEligible: false,
        couponDiscountCents: 0,
        finalTotalCents: termTotalCents,
        settlementCurrency: lockContext.settlementCurrency,
        settlementBasePriceCents: lockContext.settlementBasePriceCents,
        settlementTermSubtotalCents: settlementSnapshot.termSubtotalCents,
        settlementTermDiscountCents: settlementSnapshot.discountCents,
        settlementTermTotalCents: settlementSnapshot.totalPriceCents,
        settlementCouponDiscountCents: 0,
        settlementFinalTotalCents: settlementSnapshot.totalPriceCents,
      });
    }

    const snapshotIds = new Set(
      pricingItems.map(item => item.pricingSnapshotId)
    );

    const settlementCurrencies = new Set(
      pricingItems.map(item => item.settlementCurrency)
    );
    if (settlementCurrencies.size !== 1) {
      return createErrorResult('invalid_settlement');
    }
    const pricingSnapshotId =
      snapshotIds.size === 1 ? ([...snapshotIds][0] as string) : null;

    let normalizedCouponCode: string | null = null;
    let coupon: Coupon | undefined;

    if (params.couponCode) {
      normalizedCouponCode = normalizeCouponCode(params.couponCode);
      if (normalizedCouponCode) {
        const couponResult = await couponService.validateCouponForCart({
          couponCode: normalizedCouponCode,
          userId: params.userId,
          items: pricingItems.map(item => ({
            product: item.product,
            subtotalCents: item.termTotalCents,
            termMonths: item.termMonths,
          })),
          ...(params.client ? { client: params.client } : {}),
        });

        if (!couponResult.success) {
          return createErrorResult(couponResult.error || 'coupon_invalid');
        }

        coupon = couponResult.data.coupon;
        const eligibleSet = new Set(couponResult.data.eligibleItemIndexes);

        const allocation = computeCouponAllocation({
          applyScope: coupon.apply_scope ?? 'highest_eligible_item',
          percentOff: coupon.percent_off,
          items: pricingItems.map((item, index) => ({
            totalCents: item.termTotalCents,
            eligible: eligibleSet.has(index),
          })),
        });

        pricingItems.forEach((item, index) => {
          item.couponEligible = eligibleSet.has(index);
          const discount = allocation.itemDiscounts[index] ?? 0;
          item.couponDiscountCents = discount;
          item.finalTotalCents = Math.max(0, item.termTotalCents - discount);
        });

        const settlementAllocation = computeCouponAllocation({
          applyScope: coupon.apply_scope ?? 'highest_eligible_item',
          percentOff: coupon.percent_off,
          items: pricingItems.map((item, index) => ({
            totalCents: item.settlementTermTotalCents,
            eligible: eligibleSet.has(index),
          })),
        });

        pricingItems.forEach((item, index) => {
          const discount = settlementAllocation.itemDiscounts[index] ?? 0;
          item.settlementCouponDiscountCents = discount;
          item.settlementFinalTotalCents = Math.max(
            0,
            item.settlementTermTotalCents - discount
          );
        });
      }
    }

    const orderSubtotalCents = pricingItems.reduce(
      (sum, item) => sum + item.termSubtotalCents,
      0
    );
    const orderDiscountCents = pricingItems.reduce(
      (sum, item) => sum + item.termDiscountCents,
      0
    );
    const orderCouponDiscountCents = pricingItems.reduce(
      (sum, item) => sum + item.couponDiscountCents,
      0
    );
    const orderTotalCents = Math.max(
      0,
      orderSubtotalCents - orderDiscountCents - orderCouponDiscountCents
    );
    const orderSettlementTotalCents = pricingItems.reduce(
      (sum, item) => sum + item.settlementFinalTotalCents,
      0
    );

    if (orderTotalCents <= 0 || orderSettlementTotalCents <= 0) {
      return createErrorResult('zero_total');
    }

    return createSuccessResult({
      items: pricingItems,
      pricingSnapshotId,
      displayCurrency: normalizedCurrency,
      settlementCurrency: [...settlementCurrencies][0] as string,
      orderSubtotalCents,
      orderDiscountCents,
      orderCouponDiscountCents,
      orderTotalCents,
      orderSettlementTotalCents,
      ...(coupon ? { coupon } : {}),
      normalizedCouponCode,
    });
  }
}

export const checkoutPricingService = new CheckoutPricingService();
