import { CheckoutPricingService } from '../services/checkoutPricingService';
import { resolveVariantPricing } from '../services/variantPricingService';
import { resolvePricingLockContext } from '../services/pricingLockService';

jest.mock('../services/variantPricingService', () => ({
  resolveVariantPricing: jest.fn(),
}));

jest.mock('../services/pricingLockService', () => ({
  resolvePricingLockContext: jest.fn(),
}));

const mockResolveVariantPricing = resolveVariantPricing as jest.MockedFunction<
  typeof resolveVariantPricing
>;
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

    mockResolveVariantPricing.mockResolvedValue({
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
        variant: {
          id: productId,
          product_id: productId,
          name: 'Bolt.new Pro 12 Months',
          service_plan: 'bolt-new-pro-12-months',
          is_active: true,
          sort_order: 0,
          created_at: now,
          updated_at: now,
        },
        term: {
          id: productId,
          product_variant_id: productId,
          months: 12,
          discount_percent: 0,
          is_active: true,
          is_recommended: true,
          sort_order: 0,
          created_at: now,
          updated_at: now,
        },
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
        productVariantId: null,
        planCode: 'bolt-new-pro-12-months',
        catalogMode: 'fixed_product',
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
          variant_id: productId,
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
  });
});
