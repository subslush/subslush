import Fastify from 'fastify';
import { subscriptionRoutes } from '../routes/subscriptions';
import { catalogService } from '../services/catalogService';
import { getDatabasePool } from '../config/database';

jest.mock('../services/catalogService');
jest.mock('../config/database', () => ({ getDatabasePool: jest.fn() }));
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
const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;

describe('Subscriptions available listing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCatalogService.listCurrentFixedProductPricesForCurrency.mockResolvedValue(
      new Map()
    );
    mockGetDatabasePool.mockReturnValue({
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    } as any);
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
        sub_category: 'Spotify',
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
    mockCatalogService.listActiveFixedProducts.mockResolvedValue([]);
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
    expect(plan.sub_category).toBe('Spotify');
    expect(plan.product_id).toBe('prod-1');
    expect(plan.variant_id).toBe('variant-1');
  });

  it('supports category and sub-category filters for browse listings', async () => {
    const listing = {
      product: {
        id: 'prod-2',
        name: 'Netflix Premium',
        slug: 'netflix-premium',
        description: 'Streaming plan',
        service_type: 'netflix',
        logo_key: 'netflix',
        category: 'streaming',
        sub_category: 'Netflix',
        default_currency: 'USD',
        max_subscriptions: 2,
        status: 'active',
        metadata: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
      variant: {
        id: 'variant-2',
        product_id: 'prod-2',
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

    const price = {
      id: 'price-2',
      product_variant_id: 'variant-2',
      price_cents: 9000,
      currency: 'USD',
      starts_at: new Date(),
      ends_at: null,
      metadata: null,
      created_at: new Date(),
    };

    mockCatalogService.listActiveListings.mockResolvedValue([listing as any]);
    mockCatalogService.listActiveFixedProducts.mockResolvedValue([]);
    mockCatalogService.listCurrentPricesForCurrency.mockResolvedValue(
      new Map([['variant-2', price as any]])
    );
    mockCatalogService.listVariantTermsForVariants.mockResolvedValue(
      new Map([
        [
          'variant-2',
          [
            {
              id: 'term-2',
              product_variant_id: 'variant-2',
              months: 1,
              discount_percent: 0,
              is_active: true,
              is_recommended: true,
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
      url: '/subscriptions/products/available?category=streaming&sub_category=netflix',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(mockCatalogService.listActiveListings).toHaveBeenCalledWith({
      category: 'streaming',
      sub_category: 'netflix',
    });
    expect(mockCatalogService.listActiveFixedProducts).toHaveBeenCalledWith({
      category: 'streaming',
      sub_category: 'netflix',
    });

    const body = response.json();
    expect(body.data.total_products).toBe(1);
    expect(body.data.products[0]?.sub_category).toBe('Netflix');
  });

  it('keeps valid fixed products available when a legacy listing has no terms', async () => {
    const fixedProduct = {
      id: 'fixed-product',
      name: 'Product A — 12 Months',
      slug: 'product-a-12-months',
      description: 'Twelve month access',
      service_type: 'product-a',
      duration_months: 12,
      fixed_price_cents: 12000,
      fixed_price_currency: 'USD',
      status: 'active',
      metadata: null,
    };
    mockCatalogService.listActiveListings.mockResolvedValue([
      {
        product: {
          id: 'legacy-product',
          name: 'Broken legacy product',
          slug: 'broken-legacy',
          service_type: 'legacy',
          status: 'active',
          metadata: null,
        },
        variant: {
          id: 'legacy-variant',
          product_id: 'legacy-product',
          name: 'Accidental row',
          service_plan: 'legacy-plan',
          is_active: true,
          metadata: null,
        },
      },
    ] as any);
    mockCatalogService.listActiveFixedProducts.mockResolvedValue([
      fixedProduct,
    ] as any);
    mockCatalogService.getProductById.mockResolvedValue(fixedProduct as any);
    mockCatalogService.getCurrentFixedProductPriceForCurrency.mockResolvedValue(
      null
    );
    mockCatalogService.listCurrentPricesForCurrency.mockResolvedValue(
      new Map()
    );
    mockCatalogService.listVariantTermsForVariants.mockResolvedValue(new Map());

    const app = Fastify();
    await app.register(subscriptionRoutes, { prefix: '/subscriptions' });
    const response = await app.inject({
      method: 'GET',
      url: '/subscriptions/products/available',
    });
    const planResponse = await app.inject({
      method: 'GET',
      url: '/subscriptions/available',
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-catalog-terms-status']).toBe('degraded');
    const data = response.json().data;
    expect(data.products).toEqual([
      expect.objectContaining({
        product_id: 'fixed-product',
        variant_id: 'fixed-product',
        from_term_months: 12,
        actual_price: 120,
      }),
    ]);
    expect(data.catalog_diagnostics).toEqual([
      expect.objectContaining({
        code: 'legacy_terms_unavailable',
        product_id: 'legacy-product',
        listing_id: 'legacy-variant',
      }),
    ]);
    expect(planResponse.statusCode).toBe(200);
    expect(planResponse.headers['x-catalog-terms-status']).toBe('degraded');
    const planData = planResponse.json().data;
    expect(planData.total_plans).toBe(1);
    expect(planData.services['product-a']).toEqual([
      expect.objectContaining({
        product_id: 'fixed-product',
        variant_id: 'fixed-product',
        plan: 'product-a-12-months',
        price: 120,
      }),
    ]);
    expect(planData.catalog_diagnostics).toEqual([
      expect.objectContaining({
        code: 'legacy_terms_unavailable',
        product_id: 'legacy-product',
      }),
    ]);
  });

  it('fails a malformed fixed product closed without hiding a valid fixed product', async () => {
    const validFixedProduct = {
      id: 'valid-fixed',
      name: 'Product A — 1 Month',
      slug: 'product-a-1-month',
      service_type: 'product-a',
      duration_months: 1,
      fixed_price_cents: 1500,
      fixed_price_currency: 'USD',
      status: 'active',
      metadata: null,
    };
    mockCatalogService.listActiveListings.mockResolvedValue([]);
    mockCatalogService.listActiveFixedProducts.mockResolvedValue([
      {
        id: 'malformed-fixed',
        name: 'Malformed fixed',
        slug: 'malformed-fixed',
        service_type: 'product-a',
        duration_months: null,
        fixed_price_cents: 500,
        fixed_price_currency: 'USD',
        status: 'active',
        metadata: null,
      },
      validFixedProduct,
    ] as any);
    mockCatalogService.getProductById.mockResolvedValue(
      validFixedProduct as any
    );
    mockCatalogService.getCurrentFixedProductPriceForCurrency.mockResolvedValue(
      null
    );
    mockCatalogService.listCurrentPricesForCurrency.mockResolvedValue(
      new Map()
    );
    mockCatalogService.listVariantTermsForVariants.mockResolvedValue(new Map());

    const app = Fastify();
    await app.register(subscriptionRoutes, { prefix: '/subscriptions' });
    const response = await app.inject({
      method: 'GET',
      url: '/subscriptions/products/available',
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    expect(data.products).toEqual([
      expect.objectContaining({ product_id: 'valid-fixed', actual_price: 15 }),
    ]);
    expect(data.catalog_diagnostics).toEqual([
      expect.objectContaining({
        code: 'invalid_fixed_catalog',
        product_id: 'malformed-fixed',
        catalog_mode: 'fixed_product',
      }),
    ]);
    expect(response.headers['x-catalog-diagnostics-count']).toBe('1');
  });
});
