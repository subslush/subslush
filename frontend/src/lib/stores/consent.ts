import { browser } from '$app/environment';
import { get, writable } from 'svelte/store';

export type ConsentPreferences = {
  analytics: boolean;
  marketing: boolean;
};

export type ConsentDecision = 'accept_all' | 'reject_non_essential' | 'custom';

export type ConsentState = {
  version: string;
  updatedAt: string;
  decision: ConsentDecision;
  preferences: ConsentPreferences;
};

const CONSENT_VERSION = '2026-02-05';
const STORAGE_KEY = 'subslush_cookie_consent';

const defaultPreferences: ConsentPreferences = {
  analytics: false,
  marketing: false
};

const normalizePreferences = (
  input?: Partial<ConsentPreferences> | null
): ConsentPreferences => ({
  analytics: Boolean(input?.analytics),
  marketing: Boolean(input?.marketing)
});

const loadConsent = (): ConsentState | null => {
  if (!browser) return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (!parsed || parsed.version !== CONSENT_VERSION) {
      return null;
    }
    return {
      version: parsed.version,
      updatedAt: parsed.updatedAt,
      decision: parsed.decision || 'custom',
      preferences: normalizePreferences(parsed.preferences)
    };
  } catch {
    return null;
  }
};

const persistConsent = (state: ConsentState): void => {
  if (!browser) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const consentStore = writable<ConsentState | null>(null);
export const consentReady = writable(false);

export const consentUi = writable<{ isOpen: boolean; showPreferences: boolean }>(
  { isOpen: false, showPreferences: false }
);

export const initConsent = (): void => {
  consentStore.set(loadConsent());
  consentReady.set(true);
};

const saveConsent = (
  preferences: ConsentPreferences,
  decision: ConsentDecision
): void => {
  const state: ConsentState = {
    version: CONSENT_VERSION,
    updatedAt: new Date().toISOString(),
    decision,
    preferences: normalizePreferences(preferences)
  };
  consentStore.set(state);
  consentReady.set(true);
  persistConsent(state);
};

export const acceptAll = (): void => {
  saveConsent(
    { analytics: true, marketing: true },
    'accept_all'
  );
  closeConsentPreferences();
};

export const rejectNonEssential = (): void => {
  saveConsent(
    { analytics: false, marketing: false },
    'reject_non_essential'
  );
  closeConsentPreferences();
};

export const updateConsent = (preferences: ConsentPreferences): void => {
  saveConsent(preferences, 'custom');
  closeConsentPreferences();
};

export const openConsentPreferences = (): void => {
  consentUi.set({ isOpen: true, showPreferences: true });
};

export const closeConsentPreferences = (): void => {
  consentUi.set({ isOpen: false, showPreferences: false });
};

export const hasAnalyticsConsent = (): boolean => {
  if (!browser) return false;
  return Boolean(get(consentStore)?.preferences.analytics);
};

export const hasMarketingConsent = (): boolean => {
  if (!browser) return false;
  return Boolean(get(consentStore)?.preferences.marketing);
};

export const getConsentSnapshot = (): ConsentState | null => {
  return get(consentStore);
};
