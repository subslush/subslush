import { getDatabasePool } from '../config/database';
import { catalogService } from '../services/catalogService';
import {
  validateFixedCatalogDraft,
  validateFixedComparisonPrice,
  validatePublishableFixedCatalog,
} from '../utils/fixedCatalog';

jest.mock('../config/database', () => ({ getDatabasePool: jest.fn() }));
jest.mock('../utils/logger');

const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;
const fixedProductRow = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Product A — 12 Months',
  slug: 'product-a-12-months',
  service_type: 'product-a',
  duration_months: 12,
  fixed_price_cents: 12000,
  fixed_price_currency: 'USD',
  status: 'active',
  metadata: {},
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
};

describe('fixed catalog validation and recovery', () => {
  beforeEach(() => jest.clearAllMocks());

  it('allows incomplete inactive drafts but requires every fixed field for publishing', () => {
    expect(validateFixedCatalogDraft({})).toEqual({ valid: true });
    const result = validatePublishableFixedCatalog({
      duration_months: null,
      fixed_price_cents: null,
      fixed_price_currency: null,
    });
    expect(result.valid).toBe(false);
    expect(result.message).toContain('Fixed Catalog Fields');
    expect(result.message).toContain('A variant is not required');
  });

  it('rejects zero prices because checkout locks require a positive amount', () => {
    expect(
      validateFixedCatalogDraft({
        duration_months: 1,
        fixed_price_cents: 0,
        fixed_price_currency: 'USD',
      })
    ).toEqual({
      valid: false,
      message: 'Fixed price must be a positive whole number of cents.',
    });
  });

  it('keeps USD as the canonical price while FX supplies regional display currencies', () => {
    expect(
      validateFixedCatalogDraft({
        duration_months: 1,
        fixed_price_cents: 999,
        fixed_price_currency: 'EUR',
      })
    ).toEqual({
      valid: false,
      message:
        'Fixed price currency must be USD; regional display currencies are derived by the FX publisher.',
    });
    expect(validateFixedComparisonPrice(999, 999).valid).toBe(false);
    expect(validateFixedComparisonPrice(999, 1299)).toEqual({ valid: true });
  });

  it('closes the prior fixed-price window and creates an auditable current snapshot', async () => {
    const queries: string[] = [];
    const nextPrice = {
      id: 'price-2',
      product_id: fixedProductRow.id,
      price_cents: 13000,
      currency: 'USD',
      starts_at: new Date('2026-02-01T00:00:00.000Z'),
      ends_at: null,
      metadata: { snapshot_id: '22222222-2222-4222-8222-222222222222' },
      created_at: new Date('2026-02-01T00:00:00.000Z'),
    };
    const client = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes('SELECT * FROM products'))
          return { rows: [fixedProductRow] };
        if (sql.includes('INSERT INTO pricing_publish_runs')) {
          return {
            rows: [{ snapshot_id: '22222222-2222-4222-8222-222222222222' }],
          };
        }
        if (sql.includes('INSERT INTO product_fixed_price_history'))
          return { rows: [nextPrice], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      }),
      release: jest.fn(),
    };
    mockGetDatabasePool.mockReturnValue({
      connect: jest.fn().mockResolvedValue(client),
    } as any);

    const result = await catalogService.setCurrentFixedProductPrice({
      product_id: fixedProductRow.id,
      duration_months: 12,
      price_cents: 13000,
      currency: 'USD',
      comparison_price_cents: 15000,
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ price_cents: 13000, currency: 'USD' }),
      })
    );
    expect(queries.some(sql => sql.includes('SET ends_at'))).toBe(true);
    expect(queries.some(sql => sql.includes('UPDATE products'))).toBe(true);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'duration_months = COALESCE($5, duration_months)'
      ),
      expect.arrayContaining([fixedProductRow.id, 13000, 'USD', 12])
    );
    expect(
      queries.some(sql => sql.includes('INSERT INTO pricing_publish_runs'))
    ).toBe(true);
    expect(
      queries.some(sql =>
        sql.includes('INSERT INTO product_fixed_price_history')
      )
    ).toBe(true);
    expect(queries).toContain('COMMIT');
  });

  it('does not create a new history window when commercial terms are unchanged', async () => {
    const currentPrice = {
      id: 'price-current',
      product_id: fixedProductRow.id,
      price_cents: fixedProductRow.fixed_price_cents,
      currency: fixedProductRow.fixed_price_currency,
      starts_at: new Date('2026-01-01T00:00:00.000Z'),
      ends_at: null,
      metadata: {},
      created_at: new Date('2026-01-01T00:00:00.000Z'),
    };
    const queries: string[] = [];
    const client = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes('SELECT * FROM products')) {
          return { rows: [fixedProductRow] };
        }
        if (sql.includes('FROM product_fixed_price_history')) {
          return { rows: [currentPrice] };
        }
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    mockGetDatabasePool.mockReturnValue({
      connect: jest.fn().mockResolvedValue(client),
    } as any);

    const result = await catalogService.setCurrentFixedProductPrice({
      product_id: fixedProductRow.id,
      duration_months: fixedProductRow.duration_months,
      price_cents: fixedProductRow.fixed_price_cents,
      currency: fixedProductRow.fixed_price_currency,
      comparison_price_cents: null,
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ id: currentPrice.id }),
      })
    );
    expect(queries).toContain('COMMIT');
    expect(queries.some(sql => sql.includes('SET ends_at'))).toBe(false);
    expect(
      queries.some(sql =>
        sql.includes('INSERT INTO product_fixed_price_history')
      )
    ).toBe(false);
    expect(queries.some(sql => sql.includes('UPDATE products'))).toBe(false);
  });

  it('does not write price history when a general product update resends the same price', async () => {
    const clientQueries: string[] = [];
    const client = {
      query: jest.fn(async (sql: string) => {
        clientQueries.push(sql);
        return { rows: [{ id: fixedProductRow.id }], rowCount: 1 };
      }),
      release: jest.fn(),
    };
    const poolQuery = jest.fn().mockResolvedValue({ rows: [fixedProductRow] });
    mockGetDatabasePool.mockReturnValue({
      query: poolQuery,
      connect: jest.fn().mockResolvedValue(client),
    } as any);

    const result = await catalogService.updateProduct(fixedProductRow.id, {
      name: 'Renamed product',
      fixed_price_cents: fixedProductRow.fixed_price_cents,
      fixed_price_currency: fixedProductRow.fixed_price_currency,
    });

    expect(result.success).toBe(true);
    expect(
      clientQueries.some(sql => sql.includes('product_fixed_price_history'))
    ).toBe(false);
    expect(
      clientQueries.some(sql => sql.includes('pricing_publish_runs'))
    ).toBe(false);
  });

  it('deactivates accidental catalog rows transactionally without deleting dependencies', async () => {
    const queries: string[] = [];
    const client = {
      query: jest.fn(async (sql: string) => {
        queries.push(sql);
        if (sql.includes('SELECT * FROM products'))
          return { rows: [fixedProductRow] };
        if (sql.includes('UPDATE product_variants'))
          return { rows: [{ id: 'variant-1' }], rowCount: 1 };
        if (sql.includes('WITH legacy_variants')) {
          return {
            rows: [
              {
                variant_count: 1,
                active_variant_count: 0,
                term_count: 2,
                price_history_count: 3,
                subscription_count: 1,
                order_item_count: 1,
                payment_count: 1,
                credit_transaction_count: 1,
              },
            ],
          };
        }
        if (sql.includes('SELECT duration_months'))
          return { rows: [fixedProductRow] };
        return { rows: [], rowCount: 0 };
      }),
      release: jest.fn(),
    };
    mockGetDatabasePool.mockReturnValue({
      connect: jest.fn().mockResolvedValue(client),
    } as any);

    const result = await catalogService.recoverProductOnlyCatalog(
      fixedProductRow.id
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual(
      expect.objectContaining({
        deactivated_variant_count: 1,
        deactivated_variant_ids: ['variant-1'],
        compatibility: expect.objectContaining({
          active_variant_count: 0,
          subscription_count: 1,
          order_item_count: 1,
          payment_count: 1,
        }),
      })
    );
    expect(
      queries.some(sql => /DELETE\s+FROM\s+product_variants/i.test(sql))
    ).toBe(false);
    expect(
      queries.some(sql => /DELETE\s+FROM\s+product_variant_terms/i.test(sql))
    ).toBe(false);
    expect(queries).toContain('COMMIT');
  });

  it('uses NULL-safe fixed precedence and returns malformed product-only rows for diagnostics', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    mockGetDatabasePool.mockReturnValue({ query } as any);

    await catalogService.listActiveListings();
    await catalogService.listActiveFixedProducts();

    const legacySql = query.mock.calls
      .map(call => String(call[0]))
      .find(sql => sql.includes('JOIN product_variants pv'));
    const fixedSql = query.mock.calls
      .map(call => String(call[0]))
      .find(sql => sql.includes('pv_fixed_probe'));
    expect(legacySql).toContain('IS NOT TRUE');
    expect(fixedSql).toContain('NOT EXISTS');
  });
});
