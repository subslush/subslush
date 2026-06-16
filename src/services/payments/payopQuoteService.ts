import { catalogService } from '../catalogService';
import type {
  FixedProductPriceHistory,
  PriceHistory,
} from '../../types/catalog';
import type { OrderItem, OrderWithItems } from '../../types/order';
import { computeCouponAllocation } from '../../utils/couponAllocation';
import {
  computeFixedTermPricing,
  computeTermPricing,
} from '../../utils/termPricing';
import {
  getPayopMethodConfig,
  isPayopCountryEligible,
  listPayopMethodCountryOptions,
  normalizePayopMethodId,
  selectPayopProcessingCurrency,
  type PayopConfiguredMethod,
  type PayopMethodType,
} from './payopCatalog';
import type { PayopAvailableMethod } from './payopProvider';

type CatalogMode = 'variant' | 'fixed_product';

type OrderItemMetadata = Record<string, unknown>;

export type PayopQuoteItem = {
  orderItemId: string;
  label: string;
  logoKey: string | null;
  totalCents: number;
};

export type PayopMethodQuote = {
  methodId: number;
  title: string;
  type: PayopMethodType;
  formType: string | null;
  logoUrl: string | null;
  supportedCountries: string[];
  supportedCurrencies: string[];
  displaySubtotalCents: number | null;
  displayFeeCents: number | null;
  displayTotalCents: number | null;
  processingCurrency: string;
  processingSubtotalCents: number;
  processingFeeCents: number;
  processingTotalCents: number;
  convertedFromDisplayCurrency: boolean;
  requiredPayerFields: string[];
  items: PayopQuoteItem[];
};

type QuotedSnapshotItem = {
  orderItemId: string;
  label: string;
  logoKey: string | null;
  totalBeforeCouponCents: number;
  couponEligible: boolean;
  catalogMode: CatalogMode;
  pricingReferenceId: string;
  targetFxRate: number | null;
};

type OrderCurrencyQuote = {
  displayCurrency: string;
  subtotalCents: number;
  items: QuotedSnapshotItem[];
};

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const normalizeCurrency = (value: unknown): string | null => {
  const normalized = normalizeString(value);
  return normalized ? normalized.toUpperCase() : null;
};

const parseNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const parsePositiveInt = (value: unknown): number | null => {
  const parsed = parseNumber(value);
  if (parsed === null) {
    return null;
  }
  const normalized = Math.floor(parsed);
  return normalized > 0 ? normalized : null;
};

const parseNonNegativeInt = (value: unknown): number | null => {
  const parsed = parseNumber(value);
  if (parsed === null) {
    return null;
  }
  const normalized = Math.floor(parsed);
  return normalized >= 0 ? normalized : null;
};

const parsePercent = (value: unknown): number | null => {
  const parsed = parseNumber(value);
  if (parsed === null) {
    return null;
  }
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return parsed;
};

const parseBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value === 1 ? true : value === 0 ? false : null;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
  }
  return null;
};

const resolveItemMetadata = (item: OrderItem): OrderItemMetadata =>
  item.metadata && typeof item.metadata === 'object'
    ? (item.metadata as OrderItemMetadata)
    : {};

const resolveOrderDisplayCurrency = (order: OrderWithItems): string => {
  const metadata =
    order.metadata && typeof order.metadata === 'object'
      ? (order.metadata as Record<string, unknown>)
      : {};
  return (
    normalizeCurrency(metadata['display_currency']) ||
    normalizeCurrency(order.currency) ||
    'USD'
  );
};

const resolveOrderDisplayTotalCents = (
  order: OrderWithItems
): number | null => {
  const metadata =
    order.metadata && typeof order.metadata === 'object'
      ? (order.metadata as Record<string, unknown>)
      : {};

  return (
    parseNonNegativeInt(metadata['display_total_cents']) ??
    parseNonNegativeInt(order.total_cents)
  );
};

const resolveOrderPricingSnapshotId = (
  order: OrderWithItems
): string | null => {
  const metadata =
    order.metadata && typeof order.metadata === 'object'
      ? (order.metadata as Record<string, unknown>)
      : {};
  return (
    normalizeString(order.pricing_snapshot_id) ||
    normalizeString(metadata['pricing_snapshot_id']) ||
    null
  );
};

const resolveItemCatalogMode = (metadata: OrderItemMetadata): CatalogMode =>
  metadata['catalog_mode'] === 'fixed_product' ? 'fixed_product' : 'variant';

