import { catalogService } from '../services/catalogService';
import { fxDisplayPricingService } from '../services/fx/fxDisplayPricingService';
import { resolveSellableProduct } from '../services/sellableProductService';
import {
  getLegacyVariantCompatibilityMetrics,
  resetLegacyVariantCompatibilityMetrics,
} from '../utils/catalogApiCompatibility';

jest.mock('../services/catalogService', () => ({
  catalogService: {
    getProductById: jest.fn(),
    getVariantWithProduct: jest.fn(),
    getVariantTerm: jest.fn(),
    getCurrentPriceForCurrency: jest.fn(),
    getCurrentFixedProductPriceForCurrency: jest.fn(),
  },
}));
jest.mock('../services/fx/fxDisplayPricingService', () => ({
  fxDisplayPricingService: {
    convertUsdCentsToDisplayCurrency: jest.fn(),
  },
}));
jest.mock('../utils/logger');

const mockedCatalog = catalogService as jest.Mocked<typeof catalogService>;
const mockedFx = fxDisplayPricingService as jest.Mocked<
  typeof fxDisplayPricingService
>;

const now = new Date('2026-07-21T12:00:00.000Z');
const productId = '11111111-1111-4111-8111-111111111111';
const variantId = '22222222-2222-4222-8222-222222222222';
const snapshotId = '33333333-3333-4333-8333-333333333333';

const fixedProduct = {
  id: productId,
  name: 'Product A — 12 Months',
  slug: 'product-a-12-months',
  status: 'active',
  duration_months: 12,
  fixed_price_cents: 12900,
  fixed_price_currency: 'USD',
  metadata: { comparison_price_cents: 14900 },
  created_at: now,
  updated_at: now,
};

describe('resolveSellableProduct', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetLegacyVariantCompatibilityMetrics();
    mockedCatalog.getProductById.mockResolvedValue(fixedProduct as any);
    mockedCatalog.getCurrentFixedProductPriceForCurrency.mockResolvedValue({
      id: snapshotId,
      product_id: productId,
      price_cents: 12900,
      currency: 'USD',
      starts_at: now,
      ends_at: null,
      metadata: { snapshot_id: snapshotId },
      created_at: now,
    });
  });

  it('resolves a fixed product using product identity only', async () => {
    const result = await resolveSellableProduct({
      context: 'test',
      productId,
      currency: 'USD',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({
      productId,
      legacyVariantId: null,
      durationMonths: 12,
      priceCents: 12900,
      comparisonPriceCents: 14900,
      pricingSnapshotId: snapshotId,
      catalogMode: 'fixed_product',
    });
    expect(result.data.snapshot.totalPriceCents).toBe(12900);
    expect(mockedCatalog.getVariantWithProduct).not.toHaveBeenCalled();
  });

  it('rejects an invalid duration and a stale price with stable codes', async () => {
    await expect(
      resolveSellableProduct({
        context: 'test',
        productId,
        currency: 'USD',
        durationMonths: 1.5,
      })
    ).resolves.toMatchObject({ ok: false, code: 'INVALID_DURATION' });

    await expect(
      resolveSellableProduct({
        context: 'test',
        productId,
        currency: 'USD',
        durationMonths: 1,
      })
    ).resolves.toMatchObject({ ok: false, code: 'INVALID_DURATION' });

    await expect(
      resolveSellableProduct({
        context: 'test',
        productId,
        currency: 'USD',
        expectedPricingSnapshotId: 'stale-snapshot',
      })
    ).resolves.toMatchObject({ ok: false, code: 'STALE_PRICE' });
  });

  it('rejects mismatched product and variant identifiers without fallback', async () => {
    mockedCatalog.getVariantWithProduct.mockResolvedValue({
      product: { ...fixedProduct, id: '44444444-4444-4444-8444-444444444444' },
      variant: { id: variantId },
    } as any);

    const result = await resolveSellableProduct({
      context: 'test',
      productId,
      legacyVariantId: variantId,
      currency: 'USD',
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'LEGACY_IDENTIFIER_CONFLICT',
    });
    expect(mockedCatalog.getProductById).not.toHaveBeenCalled();
    expect(getLegacyVariantCompatibilityMetrics()).toMatchObject({
      accepted: 0,
      conflicts: 1,
    });
  });

  it('isolates legacy resolution and records successful compatibility usage', async () => {
    const legacyProduct = {
      ...fixedProduct,
      duration_months: null,
      fixed_price_cents: null,
      fixed_price_currency: null,
    };
    mockedCatalog.getVariantWithProduct.mockResolvedValue({
      product: legacyProduct,
      variant: {
        id: variantId,
        product_id: productId,
        name: 'Legacy plan',
        variant_code: 'legacy-plan',
        service_plan: 'legacy-plan',
        is_active: true,
      },
    } as any);
    mockedCatalog.getVariantTerm.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      product_variant_id: variantId,
      months: 3,
      discount_percent: 10,
      is_active: true,
    } as any);
    mockedCatalog.getCurrentPriceForCurrency.mockResolvedValue({
      id: snapshotId,
      product_variant_id: variantId,
      price_cents: 1000,
      currency: 'USD',
      starts_at: now,
      metadata: { snapshot_id: snapshotId },
      created_at: now,
    } as any);

    const result = await resolveSellableProduct({
      context: 'legacy_test',
      legacyVariantId: variantId,
      currency: 'USD',
      durationMonths: 3,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        productId,
        legacyVariantId: variantId,
        durationMonths: 3,
        catalogMode: 'legacy_variant',
      },
    });
    expect(getLegacyVariantCompatibilityMetrics()).toEqual({
      accepted: 1,
      conflicts: 0,
      byContext: { legacy_test: 1 },
    });
  });

  it('returns unsupported currency without consulting FX', async () => {
    const result = await resolveSellableProduct({
      context: 'test',
      productId,
      currency: 'BTC',
    });
    expect(result).toMatchObject({ ok: false, code: 'UNSUPPORTED_CURRENCY' });
    expect(mockedFx.convertUsdCentsToDisplayCurrency).not.toHaveBeenCalled();
  });
});
