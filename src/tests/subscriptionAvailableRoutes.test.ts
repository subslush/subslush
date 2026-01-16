import Fastify from 'fastify';
import { subscriptionRoutes } from '../routes/subscriptions';
import { catalogService } from '../services/catalogService';

jest.mock('../services/catalogService');
jest.mock('../middleware/rateLimitMiddleware', () => ({
  createRateLimitHandler: jest.fn(() => async () => {}),
}));
jest.mock('../middleware/authMiddleware', () => ({
  authPreHandler: jest.fn(async (request: any) => {
    request.user = {
      userId: 'user-1',
      email: 'user@example.com',
      role: 'user',
      sessionId: 'session-1',
      isAdmin: false,
    };
  }),
}));
jest.mock('../utils/logger');

const mockCatalogService = catalogService as jest.Mocked<typeof catalogService>;

describe('Subscriptions available listing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns DB-driven listings with current price', async () => {
    const listing = {
      product: {
        id: 'prod-1',
        name: 'Spotify',
        slug: 'spotify',
        description: 'Music streaming',
        service_type: 'spotify',
        logo_key: 'spotify',
        category: 'music',
        default_currency: 'USD',
        max_subscriptions: 1,
        status: 'active',
        metadata: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
      variant: {
        id: 'variant-1',
        product_id: 'prod-1',
        name: 'Premium',
        variant_code: 'premium',
        description: 'Premium plan',
        service_plan: 'premium',
        is_active: true,
        sort_order: 0,
        metadata: { features: ['Ad-free listening'] },
        created_at: new Date(),
        updated_at: new Date(),
      },
    };

    const price = {
      id: 'price-1',
      product_variant_id: 'variant-1',
      price_cents: 5000,
      currency: 'USD',
      starts_at: new Date(),
      ends_at: null,
      metadata: null,
      created_at: new Date(),
    };

    mockCatalogService.listActiveListings.mockResolvedValue([listing as any]);
    mockCatalogService.listCurrentPricesForCurrency.mockResolvedValue(
      new Map([['variant-1', price as any]])
    );
    mockCatalogService.listVariantTermsForVariants.mockResolvedValue(
      new Map([
        [
          'variant-1',
          [
            {
              id: 'term-1',
              product_variant_id: 'variant-1',
              months: 1,
              discount_percent: 0,
              is_active: true,
              is_recommended: false,
              sort_order: 0,
              metadata: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
          ],
        ],
      ])
    );

    const app = Fastify();
    await app.register(subscriptionRoutes, { prefix: '/subscriptions' });

    const response = await app.inject({
      method: 'GET',
      url: '/subscriptions/available',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.total_plans).toBe(1);
    expect(body.data.services.spotify).toHaveLength(1);

    const plan = body.data.services.spotify[0];
    expect(plan.plan).toBe('premium');
    expect(plan.price).toBe(50);
    expect(plan.service_name).toBe('Spotify');
    expect(plan.logo_key).toBe('spotify');
    expect(plan.product_id).toBe('prod-1');
    expect(plan.variant_id).toBe('variant-1');
  });
});
