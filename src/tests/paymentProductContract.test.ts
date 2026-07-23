import Fastify from 'fastify';
import { paymentRoutes } from '../routes/payments';
import { resolveSellableProduct } from '../services/sellableProductService';
import { resolvePricingLockContext } from '../services/pricingLockService';

jest.mock('../middleware/authMiddleware', () => ({
  authPreHandler: jest.fn(async (request: any) => {
    request.user = { userId: 'user-1', email: 'user@example.com' };
  }),
}));
jest.mock('../middleware/paymentMiddleware', () => ({
  paymentQuoteRateLimit: jest.fn(async () => {}),
  paymentRateLimit: jest.fn(async () => {}),
  paymentRefreshRateLimit: jest.fn(async () => {}),
  paymentRetryRateLimit: jest.fn(async () => {}),
  webhookRateLimit: jest.fn(async () => {}),
}));
jest.mock('../services/sellableProductService', () => ({
  resolveSellableProduct: jest.fn(),
}));
jest.mock('../services/pricingLockService', () => ({
  resolvePricingLockContext: jest.fn(),
}));
jest.mock('../utils/logger');

const mockResolver = resolveSellableProduct as jest.MockedFunction<
  typeof resolveSellableProduct
>;
const mockLock = resolvePricingLockContext as jest.MockedFunction<
  typeof resolvePricingLockContext
>;

describe('payment product-centric contract', () => {
  const productId = '11111111-1111-4111-8111-111111111111';
  const snapshotId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('quotes a fixed product without a variant identifier', async () => {
    mockResolver.mockResolvedValue({
      ok: true,
      data: {
        product: { id: productId, name: 'Product A', slug: 'product-a' },
        productId,
        legacyVariantId: null,
        price: { id: snapshotId },
        snapshot: {
          termMonths: 12,
          termSubtotalCents: 12900,
          discountCents: 0,
          totalPriceCents: 12900,
          discountPercent: 0,
        },
        currency: 'USD',
        catalogMode: 'fixed_product',
        pricingSnapshotId: snapshotId,
      },
    } as any);
    mockLock.mockResolvedValue({
      snapshotId: 'lock-1',
      displayCurrency: 'USD',
      displayBasePriceCents: 12900,
      settlementCurrency: 'USD',
      settlementBasePriceCents: 12900,
    });

    const app = Fastify();
    await app.register(paymentRoutes, { prefix: '/payments' });
    const response = await app.inject({
      method: 'POST',
      url: '/payments/quote',
      payload: { product_id: productId, currency: 'USD' },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(mockResolver).toHaveBeenCalledWith({
      context: 'payment_quote',
      productId,
      legacyVariantId: null,
      currency: 'USD',
      durationMonths: null,
      expectedPricingSnapshotId: null,
    });
    expect(response.json().data).toMatchObject({
      product_id: productId,
      variant_id: null,
      duration_months: 12,
      catalog_mode: 'fixed_product',
      catalog_pricing_snapshot_id: snapshotId,
      pricing_snapshot_id: 'lock-1',
      total_cents: 12900,
    });
    expect(response.headers.deprecation).toBeUndefined();
  });

  it('returns a stable conflict and deprecation signals for mismatched legacy identity', async () => {
    mockResolver.mockResolvedValue({
      ok: false,
      code: 'LEGACY_IDENTIFIER_CONFLICT',
      message: 'product_id and variant_id identify different products.',
      details: { product_id: productId, variant_id: 'legacy-variant' },
    });

    const app = Fastify();
    await app.register(paymentRoutes, { prefix: '/payments' });
    const response = await app.inject({
      method: 'POST',
      url: '/payments/quote',
      payload: {
        product_id: productId,
        variant_id: 'legacy-variant',
        currency: 'USD',
      },
    });
    await app.close();

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: 'LEGACY_IDENTIFIER_CONFLICT',
      details: { product_id: productId, variant_id: 'legacy-variant' },
    });
    expect(response.headers.deprecation).toBe('true');
    expect(response.headers.sunset).toBeTruthy();
  });
});
