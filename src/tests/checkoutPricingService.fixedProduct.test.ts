import { CheckoutPricingService } from '../services/checkoutPricingService';
import { resolveSellableProduct } from '../services/sellableProductService';
import { resolvePricingLockContext } from '../services/pricingLockService';

jest.mock('../services/sellableProductService', () => ({
  resolveSellableProduct: jest.fn(),
}));

jest.mock('../services/pricingLockService', () => ({
  resolvePricingLockContext: jest.fn(),
}));

const mockResolveSellableProduct =
  resolveSellableProduct as jest.MockedFunction<typeof resolveSellableProduct>;
const mockResolvePricingLockContext =
  resolvePricingLockContext as jest.MockedFunction<
    typeof resolvePricingLockContext
  >;

describe('CheckoutPricingService fixed product pricing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not multiply fixed-product term totals by duration months', async () => {
    const now = new Date('2026-03-30T00:00:00.000Z');
    const productId = '11111111-1111-4111-8111-111111111111';
    const snapshotId = '22222222-2222-4222-8222-222222222222';

    mockResolveSellableProduct.mockResolvedValue({
      ok: true,
      data: {
        product: {
          id: productId,
          name: 'Bolt.new Pro 12 Months',
          slug: 'bolt-new-pro-12-months',
          status: 'active',
          created_at: now,
          updated_at: now,
        },
        legacyVariant: null,
        legacyTerm: null,
        price: {
          id: productId,
          product_variant_id: productId,
          price_cents: 9999,
          currency: 'USD',
          starts_at: now,
          ends_at: null,
          metadata: {
            snapshot_id: snapshotId,
            catalog_mode: 'fixed_product',
          },
          created_at: now,
        },
        currency: 'USD',
        snapshot: {
          basePriceCents: 9999,
          termMonths: 12,
          discountPercent: 0,
          termSubtotalCents: 9999,
          totalPriceCents: 9999,
          discountCents: 0,
        },
        productId,
        legacyVariantId: null,
        durationMonths: 12,
        priceCents: 9999,
        comparisonPriceCents: null,
        pricingSnapshotId: snapshotId,
        itemCode: 'bolt-new-pro-12-months',
        catalogMode: 'fixed_product',
        availability: 'available',
        legacyIdentifierUsed: false,
      },
    });

    mockResolvePricingLockContext.mockResolvedValue({
      snapshotId,
      displayCurrency: 'USD',
      displayBasePriceCents: 9999,
      settlementCurrency: 'USD',
      settlementBasePriceCents: 9999,
    });

    const service = new CheckoutPricingService();
    const result = await service.priceDraft({
      items: [
        {
          product_id: productId,
          term_months: 12,
        },
      ],
      currency: 'USD',
      userId: '33333333-3333-4333-8333-333333333333',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.orderSubtotalCents).toBe(9999);
    expect(result.data.orderTotalCents).toBe(9999);
    expect(result.data.orderSettlementTotalCents).toBe(9999);
    expect(result.data.items[0].termSubtotalCents).toBe(9999);
    expect(result.data.items[0].termTotalCents).toBe(9999);
    expect(result.data.items[0].settlementTermSubtotalCents).toBe(9999);
    expect(result.data.items[0].settlementTermTotalCents).toBe(9999);
    expect(mockResolveSellableProduct).toHaveBeenCalledWith({
      context: 'checkout_pricing_item',
      productId,
      legacyVariantId: null,
      currency: 'USD',
      durationMonths: 12,
      expectedPricingSnapshotId: null,
    });
  });

  it('rejects a product id that conflicts with the resolved pricing item', async () => {
    const productId = '11111111-1111-4111-8111-111111111111';
    mockResolveSellableProduct.mockResolvedValue({
      ok: false,
      code: 'LEGACY_IDENTIFIER_CONFLICT',
      message: 'product_id and variant_id identify different products.',
    });

    const result = await new CheckoutPricingService().priceDraft({
      items: [
        {
          variant_id: productId,
          product_id: '22222222-2222-4222-8222-222222222222',
          term_months: 1,
        },
      ],
      currency: 'USD',
      userId: '33333333-3333-4333-8333-333333333333',
    });

    expect(result).toEqual({
      success: false,
      error: 'LEGACY_IDENTIFIER_CONFLICT',
    });
    expect(mockResolvePricingLockContext).not.toHaveBeenCalled();
  });
});
