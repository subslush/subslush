import { getDatabasePool } from '../../config/database';
import { env } from '../../config/environment';
import { Logger } from '../../utils/logger';
import { FX_BASE_CURRENCY } from './fxConfig';

type FxRateMap = Record<string, number>;

type CurrencyApiResponse = {
  meta?: {
    last_updated_at?: string;
  };
  data?: Record<string, { code?: string; value?: number }>;
};

export type FxFetchStatus = 'success' | 'failed' | 'skipped';

export type FxFetchResult = {
  status: FxFetchStatus;
  fetchId: string | null;
  rateCount: number;
  reason?: string;
};

function toUpper(value: string): string {
  return value.trim().toUpperCase();
}

function extractRates(payload: CurrencyApiResponse): FxRateMap {
  const rates: FxRateMap = {
    [FX_BASE_CURRENCY]: 1,
  };

  if (!payload?.data || typeof payload.data !== 'object') {
    return rates;
  }

  for (const [key, raw] of Object.entries(payload.data)) {
    const code = toUpper(raw?.code || key);
    const value = Number(raw?.value);
    if (!Number.isFinite(value) || value <= 0) {
      continue;
    }
    rates[code] = value;
  }

  return rates;
}

function buildCurrencyApiUrl(): string {
  const base = 'https://api.currencyapi.com/v3/latest';
  const url = new URL(base);
  url.searchParams.set('apikey', env.CURRENCYAPI_KEY);
  url.searchParams.set('base_currency', FX_BASE_CURRENCY);
  return url.toString();
}

export class FxRateService {
  async fetchAndCacheLatestUsdRates(now: Date = new Date()): Promise<FxFetchResult> {
    if (!env.FX_ENGINE_ENABLED) {
      return this.recordSkippedFetch('fx_engine_disabled', now);
    }

    if (!env.CURRENCYAPI_KEY) {
      return this.recordSkippedFetch('currencyapi_key_missing', now);
    }

    const fetchStartedAt = now;
    let responseStatus: number | null = null;

    try {
      const response = await fetch(buildCurrencyApiUrl(), {
        headers: {
          Accept: 'application/json',
        },
      });
      responseStatus = response.status;

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `currencyapi_request_failed status=${response.status} body=${errorBody.slice(0, 300)}`
        );
      }

      const payload = (await response.json()) as CurrencyApiResponse;
      const rates = extractRates(payload);
      const rateEntries = Object.entries(rates);

      if (rateEntries.length === 0) {
        throw new Error('currencyapi_empty_rates');
      }

      const staleAfter = new Date(
        now.getTime() + env.FX_RATE_STALE_MINUTES * 60 * 1000
      );

      const pool = getDatabasePool();
      const client = await pool.connect();
      let transactionOpen = false;

      try {
        await client.query('BEGIN');
        transactionOpen = true;

        const fetchInsert = await client.query(
          `INSERT INTO fx_rate_fetches (
             source, base_currency, status, fetch_started_at, fetch_completed_at,
             http_status, rates_count, is_success, metadata
           ) VALUES ($1, $2, 'success', $3, $4, $5, $6, TRUE, $7::jsonb)
           RETURNING id`,
          [
            'currencyapi',
            FX_BASE_CURRENCY,
            fetchStartedAt,
            now,
            responseStatus,
            rateEntries.length,
            JSON.stringify({
              provider_meta: payload.meta || null,
            }),
          ]
        );

        const fetchId = fetchInsert.rows[0]?.id as string;

        for (const [quoteCurrency, rate] of rateEntries) {
          await client.query(
            `INSERT INTO fx_rate_cache (
               base_currency,
               quote_currency,
               rate,
               fetched_at,
               source_fetch_id,
               is_lkg,
               stale_after,
               metadata
             ) VALUES ($1, $2, $3, $4, $5, FALSE, $6, $7::jsonb)
             ON CONFLICT (base_currency, quote_currency)
             DO UPDATE SET
               rate = EXCLUDED.rate,
               fetched_at = EXCLUDED.fetched_at,
               source_fetch_id = EXCLUDED.source_fetch_id,
               is_lkg = FALSE,
               stale_after = EXCLUDED.stale_after,
               metadata = EXCLUDED.metadata,
               updated_at = NOW()`,
            [
              FX_BASE_CURRENCY,
              quoteCurrency,
              rate,
              now,
              fetchId,
              staleAfter,
              JSON.stringify({
                source: 'currencyapi',
              }),
            ]
          );
        }

        await client.query(
          `UPDATE fx_rate_cache
           SET is_lkg = TRUE,
               updated_at = NOW()
           WHERE base_currency = $1
             AND quote_currency <> ALL($2::text[])
             AND source_fetch_id IS DISTINCT FROM $3`,
          [
            FX_BASE_CURRENCY,
            rateEntries.map(([code]) => code),
            fetchId,
          ]
        );

        await client.query('COMMIT');
        transactionOpen = false;

        Logger.info('FX fetch completed', {
          fetchId,
          rateCount: rateEntries.length,
          staleAfter: staleAfter.toISOString(),
        });

        return {
          status: 'success',
          fetchId,
          rateCount: rateEntries.length,
        };
      } catch (error) {
        if (transactionOpen) {
          await client.query('ROLLBACK');
          transactionOpen = false;
        }
        throw error;
      } finally {
        if (transactionOpen) {
          try {
            await client.query('ROLLBACK');
          } catch (rollbackError) {
            Logger.error('Failed to rollback FX fetch transaction', rollbackError);
          }
        }
        client.release();
      }
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'currencyapi_fetch_failed';
      Logger.error('FX fetch failed', {
        error,
      });

