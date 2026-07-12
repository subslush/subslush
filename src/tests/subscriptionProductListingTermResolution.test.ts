import Fastify from 'fastify';
import { subscriptionRoutes } from '../routes/subscriptions';
import { catalogService } from '../services/catalogService';

jest.mock('../services/catalogService');
jest.mock('../middleware/rateLimitMiddleware', () => ({
  createRateLimitHandler: jest.fn(() => async () => {}),
}));
jest.mock('../utils/logger');

const mockCatalogService = catalogService as jest.Mocked<typeof catalogService>;

const product = (durationMonths: number | null) => ({
  id: 'product-1',
  name: 'Term listing',
  slug: 'term-listing',
  status: 'active',
  metadata: {},
  duration_months: durationMonths,
  service_type: 'streaming',
});

const variant = {
  id: 'variant-1',
  name: 'Term listing variant',
  service_plan: 'standard',
  variant_code: 'standard',
  metadata: {},
};

const configureListing = (params: {
  durationMonths: number | null;
  terms: number[];
  priceMetadata?: Record<string, unknown>;
}) => {
  mockCatalogService.getProductBySlug.mockResolvedValue(
    product(params.durationMonths) as any
  );
  mockCatalogService.listVariants.mockResolvedValue([variant] as any);
  mockCatalogService.listCurrentPricesForCurrency.mockResolvedValue(
    new Map([
      [
        'variant-1',
        {
          product_variant_id: 'variant-1',
          price_cents: 1000,
          currency: 'USD',
          metadata: params.priceMetadata || {},
        },
      ],
    ]) as any
  );
  mockCatalogService.listVariantTermsForVariants.mockResolvedValue(
    new Map([
      [
        'variant-1',
        params.terms.map(months => ({ months, discount_percent: 0 })),
      ],
    ]) as any
  );
};

describe('public product listing term resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([1, 6])(
    'renders a single active %i-month term without duration_months',
    async months => {
      configureListing({ durationMonths: null, terms: [months] });
      const app = Fastify();
      await app.register(subscriptionRoutes, { prefix: '/subscriptions' });

      const response = await app.inject({
        method: 'GET',
        url: '/subscriptions/products/term-listing',
      });

      await app.close();

      expect(response.statusCode).toBe(200);
      expect(response.json().data.variants[0].term_options).toEqual([
        expect.objectContaining({ months }),
      ]);
    }
  );

  it('uses an explicit listing duration when multiple active terms exist', async () => {
    configureListing({ durationMonths: 6, terms: [1, 6] });
    const app = Fastify();
    await app.register(subscriptionRoutes, { prefix: '/subscriptions' });

    const response = await app.inject({
      method: 'GET',
      url: '/subscriptions/products/term-listing',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().data.variants[0].term_options).toEqual([
      expect.objectContaining({ months: 6 }),
    ]);
  });

  it('fails safe for multiple active terms without a designated listing term', async () => {
    configureListing({ durationMonths: null, terms: [1, 6] });
    const app = Fastify();
    await app.register(subscriptionRoutes, { prefix: '/subscriptions' });

    const response = await app.inject({
      method: 'GET',
      url: '/subscriptions/products/term-listing',
    });

    await app.close();

    expect(response.statusCode).toBe(404);
    expect(response.json().message).toBe('Product not available');
  });

  it('renders the price-record compare-at value on the public product page', async () => {
    configureListing({
      durationMonths: 1,
      terms: [1],
      priceMetadata: { compare_at_price_cents: 1500 },
    });
    const app = Fastify();
    await app.register(subscriptionRoutes, { prefix: '/subscriptions' });

    const response = await app.inject({
      method: 'GET',
      url: '/subscriptions/products/term-listing',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().data.variants[0].term_options[0]).toEqual(
      expect.objectContaining({
        total_price: 10,
        comparison_price: 15,
      })
    );
  });
});
