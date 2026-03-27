import { getDatabasePool } from '../config/database';
import { env } from '../config/environment';
import { FX_DISPLAY_CURRENCIES } from '../services/fx/fxConfig';
import { fxPricingPublisherService } from '../services/fx/fxPricingPublisherService';
import { fxRateService } from '../services/fx/fxRateService';

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

type FxRateFetchStatus = 'success' | 'failed' | 'skipped';
type PublishRunStatus = 'started' | 'succeeded' | 'failed' | 'skipped';

type FxRateFetchRow = {
  id: string;
  source: string;
  base_currency: string;
  status: FxRateFetchStatus;
  fetch_started_at: Date;
  fetch_completed_at: Date | null;
  http_status: number | null;
  rates_count: number | null;
  is_success: boolean;
  error_code: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

type FxRateCacheRow = {
  base_currency: string;
  quote_currency: string;
  rate: number;
  fetched_at: Date;
  source_fetch_id: string | null;
  is_lkg: boolean;
  stale_after: Date | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

type PricingPublishRunRow = {
  id: string;
  snapshot_id: string;
  status: PublishRunStatus;
  triggered_by: 'scheduler' | 'manual' | 'system';
  fx_fetch_id: string | null;
  published_at: Date | null;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
};

type ProductRow = {
  id: string;
  status: string;
  duration_months: number | null;
  fixed_price_cents: number | null;
  fixed_price_currency: string | null;
};

type ProductVariantRow = {
  id: string;
  product_id: string;
  is_active: boolean;
};

type PriceHistoryRow = {
  id: string;
  product_variant_id: string;
  price_cents: number;
  currency: string;
  starts_at: Date;
  ends_at: Date | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

type ProductFixedPriceHistoryRow = {
  id: string;
  product_id: string;
  price_cents: number;
  currency: string;
  starts_at: Date;
  ends_at: Date | null;
  metadata: Record<string, unknown>;
  created_at: Date;
};

type FakeDatabaseState = {
  fxRateFetches: FxRateFetchRow[];
  fxRateCache: Map<string, FxRateCacheRow>;
  pricingPublishRuns: PricingPublishRunRow[];
  products: ProductRow[];
  productVariants: ProductVariantRow[];
  priceHistory: PriceHistoryRow[];
  productFixedPriceHistory: ProductFixedPriceHistoryRow[];
};

function toDate(value: unknown): Date {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  return new Date(String(value));
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string' && value.length > 0) {
    return JSON.parse(value) as Record<string, unknown>;
  }
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return {};
}

function createFakeDatabasePool(): {
  state: FakeDatabaseState;
  pool: {
    query: jest.Mock<Promise<{ rows: any[] }>, [string, unknown[]?]>;
    connect: jest.Mock<Promise<any>, []>;
  };
} {
  let idCounter = 1;
  const nextId = (prefix: string): string => `${prefix}-${idCounter++}`;

  const state: FakeDatabaseState = {
    fxRateFetches: [],
    fxRateCache: new Map<string, FxRateCacheRow>(),
    pricingPublishRuns: [],
    products: [
      {
        id: 'product-1',
        status: 'active',
        duration_months: null,
        fixed_price_cents: null,
        fixed_price_currency: null,
      },
      {
        id: 'fixed-product-1',
        status: 'active',
        duration_months: 12,
        fixed_price_cents: 2999,
        fixed_price_currency: 'USD',
      },
    ],
    productVariants: [{ id: 'variant-1', product_id: 'product-1', is_active: true }],
    priceHistory: [
      {
        id: 'price-usd-seed',
        product_variant_id: 'variant-1',
        price_cents: 1999,
        currency: 'USD',
        starts_at: new Date('2026-01-01T00:00:00.000Z'),
        ends_at: null,
        metadata: { seed: true },
        created_at: new Date('2026-01-01T00:00:00.000Z'),
      },
    ],
    productFixedPriceHistory: [],
  };

  const updateRun = (
    runId: string,
    patch: Partial<Omit<PricingPublishRunRow, 'id' | 'snapshot_id'>>
  ): void => {
    const run = state.pricingPublishRuns.find(item => item.id === runId);
    if (!run) {
      throw new Error(`Unknown pricing publish run: ${runId}`);
    }
    Object.assign(run, patch, {
      updated_at: new Date(),
    });
  };

  const executeQuery = async (
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: any[] }> => {
    const values = params ?? [];

    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return { rows: [] };
    }

    if (sql.includes('INSERT INTO fx_rate_fetches') && sql.includes("'success'")) {
      const source = String(values[0] || 'currencyapi');
      const baseCurrency = String(values[1] || 'USD');
      const fetchStartedAt = toDate(values[2]);
      const fetchCompletedAt = toDate(values[3]);
      const httpStatus =
        values[4] === null || values[4] === undefined ? null : Number(values[4]);
      const ratesCount =
        values[5] === null || values[5] === undefined ? null : Number(values[5]);
      const metadata = parseJsonObject(values[6]);

      const row: FxRateFetchRow = {
        id: nextId('fx-fetch'),
        source,
        base_currency: baseCurrency,
        status: 'success',
        fetch_started_at: fetchStartedAt,
        fetch_completed_at: fetchCompletedAt,
        http_status: httpStatus,
        rates_count: ratesCount,
        is_success: true,
        error_code: null,
        error_message: null,
        metadata,
        created_at: fetchCompletedAt,
      };
      state.fxRateFetches.push(row);

      return { rows: [{ id: row.id }] };
    }

    if (sql.includes('INSERT INTO fx_rate_cache')) {
      const baseCurrency = String(values[0]);
      const quoteCurrency = String(values[1]);
      const rate = Number(values[2]);
      const fetchedAt = toDate(values[3]);
      const sourceFetchId =
        values[4] === null || values[4] === undefined ? null : String(values[4]);
      const staleAfter =
        values[5] === null || values[5] === undefined ? null : toDate(values[5]);
      const metadata = parseJsonObject(values[6]);

      const key = `${baseCurrency}:${quoteCurrency}`;
      const existing = state.fxRateCache.get(key);
      const createdAt = existing?.created_at ?? fetchedAt;
      state.fxRateCache.set(key, {
        base_currency: baseCurrency,
        quote_currency: quoteCurrency,
        rate,
        fetched_at: fetchedAt,
        source_fetch_id: sourceFetchId,
        is_lkg: false,
        stale_after: staleAfter,
        metadata,
        created_at: createdAt,
        updated_at: fetchedAt,
      });
      return { rows: [] };
    }

    if (
      sql.includes('UPDATE fx_rate_cache') &&
      sql.includes('quote_currency <> ALL')
    ) {
      const baseCurrency = String(values[0]);
      const freshQuotes = (values[1] as string[]) ?? [];
      const fetchId = values[2] === null ? null : String(values[2]);

      for (const row of state.fxRateCache.values()) {
        if (
          row.base_currency === baseCurrency &&
          !freshQuotes.includes(row.quote_currency) &&
          row.source_fetch_id !== fetchId
        ) {
          row.is_lkg = true;
          row.updated_at = new Date();
        }
      }
      return { rows: [] };
    }

    if (sql.includes('INSERT INTO pricing_publish_runs')) {
      const triggeredBy = String(values[0]) as 'scheduler' | 'manual' | 'system';
      const createdAt = new Date();
      const row: PricingPublishRunRow = {
        id: nextId('publish-run'),
        snapshot_id: nextId('snapshot'),
        status: 'started',
        triggered_by: triggeredBy,
        fx_fetch_id: null,
        published_at: null,
        reason: null,
        metadata: {},
        created_at: createdAt,
        updated_at: createdAt,
      };
      state.pricingPublishRuns.push(row);
      return { rows: [{ id: row.id, snapshot_id: row.snapshot_id }] };
    }

    if (
      sql.includes('UPDATE pricing_publish_runs') &&
      sql.includes("SET status = 'succeeded'")
    ) {
      const runId = String(values[0]);
      const fetchId =
        values[1] === null || values[1] === undefined ? null : String(values[1]);
      const publishedAt = toDate(values[2]);
      const metadata = parseJsonObject(values[3]);
      updateRun(runId, {
        status: 'succeeded',
        fx_fetch_id: fetchId,
        published_at: publishedAt,
        reason: null,
        metadata,
      });
      return { rows: [] };
    }

    if (
      sql.includes('UPDATE pricing_publish_runs') &&
      sql.includes('SET status = $2')
    ) {
      const runId = String(values[0]);
      const status = String(values[1]) as PublishRunStatus;
      const fetchId =
        values[2] === null || values[2] === undefined ? null : String(values[2]);
      const reason =
        values[3] === null || values[3] === undefined ? null : String(values[3]);
      const metadata = parseJsonObject(values[4]);
      updateRun(runId, {
        status,
        fx_fetch_id: fetchId,
        reason,
        metadata,
      });
      return { rows: [] };
    }

    if (sql.includes('SELECT id') && sql.includes('FROM fx_rate_fetches')) {
      const latestSuccess = [...state.fxRateFetches]
        .filter(row => row.status === 'success')
        .sort((a, b) => b.fetch_completed_at!.getTime() - a.fetch_completed_at!.getTime())[0];
      return { rows: latestSuccess ? [{ id: latestSuccess.id }] : [] };
    }

    if (sql.includes('FROM fx_rate_cache') && sql.includes('quote_currency = ANY')) {
      const baseCurrency = String(values[0]);
      const currencies = (values[1] as string[]) ?? [];
      const rows = currencies
        .map(currency => state.fxRateCache.get(`${baseCurrency}:${currency}`))
        .filter((row): row is FxRateCacheRow => Boolean(row))
        .map(row => ({
          quote_currency: row.quote_currency,
          rate: row.rate,
          fetched_at: row.fetched_at,
          stale_after: row.stale_after,
          is_lkg: row.is_lkg,
          source_fetch_id: row.source_fetch_id,
        }));
      return { rows };
    }

    if (sql.includes('FROM product_variants pv') && sql.includes('FROM price_history')) {
      const currency = String(values[0]).toUpperCase();
      const atDate = toDate(values[1]);

      const rows = state.productVariants
        .filter(variant => variant.is_active)
        .filter(variant =>
          state.products.some(
            product =>
              product.id === variant.product_id && product.status === 'active'
          )
        )
        .map(variant => {
          const price = [...state.priceHistory]
            .filter(
              row =>
                row.product_variant_id === variant.id &&
                row.currency.toUpperCase() === currency &&
                row.starts_at <= atDate &&
                (row.ends_at === null || row.ends_at > atDate)
            )
            .sort((a, b) => b.starts_at.getTime() - a.starts_at.getTime())[0];

          return price
            ? {
                product_variant_id: variant.id,
                usd_price_cents: price.price_cents,
              }
            : null;
        })
        .filter(
          (
            row
          ): row is {
            product_variant_id: string;
            usd_price_cents: number;
          } => row !== null
        );

      return { rows };
    }

    if (
      sql.includes('FROM products p') &&
      sql.includes('fixed_price_cents AS usd_price_cents') &&
      sql.includes('LEFT JOIN product_variants pv')
    ) {
      const currency = String(values[0]).toUpperCase();

      const rows = state.products
        .filter(product => product.status === 'active')
        .filter(
          product =>
            Number.isInteger(product.duration_months) &&
            product.duration_months !== null &&
            Number.isInteger(product.fixed_price_cents) &&
            product.fixed_price_cents !== null &&
            product.fixed_price_cents >= 0 &&
            typeof product.fixed_price_currency === 'string' &&
            product.fixed_price_currency.toUpperCase() === currency
        )
        .filter(
          product =>
            !state.productVariants.some(
              variant => variant.product_id === product.id && variant.is_active
            )
        )
        .map(product => ({
          product_id: product.id,
          usd_price_cents: product.fixed_price_cents,
        }));

      return { rows };
    }

    if (sql.includes('UPDATE price_history') && sql.includes('SET ends_at = $1')) {
      const endsAt = toDate(values[0]);
      const variantId = String(values[1]);
      const currency = String(values[2]).toUpperCase();
      for (const row of state.priceHistory) {
        if (
          row.product_variant_id === variantId &&
          row.currency.toUpperCase() === currency &&
          row.starts_at < endsAt &&
          (row.ends_at === null || row.ends_at > endsAt)
        ) {
          row.ends_at = endsAt;
        }
      }
      return { rows: [] };
    }

    if (sql.includes('INSERT INTO price_history')) {
      const variantId = String(values[0]);
      const priceCents = Number(values[1]);
      const currency = String(values[2]).toUpperCase();
      const startsAt = toDate(values[3]);
      const metadata = parseJsonObject(values[4]);
      state.priceHistory.push({
        id: nextId('price'),
        product_variant_id: variantId,
        price_cents: priceCents,
        currency,
        starts_at: startsAt,
        ends_at: null,
        metadata,
        created_at: startsAt,
      });
      return { rows: [] };
    }

    if (
      sql.includes('UPDATE product_fixed_price_history') &&
      sql.includes('SET ends_at = $1')
    ) {
      const endsAt = toDate(values[0]);
      const productId = String(values[1]);
      const currency = String(values[2]).toUpperCase();
      for (const row of state.productFixedPriceHistory) {
        if (
          row.product_id === productId &&
          row.currency.toUpperCase() === currency &&
          row.starts_at < endsAt &&
          (row.ends_at === null || row.ends_at > endsAt)
        ) {
          row.ends_at = endsAt;
        }
      }
      return { rows: [] };
    }

    if (sql.includes('INSERT INTO product_fixed_price_history')) {
      const productId = String(values[0]);
      const priceCents = Number(values[1]);
      const currency = String(values[2]).toUpperCase();
      const startsAt = toDate(values[3]);
      const metadata = parseJsonObject(values[4]);

      const existing = state.productFixedPriceHistory.find(
        row =>
          row.product_id === productId &&
          row.currency === currency &&
          row.starts_at.getTime() === startsAt.getTime()
      );
      if (existing) {
        existing.price_cents = priceCents;
        existing.ends_at = null;
        existing.metadata = metadata;
      } else {
        state.productFixedPriceHistory.push({
          id: nextId('fixed-price'),
          product_id: productId,
          price_cents: priceCents,
          currency,
          starts_at: startsAt,
          ends_at: null,
          metadata,
          created_at: startsAt,
        });
      }
      return { rows: [] };
    }

    throw new Error(`Unexpected SQL in fake DB: ${sql}`);
  };

  const client = {
    query: jest.fn(executeQuery),
    release: jest.fn(),
  };

  const pool = {
    query: jest.fn(executeQuery),
    connect: jest.fn(async () => client),
  };

  return { state, pool };
}

function buildCurrencyApiPayload(): {
  payload: Record<string, { code: string; value: number }>;
  rates: Record<string, number>;
} {
  const payload: Record<string, { code: string; value: number }> = {};
  const rates: Record<string, number> = { USD: 1 };

  let index = 0;
  for (const currency of FX_DISPLAY_CURRENCIES) {
    if (currency === 'USD') {
      continue;
    }
    index += 1;
    const rate = Number((1 + index / 10).toFixed(6));
    payload[currency] = { code: currency, value: rate };
    rates[currency] = rate;
  }

  return { payload, rates };
}

describe('FX pipeline integration', () => {
  const mutableEnv = env as {
    FX_ENGINE_ENABLED: boolean;
    CURRENCYAPI_KEY: string;
    FX_RATE_STALE_MINUTES: number;
    FX_RATE_MAX_STALE_MINUTES: number;
    FX_ROUNDING_RULE_VERSION: string;
  };

  let previousFxEngineEnabled = mutableEnv.FX_ENGINE_ENABLED;
  let previousCurrencyApiKey = mutableEnv.CURRENCYAPI_KEY;
  let previousRateStaleMinutes = mutableEnv.FX_RATE_STALE_MINUTES;
  let previousRateMaxStaleMinutes = mutableEnv.FX_RATE_MAX_STALE_MINUTES;
  let previousRoundingRuleVersion = mutableEnv.FX_ROUNDING_RULE_VERSION;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();

    previousFxEngineEnabled = mutableEnv.FX_ENGINE_ENABLED;
    previousCurrencyApiKey = mutableEnv.CURRENCYAPI_KEY;
    previousRateStaleMinutes = mutableEnv.FX_RATE_STALE_MINUTES;
    previousRateMaxStaleMinutes = mutableEnv.FX_RATE_MAX_STALE_MINUTES;
    previousRoundingRuleVersion = mutableEnv.FX_ROUNDING_RULE_VERSION;

    mutableEnv.FX_ENGINE_ENABLED = true;
    mutableEnv.CURRENCYAPI_KEY = 'currencyapi-test-key';
    mutableEnv.FX_RATE_STALE_MINUTES = 1560;
    mutableEnv.FX_RATE_MAX_STALE_MINUTES = 2880;
    mutableEnv.FX_ROUNDING_RULE_VERSION = '2026-02-v1';
  });

  afterEach(() => {
    mutableEnv.FX_ENGINE_ENABLED = previousFxEngineEnabled;
    mutableEnv.CURRENCYAPI_KEY = previousCurrencyApiKey;
    mutableEnv.FX_RATE_STALE_MINUTES = previousRateStaleMinutes;
    mutableEnv.FX_RATE_MAX_STALE_MINUTES = previousRateMaxStaleMinutes;
    mutableEnv.FX_ROUNDING_RULE_VERSION = previousRoundingRuleVersion;
    global.fetch = originalFetch;
  });

  it('fetches USD FX rates, publishes snapshot pricing, and writes provenance metadata', async () => {
    const { pool, state } = createFakeDatabasePool();
    mockGetDatabasePool.mockReturnValue(pool as any);

    const fetchStartedAt = new Date('2026-02-23T10:00:00.000Z');
    const publishAt = new Date('2026-02-23T12:00:00.000Z');
    const { payload, rates } = buildCurrencyApiPayload();

    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        meta: { last_updated_at: fetchStartedAt.toISOString() },
        data: payload,
      }),
      text: async () => JSON.stringify({ data: payload }),
    })) as typeof global.fetch;

    const fetchResult = await fxRateService.fetchAndCacheLatestUsdRates(
      fetchStartedAt
    );

    expect(fetchResult.status).toBe('success');
    expect(fetchResult.fetchId).toBeTruthy();
    expect(fetchResult.rateCount).toBe(FX_DISPLAY_CURRENCIES.length);
    expect(state.fxRateFetches).toHaveLength(1);
    expect(state.fxRateCache.size).toBe(FX_DISPLAY_CURRENCIES.length);

    const publishResult =
      await fxPricingPublisherService.publishCurrentPricingSnapshot({
        triggeredBy: 'manual',
        now: publishAt,
      });

    expect(publishResult.status).toBe('succeeded');
    expect(publishResult.publishedCount).toBe(FX_DISPLAY_CURRENCIES.length * 2);
    expect(publishResult.snapshotId).toBeTruthy();

    const publishRun = state.pricingPublishRuns.find(
      row => row.id === publishResult.runId
    );
    expect(publishRun?.status).toBe('succeeded');
    expect(publishRun?.fx_fetch_id).toBe(fetchResult.fetchId);

    const eurPrice = state.priceHistory.find(
      row =>
        row.product_variant_id === 'variant-1' &&
        row.currency === 'EUR' &&
        row.starts_at.getTime() === publishAt.getTime() &&
        row.ends_at === null
    );
    expect(eurPrice).toBeDefined();
    expect(eurPrice?.metadata['snapshot_id']).toBe(publishResult.snapshotId);
    expect(eurPrice?.metadata['fx_rate']).toBe(rates['EUR']);
    expect(eurPrice?.metadata['raw_amount']).toBe(
      Number(((1999 / 100) * (rates['EUR'] || 0)).toFixed(8))
    );
    expect(eurPrice?.metadata['rounding_profile']).toBe('standard_2dp');
    expect(eurPrice?.metadata['rounding_rule_version']).toBe('2026-02-v1');
    expect(eurPrice?.metadata['settlement_currency']).toBe('EUR');

    const jpyPrice = state.priceHistory.find(
      row =>
        row.product_variant_id === 'variant-1' &&
        row.currency === 'JPY' &&
        row.starts_at.getTime() === publishAt.getTime() &&
        row.ends_at === null
    );
    expect(jpyPrice).toBeDefined();
    expect(jpyPrice?.metadata['rounding_profile']).toBe('standard_2dp');
    expect(jpyPrice?.metadata['settlement_currency']).toBe('USD');

    const sekPrice = state.priceHistory.find(
      row =>
        row.product_variant_id === 'variant-1' &&
        row.currency === 'SEK' &&
        row.starts_at.getTime() === publishAt.getTime() &&
        row.ends_at === null
    );
    expect(sekPrice).toBeDefined();
    expect(sekPrice?.metadata['settlement_currency']).toBe('EUR');

    const closedUsdSeed = state.priceHistory.find(row => row.id === 'price-usd-seed');
    expect(closedUsdSeed?.ends_at?.toISOString()).toBe(publishAt.toISOString());

    const activeUsdRows = state.priceHistory.filter(
      row =>
        row.product_variant_id === 'variant-1' &&
        row.currency === 'USD' &&
        row.ends_at === null
    );
    expect(activeUsdRows).toHaveLength(1);
    expect(activeUsdRows[0]?.starts_at.toISOString()).toBe(publishAt.toISOString());

    const fixedEurPrice = state.productFixedPriceHistory.find(
      row =>
        row.product_id === 'fixed-product-1' &&
        row.currency === 'EUR' &&
        row.starts_at.getTime() === publishAt.getTime() &&
        row.ends_at === null
    );
    expect(fixedEurPrice).toBeDefined();
    expect(fixedEurPrice?.metadata['snapshot_id']).toBe(publishResult.snapshotId);
    expect(fixedEurPrice?.metadata['catalog_mode']).toBe('fixed_product');
  });
});
