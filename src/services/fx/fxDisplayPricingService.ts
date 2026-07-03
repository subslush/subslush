import { getDatabasePool } from '../../config/database';
import {
  normalizeCurrencyCode,
  type SupportedCurrency,
} from '../../utils/currency';
import { Logger } from '../../utils/logger';
import { FX_BASE_CURRENCY } from './fxConfig';
import { applyPsychologicalRounding, roundedAmountToCents } from './fxRounding';

export type FxDisplayPrice = {
  priceCents: number;
  currency: SupportedCurrency;
  fxRate: number;
  metadata: Record<string, unknown>;
};

type FxRateCacheRow = {
  rate: string | number;
  fetched_at: Date | string | null;
  stale_after: Date | string | null;
  is_lkg: boolean | null;
  source_fetch_id: string | null;
};

class FxDisplayPricingService {
  private readonly rateCache = new Map<
    string,
    Promise<FxRateCacheRow | null>
  >();

  async convertUsdCentsToDisplayCurrency(params: {
    usdCents: number;
    currency: string;
  }): Promise<FxDisplayPrice | null> {
    const currency = normalizeCurrencyCode(params.currency);
    const usdCents = Number(params.usdCents);
    if (!currency || !Number.isInteger(usdCents) || usdCents < 0) {
      return null;
    }

    if (currency === FX_BASE_CURRENCY) {
      return {
        priceCents: usdCents,
        currency,
        fxRate: 1,
        metadata: {
          source: 'fx_display_pricing_base_currency',
          fx_rate: 1,
        },
      };
    }

    const rateRow = await this.getUsdRate(currency);
    const fxRate = Number(rateRow?.rate);
    if (!Number.isFinite(fxRate) || fxRate <= 0) {
      return null;
    }

    const rawAmount = (usdCents / 100) * fxRate;
    const rounded = applyPsychologicalRounding({
      amount: rawAmount,
      currency,
    });
    const priceCents = roundedAmountToCents({
      roundedAmount: rounded.roundedAmount,
      profile: rounded.profile,
    });

    return {
      priceCents,
      currency,
      fxRate,
      metadata: {
        source: 'fx_display_pricing_rate_cache',
        fx_rate: fxRate,
        raw_amount: Number(rawAmount.toFixed(8)),
        rounding_profile: rounded.profile,
        fx_fetched_at: rateRow?.fetched_at ?? null,
        fx_stale_after: rateRow?.stale_after ?? null,
        fx_is_lkg: Boolean(rateRow?.is_lkg),
        fx_source_fetch_id: rateRow?.source_fetch_id ?? null,
      },
    };
  }

  private async getUsdRate(
    currency: SupportedCurrency
  ): Promise<FxRateCacheRow | null> {
    const cached = this.rateCache.get(currency);
    if (cached) {
      return cached;
    }

    const lookup = this.loadUsdRate(currency);
    this.rateCache.set(currency, lookup);
    return lookup;
  }

  private async loadUsdRate(
    currency: SupportedCurrency
  ): Promise<FxRateCacheRow | null> {
    try {
      const pool = getDatabasePool();
      const result = await pool.query(
        `SELECT rate, fetched_at, stale_after, is_lkg, source_fetch_id
         FROM fx_rate_cache
         WHERE base_currency = $1
           AND quote_currency = $2
         LIMIT 1`,
        [FX_BASE_CURRENCY, currency]
      );

      return result.rows[0] || null;
    } catch (error) {
      Logger.error('Failed to load FX display rate', {
        currency,
        error,
      });
      return null;
    }
  }
}

export const fxDisplayPricingService = new FxDisplayPricingService();
