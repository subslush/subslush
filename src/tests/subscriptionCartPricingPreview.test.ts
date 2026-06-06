import Fastify from 'fastify';
import { subscriptionRoutes } from '../routes/subscriptions';
import { resolveVariantPricing } from '../services/variantPricingService';

jest.mock('../services/variantPricingService', () => ({
  resolveVariantPricing: jest.fn(),
}));
jest.mock('../middleware/rateLimitMiddleware', () => ({
  createRateLimitHandler: jest.fn(() => async () => {}),
}));
jest.mock('../middleware/authMiddleware', () => ({
  authPreHandler: jest.fn(async () => {}),
}));
jest.mock('../utils/logger');

const mockResolveVariantPricing = resolveVariantPricing as jest.MockedFunction<
  typeof resolveVariantPricing
>;

describe('Subscription cart pricing preview route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns repriced cart items in the requested currency', async () => {
    mockResolveVariantPricing.mockResolvedValue({
      ok: true,
      data: {
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
    expect(mockResolveVariantPricing).toHaveBeenCalledWith({
      variantId: 'variant-1',
      currency: 'SEK',
      termMonths: 1,
    });

    const body = response.json();
    expect(body.data.currency).toBe('SEK');
    expect(body.data.items).toEqual([
      {
        cart_item_id: 'cart-item-1',
        variant_id: 'variant-1',
        term_months: 1,
        quantity: 2,
        unit_price: 46.14,
        line_total: 92.28,
        currency: 'SEK',
      },
    ]);
  });

  it('returns skipped items when pricing cannot be resolved', async () => {
    mockResolveVariantPricing.mockResolvedValue({
      ok: false,
      error: 'price_unavailable',
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
        variant_id: 'variant-2',
        reason: 'price_unavailable',
      },
    ]);
  });
});
