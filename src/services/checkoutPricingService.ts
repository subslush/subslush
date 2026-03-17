import { couponService, normalizeCouponCode } from './couponService';
import { resolveVariantPricing } from './variantPricingService';
import { resolvePricingLockContext } from './pricingLockService';
import {
  createErrorResult,
  createSuccessResult,
  ServiceResult,
} from '../types/service';
import { normalizeCurrencyCode } from '../utils/currency';
import { computeCouponAllocation } from '../utils/couponAllocation';
import { computeTermPricing } from '../utils/termPricing';
import type { Coupon } from '../types/coupon';
import type { Product, ProductVariant } from '../types/catalog';

export type CheckoutPricingItemInput = {
  variant_id: string;
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
  pricingSnapshotId: string;
  termMonths: number;
  currency: string;
  basePriceCents: number;
  discountPercent: number;
  termSubtotalCents: number;
  termDiscountCents: number;
  termTotalCents: number;
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
  pricingSnapshotId: string;
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

const normalizeTermMonths = (value?: number | null): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value as number));
};

export class CheckoutPricingService {
  async priceDraft(params: {
    items: CheckoutPricingItemInput[];
    currency: string;
    couponCode?: string | null;
    userId: string;
  }): Promise<ServiceResult<CheckoutPricingResult>> {
    const normalizedCurrency = normalizeCurrencyCode(params.currency);
    if (!normalizedCurrency) {
      return createErrorResult('invalid_currency');
    }

    const pricingItems: CheckoutPricingItem[] = [];

    for (const item of params.items) {
      const termMonths = normalizeTermMonths(item.term_months ?? null);
      const pricingResult = await resolveVariantPricing({
        variantId: item.variant_id,
        currency: normalizedCurrency,
        termMonths,
      });

      if (!pricingResult.ok) {
        return createErrorResult(pricingResult.error);
      }

      const { product, variant, snapshot } = pricingResult.data;
      const lockContext = await resolvePricingLockContext({
        variantId:
          pricingResult.data.productVariantId ||
          item.variant_id,
        displayCurrency: normalizedCurrency,
        displayPrice: pricingResult.data.price,
      });
      if (!lockContext) {
        return createErrorResult('price_unavailable');
      }
      const termSubtotalCents = snapshot.basePriceCents * snapshot.termMonths;
      const termDiscountCents = snapshot.discountCents;
      const termTotalCents = snapshot.totalPriceCents;
      const settlementSnapshot = computeTermPricing({
        basePriceCents: lockContext.settlementBasePriceCents,
        termMonths: snapshot.termMonths,
        discountPercent: snapshot.discountPercent,
      });

      pricingItems.push({
        input: item,
        product,
        variant,
        productVariantId: pricingResult.data.productVariantId,
        planCode: pricingResult.data.planCode,
        pricingSnapshotId: lockContext.snapshotId,
        termMonths: snapshot.termMonths,
        currency: normalizedCurrency,
        basePriceCents: snapshot.basePriceCents,
        discountPercent: snapshot.discountPercent,
        termSubtotalCents,
        termDiscountCents,
        termTotalCents,
        couponDiscountCents: 0,
        finalTotalCents: termTotalCents,
        settlementCurrency: lockContext.settlementCurrency,
        settlementBasePriceCents: lockContext.settlementBasePriceCents,
        settlementTermSubtotalCents:
          settlementSnapshot.basePriceCents * settlementSnapshot.termMonths,
        settlementTermDiscountCents: settlementSnapshot.discountCents,
        settlementTermTotalCents: settlementSnapshot.totalPriceCents,
        settlementCouponDiscountCents: 0,
        settlementFinalTotalCents: settlementSnapshot.totalPriceCents,
      });
    }

    const snapshotIds = new Set(pricingItems.map(item => item.pricingSnapshotId));
    if (snapshotIds.size !== 1) {
      return createErrorResult('price_unavailable');
    }

    const settlementCurrencies = new Set(
      pricingItems.map(item => item.settlementCurrency)
    );
    if (settlementCurrencies.size !== 1) {
      return createErrorResult('invalid_settlement');
    }

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
      pricingSnapshotId: [...snapshotIds][0] as string,
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
