import Fastify from 'fastify';
import { subscriptionRoutes } from '../routes/subscriptions';
import { resolveSellableProduct } from '../services/sellableProductService';

jest.mock('../services/sellableProductService', () => ({
  resolveSellableProduct: jest.fn(),
}));
jest.mock('../middleware/rateLimitMiddleware', () => ({
  createRateLimitHandler: jest.fn(() => async () => {}),
}));
jest.mock('../middleware/authMiddleware', () => ({
  authPreHandler: jest.fn(async () => {}),
}));
jest.mock('../utils/logger');

const mockResolveSellableProduct =
  resolveSellableProduct as jest.MockedFunction<typeof resolveSellableProduct>;

describe('Subscription cart pricing preview route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns repriced cart items in the requested currency', async () => {
    mockResolveSellableProduct.mockResolvedValue({
      ok: true,
      data: {
        product: { id: 'product-1' },
        productId: 'product-1',
        legacyVariantId: 'variant-1',
        durationMonths: 1,
        pricingSnapshotId: 'snapshot-1',
        catalogMode: 'legacy_variant',
        snapshot: {
          totalPriceCents: 4614,
        },
        currency: 'SEK',
      },
    } as any);

    const app = Fastify();
    await app.register(subscriptionRoutes, { prefix: '/subscriptions' });

    const response = await app.inject({
      method: 'POST',
      url: '/subscriptions/cart-pricing-preview',
      payload: {
        currency: 'sek',
        items: [
          {
            cart_item_id: 'cart-item-1',
            variant_id: 'variant-1',
            term_months: 1,
            quantity: 2,
          },
        ],
      },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(mockResolveSellableProduct).toHaveBeenCalledWith({
      context: 'cart_pricing_preview',
      productId: null,
      legacyVariantId: 'variant-1',
      currency: 'SEK',
      durationMonths: 1,
    });

    const body = response.json();
    expect(body.data.currency).toBe('SEK');
    expect(body.data.items).toEqual([
      {
        cart_item_id: 'cart-item-1',
        variant_id: 'variant-1',
        product_id: 'product-1',
        duration_months: 1,
        term_months: 1,
        quantity: 2,
        unit_price_cents: 4614,
        line_total_cents: 9228,
        unit_price: 46.14,
        line_total: 92.28,
        currency: 'SEK',
        pricing_snapshot_id: 'snapshot-1',
        catalog_mode: 'legacy_variant',
      },
    ]);
    expect(response.headers.deprecation).toBe('true');
  });

  it('returns skipped items when pricing cannot be resolved', async () => {
    mockResolveSellableProduct.mockResolvedValue({
      ok: false,
      code: 'PRICE_UNAVAILABLE',
      message: 'No current price is available in the requested currency.',
    } as any);

    const app = Fastify();
    await app.register(subscriptionRoutes, { prefix: '/subscriptions' });

    const response = await app.inject({
      method: 'POST',
      url: '/subscriptions/cart-pricing-preview',
      payload: {
        items: [
          {
            cart_item_id: 'cart-item-2',
            variant_id: 'variant-2',
            term_months: 3,
          },
        ],
      },
    });

    await app.close();

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.data.items).toEqual([]);
    expect(body.data.skipped_items).toEqual([
      {
        cart_item_id: 'cart-item-2',
        product_id: null,
        variant_id: 'variant-2',
        code: 'PRICE_UNAVAILABLE',
        message: 'No current price is available in the requested currency.',
        reason: 'PRICE_UNAVAILABLE',
      },
    ]);
  });
});
