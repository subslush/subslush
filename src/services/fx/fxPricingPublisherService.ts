import type { PoolClient } from 'pg';
import { getDatabasePool } from '../../config/database';
import { env } from '../../config/environment';
import { Logger } from '../../utils/logger';
import {
  FX_BASE_CURRENCY,
  FX_DISPLAY_CURRENCIES,
  FX_ROUNDING_RULE_VERSION_DEFAULT,
} from './fxConfig';
import {
  applyPsychologicalRounding,
  roundedAmountToCents,
} from './fxRounding';
import { resolveSettlementCurrency } from './fxSettlement';

type PublishStatus = 'succeeded' | 'failed' | 'skipped';

type PublishOutcome = {
  status: PublishStatus;
  runId: string;
  snapshotId: string;
  publishedCount: number;
  reason?: string;
};

type CachedRateRow = {
  quote_currency: string;
  rate: string | number;
  fetched_at: Date;
  stale_after: Date | null;
  is_lkg: boolean;
  source_fetch_id: string | null;
};

type BaseVariantPriceRow = {
  product_variant_id: string;
  usd_price_cents: number;
};

type BaseFixedProductPriceRow = {
  product_id: string;
  usd_price_cents: number;
};

type ValidationResult =
  | {
      ok: true;
      rates: Map<string, number>;
      latestFetchId: string | null;
    }
  | {
      ok: false;
      reason: string;
      latestFetchId: string | null;
    };