      const fetchId = await this.recordFailedFetch({
        now,
        fetchStartedAt,
        responseStatus,
        reason,
      });

      await this.markCacheAsLkg(now);

      return {
        status: 'failed',
        fetchId,
        rateCount: 0,
        reason,
      };
    }
  }

  async getLatestFetchDiagnostics(): Promise<Record<string, any> | null> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `SELECT *
         FROM fx_rate_fetches
         ORDER BY created_at DESC
         LIMIT 1`
      );
      return result.rows[0] || null;
    } catch (error) {
      Logger.error('Failed to fetch FX diagnostics', error);
      return null;
    }
  }

  private async markCacheAsLkg(now: Date): Promise<void> {
    try {
      const pool = getDatabasePool();
      await pool.query(
        `UPDATE fx_rate_cache
         SET is_lkg = TRUE,
             updated_at = $2
         WHERE base_currency = $1`,
        [FX_BASE_CURRENCY, now]
      );
    } catch (error) {
      Logger.error('Failed to mark FX cache as LKG', error);
    }
  }

  private async recordSkippedFetch(
    reason: string,
    now: Date
  ): Promise<FxFetchResult> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `INSERT INTO fx_rate_fetches (
           source, base_currency, status, fetch_started_at, fetch_completed_at,
           is_success, error_code, error_message, metadata
         ) VALUES ($1, $2, 'skipped', $3, $4, FALSE, $5, $6, '{}'::jsonb)
         RETURNING id`,
        ['currencyapi', FX_BASE_CURRENCY, now, now, reason, reason]
      );
      return {
        status: 'skipped',
        fetchId: result.rows[0]?.id || null,
        rateCount: 0,
        reason,
      };
    } catch (error) {
      Logger.error('Failed to record skipped FX fetch', error);
      return {
        status: 'skipped',
        fetchId: null,
        rateCount: 0,
        reason,
      };
    }
  }

  private async recordFailedFetch(params: {
    now: Date;
    fetchStartedAt: Date;
    responseStatus: number | null;
    reason: string;
  }): Promise<string | null> {
    const { now, fetchStartedAt, responseStatus, reason } = params;
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `INSERT INTO fx_rate_fetches (
           source, base_currency, status, fetch_started_at, fetch_completed_at,
           http_status, rates_count, is_success, error_code, error_message, metadata
         ) VALUES ($1, $2, 'failed', $3, $4, $5, 0, FALSE, $6, $7, '{}'::jsonb)
         RETURNING id`,
        [
          'currencyapi',
          FX_BASE_CURRENCY,
          fetchStartedAt,
          now,
          responseStatus,
          'currencyapi_fetch_failed',
          reason.slice(0, 512),
        ]
      );
      return result.rows[0]?.id || null;
    } catch (error) {
      Logger.error('Failed to persist failed FX fetch', error);
      return null;
    }
  }
}

export const fxRateService = new FxRateService();
