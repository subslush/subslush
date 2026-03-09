import { catalogService } from './catalogService';
import { resolveSettlementCurrency } from './fx/fxSettlement';
import { normalizeCurrencyCode } from '../utils/currency';
import type { PriceHistory } from '../types/catalog';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

const parseSnapshotId = (
  metadata: Record<string, unknown> | null | undefined
): string | null => {
  const raw = normalizeString(metadata?.['snapshot_id']);
  if (!raw || !UUID_PATTERN.test(raw)) {
    return null;
  }
  return raw.toLowerCase();
};

const resolveCurrency = (value: string): string => {
  return normalizeCurrencyCode(value) || value.trim().toUpperCase();
};

const parsePositiveCents = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.round(value);
  return normalized > 0 ? normalized : null;
};

export type PricingLockContext = {
  snapshotId: string;
  displayCurrency: string;
  displayBasePriceCents: number;
  settlementCurrency: string;
  settlementBasePriceCents: number;
};

export async function resolvePricingLockContext(params: {
  variantId: string;
  displayCurrency: string;
  displayPrice: PriceHistory;
  atDate?: Date;
}): Promise<PricingLockContext | null> {
  const displayCurrency = resolveCurrency(params.displayCurrency);
  const displayBasePriceCents = parsePositiveCents(params.displayPrice.price_cents);
  if (!displayCurrency || !displayBasePriceCents) {
    return null;
  }

  const displayMetadata =
    params.displayPrice.metadata &&
    typeof params.displayPrice.metadata === 'object'
      ? (params.displayPrice.metadata as Record<string, unknown>)
      : null;
  const displaySnapshotId = parseSnapshotId(displayMetadata);
  const settlementCurrencyRaw = normalizeString(
    displayMetadata?.['settlement_currency']
  );
  const settlementCurrency = settlementCurrencyRaw
    ? resolveCurrency(settlementCurrencyRaw)
    : resolveSettlementCurrency(displayCurrency);

  let settlementPrice = params.displayPrice;
  if (settlementCurrency !== displayCurrency) {
    const fallbackAtDate = params.displayPrice.starts_at
      ? new Date(params.displayPrice.starts_at)
      : new Date();
    const fetchedSettlement = await catalogService.getCurrentPriceForCurrency({
      variantId: params.variantId,
      currency: settlementCurrency,
      atDate: params.atDate ?? fallbackAtDate,
    });
    if (!fetchedSettlement) {
      return null;
    }
    settlementPrice = fetchedSettlement;
  }

  const settlementMetadata =
    settlementPrice.metadata && typeof settlementPrice.metadata === 'object'
      ? (settlementPrice.metadata as Record<string, unknown>)
      : null;
  const settlementSnapshotId = parseSnapshotId(settlementMetadata);
  if (displaySnapshotId && settlementSnapshotId) {
    if (displaySnapshotId !== settlementSnapshotId) {
      return null;
    }
  }

  const snapshotId = displaySnapshotId || settlementSnapshotId;
  if (!snapshotId) {
    return null;
  }

  const settlementBasePriceCents = parsePositiveCents(settlementPrice.price_cents);
  if (!settlementBasePriceCents) {
    return null;
  }

  return {
    snapshotId,
    displayCurrency,
    displayBasePriceCents,
    settlementCurrency,
    settlementBasePriceCents,
  };
}