function toFiniteRate(value: string | number): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export class FxPricingPublisherService {
  async publishCurrentPricingSnapshot(params?: {
    triggeredBy?: 'scheduler' | 'manual' | 'system';
    now?: Date;
  }): Promise<PublishOutcome> {
    const now = params?.now ?? new Date();
    const triggeredBy = params?.triggeredBy ?? 'scheduler';
    const pool = getDatabasePool();

    const runInsert = await pool.query(
      `INSERT INTO pricing_publish_runs (status, triggered_by, metadata)
       VALUES ('started', $1, '{}'::jsonb)
       RETURNING id, snapshot_id`,
      [triggeredBy]
    );

    const runId = runInsert.rows[0]?.id as string;
    const snapshotId = runInsert.rows[0]?.snapshot_id as string;

    const client = await pool.connect();
    let transactionOpen = false;

    try {
      await client.query('BEGIN');
      transactionOpen = true;

      const validation = await this.validateRates(client, now);
      if (!validation.ok) {
        await client.query('ROLLBACK');
        transactionOpen = false;

        await this.updateRunStatus({
          runId,
          status: 'skipped',
          reason: validation.reason,
          latestFetchId: validation.latestFetchId,
          metadata: {
            snapshot_id: snapshotId,
            reason: validation.reason,
          },
        });

        Logger.warn('FX pricing publish skipped', {
          runId,
          snapshotId,
          reason: validation.reason,
        });

        return {
          status: 'skipped',
          runId,
          snapshotId,
          publishedCount: 0,
          reason: validation.reason,
        };
      }

      const [variantBasePrices, fixedProductBasePrices] = await Promise.all([
        this.loadCurrentUsdVariantBasePrices(client, now),
        this.loadCurrentUsdFixedProductBasePrices(client),
      ]);
      if (variantBasePrices.length === 0 && fixedProductBasePrices.length === 0) {
        await client.query('ROLLBACK');
        transactionOpen = false;

        const reason = 'no_active_usd_base_prices';
        await this.updateRunStatus({
          runId,
          status: 'skipped',
          reason,
          latestFetchId: validation.latestFetchId,
          metadata: {
            snapshot_id: snapshotId,
            reason,
          },
        });

        return {
          status: 'skipped',
          runId,
          snapshotId,
          publishedCount: 0,
          reason,
        };
      }

      let publishedCount = 0;
      let variantPublishedCount = 0;
      let fixedProductPublishedCount = 0;
      const roundingRuleVersion =
        env.FX_ROUNDING_RULE_VERSION || FX_ROUNDING_RULE_VERSION_DEFAULT;

      const sortedVariantBasePrices = [...variantBasePrices].sort((a, b) =>
        a.product_variant_id.localeCompare(b.product_variant_id)
      );
      const sortedFixedProductBasePrices = [...fixedProductBasePrices].sort(
        (a, b) => a.product_id.localeCompare(b.product_id)
      );

      for (const basePrice of sortedVariantBasePrices) {
        for (const displayCurrency of FX_DISPLAY_CURRENCIES) {
          const fxRate =
            displayCurrency === FX_BASE_CURRENCY
              ? 1
              : validation.rates.get(displayCurrency);
          if (!fxRate || !Number.isFinite(fxRate) || fxRate <= 0) {
            continue;
          }

          const rawAmount = (basePrice.usd_price_cents / 100) * fxRate;
          const rounded = applyPsychologicalRounding({
            amount: rawAmount,
            currency: displayCurrency,
          });
          const roundedCents = roundedAmountToCents({
            roundedAmount: rounded.roundedAmount,
            profile: rounded.profile,
          });
          const settlementCurrency = resolveSettlementCurrency(displayCurrency);

          const metadata = {
            snapshot_id: snapshotId,
            catalog_mode: 'variant',
            fx_rate: fxRate,
            raw_amount: Number(rawAmount.toFixed(8)),
            rounding_profile: rounded.profile,
            rounding_rule_version: roundingRuleVersion,
            settlement_currency: settlementCurrency,
          };

          await this.replaceCurrentPrice(client, {
            variantId: basePrice.product_variant_id,
            currency: displayCurrency,
            priceCents: roundedCents,
            startsAt: now,
            metadata,
          });

          publishedCount += 1;
          variantPublishedCount += 1;
        }
      }

      for (const basePrice of sortedFixedProductBasePrices) {
        for (const displayCurrency of FX_DISPLAY_CURRENCIES) {
          const fxRate =
            displayCurrency === FX_BASE_CURRENCY
              ? 1
              : validation.rates.get(displayCurrency);
          if (!fxRate || !Number.isFinite(fxRate) || fxRate <= 0) {
            continue;
          }

          const rawAmount = (basePrice.usd_price_cents / 100) * fxRate;
          const rounded = applyPsychologicalRounding({
            amount: rawAmount,
            currency: displayCurrency,
          });
          const roundedCents = roundedAmountToCents({
            roundedAmount: rounded.roundedAmount,
            profile: rounded.profile,
          });
          const settlementCurrency = resolveSettlementCurrency(displayCurrency);

          const metadata = {
            snapshot_id: snapshotId,
            catalog_mode: 'fixed_product',
            fx_rate: fxRate,
            raw_amount: Number(rawAmount.toFixed(8)),
            rounding_profile: rounded.profile,
            rounding_rule_version: roundingRuleVersion,
            settlement_currency: settlementCurrency,
          };

          await this.replaceCurrentFixedProductPrice(client, {
            productId: basePrice.product_id,
            currency: displayCurrency,
            priceCents: roundedCents,
            startsAt: now,
            metadata,
          });

          publishedCount += 1;
          fixedProductPublishedCount += 1;
        }
      }

      await client.query(
        `UPDATE pricing_publish_runs
         SET status = 'succeeded',
             fx_fetch_id = $2,
             published_at = $3,
             reason = NULL,
             metadata = COALESCE(metadata, '{}'::jsonb) || $4::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [
          runId,
          validation.latestFetchId,
          now,
          JSON.stringify({
            snapshot_id: snapshotId,
            published_count: publishedCount,
            published_variant_count: variantPublishedCount,
            published_fixed_product_count: fixedProductPublishedCount,
            display_currencies: FX_DISPLAY_CURRENCIES,
          }),
        ]
      );

      await client.query('COMMIT');
      transactionOpen = false;

      Logger.info('FX pricing publish succeeded', {
        runId,
        snapshotId,
        publishedCount,
      });

      return {
        status: 'succeeded',
        runId,
        snapshotId,
        publishedCount,
      };
    } catch (error) {
      if (transactionOpen) {
        await client.query('ROLLBACK');
        transactionOpen = false;
      }

      const reason =
        error instanceof Error ? error.message : 'pricing_publish_failed';
      Logger.error('FX pricing publish failed', {
        runId,
        snapshotId,
        error,
      });

      await this.updateRunStatus({
        runId,
        status: 'failed',
        reason,
        latestFetchId: null,
        metadata: {
          snapshot_id: snapshotId,
          reason,
        },
      });

      return {
        status: 'failed',
        runId,
        snapshotId,
        publishedCount: 0,
        reason,
      };
    } finally {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          Logger.error('Failed to rollback FX publish transaction', rollbackError);
        }
      }
      client.release();
    }
  }

  async getDiagnostics(): Promise<{
    latestFetch: Record<string, any> | null;
    latestPublishRun: Record<string, any> | null;
    latestPublishedSnapshot: Record<string, any> | null;
  }> {
    try {
      const pool = getDatabasePool();
      const [fetchResult, runResult, snapshotResult] = await Promise.all([
        pool.query(
          `SELECT *
           FROM fx_rate_fetches
           ORDER BY created_at DESC
           LIMIT 1`
        ),
        pool.query(
          `SELECT *
           FROM pricing_publish_runs
           ORDER BY created_at DESC
           LIMIT 1`
        ),
        pool.query(
          `SELECT *
           FROM pricing_publish_runs
           WHERE status = 'succeeded'
           ORDER BY published_at DESC NULLS LAST, created_at DESC
           LIMIT 1`
        ),
      ]);

      return {
        latestFetch: fetchResult.rows[0] || null,
        latestPublishRun: runResult.rows[0] || null,
        latestPublishedSnapshot: snapshotResult.rows[0] || null,
      };
    } catch (error) {
      Logger.error('Failed to read FX diagnostics', error);
      return {
        latestFetch: null,
        latestPublishRun: null,
        latestPublishedSnapshot: null,
      };
    }
  }

  private async validateRates(
    client: PoolClient,
    now: Date
  ): Promise<ValidationResult> {
    const latestFetchResult = await client.query(
      `SELECT id
       FROM fx_rate_fetches
       WHERE status = 'success'
       ORDER BY fetch_completed_at DESC NULLS LAST, created_at DESC
       LIMIT 1`
    );
    const latestFetchId = (latestFetchResult.rows[0]?.id as string) || null;

    const currencies = FX_DISPLAY_CURRENCIES.filter(
      currency => currency !== FX_BASE_CURRENCY
    );
    const rows = await client.query(
      `SELECT quote_currency, rate, fetched_at, stale_after, is_lkg, source_fetch_id
       FROM fx_rate_cache
       WHERE base_currency = $1
         AND quote_currency = ANY($2::text[])`,
      [FX_BASE_CURRENCY, currencies]
    );

    const rateMap = new Map<string, CachedRateRow>();
    for (const row of rows.rows as CachedRateRow[]) {
      rateMap.set(String(row.quote_currency).toUpperCase(), row);
    }

    const numericRates = new Map<string, number>();
    numericRates.set(FX_BASE_CURRENCY, 1);

    const maxAgeMs = env.FX_RATE_STALE_MINUTES * 60 * 1000;

    for (const currency of currencies) {
      const row = rateMap.get(currency);
      if (!row) {
        return {
          ok: false,
          reason: `missing_fx_rate_${currency}`,
          latestFetchId,
        };
      }

      const rate = toFiniteRate(row.rate);
      if (!rate) {
        return {
          ok: false,
          reason: `invalid_fx_rate_${currency}`,
          latestFetchId,
        };
      }

      const fetchedAtMs = new Date(row.fetched_at).getTime();
      const staleAfterMs = row.stale_after
        ? new Date(row.stale_after).getTime()
        : fetchedAtMs + maxAgeMs;
      const nowMs = now.getTime();

      if (
        nowMs - fetchedAtMs > maxAgeMs ||
        staleAfterMs <= nowMs ||
        nowMs - fetchedAtMs > env.FX_RATE_MAX_STALE_MINUTES * 60 * 1000
      ) {
        return {
          ok: false,
          reason: `stale_fx_rate_${currency}`,
          latestFetchId,
        };
      }

      numericRates.set(currency, rate);
    }

    return {
      ok: true,
      rates: numericRates,
      latestFetchId,
    };
  }

  private async loadCurrentUsdVariantBasePrices(
    client: PoolClient,
    atDate: Date
  ): Promise<BaseVariantPriceRow[]> {
    const result = await client.query(
      `SELECT pv.id AS product_variant_id,
              ph.price_cents AS usd_price_cents
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       JOIN LATERAL (
         SELECT price_cents
         FROM price_history
         WHERE product_variant_id = pv.id
           AND UPPER(currency) = $1
           AND starts_at <= $2
           AND (ends_at IS NULL OR ends_at > $2)
         ORDER BY starts_at DESC
         LIMIT 1
       ) ph ON TRUE
       WHERE p.status = 'active'
         AND pv.is_active = TRUE`,
      [FX_BASE_CURRENCY, atDate]
    );

    return result.rows.map((row: any) => ({
      product_variant_id: row.product_variant_id,
      usd_price_cents: Number(row.usd_price_cents),
    }));
  }

  private async loadCurrentUsdFixedProductBasePrices(
    client: PoolClient
  ): Promise<BaseFixedProductPriceRow[]> {
    const result = await client.query(
      `SELECT p.id AS product_id,
              p.fixed_price_cents AS usd_price_cents
       FROM products p
       LEFT JOIN product_variants pv
         ON pv.product_id = p.id
        AND pv.is_active = TRUE
       WHERE p.status = 'active'
         AND p.duration_months IS NOT NULL
         AND p.fixed_price_cents IS NOT NULL
         AND p.fixed_price_cents >= 0
         AND p.fixed_price_currency IS NOT NULL
         AND UPPER(p.fixed_price_currency) = $1
         AND pv.id IS NULL`,
      [FX_BASE_CURRENCY]
    );

    return result.rows.map((row: any) => ({
      product_id: row.product_id,
      usd_price_cents: Number(row.usd_price_cents),
    }));
  }

  private async replaceCurrentPrice(
    client: PoolClient,
    params: {
      variantId: string;
      currency: string;
      priceCents: number;
      startsAt: Date;
      metadata: Record<string, any>;
    }
  ): Promise<void> {
    await client.query(
      `UPDATE price_history
       SET ends_at = $1
       WHERE product_variant_id = $2
         AND UPPER(currency) = $3
         AND starts_at < $1
         AND (ends_at IS NULL OR ends_at > $1)`,
      [params.startsAt, params.variantId, params.currency]
    );

    await client.query(
      `INSERT INTO price_history (
         product_variant_id,
         price_cents,
         currency,
         starts_at,
         ends_at,
         metadata
       ) VALUES ($1, $2, $3, $4, NULL, $5::jsonb)`,
      [
        params.variantId,
        params.priceCents,
        params.currency,
        params.startsAt,
        JSON.stringify(params.metadata),
      ]
    );
  }

  private async replaceCurrentFixedProductPrice(
    client: PoolClient,
    params: {
      productId: string;
      currency: string;
      priceCents: number;
      startsAt: Date;
      metadata: Record<string, any>;
    }
  ): Promise<void> {
    await client.query(
      `UPDATE product_fixed_price_history
       SET ends_at = $1
       WHERE product_id = $2
         AND UPPER(currency) = $3
         AND starts_at < $1
         AND (ends_at IS NULL OR ends_at > $1)`,
      [params.startsAt, params.productId, params.currency]
    );

    await client.query(
      `INSERT INTO product_fixed_price_history (
         product_id,
         price_cents,
         currency,
         starts_at,
         ends_at,
         metadata
       ) VALUES ($1, $2, $3, $4, NULL, $5::jsonb)
       ON CONFLICT (product_id, currency, starts_at)
       DO UPDATE SET
         price_cents = EXCLUDED.price_cents,
         ends_at = EXCLUDED.ends_at,
         metadata = EXCLUDED.metadata`,
      [
        params.productId,
        params.priceCents,
        params.currency,
        params.startsAt,
        JSON.stringify(params.metadata),
      ]
    );
  }

  private async updateRunStatus(params: {
    runId: string;
    status: 'failed' | 'skipped';
    reason: string;
    latestFetchId: string | null;
    metadata: Record<string, any>;
  }): Promise<void> {
    const { runId, status, reason, latestFetchId, metadata } = params;
    const pool = getDatabasePool();
    await pool.query(
      `UPDATE pricing_publish_runs
       SET status = $2,
           fx_fetch_id = $3,
           reason = $4,
           metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [runId, status, latestFetchId, reason.slice(0, 1000), JSON.stringify(metadata)]
    );
  }
}

export const fxPricingPublisherService = new FxPricingPublisherService();
