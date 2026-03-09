import {
  FX_DISPLAY_CURRENCIES,
  FX_EUR_SETTLEMENT_BUCKET,
  FX_USD_SETTLEMENT_BUCKET,
  type FxDisplayCurrency,
} from './fxConfig';

const DISPLAY_CURRENCY_SET = new Set<string>(FX_DISPLAY_CURRENCIES);

export function isSupportedDisplayCurrency(
  currency: string
): currency is FxDisplayCurrency {
  return DISPLAY_CURRENCY_SET.has(currency);
}

export function resolveSettlementCurrency(displayCurrency: string): string {
  const normalized = displayCurrency.trim().toUpperCase();

  if (FX_EUR_SETTLEMENT_BUCKET.has(normalized)) {
    return 'EUR';
  }

  if (FX_USD_SETTLEMENT_BUCKET.has(normalized)) {
    return 'USD';
  }

  if (DISPLAY_CURRENCY_SET.has(normalized)) {
    return normalized;
  }

  return 'USD';
}
