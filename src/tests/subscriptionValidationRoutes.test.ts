import Fastify from 'fastify';
import { subscriptionRoutes } from '../routes/subscriptions';
import { catalogService } from '../services/catalogService';
import { subscriptionService } from '../services/subscriptionService';
import { creditService } from '../services/creditService';

jest.mock('../services/catalogService');
jest.mock('../services/subscriptionService');
jest.mock('../services/creditService');
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
const mockSubscriptionService = subscriptionService as jest.Mocked<
  typeof subscriptionService
>;
const mockCreditService = creditService as jest.Mocked<typeof creditService>;

describe('Subscription purchase validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns DB-rule validation failures from the service layer', async () => {
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
      price_cents: 5000,
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
      canPurchase: false,
      reason: 'Maximum 1 spotify subscription(s) allowed',
    } as any);
    mockCreditService.getUserBalance.mockResolvedValue({
      userId: 'user-1',
      totalBalance: 100,
      availableBalance: 100,
      pendingBalance: 0,
      lastUpdated: new Date(),
    } as any);

    const app = Fastify();
    await app.register(subscriptionRoutes, { prefix: '/subscriptions' });

    const response = await app.inject({
      method: 'POST',
      url: '/subscriptions/validate-purchase',
      payload: {
        variant_id: 'variant-1',
        duration_months: 1,
      },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.can_purchase).toBe(false);
    expect(body.data.reason).toContain('Maximum 1');
    expect(mockSubscriptionService.canPurchaseSubscription).toHaveBeenCalled();
  });

  it('validates a fixed product using product identity only', async () => {
    const productId = '11111111-1111-4111-8111-111111111111';
    const snapshotId = '22222222-2222-4222-8222-222222222222';
    const now = new Date('2026-07-21T00:00:00.000Z');
    mockCatalogService.getProductById.mockResolvedValue({
      id: productId,
      name: 'Product A — 12 Months',
      slug: 'product-a-12-months',
      description: 'Fixed product',
      service_type: 'product-a',
      status: 'active',
      duration_months: 12,
      fixed_price_cents: 12900,
      fixed_price_currency: 'USD',
      metadata: { features: ['Feature'] },
      created_at: now,
      updated_at: now,
    } as any);
    mockCatalogService.getCurrentFixedProductPriceForCurrency.mockResolvedValue(
      {
        id: snapshotId,
        product_id: productId,
        price_cents: 12900,
        currency: 'USD',
        starts_at: now,
        ends_at: null,
        metadata: { snapshot_id: snapshotId },
        created_at: now,
      } as any
    );
    mockCreditService.getUserBalance.mockResolvedValue({
      userId: 'user-1',
      totalBalance: 200,
      availableBalance: 200,
      pendingBalance: 0,
      lastUpdated: now,
    } as any);
    mockSubscriptionService.canPurchaseProduct.mockResolvedValue({
      canPurchase: true,
    });

    const app = Fastify();
    await app.register(subscriptionRoutes, { prefix: '/subscriptions' });
    const response = await app.inject({
      method: 'POST',
      url: '/subscriptions/validate-purchase',
      payload: { product_id: productId },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      can_purchase: true,
      product_id: productId,
      variant_id: null,
      duration_months: 12,
      catalog_mode: 'fixed_product',
      pricing_snapshot_id: snapshotId,
      required_credits: 129,
      total_cents: 12900,
    });
    expect(mockSubscriptionService.canPurchaseProduct).toHaveBeenCalledWith(
      'user-1',
      productId
    );
    expect(
      mockSubscriptionService.canPurchaseSubscription
    ).not.toHaveBeenCalled();
  });
});
