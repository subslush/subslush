import { getDatabasePool } from '../config/database';
import { catalogService } from '../services/catalogService';

jest.mock('../config/database', () => ({
  getDatabasePool: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  Logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;

describe('Catalog price lookup regression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns current prices by currency with FX snapshot metadata intact', async () => {
    const atDate = new Date('2026-02-23T12:00:00.000Z');

    const mockPool = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        expect(sql).toContain('SELECT DISTINCT ON (product_variant_id)');
        expect(sql).toContain('UPPER(currency) = $3');
        expect(params?.[0]).toEqual(['variant-1']);
        expect(params?.[2]).toBe('EUR');

        return {
          rows: [
            {
              id: 'price-eur-1',
              product_variant_id: 'variant-1',
              price_cents: 2149,
              currency: 'EUR',
              starts_at: atDate,
              ends_at: null,
              metadata: JSON.stringify({
                snapshot_id: 'snapshot-123',
                fx_rate: 1.1,
                raw_amount: 21.989,
                rounding_profile: 'standard_2dp',
                rounding_rule_version: '2026-02-v1',
              }),
              created_at: atDate,
            },
          ],
        };
      }),
    };

    mockGetDatabasePool.mockReturnValue(mockPool as any);

    const result = await catalogService.listCurrentPricesForCurrency({
      variantIds: ['variant-1'],
      currency: 'eur',
      atDate,
    });

    expect(result.size).toBe(1);
    const price = result.get('variant-1');
    expect(price).toBeDefined();
    expect(price?.currency).toBe('EUR');
    expect(price?.price_cents).toBe(2149);
    expect(price?.metadata?.['snapshot_id']).toBe('snapshot-123');
    expect(price?.metadata?.['rounding_profile']).toBe('standard_2dp');
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });
});