const resolveItemPricingReferenceId = (
  item: OrderItem,
  metadata: OrderItemMetadata,
  catalogMode: CatalogMode
): string | null => {
  if (catalogMode === 'fixed_product') {
    return (
      normalizeString(metadata['pricing_reference_id']) ||
      normalizeString(metadata['product_id']) ||
      normalizeString(metadata['product_variant_id']) ||
      null
    );
  }

  return (
    normalizeString(metadata['pricing_reference_id']) ||
    normalizeString(item.product_variant_id) ||
    normalizeString(metadata['product_variant_id']) ||
    null
  );
};

const resolveItemTermMonths = (
  item: OrderItem,
  metadata: OrderItemMetadata
): number => {
  return (
    parsePositiveInt(item.term_months) ||
    parsePositiveInt(metadata['duration_months']) ||
    1
  );
};

const resolveItemDiscountPercent = (
  item: OrderItem,
  metadata: OrderItemMetadata
): number => {
  return (
    parsePercent(item.discount_percent) ??
    parsePercent(metadata['discount_percent']) ??
    0
  );
};

const resolveItemLabel = (item: OrderItem): string =>
  item.product_name ||
  item.variant_name ||
  item.description ||
  normalizeString(resolveItemMetadata(item)['service_plan']) ||
  'Subscription';

