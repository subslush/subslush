import { fxPricingPublisherService } from '../services/fx/fxPricingPublisherService';
import { FX_DISPLAY_CURRENCIES } from '../services/fx/fxConfig';
import { getDatabasePool } from '../config/database';

jest.mock('../config/database', () => ({
  getDatabasePool: jest.fn(),
}));

jest.mock('../utils/logger', () => ({
  Logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;

describe('FX pricing publisher stale-rate guardrail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips publish when FX cache is stale', async () => {
    const now = new Date('2026-02-23T12:00:00.000Z');
    const staleFetchedAt = new Date(
      now.getTime() - (1560 + 30) * 60 * 1000
    );
    const staleAfter = new Date(now.getTime() - 60 * 1000);
    const rateRows = FX_DISPLAY_CURRENCIES.filter(code => code !== 'USD').map(
      code => ({
        quote_currency: code,
        rate: '1.25',
        fetched_at: staleFetchedAt,
        stale_after: staleAfter,
        is_lkg: true,
        source_fetch_id: 'fetch-success-1',
      })
    );

    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') {
          return { rows: [] };
        }
        if (sql.includes('FROM fx_rate_fetches')) {
          return { rows: [{ id: 'fetch-success-1' }] };
        }
        if (sql.includes('FROM fx_rate_cache')) {
          return { rows: rateRows };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
      release: jest.fn(),
    };

    const pool = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('INSERT INTO pricing_publish_runs')) {
          return {
            rows: [{ id: 'run-1', snapshot_id: 'snapshot-1' }],
          };
        }
        if (sql.includes('UPDATE pricing_publish_runs')) {
          return { rows: [] };
        }
        throw new Error(`Unexpected pool SQL: ${sql}`);
      }),
      connect: jest.fn(async () => client),
    };

    mockGetDatabasePool.mockReturnValue(pool as any);

    const result = await fxPricingPublisherService.publishCurrentPricingSnapshot({
      triggeredBy: 'manual',
      now,
    });

    expect(result.status).toBe('skipped');
    expect(result.reason).toContain('stale_fx_rate_');
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE pricing_publish_runs'),
      expect.arrayContaining(['run-1', 'skipped'])
    );
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });
});
