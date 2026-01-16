import fastify, { FastifyInstance } from 'fastify';
import { subscriptionRoutes } from '../routes/subscriptions';
import { catalogService } from '../services/catalogService';
import { subscriptionService } from '../services/subscriptionService';
import { creditService } from '../services/creditService';
import { rateLimitRedisClient } from '../config/redis';

jest.mock('../services/catalogService');
jest.mock('../services/subscriptionService');
jest.mock('../services/creditService');
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
const mockSubscriptionService = subscriptionService as jest.Mocked<
  typeof subscriptionService
>;
const mockCreditService = creditService as jest.Mocked<typeof creditService>;

describe('Subscription validation rate limit integration', () => {
  let app: FastifyInstance;
  let client: ReturnType<typeof rateLimitRedisClient.getClient>;
  const remoteAddress = '203.0.113.10';
  const rateLimitKey = `rate_limit:sub_validation:${remoteAddress}`;

  beforeAll(async () => {
    await rateLimitRedisClient.connect();
    client = rateLimitRedisClient.getClient();
  });

  afterAll(async () => {
    await rateLimitRedisClient.disconnect();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    if (!rateLimitRedisClient.isConnected()) {
      await rateLimitRedisClient.connect();
      client = rateLimitRedisClient.getClient();
    }
    await client.del(rateLimitKey);

    app = fastify({ logger: false });
    await app.register(subscriptionRoutes, { prefix: '/subscriptions' });
    await app.ready();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('blocks concurrent validation requests beyond the limit', async () => {
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
        metadata: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
    };

    const term = {
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
    };

    const price = {
      id: 'price-1',
      product_variant_id: 'variant-1',
      price_cents: 1000,
      currency: 'USD',
      starts_at: new Date(),
      ends_at: null,
      metadata: null,
      created_at: new Date(),
    };

    mockCatalogService.getVariantWithProduct.mockResolvedValue(listing as any);
    mockCatalogService.getVariantTerm.mockResolvedValue(term as any);
    mockCatalogService.getCurrentPriceForCurrency.mockResolvedValue(
      price as any
    );
    mockSubscriptionService.canPurchaseSubscription.mockResolvedValue({
      canPurchase: true,
      reason: null,
      existing_subscription: null,
    } as any);
    mockCreditService.getUserBalance.mockResolvedValue({
      userId: 'user-1',
      totalBalance: 100,
      availableBalance: 100,
      pendingBalance: 0,
      lastUpdated: new Date(),
    } as any);

    const totalRequests = 25;
    const maxRequests = 20;

    const responses = await Promise.all(
      Array.from({ length: totalRequests }, () =>
        app.inject({
          method: 'POST',
          url: '/subscriptions/validate-purchase',
          payload: {
            variant_id: 'variant-1',
            duration_months: 1,
          },
          remoteAddress,
        })
      )
    );

    const allowed = responses.filter(r => r.statusCode === 200).length;
    const limited = responses.filter(r => r.statusCode === 429).length;
    const other = responses.filter(
      r => r.statusCode !== 200 && r.statusCode !== 429
    ).length;

    expect(other).toBe(0);
    expect(allowed).toBeLessThanOrEqual(maxRequests);
    expect(limited).toBeGreaterThanOrEqual(totalRequests - maxRequests);
    expect(allowed + limited).toBe(totalRequests);
  });
});