const resolveItemLogoKey = (item: OrderItem): string | null => {
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

const resolveQuotedPriceFxRate = (
  price: PriceHistory | FixedProductPriceHistory | null
): number | null => {
  if (!price?.metadata || typeof price.metadata !== 'object') {
    return null;
  }
  return parseNumber((price.metadata as Record<string, unknown>)['fx_rate']);
};

const resolveItemCouponEligibility = (
  item: OrderItem,
  metadata: OrderItemMetadata
): boolean => {
  const explicit = parseBoolean(metadata['coupon_eligible']);
  if (explicit !== null) {
    return explicit;
  }
  return (parsePositiveInt(item.coupon_discount_cents) ?? 0) > 0;
};

const resolveCouponContext = (
  order: OrderWithItems
): {
  percentOff: number;
  applyScope: 'highest_eligible_item' | 'order_total';
} | null => {
  const metadata =
    order.metadata && typeof order.metadata === 'object'
      ? (order.metadata as Record<string, unknown>)
      : {};
  const percentOff = parsePercent(metadata['coupon_percent_off']);
  if (percentOff === null || percentOff <= 0) {
    return null;
  }
  const applyScope =
    metadata['coupon_apply_scope'] === 'order_total'
      ? 'order_total'
      : 'highest_eligible_item';
  return {
    percentOff,
    applyScope,
  };
};

const listRequiredPayerFields = (method: PayopAvailableMethod): string[] => {
  if (!method.config?.fields || !Array.isArray(method.config.fields)) {
    return [];
  }
  const fields = new Set<string>();
  for (const field of method.config.fields) {
    if (field?.required !== true) {
      continue;
    }
    const name = normalizeString(field.name);
    if (name) {
      fields.add(name);
    }
  }
  return Array.from(fields);
};

const fetchSnapshotPriceForCurrency = async (params: {
  catalogMode: CatalogMode;
  referenceId: string;
  currency: string;
  snapshotId: string;
}): Promise<PriceHistory | FixedProductPriceHistory | null> => {
  if (params.catalogMode === 'fixed_product') {
    return catalogService.getSnapshotFixedProductPriceForCurrency({
      productId: params.referenceId,
      currency: params.currency,
      snapshotId: params.snapshotId,
    });
  }

  return catalogService.getSnapshotPriceForCurrency({
    variantId: params.referenceId,
    currency: params.currency,
    snapshotId: params.snapshotId,
  });
};

const quoteOrderInCurrency = async (params: {
  order: OrderWithItems;
  currency: string;
}): Promise<OrderCurrencyQuote | null> => {
  const snapshotId = resolveOrderPricingSnapshotId(params.order);
  if (!snapshotId) {
    return null;
  }

  const displayCurrency = resolveOrderDisplayCurrency(params.order);
  const quotedItems: QuotedSnapshotItem[] = [];

  for (const item of params.order.items) {
    const metadata = resolveItemMetadata(item);
    const catalogMode = resolveItemCatalogMode(metadata);
    const pricingReferenceId = resolveItemPricingReferenceId(
      item,
      metadata,
      catalogMode
    );
    if (!pricingReferenceId) {
      return null;
    }

    const price = await fetchSnapshotPriceForCurrency({
      catalogMode,
      referenceId: pricingReferenceId,
      currency: params.currency,
      snapshotId,
    });
    if (!price) {
      return null;
    }

    const termMonths = resolveItemTermMonths(item, metadata);
    const discountPercent = resolveItemDiscountPercent(item, metadata);
    const quantity = parsePositiveInt(item.quantity) ?? 1;
    const basePriceCents = parsePositiveInt(price.price_cents);
    if (basePriceCents === null) {
      return null;
    }

    const pricingSnapshot =
      catalogMode === 'fixed_product'
        ? computeFixedTermPricing({
            termTotalCents: basePriceCents,
            termMonths,
            basePriceCents,
          })
        : computeTermPricing({
            basePriceCents,
            termMonths,
            discountPercent,
          });

    quotedItems.push({
      orderItemId: item.id,
      label: resolveItemLabel(item),
      logoKey: resolveItemLogoKey(item),
      totalBeforeCouponCents: pricingSnapshot.totalPriceCents * quantity,
      couponEligible: resolveItemCouponEligibility(item, metadata),
      catalogMode,
      pricingReferenceId,
      targetFxRate: resolveQuotedPriceFxRate(price),
    });
  }

  const couponContext = resolveCouponContext(params.order);
  let couponDiscounts = quotedItems.map(() => 0);
  if (couponContext) {
    couponDiscounts = computeCouponAllocation({
      applyScope: couponContext.applyScope,
      percentOff: couponContext.percentOff,
      items: quotedItems.map(item => ({
        totalCents: item.totalBeforeCouponCents,
        eligible: item.couponEligible,
      })),
    }).itemDiscounts;
  }

  const items = quotedItems.map((item, index) => ({
    ...item,
    totalBeforeCouponCents: Math.max(
      0,
      item.totalBeforeCouponCents - (couponDiscounts[index] ?? 0)
    ),
  }));

  return {
    displayCurrency,
    subtotalCents: items.reduce(
      (sum, item) => sum + item.totalBeforeCouponCents,
      0
    ),
    items,
  };
};

const resolveSnapshotFxCrossRate = async (params: {
  order: OrderWithItems;
  targetCurrency: string;
  quotedItems: QuotedSnapshotItem[];
}): Promise<number | null> => {
  if (params.targetCurrency === 'EUR') {
    return 1;
  }

  const referenceItem = params.quotedItems[0];
  if (!referenceItem?.targetFxRate || referenceItem.targetFxRate <= 0) {
    return null;
  }

  const snapshotId = resolveOrderPricingSnapshotId(params.order);
  if (!snapshotId) {
    return null;
  }

  const eurPrice = await fetchSnapshotPriceForCurrency({
    catalogMode: referenceItem.catalogMode,
    referenceId: referenceItem.pricingReferenceId,
    currency: 'EUR',
    snapshotId,
  });
  const eurFxRate = resolveQuotedPriceFxRate(eurPrice);
  if (!eurFxRate || eurFxRate <= 0) {
    return null;
  }

  return referenceItem.targetFxRate / eurFxRate;
};

const computeProcessingFeeCents = async (params: {
  order: OrderWithItems;
  subtotalCents: number;
  currency: string;
  fee: PayopConfiguredMethod['fee'];
  quotedItems: QuotedSnapshotItem[];
}): Promise<number | null> => {
  const percentFeeCents = Math.round(
    params.subtotalCents * (params.fee.percentBasisPoints / 10000)
  );

  let fixedFeeCents = params.fee.fixedEurCents;
  if (params.currency !== 'EUR') {
    const crossRate = await resolveSnapshotFxCrossRate({
      order: params.order,
      targetCurrency: params.currency,
      quotedItems: params.quotedItems,
    });
    if (!crossRate || !Number.isFinite(crossRate) || crossRate <= 0) {
      return null;
    }
    fixedFeeCents = Math.round(
      (params.fee.fixedEurCents / 100) * crossRate * 100
    );
  }

  return Math.max(0, percentFeeCents + fixedFeeCents);
};

export const resolvePayopCountryOptions = (params?: {
  detectedCountry?: string | null;
  selectedCountry?: string | null;
}): string[] => {
  const options = new Set(listPayopMethodCountryOptions());
  const detected = normalizeString(params?.detectedCountry)?.toUpperCase();
  const selected = normalizeString(params?.selectedCountry)?.toUpperCase();
  if (detected) {
    options.add(detected === 'UK' ? 'GB' : detected);
  }
  if (selected) {
    options.add(selected === 'UK' ? 'GB' : selected);
  }
  return Array.from(options).sort((left, right) => left.localeCompare(right));
};

export const buildPayopMethodQuotes = async (params: {
  order: OrderWithItems;
  selectedCountry?: string | null;
  detectedCountry?: string | null;
  liveMethods: PayopAvailableMethod[];
}): Promise<PayopMethodQuote[]> => {
  const displayCurrency = resolveOrderDisplayCurrency(params.order);
  const displaySubtotalCents = resolveOrderDisplayTotalCents(params.order);
  const country =
    normalizeString(
      params.selectedCountry || params.detectedCountry
    )?.toUpperCase() || null;
  const methodQuotes: PayopMethodQuote[] = [];
  const displayOrderQuote = await quoteOrderInCurrency({
    order: params.order,
    currency: displayCurrency,
  });

  const sortedLiveMethods = [...params.liveMethods].sort((left, right) => {
    const leftConfig = getPayopMethodConfig(left.identifier);
    const rightConfig = getPayopMethodConfig(right.identifier);
    const leftSort = leftConfig?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const rightSort = rightConfig?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (leftSort !== rightSort) {
      return leftSort - rightSort;
    }
    return left.title.localeCompare(right.title);
  });

  for (const liveMethod of sortedLiveMethods) {
    const methodConfig = getPayopMethodConfig(liveMethod.identifier);
    if (!methodConfig) {
      continue;
    }
    if (!isPayopCountryEligible(methodConfig, country)) {
      continue;
    }

    const processingCurrency = selectPayopProcessingCurrency({
      method: methodConfig,
      liveCurrencies: liveMethod.currencies,
      displayCurrency,
      paymentCountry: country,
    });
    if (!processingCurrency) {
      continue;
    }

    const orderQuote = await quoteOrderInCurrency({
      order: params.order,
      currency: processingCurrency,
    });
    if (!orderQuote) {
      continue;
    }

    const feeCents = await computeProcessingFeeCents({
      order: params.order,
      subtotalCents: orderQuote.subtotalCents,
      currency: processingCurrency,
      fee: methodConfig.fee,
      quotedItems: orderQuote.items,
    });
    if (feeCents === null) {
      continue;
    }

    const resolvedDisplaySubtotalCents =
      displaySubtotalCents ?? displayOrderQuote?.subtotalCents ?? null;
    const displayFeeCents = displayOrderQuote
      ? await computeProcessingFeeCents({
          order: params.order,
          subtotalCents:
            resolvedDisplaySubtotalCents ?? displayOrderQuote.subtotalCents,
          currency: displayCurrency,
          fee: methodConfig.fee,
          quotedItems: displayOrderQuote.items,
        })
      : null;

    methodQuotes.push({
      methodId: methodConfig.identifier,
      title: methodConfig.title,
      type: methodConfig.type,
      formType: normalizeString(liveMethod.formType),
      logoUrl: normalizeString(liveMethod.logo),
      supportedCountries: liveMethod.countries,
      supportedCurrencies:
        liveMethod.currencies.length > 0
          ? liveMethod.currencies
          : [...methodConfig.processingCurrencies],
      displaySubtotalCents: resolvedDisplaySubtotalCents,
      displayFeeCents,
      displayTotalCents:
        resolvedDisplaySubtotalCents !== null && displayFeeCents !== null
          ? resolvedDisplaySubtotalCents + displayFeeCents
          : null,
      processingCurrency,
      processingSubtotalCents: orderQuote.subtotalCents,
      processingFeeCents: feeCents,
      processingTotalCents: orderQuote.subtotalCents + feeCents,
      convertedFromDisplayCurrency: processingCurrency !== displayCurrency,
      requiredPayerFields: listRequiredPayerFields(liveMethod),
      items: orderQuote.items.map(item => ({
        orderItemId: item.orderItemId,
        label: item.label,
        logoKey: item.logoKey,
        totalCents: item.totalBeforeCouponCents,
      })),
    });
  }

  return methodQuotes;
};

export const findPayopMethodQuote = (
  quotes: readonly PayopMethodQuote[],
  methodId: string | number | null | undefined
): PayopMethodQuote | null => {
  const normalizedMethodId = normalizePayopMethodId(methodId);
  if (normalizedMethodId === null) {
    return null;
  }
  return quotes.find(quote => quote.methodId === normalizedMethodId) ?? null;
};
