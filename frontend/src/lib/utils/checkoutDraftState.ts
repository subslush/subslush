import { browser } from '$app/environment';

export const CHECKOUT_DRAFT_STORAGE_KEY = 'checkout_draft_state';

export interface CheckoutDraftLegalConsentState {
  immediateFulfillmentConsent: boolean;
  termsPolicyConsent: boolean;
}

export interface CheckoutDraftState {
  email?: string;
  guestIdentityId?: string | null;
  checkoutSessionKey?: string | null;
  orderId?: string | null;
  appliedCouponCode?: string | null;
  selectedPaymentCountry?: string | null;
  legalConsent?: CheckoutDraftLegalConsentState | null;
}

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
};

export const loadCheckoutDraftState = (): CheckoutDraftState | null => {
  if (!browser) {
    return null;
  }

  try {
    const raw = localStorage.getItem(CHECKOUT_DRAFT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed =
      raw && typeof raw === 'string'
        ? (JSON.parse(raw) as Record<string, unknown>)
        : null;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const legalConsent =
      parsed.legalConsent && typeof parsed.legalConsent === 'object'
        ? {
            immediateFulfillmentConsent:
              (parsed.legalConsent as Record<string, unknown>)
                .immediateFulfillmentConsent === true,
            termsPolicyConsent:
              (parsed.legalConsent as Record<string, unknown>)
                .termsPolicyConsent === true,
          }
        : null;

    return {
      email: normalizeString(parsed.email) ?? undefined,
      guestIdentityId: normalizeString(parsed.guestIdentityId),
      checkoutSessionKey: normalizeString(parsed.checkoutSessionKey),
      orderId: normalizeString(parsed.orderId),
      appliedCouponCode: normalizeString(parsed.appliedCouponCode),
      selectedPaymentCountry: normalizeString(parsed.selectedPaymentCountry),
      legalConsent,
    };
  } catch (error) {
    console.warn('Failed to read checkout draft state:', error);
    return null;
  }
};

export const saveCheckoutDraftState = (state: CheckoutDraftState): void => {
  if (!browser) {
    return;
  }

  const normalizedEmail = normalizeString(state.email);
  if (!normalizedEmail) {
    localStorage.removeItem(CHECKOUT_DRAFT_STORAGE_KEY);
    return;
  }

  const payload: CheckoutDraftState = {
    email: normalizedEmail.toLowerCase(),
    guestIdentityId: normalizeString(state.guestIdentityId),
    checkoutSessionKey: normalizeString(state.checkoutSessionKey),
    orderId: normalizeString(state.orderId),
    appliedCouponCode: normalizeString(state.appliedCouponCode),
    selectedPaymentCountry: normalizeString(state.selectedPaymentCountry),
    legalConsent: state.legalConsent
      ? {
          immediateFulfillmentConsent:
            state.legalConsent.immediateFulfillmentConsent === true,
          termsPolicyConsent: state.legalConsent.termsPolicyConsent === true,
        }
      : null,
  };

  localStorage.setItem(CHECKOUT_DRAFT_STORAGE_KEY, JSON.stringify(payload));
};

export const clearCheckoutDraftStorage = (): void => {
  if (!browser) {
    return;
  }
  localStorage.removeItem(CHECKOUT_DRAFT_STORAGE_KEY);
};
