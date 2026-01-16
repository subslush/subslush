import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { storage, STORAGE_KEYS } from '$lib/utils/storage';
import {
  detectCurrencyFromLocale,
  getCurrencyCookie,
  normalizeCurrencyCode,
  resolvePreferredCurrency,
  setCurrencyCookie,
  type SupportedCurrency
} from '$lib/utils/currency';

const DEFAULT_CURRENCY: SupportedCurrency = 'USD';

const resolveBrowserCurrency = (): SupportedCurrency => {
  if (!browser) return DEFAULT_CURRENCY;

  const stored = normalizeCurrencyCode(storage.get(STORAGE_KEYS.PREFERRED_CURRENCY));
  if (stored) return stored;

  const cookieCurrency = getCurrencyCookie(document.cookie);
  if (cookieCurrency) return cookieCurrency;

  const localeCurrency = detectCurrencyFromLocale(navigator.language);
  if (localeCurrency) return localeCurrency;

  return DEFAULT_CURRENCY;
};

const initialCurrency = browser ? resolveBrowserCurrency() : DEFAULT_CURRENCY;
const { subscribe, set: setStore } = writable<SupportedCurrency>(initialCurrency);

const persistCurrency = (currency: SupportedCurrency) => {
  if (!browser) return;
  storage.set(STORAGE_KEYS.PREFERRED_CURRENCY, currency);
  setCurrencyCookie(currency);
};

export const currency = {
  subscribe,
  set: (value: string, options?: { persist?: boolean }) => {
    const normalized = normalizeCurrencyCode(value) || DEFAULT_CURRENCY;
    setStore(normalized);
    if (options?.persist !== false) {
      persistCurrency(normalized);
    }
  }
};

export const initializeCurrency = (value?: string | null) => {
  const preferred = resolvePreferredCurrency({
    serverCurrency: value || null,
    cookieCurrency: browser ? getCurrencyCookie(document.cookie) : null,
    localeCurrency: browser ? detectCurrencyFromLocale(navigator.language) : null,
    fallback: DEFAULT_CURRENCY
  });

  currency.set(preferred);
};
