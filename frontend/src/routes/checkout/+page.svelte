<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import Footer from '$lib/components/home/Footer.svelte';
  import { cart, type CartItem } from '$lib/stores/cart.js';
  import { auth, user } from '$lib/stores/auth.js';
  import { currency } from '$lib/stores/currency.js';
  import { credits } from '$lib/stores/credits.js';
  import { checkoutService } from '$lib/api/checkout.js';
  import { paymentService } from '$lib/api/payments.js';
  import {
    trackAddPaymentInfo,
    trackBeginCheckout,
    trackPurchase,
    type AnalyticsItem
  } from '$lib/utils/analytics.js';
  import {
    formatCurrency,
    normalizeCurrencyCode,
    type SupportedCurrency
  } from '$lib/utils/currency.js';
  import type {
    CheckoutPricingSummary,
    CheckoutNowPaymentsInvoiceResponse,
    CheckoutNowPaymentsMinimumResponse
  } from '$lib/types/checkout.js';
  import type { Currency } from '$lib/types/payment.js';
  import type { OwnAccountCredentialRequirement } from '$lib/types/subscription.js';
  import { Loader2, Mail, ShieldCheck, Trash2 } from 'lucide-svelte';

  const DRAFT_STORAGE_KEY = 'checkout_draft_state';
  const CHECKOUT_INITIATE_TRACKING_KEY = 'checkout_initiate_tracking';
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let contactEmail = '';
  let emailTouched = false;
  let emailError = '';
  let guestIdentityId: string | null = null;
  let checkoutSessionKey: string | null = null;
  let orderId: string | null = null;
  let pricing: CheckoutPricingSummary | null = null;
  let draftLoading = false;
  let draftError = '';
  let lastDraftSignature = '';
  let draftTimer: ReturnType<typeof setTimeout> | null = null;
  let draftRequestCounter = 0;
  let lastIdentityEmail = '';
  let identityEmail: string | null = null;
  let draftInitialized = false;
  let initiateCheckoutEventId: string | null = null;
  let initiateCheckoutTracked = false;

  let couponCode = '';
  let appliedCouponCode: string | null = null;
  let couponMessage = '';
  let showDiscountCodeInput = false;

  let paymentMethod: 'stripe' | 'crypto' | 'credits' | null = null;
  let redirecting = false;
  let actionError = '';
  let lastPaymentMethod: 'stripe' | 'crypto' | 'credits' | null = null;
  type OwnAccountCheckoutInput = {
    accountIdentifier: string;
    credentials: string;
  };
  let ownAccountInputs: Record<string, OwnAccountCheckoutInput> = {};
  const resolveOwnAccountCredentialRequirement = (
    item: CartItem
  ): OwnAccountCredentialRequirement =>
    item.ownAccountCredentialRequirement === 'email_only'
      ? 'email_only'
      : 'email_and_password';
  const ownAccountRequiresPassword = (item: CartItem): boolean =>
    resolveOwnAccountCredentialRequirement(item) === 'email_and_password';

  let currenciesLoading = false;
  let currenciesError = '';
  let supportedCurrencies: Currency[] = [];
  type CryptoCurrencyOption = {
    code: string;
    baseCode: string;
    coinLabel: string;
    networkCode: string;
    networkLabel: string;
    rank: number;
  };
  let cryptoCurrencyOptions: CryptoCurrencyOption[] = [];
  let cryptoCoinOptions: Array<{ value: string; label: string }> = [];
  let cryptoNetworkOptions: CryptoCurrencyOption[] = [];
  let payCoin = '';
  let payCurrency = 'btc';
  let invoice: CheckoutNowPaymentsInvoiceResponse | null = null;
  let invoiceLoading = false;
  let invoiceError = '';
  let invoiceDraftSignature = '';
  let cryptoMinimum: CheckoutNowPaymentsMinimumResponse | null = null;
  let cryptoMinimumLoading = false;
  let cryptoMinimumError = '';
  let lastCryptoMinimumKey = '';

  let creditsQuoteLoading = false;
  let creditsQuoteMessage = '';
  let creditsRequired: number | null = null;
  let creditsInsufficient = false;

  const normalizeEmail = (value: string): string => value.trim().toLowerCase();
  const isValidEmail = (value: string): boolean => EMAIL_REGEX.test(value.trim());
  const isProviderMismatchMessage = (message: string): boolean =>
    message.toLowerCase().includes('payment provider mismatch') ||
    message.toLowerCase().includes('payment_provider_mismatch');
  const normalizeTicker = (value: string | null | undefined): string =>
    (value || '').trim().toLowerCase();
  const mapCouponErrorMessage = (message: string): string => {
    const normalized = message
      .trim()
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ');

    if (
      normalized.includes('not found') ||
      normalized.includes('invalid code') ||
      normalized.includes('coupon invalid')
    ) {
      return 'This discount code is invalid. Please check the code and try again.';
    }
    if (normalized.includes('inactive') || normalized.includes('expired')) {
      return 'This discount code is no longer active.';
    }
    if (normalized.includes('scope mismatch')) {
      return 'This discount code does not apply to the items in your cart.';
    }
    if (normalized.includes('term mismatch')) {
      return 'This discount code is not available for the selected subscription term.';
    }
    if (normalized.includes('first order only')) {
      return 'This discount code is available for first orders only.';
    }
    if (normalized.includes('already redeemed')) {
      return 'This discount code has already been used on your account.';
    }
    if (normalized.includes('max redemptions')) {
      return 'This discount code has reached its usage limit.';
    }
    if (normalized.includes('bound user')) {
      return 'This discount code is not assigned to your account.';
    }
    if (normalized.includes('zero total')) {
      return 'This discount code cannot be applied to this order.';
    }

    return 'Unable to apply this discount code. Please review the code and try again.';
  };

  const rebuildDraftForPaymentMethodChange = async (): Promise<boolean> => {
    checkoutSessionKey = null;
    orderId = null;
    lastDraftSignature = '';
    const rebuilt = await refreshDraft(true);
    return rebuilt && Boolean(getDraftCheckoutSessionKey());
  };
  const getDraftCheckoutSessionKey = (): string | null => {
    if (typeof checkoutSessionKey !== 'string') {
      return null;
    }

    const normalized = checkoutSessionKey.trim();
    return normalized.length >= 8 ? normalized : null;
  };

  const resolveOrderCurrency = (items: CartItem[]): SupportedCurrency => {
    const distinct = new Set<SupportedCurrency>(
      items
        .map(item => normalizeCurrencyCode(item.currency))
        .filter((item): item is SupportedCurrency => item !== null)
    );
    if (distinct.size === 1) {
      const [singleCurrency] = [...distinct];
      if (singleCurrency) {
        return singleCurrency;
      }
    }
    return $currency || 'USD';
  };

  const CRYPTO_COIN_PRIORITY = [
    'usdc',
    'usdt',
    'btc',
    'eth',
    'bnb',
    'sol',
    'xrp',
    'ada',
    'doge',
    'trx',
    'ton',
    'avax',
    'dot',
    'link',
    'ltc'
  ];
  const CRYPTO_NETWORK_PRIORITY = [
    'native',
    'erc20',
    'trc20',
    'bsc',
    'bep20',
    'bep2',
    'polygon',
    'solana',
    'arbitrum',
    'optimism',
    'base',
    'avaxc'
  ];

  const resolveCoinRank = (coin: string): number => {
    const index = CRYPTO_COIN_PRIORITY.indexOf(coin);
    return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
  };

  const resolveNetworkRank = (networkCode: string): number => {
    const index = CRYPTO_NETWORK_PRIORITY.indexOf(networkCode);
    return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
  };

  const normalizeCryptoCurrencyOption = (
    currencyOption: Currency
  ): CryptoCurrencyOption | null => {
    const code = (currencyOption.code || '').trim().toLowerCase();
    if (!code) return null;
    const baseCode = (currencyOption.baseCode || code).trim().toLowerCase();
    const coinLabel = baseCode.toUpperCase();
    const networkCode = (currencyOption.networkCode || 'native')
      .trim()
      .toLowerCase();
    const networkLabel =
      (currencyOption.network || currencyOption.networkCode || 'Network')
        .toString()
        .trim();
    return {
      code,
      baseCode,
      coinLabel,
      networkCode,
      networkLabel,
      rank: resolveCoinRank(baseCode)
    };
  };

  const buildDraftItems = (items: CartItem[]) =>
    items.map(item => ({
      variant_id: item.variantId || '',
      term_months: item.termMonths ?? null,
      auto_renew: item.autoRenew ?? true,
      selection_type: item.upgradeSelectionType ?? null,
      account_identifier:
        item.upgradeSelectionType === 'upgrade_own_account'
          ? (ownAccountInputs[item.id]?.accountIdentifier?.trim() || null)
          : null,
      credentials:
        item.upgradeSelectionType === 'upgrade_own_account' &&
        ownAccountRequiresPassword(item)
          ? (ownAccountInputs[item.id]?.credentials?.trim() || null)
          : null,
      manual_monthly_acknowledged: item.manualMonthlyAcknowledged ?? null
    }));

  type PaymentAnalyticsMethod = 'card' | 'crypto' | 'credits';

  const buildCheckoutAnalyticsItems = (items: CartItem[]): AnalyticsItem[] =>
    items.map((item, index) => ({
      item_id:
        item.variantId ||
        `${item.serviceType || item.serviceName}-${item.plan}-${item.termMonths || 1}`,
      item_name: item.serviceName,
      item_category: item.serviceType,
      item_variant: item.plan,
      price: item.price,
      currency: normalizeCurrencyCode(item.currency || orderCurrency) || orderCurrency,
      quantity: item.quantity,
      index
    }));

  const resolveCheckoutTrackingBase = (): string | null => {
    const normalizedOrderId = orderId?.trim();
    if (normalizedOrderId) {
      return `order_${normalizedOrderId}`;
    }
    const checkoutKey = getDraftCheckoutSessionKey();
    if (!checkoutKey) {
      return null;
    }
    return `checkout_${checkoutKey}`;
  };

  const buildCheckoutEventId = (suffix: string): string | undefined => {
    const base = resolveCheckoutTrackingBase();
    if (!base) return undefined;
    return `${base}_${suffix}`;
  };

  const persistInitiateCheckoutTracking = (): void => {
    if (!browser) return;
    if (!initiateCheckoutEventId) {
      sessionStorage.removeItem(CHECKOUT_INITIATE_TRACKING_KEY);
      return;
    }
    sessionStorage.setItem(
      CHECKOUT_INITIATE_TRACKING_KEY,
      JSON.stringify({
        eventId: initiateCheckoutEventId,
        tracked: initiateCheckoutTracked
      })
    );
  };

  const resetInitiateCheckoutTracking = (): void => {
    initiateCheckoutEventId = null;
    initiateCheckoutTracked = false;
    if (!browser) return;
    sessionStorage.removeItem(CHECKOUT_INITIATE_TRACKING_KEY);
  };

  const ensureInitiateCheckoutEventId = (): string | null => {
    if (!browser) return null;
    if (initiateCheckoutEventId) {
      return initiateCheckoutEventId;
    }
    const randomPart =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
    initiateCheckoutEventId = `checkout_start_${randomPart}`;
    persistInitiateCheckoutTracking();
    return initiateCheckoutEventId;
  };

  const trackCheckoutPaymentStep = (
    paymentType: PaymentAnalyticsMethod
  ): {
    addPaymentInfoEventId?: string;
  } => {
    const analyticsItems = buildCheckoutAnalyticsItems($cart);
    if (analyticsItems.length === 0) {
      return {};
    }

    const addPaymentInfoEventId = buildCheckoutEventId(
      `add_payment_info_${paymentType}`
    );

    trackAddPaymentInfo(
      paymentType,
      orderCurrency,
      total,
      analyticsItems,
      addPaymentInfoEventId
    );

    return {
      addPaymentInfoEventId
    };
  };

  const buildDraftSignature = (
    email: string,
    currencyCode: string,
    items: CartItem[],
    coupon: string | null
  ): string => {
    const payload = {
      email,
      currency: currencyCode,
      coupon: coupon ?? '',
      items: items
        .map(item => ({
          id: item.id,
          variant_id: item.variantId,
          term_months: item.termMonths,
          auto_renew: item.autoRenew ?? true,
          selection_type: item.upgradeSelectionType ?? null,
          own_account_credential_requirement:
            item.upgradeSelectionType === 'upgrade_own_account'
              ? resolveOwnAccountCredentialRequirement(item)
              : null,
          own_account_identifier:
            item.upgradeSelectionType === 'upgrade_own_account'
              ? (ownAccountInputs[item.id]?.accountIdentifier?.trim() || null)
              : null,
          own_account_credentials_present:
            item.upgradeSelectionType === 'upgrade_own_account' &&
            ownAccountRequiresPassword(item)
              ? Boolean(ownAccountInputs[item.id]?.credentials?.trim())
              : null,
          manual_monthly_acknowledged: item.manualMonthlyAcknowledged ?? null,
          quantity: item.quantity
        }))
        .sort((a, b) => a.id.localeCompare(b.id))
    };
    return JSON.stringify(payload);
  };

  const persistDraftState = () => {
    if (!browser) return;
    if (!contactEmail) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      return;
    }
    const payload = {
      email: normalizeEmail(contactEmail),
      guestIdentityId,
      checkoutSessionKey: getDraftCheckoutSessionKey(),
      orderId,
      appliedCouponCode
    };
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
  };

  const clearDraftState = () => {
    guestIdentityId = null;
    checkoutSessionKey = null;
    orderId = null;
    pricing = null;
    lastDraftSignature = '';
    invoice = null;
    invoiceError = '';
    invoiceDraftSignature = '';
    resetInitiateCheckoutTracking();
    persistDraftState();
  };

  const loadDraftState = () => {
    if (!browser) return;
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        email?: string;
        guestIdentityId?: string;
        checkoutSessionKey?: string;
        orderId?: string;
        appliedCouponCode?: string | null;
      };
      if (parsed.email) {
        contactEmail = parsed.email;
        identityEmail = normalizeEmail(parsed.email);
        lastIdentityEmail = identityEmail;
      }
      guestIdentityId = parsed.guestIdentityId ?? null;
      checkoutSessionKey =
        typeof parsed.checkoutSessionKey === 'string' &&
        parsed.checkoutSessionKey.trim().length >= 8
          ? parsed.checkoutSessionKey.trim()
          : null;
      orderId = parsed.orderId ?? null;
      appliedCouponCode =
        typeof parsed.appliedCouponCode === 'string' && parsed.appliedCouponCode
          ? parsed.appliedCouponCode
          : null;
      couponCode = appliedCouponCode ?? '';
      showDiscountCodeInput = Boolean(appliedCouponCode);
    } catch (error) {
      console.warn('Failed to read checkout draft state:', error);
    }

    try {
      const rawTracking = sessionStorage.getItem(
        CHECKOUT_INITIATE_TRACKING_KEY
      );
      if (!rawTracking) return;
      const parsedTracking = JSON.parse(rawTracking) as {
        eventId?: string;
        tracked?: boolean;
      };
      initiateCheckoutEventId =
        typeof parsedTracking.eventId === 'string' &&
        parsedTracking.eventId.trim().length > 0
          ? parsedTracking.eventId.trim()
          : null;
      initiateCheckoutTracked = parsedTracking.tracked === true;
    } catch (error) {
      console.warn('Failed to read checkout initiate tracking state:', error);
    }
  };

  const ensureIdentity = async (): Promise<void> => {
    if (!isValidEmail(contactEmail)) return;
    const normalized = normalizeEmail(contactEmail);
    if (normalized === lastIdentityEmail && guestIdentityId) return;
    lastIdentityEmail = normalized;
    emailError = '';

    try {
      const response = await checkoutService.createIdentity(contactEmail);
      guestIdentityId = response.guest_identity_id;
      identityEmail = normalized;
      persistDraftState();
    } catch (error) {
      guestIdentityId = null;
      emailError =
        error instanceof Error
          ? error.message
          : 'Unable to verify email for checkout.';
    }
  };

  const refreshDraft = async (force = false): Promise<boolean> => {
    if (!isValidEmail(contactEmail)) return false;
    if (!guestIdentityId) {
      await ensureIdentity();
      if (!guestIdentityId) {
        return false;
      }
    }

    const items = $cart;
    if (items.length === 0) return false;
    const currencyCode = resolveOrderCurrency(items);
    const signature = buildDraftSignature(
      normalizeEmail(contactEmail),
      currencyCode,
      items,
      appliedCouponCode
    );
    if (!force && signature === lastDraftSignature) {
      return true;
    }
    lastDraftSignature = signature;
    draftLoading = true;
    draftError = '';
    actionError = '';
    const requestId = ++draftRequestCounter;
    const shouldSendInitiateCheckout =
      !initiateCheckoutTracked && browser === true;
    const pendingInitiateCheckoutEventId = shouldSendInitiateCheckout
      ? ensureInitiateCheckoutEventId()
      : null;

    try {
      const response = await checkoutService.upsertDraft({
        checkout_session_key: getDraftCheckoutSessionKey(),
        guest_identity_id: guestIdentityId,
        contact_email: contactEmail,
        currency: currencyCode,
        items: buildDraftItems(items),
        ...(appliedCouponCode ? { coupon_code: appliedCouponCode } : {}),
        ...(pendingInitiateCheckoutEventId
          ? {
              initiate_checkout_event_id: pendingInitiateCheckoutEventId
            }
          : {})
      });

      if (requestId !== draftRequestCounter) {
        // Ignore stale responses that finish after a newer draft refresh.
        return true;
      }

      checkoutSessionKey = response.checkout_session_key;
      orderId = response.order_id;
      pricing = response.pricing ?? pricing;
      if (response.pricing?.normalized_coupon_code) {
        appliedCouponCode = response.pricing.normalized_coupon_code;
        couponCode = response.pricing.normalized_coupon_code;
        showDiscountCodeInput = true;
        couponMessage = 'Coupon applied.';
      }
      invoice = null;
      invoiceError = '';
      invoiceDraftSignature = '';
      lastCryptoMinimumKey = '';
      if (paymentMethod === 'crypto' && normalizeTicker(payCurrency)) {
        void refreshCryptoMinimum(true);
      }
      if (
        pendingInitiateCheckoutEventId &&
        !initiateCheckoutTracked &&
        browser
      ) {
        const analyticsItems = buildCheckoutAnalyticsItems(items);
        if (analyticsItems.length > 0) {
          const resolvedValue =
            typeof response.pricing?.order_total_cents === 'number'
              ? Number((response.pricing.order_total_cents / 100).toFixed(2))
              : Number(
                  items
                    .reduce((sum, item) => sum + item.price * item.quantity, 0)
                    .toFixed(2)
                );
          trackBeginCheckout(
            currencyCode,
            resolvedValue,
            analyticsItems,
            pendingInitiateCheckoutEventId
          );
        }
        initiateCheckoutTracked = true;
        persistInitiateCheckoutTracking();
      }
      persistDraftState();
      return true;
    } catch (error) {
      if (requestId !== draftRequestCounter) {
        // A newer refresh is already in progress; suppress stale errors.
        return false;
      }
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to update checkout details.';
      const normalizedMessage = message.toLowerCase();
      if (normalizedMessage.includes('checkout session locked')) {
        checkoutSessionKey = null;
        orderId = null;
        lastDraftSignature = '';
        return refreshDraft(true);
      }
      if (
        normalizedMessage.includes('checkout session not found') ||
        normalizedMessage.includes('checkout session mismatch')
      ) {
        checkoutSessionKey = null;
        orderId = null;
        lastDraftSignature = '';
        return refreshDraft(true);
      }
      if (appliedCouponCode) {
        couponMessage = mapCouponErrorMessage(message);
        appliedCouponCode = null;
      } else {
        draftError = message;
      }
      return false;
    } finally {
      if (requestId === draftRequestCounter) {
        draftLoading = false;
      }
    }
  };

  const scheduleDraftRefresh = () => {
    if (draftTimer) {
      clearTimeout(draftTimer);
    }
    draftTimer = setTimeout(() => {
      void refreshDraft();
    }, 350);
  };

  const handleApplyCoupon = async () => {
    const next = couponCode.trim();
    couponMessage = '';
    showDiscountCodeInput = true;
    if (!next) {
      couponMessage = 'Enter a discount code.';
      return;
    }

    if (!isValidEmail(contactEmail)) {
      emailTouched = true;
      emailError = 'Enter a valid email address.';
      couponMessage =
        'Enter a valid checkout email before applying a discount code.';
      return;
    }

    const previousCoupon = appliedCouponCode;
    appliedCouponCode = next;
    const refreshed = await refreshDraft(true);
    const normalizedNext = next.toLowerCase();
    const normalizedApplied =
      pricing?.normalized_coupon_code?.trim().toLowerCase() ?? null;

    if (!refreshed || normalizedApplied !== normalizedNext) {
      appliedCouponCode = previousCoupon;
      if (!couponMessage) {
        couponMessage =
          'This discount code is invalid or does not apply to your cart.';
      }
    }
  };

  const handleClearCoupon = async () => {
    couponCode = '';
    appliedCouponCode = null;
    couponMessage = '';
    await refreshDraft(true);
  };

  const loadCurrencies = async () => {
    if (supportedCurrencies.length > 0) return;
    currenciesLoading = true;
    currenciesError = '';
    try {
      supportedCurrencies = await paymentService.getSupportedCurrencies();
      const hasSelected = supportedCurrencies.find(
        currency => currency.code === payCurrency
      );
      if (!hasSelected && supportedCurrencies.length > 0) {
        const normalizedOptions = supportedCurrencies
          .map(normalizeCryptoCurrencyOption)
          .filter((option): option is CryptoCurrencyOption => option !== null)
          .sort((a, b) => a.rank - b.rank || a.coinLabel.localeCompare(b.coinLabel));
        payCurrency = normalizedOptions[0]?.code || supportedCurrencies[0].code;
      }
    } catch (error) {
      currenciesError =
        error instanceof Error
          ? error.message
          : 'Unable to load crypto currencies.';
    } finally {
      currenciesLoading = false;
    }
  };

  const refreshCryptoMinimum = async (force = false): Promise<void> => {
    if (paymentMethod !== 'crypto') {
      return;
    }

    const checkoutKey = getDraftCheckoutSessionKey();
    const payCurrencyNormalized = normalizeTicker(payCurrency);
    if (!checkoutKey || !payCurrencyNormalized) {
      cryptoMinimum = null;
      cryptoMinimumError = '';
      lastCryptoMinimumKey = '';
      return;
    }

    const quoteKey = `${checkoutKey}:${payCurrencyNormalized}:${orderCurrency}:${total.toFixed(2)}`;
    if (!force && quoteKey === lastCryptoMinimumKey) {
      return;
    }
    lastCryptoMinimumKey = quoteKey;

    cryptoMinimumLoading = true;
    cryptoMinimumError = '';
    try {
      const response = await checkoutService.getNowPaymentsMinimum({
        checkout_session_key: checkoutKey,
        pay_currency: payCurrencyNormalized
      });
      cryptoMinimum = response;
    } catch (error) {
      cryptoMinimum = null;
      cryptoMinimumError =
        error instanceof Error
          ? error.message
          : 'Unable to check minimum payment amount.';
    } finally {
      cryptoMinimumLoading = false;
    }
  };

  const refreshCreditsQuote = async () => {
    creditsQuoteLoading = false;
    creditsQuoteMessage = '';
    if (!$auth.isAuthenticated || $cart.length === 0) {
      creditsRequired = null;
      return;
    }

    const normalizedCurrency = resolveOrderCurrency($cart);
    if (normalizedCurrency !== 'USD') {
      creditsRequired = null;
      creditsQuoteMessage = 'Credits checkout is only available for USD pricing.';
      return;
    }

    const roundedTotal = Math.max(0, Number(total.toFixed(2)));
    creditsRequired = roundedTotal;
  };

  const updateOwnAccountInput = (
    itemId: string,
    field: keyof OwnAccountCheckoutInput,
    value: string
  ) => {
    const current = ownAccountInputs[itemId] ?? {
      accountIdentifier: '',
      credentials: ''
    };
    ownAccountInputs = {
      ...ownAccountInputs,
      [itemId]: {
        ...current,
        [field]: value
      }
    };
    actionError = '';
    if (invoiceError) {
      invoiceError = '';
    }
  };

  const resolveOwnAccountValidationError = (): string | null => {
    const missingFields: string[] = [];

    for (const item of $cart) {
      if (item.upgradeSelectionType !== 'upgrade_own_account') {
        continue;
      }

      const input = ownAccountInputs[item.id];
      const accountIdentifier = input?.accountIdentifier?.trim() ?? '';
      const credentials = input?.credentials?.trim() ?? '';
      if (!accountIdentifier) {
        missingFields.push(`${item.serviceName} (${item.plan}): account email`);
      }
      if (ownAccountRequiresPassword(item) && !credentials) {
        missingFields.push(
          `${item.serviceName} (${item.plan}): account password`
        );
      }
    }

    if (missingFields.length === 0) {
      return null;
    }

    return `Please fill in the required account details before payment: ${missingFields.join(', ')}.`;
  };

  const handleStripeCheckout = async () => {
    actionError = '';
    if (!isValidEmail(contactEmail)) {
      emailTouched = true;
      emailError = 'Enter a valid email address.';
      actionError = 'Please enter a valid checkout email before continuing.';
      return;
    }
    const ownAccountValidationError = resolveOwnAccountValidationError();
    if (ownAccountValidationError) {
      actionError = ownAccountValidationError;
      return;
    }

    const draftReady = await refreshDraft(true);
    if (!draftReady || !getDraftCheckoutSessionKey()) {
      actionError = 'Please review your checkout details.';
      return;
    }

    const startStripeSession = async (trackingIds?: {
      addPaymentInfoEventId?: string;
    }): Promise<string | null> => {
      const response = await checkoutService.createStripeSession({
        checkout_session_key: getDraftCheckoutSessionKey(),
        add_payment_info_event_id:
          trackingIds?.addPaymentInfoEventId ?? null
      });
      return response.session_url || null;
    };

    redirecting = true;
    try {
      const trackingIds = trackCheckoutPaymentStep('card');
      const sessionUrl = await startStripeSession(trackingIds);
      if (!sessionUrl) {
        actionError = 'Stripe session unavailable. Please try again.';
        return;
      }
      window.location.assign(sessionUrl);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to start Stripe checkout.';
      if (isProviderMismatchMessage(message)) {
        const rebuilt = await rebuildDraftForPaymentMethodChange();
        if (rebuilt) {
          try {
            const retryTrackingIds = trackCheckoutPaymentStep('card');
            const retrySessionUrl = await startStripeSession(retryTrackingIds);
            if (retrySessionUrl) {
              window.location.assign(retrySessionUrl);
              return;
            }
          } catch (retryError) {
            actionError =
              retryError instanceof Error
                ? retryError.message
                : 'Unable to start Stripe checkout.';
            return;
          }
        }
      }
      actionError = message;
    } finally {
      redirecting = false;
    }
  };

  const handleCryptoInvoice = async () => {
    actionError = '';
    invoiceError = '';
    const ownAccountValidationError = resolveOwnAccountValidationError();
    if (ownAccountValidationError) {
      invoiceError = ownAccountValidationError;
      return;
    }
    if (invoiceLoading) {
      return;
    }
    const shouldForceNewInvoice = false;

    const draftReady = await refreshDraft(true);
    if (!draftReady || !getDraftCheckoutSessionKey()) {
      invoiceError = 'Please review your checkout details.';
      return;
    }
    await refreshCryptoMinimum(true);
    if (!cryptoMinimum) {
      invoiceError =
        cryptoMinimumError || 'Unable to verify minimum amount for selected network.';
      return;
    }
    if (!cryptoMinimum.meets_minimum) {
      invoiceError =
        'Selected coin/network requires a higher order total. Choose another option or add more items.';
      return;
    }

    const createInvoice = async (trackingIds?: {
      addPaymentInfoEventId?: string;
    }): Promise<CheckoutNowPaymentsInvoiceResponse> =>
      checkoutService.createNowPaymentsInvoice({
        checkout_session_key: getDraftCheckoutSessionKey(),
        pay_currency: payCurrency,
        force_new_invoice: shouldForceNewInvoice,
        add_payment_info_event_id:
          trackingIds?.addPaymentInfoEventId ?? null
      });

    invoiceLoading = true;
    try {
      const trackingIds = trackCheckoutPaymentStep('crypto');
      let response = await createInvoice(trackingIds);
      invoice = response;
      invoiceDraftSignature = lastDraftSignature;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to create invoice.';
      if (isProviderMismatchMessage(message)) {
        const rebuilt = await rebuildDraftForPaymentMethodChange();
        if (rebuilt) {
          try {
            const retryTrackingIds = trackCheckoutPaymentStep('crypto');
            const response = await createInvoice(retryTrackingIds);
            invoice = response;
            invoiceDraftSignature = lastDraftSignature;
            return;
          } catch (retryError) {
            invoiceError =
              retryError instanceof Error
                ? retryError.message
                : 'Unable to create invoice.';
            return;
          }
        }
      }
      invoiceError = message;
    } finally {
      invoiceLoading = false;
    }
  };

  const handleCreditsCheckout = async () => {
    actionError = '';
    const ownAccountValidationError = resolveOwnAccountValidationError();
    if (ownAccountValidationError) {
      actionError = ownAccountValidationError;
      return;
    }
    if (!$auth.isAuthenticated) {
      goto('/auth/login?redirect=/checkout');
      return;
    }
    if (orderCurrency !== 'USD') {
      actionError = 'Credits checkout is only available for USD pricing.';
      return;
    }
    if (creditsRequired !== null && creditsRequired > ($credits.balance ?? 0)) {
      actionError = 'Insufficient credits to complete this purchase.';
      return;
    }

    const draftReady = await refreshDraft(true);
    if (!draftReady || !getDraftCheckoutSessionKey()) {
      actionError = 'Please review your checkout details.';
      return;
    }

    const { addPaymentInfoEventId } = trackCheckoutPaymentStep('credits');
    const purchaseEventId = buildCheckoutEventId('purchase');
    const analyticsItems = buildCheckoutAnalyticsItems($cart);

    redirecting = true;
    try {
      const response = await checkoutService.completeCreditsCheckout({
        checkout_session_key: getDraftCheckoutSessionKey(),
        add_payment_info_event_id: addPaymentInfoEventId ?? null,
        purchase_event_id: purchaseEventId ?? null
      });
      if (analyticsItems.length > 0) {
        trackPurchase(
          response.transaction_id || response.order_id,
          orderCurrency,
          total,
          analyticsItems,
          purchaseEventId
        );
      }
      await credits.refresh($user?.id ?? null, { force: true });
      cart.clear();
      clearDraftState();
      goto('/dashboard/subscriptions');
    } catch (error) {
      actionError =
        error instanceof Error
          ? error.message
          : 'Unable to complete credits checkout.';
    } finally {
      redirecting = false;
    }
  };

  $: if ($auth.isAuthenticated) {
    const accountEmail = ($user?.email || '').trim().toLowerCase();
    if (accountEmail && contactEmail !== accountEmail) {
      contactEmail = accountEmail;
      emailTouched = false;
      emailError = '';
    }
  }

  $: if (browser && draftInitialized) {
    persistDraftState();
  }

  $: if (contactEmail && !isValidEmail(contactEmail) && emailTouched) {
    emailError = 'Enter a valid email address.';
  } else if (emailTouched) {
    emailError = '';
  }

  $: if (contactEmail && isValidEmail(contactEmail)) {
    const normalized = normalizeEmail(contactEmail);
    if (identityEmail && normalized !== identityEmail) {
      clearDraftState();
      identityEmail = null;
    }
    if (normalized !== lastIdentityEmail) {
      void ensureIdentity();
    }
  }

  $: {
    const nextInputs: Record<string, OwnAccountCheckoutInput> = {};
    for (const item of $cart) {
      if (item.upgradeSelectionType !== 'upgrade_own_account') {
        continue;
      }
      const existing = ownAccountInputs[item.id];
      const requiresPassword = ownAccountRequiresPassword(item);
      nextInputs[item.id] = {
        accountIdentifier: existing?.accountIdentifier ?? '',
        credentials: requiresPassword ? existing?.credentials ?? '' : ''
      };
    }

    const currentKeys = Object.keys(ownAccountInputs);
    const nextKeys = Object.keys(nextInputs);
    const changed =
      currentKeys.length !== nextKeys.length ||
      nextKeys.some(
        key =>
          ownAccountInputs[key]?.accountIdentifier !==
            nextInputs[key]?.accountIdentifier ||
          ownAccountInputs[key]?.credentials !== nextInputs[key]?.credentials
      );

    if (changed) {
      ownAccountInputs = nextInputs;
    }
  }

  $: if (guestIdentityId && contactEmail && isValidEmail(contactEmail) && $cart.length > 0) {
    scheduleDraftRefresh();
  }

  $: if (draftInitialized && $cart.length === 0) {
    clearDraftState();
  }

  $: if (invoice && invoiceDraftSignature && invoiceDraftSignature !== lastDraftSignature) {
    invoice = null;
  }

  $: {
    const invoiceCurrency = normalizeTicker(invoice?.pay_currency);
    if (invoice && invoiceCurrency && invoiceCurrency !== normalizeTicker(payCurrency)) {
      invoice = null;
      invoiceDraftSignature = '';
    }
  }

  $: if (paymentMethod === 'crypto') {
    void loadCurrencies();
  }

  $: if (
    paymentMethod === 'crypto' &&
    !draftLoading &&
    lastDraftSignature &&
    getDraftCheckoutSessionKey() &&
    normalizeTicker(payCurrency)
  ) {
    void refreshCryptoMinimum();
  }

  $: if (paymentMethod === 'credits') {
    void credits.refresh($user?.id ?? null, { force: true });
    void refreshCreditsQuote();
  }

  $: if (!$auth.isAuthenticated && paymentMethod === 'credits') {
    paymentMethod = null;
  }

  $: if (paymentMethod !== 'crypto') {
    invoiceError = '';
    cryptoMinimum = null;
    cryptoMinimumError = '';
    cryptoMinimumLoading = false;
    lastCryptoMinimumKey = '';
  }

  $: if (paymentMethod !== 'credits') {
    creditsQuoteMessage = '';
    creditsRequired = null;
  }

  $: if (paymentMethod !== lastPaymentMethod) {
    actionError = '';
    if (paymentMethod !== 'crypto') {
      invoice = null;
      invoiceError = '';
    }
    lastPaymentMethod = paymentMethod;
  }

  $: cryptoCurrencyOptions = supportedCurrencies
    .map(normalizeCryptoCurrencyOption)
    .filter((option): option is CryptoCurrencyOption => option !== null)
    .filter(
      (option, index, options) =>
        options.findIndex(entry => entry.code === option.code) === index
    );

  $: {
    const coinMap = new Map<string, { value: string; label: string; rank: number }>();
    for (const option of cryptoCurrencyOptions) {
      const existing = coinMap.get(option.baseCode);
      if (!existing || option.rank < existing.rank) {
        coinMap.set(option.baseCode, {
          value: option.baseCode,
          label: option.coinLabel,
          rank: option.rank
        });
      }
    }
    cryptoCoinOptions = [...coinMap.values()]
      .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label))
      .map(({ value, label }) => ({ value, label }));
  }

  $: if (cryptoCoinOptions.length > 0 && !cryptoCoinOptions.some(coin => coin.value === payCoin)) {
    payCoin = cryptoCoinOptions[0].value;
  }

  $: cryptoNetworkOptions = cryptoCurrencyOptions
    .filter(option => option.baseCode === payCoin)
    .sort(
      (a, b) =>
        resolveNetworkRank(a.networkCode) - resolveNetworkRank(b.networkCode) ||
        a.networkLabel.localeCompare(b.networkLabel)
    );

  $: if (
    cryptoNetworkOptions.length > 0 &&
    !cryptoNetworkOptions.some(option => option.code === payCurrency)
  ) {
    payCurrency = cryptoNetworkOptions[0].code;
  }

  $: creditsInsufficient =
    paymentMethod === 'credits' &&
    creditsRequired !== null &&
    ($credits.balance ?? 0) < creditsRequired;

  let orderCurrency: SupportedCurrency = 'USD';
  let fallbackTotal = 0;
  let subtotal = 0;
  let termDiscount = 0;
  let couponDiscount = 0;
  let total = 0;
  let cryptoInvoiceMatchesSelection = false;
  let showPrimaryActionButton = true;
  let selectedCryptoCoinLabel = '';
  let selectedCryptoNetworkLabel = '';

  $: orderCurrency = resolveOrderCurrency($cart);
  $: fallbackTotal = $cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );
  $: subtotal =
    pricing?.order_subtotal_cents !== undefined
      ? pricing.order_subtotal_cents / 100
      : fallbackTotal;
  $: termDiscount =
    pricing?.order_discount_cents !== undefined
      ? pricing.order_discount_cents / 100
      : 0;
  $: couponDiscount =
    pricing?.order_coupon_discount_cents !== undefined
      ? pricing.order_coupon_discount_cents / 100
      : 0;
  $: total =
    pricing?.order_total_cents !== undefined
      ? pricing.order_total_cents / 100
      : fallbackTotal;
  $: cryptoInvoiceMatchesSelection =
    paymentMethod === 'crypto' &&
    Boolean(invoice) &&
    normalizeTicker(invoice?.pay_currency) === normalizeTicker(payCurrency);
  $: showPrimaryActionButton =
    paymentMethod !== 'crypto' || !cryptoInvoiceMatchesSelection;
  $: selectedCryptoCoinLabel =
    cryptoCoinOptions.find(option => option.value === payCoin)?.label ||
    payCoin.toUpperCase();
  $: selectedCryptoNetworkLabel =
    cryptoNetworkOptions.find(option => option.code === payCurrency)
      ?.networkLabel || 'selected network';

  onMount(() => {
    loadDraftState();
    draftInitialized = true;
  });

  onDestroy(() => {
    if (draftTimer) {
      clearTimeout(draftTimer);
    }
  });
</script>

<svelte:head>
  <title>Checkout - SubSlush</title>
  <meta
    name="description"
    content="Confirm your details and complete your subscription checkout."
  />
</svelte:head>

<div class="min-h-screen bg-slate-50">
  <HomeNav />

  <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
    <div>
      <h1 class="text-3xl font-semibold text-slate-900">Checkout</h1>
      <p class="text-sm text-slate-600 mt-1">
        Review your cart, confirm your email, and choose a payment method.
      </p>
    </div>

    {#if $cart.length === 0}
      <div class="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-center">
        <p class="text-lg font-semibold text-slate-900">Your cart is empty</p>
        <p class="text-sm text-slate-600 mt-2">
          Browse subscriptions to add items before checking out.
        </p>
        <a
          href="/browse"
          class="mt-4 inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-cyan-500 to-pink-500 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          Browse subscriptions
        </a>
      </div>
    {:else}
      <div class="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <section class="space-y-6">
          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold text-slate-900">Your items</h2>
              <span class="text-xs text-slate-500">{ $cart.length } item(s)</span>
            </div>
            <div class="mt-4 space-y-4">
              {#each $cart as item}
                <div class="rounded-xl border border-slate-200 p-4">
                  <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p class="text-base font-semibold text-slate-900">{item.serviceName}</p>
                      <p class="text-sm text-slate-500 capitalize">
                        {item.plan}
                        {#if item.termMonths}
                          · {item.termMonths} months
                        {/if}
                      </p>
                      {#if item.upgradeSelectionType}
                        <p class="mt-2 inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                          Upgrade option: {item.upgradeSelectionType === 'upgrade_new_account'
                            ? 'New account'
                            : 'Own account'}
                        </p>
                      {/if}
                    </div>
                    <div class="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:w-auto sm:min-w-[210px] sm:border-0 sm:bg-transparent sm:p-0 sm:pl-6">
                      <div class="flex items-end justify-between sm:block sm:text-right">
                        <p class="text-xs text-slate-500 sm:mb-0.5">Total</p>
                        <p class="text-2xl font-semibold leading-none text-slate-900 sm:text-xl">
                          {formatCurrency(item.price, normalizeCurrencyCode(item.currency) || orderCurrency)}
                        </p>
                      </div>
                      <div class="mt-2 flex items-center justify-between sm:mt-3 sm:justify-end sm:gap-2">
                        <label class="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-[11px] text-slate-600">
                          <input
                            type="checkbox"
                            class="h-3.5 w-3.5 rounded border-slate-300 text-slate-900"
                            checked={item.autoRenew ?? true}
                            on:change={(event) =>
                              cart.updateItem(item.id, {
                                autoRenew: (event.currentTarget as HTMLInputElement).checked
                              })
                            }
                          />
                          Auto-renew
                        </label>
                        <button
                          type="button"
                          class="rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                          on:click={() => cart.removeItem(item.id)}
                          aria-label="Remove item"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {#if item.upgradeSelectionType === 'upgrade_own_account'}
                    {@const requiresPassword = ownAccountRequiresPassword(item)}
                    <div class="mt-4 border-t border-slate-200 pt-4">
                      <div class="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
                        <div>
                          <p class="flex items-center gap-2 text-sm font-semibold text-slate-800">
                            <ShieldCheck size={14} class="text-cyan-600" />
                            Account access details
                          </p>
                          <p class="mt-1 text-xs text-slate-600">
                            {requiresPassword
                              ? 'Enter the account email and password we should use to apply the subscription.'
                              : 'Enter the account email we should use to apply the subscription'}
                          </p>
                        </div>
                        <div class={`mt-3 grid gap-3 ${requiresPassword ? 'md:grid-cols-2' : ''}`}>
                          <div class="space-y-1.5">
                            <label class="text-[11px] font-semibold uppercase tracking-wide text-slate-500" for={`account-email-${item.id}`}>
                              Account email
                            </label>
                            <input
                              id={`account-email-${item.id}`}
                              type="email"
                              class="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                              placeholder="name@example.com"
                              autocomplete="off"
                              value={ownAccountInputs[item.id]?.accountIdentifier ?? ''}
                              on:input={(event) =>
                                updateOwnAccountInput(
                                  item.id,
                                  'accountIdentifier',
                                  (event.currentTarget as HTMLInputElement).value
                                )}
                            />
                          </div>
                          {#if requiresPassword}
                            <div class="space-y-1.5">
                              <label class="text-[11px] font-semibold uppercase tracking-wide text-slate-500" for={`account-password-${item.id}`}>
                                Account password
                              </label>
                              <textarea
                                id={`account-password-${item.id}`}
                                class="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                                rows={3}
                                placeholder="Password and optional login notes"
                                autocomplete="off"
                                value={ownAccountInputs[item.id]?.credentials ?? ''}
                                on:input={(event) =>
                                  updateOwnAccountInput(
                                    item.id,
                                    'credentials',
                                    (event.currentTarget as HTMLTextAreaElement).value
                                  )}
                              ></textarea>
                            </div>
                          {/if}
                        </div>
                        <p class="mt-3 text-[11px] text-slate-500">
                          Details are encrypted and only used to complete this order.
                        </p>
                      </div>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
            {#if draftError}
              <div class="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {draftError}
              </div>
            {/if}
          </div>

          {#if !$auth.isAuthenticated}
            <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div class="flex items-center gap-2">
                <Mail size={16} class="text-slate-500" />
                <h3 class="text-sm font-semibold text-slate-900">Contact email</h3>
              </div>
              <p class="text-xs text-slate-500">
                We will send your confirmation and claim link to this email.
              </p>
              <input
                type="email"
                class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="you@example.com"
                bind:value={contactEmail}
                on:input={() => (emailTouched = true)}
              />
              {#if emailError}
                <p class="text-xs text-rose-600">{emailError}</p>
              {/if}
            </div>
          {/if}

        </section>

        <aside class="space-y-6">
          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <h3 class="text-sm font-semibold text-slate-900">Order summary</h3>
            <div class="space-y-2 text-sm text-slate-600">
              <div class="flex items-center justify-between">
                <span>Subtotal</span>
                <span>{draftLoading ? '--' : formatCurrency(subtotal, orderCurrency)}</span>
              </div>
              {#if termDiscount > 0}
                <div class="flex items-center justify-between">
                  <span>Term discount</span>
                  <span class="text-emerald-600">
                    -{draftLoading ? '--' : formatCurrency(termDiscount, orderCurrency)}
                  </span>
                </div>
              {/if}
              {#if couponDiscount > 0}
                <div class="flex items-center justify-between">
                  <span>Coupon discount</span>
                  <span class="text-emerald-600">
                    -{draftLoading ? '--' : formatCurrency(couponDiscount, orderCurrency)}
                  </span>
                </div>
              {/if}
              <div class="flex items-center justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
                <span>Total</span>
                <span>{draftLoading ? '--' : formatCurrency(total, orderCurrency)}</span>
              </div>
            </div>
            <div class="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <ShieldCheck size={14} class="text-cyan-600" />
              Orders are backed by our warranty policy.
            </div>
          </div>

          <div class="px-1">
            <button
              type="button"
              class="text-sm font-semibold text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-slate-900"
              on:click={() => {
                showDiscountCodeInput = !showDiscountCodeInput;
              }}
            >
              Got a discount code?
            </button>
            {#if showDiscountCodeInput}
              <div class="mt-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                <h3 class="text-sm font-semibold text-slate-900">Discount code</h3>
                <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    class="w-full min-w-0 rounded-lg border border-slate-200 px-3 py-2 text-sm sm:flex-1"
                    placeholder="Enter code"
                    bind:value={couponCode}
                  />
                  <div class="flex w-full gap-2 sm:w-auto">
                    <button
                      type="button"
                      class="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 sm:flex-none sm:whitespace-nowrap"
                      on:click={handleApplyCoupon}
                      disabled={draftLoading}
                    >
                      APPLY
                    </button>
                    {#if appliedCouponCode}
                      <button
                        type="button"
                        class="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50 sm:flex-none sm:whitespace-nowrap"
                        on:click={handleClearCoupon}
                      >
                        CLEAR
                      </button>
                    {/if}
                  </div>
                </div>
                {#if couponMessage}
                  <p class="text-xs text-slate-500 whitespace-pre-line">{couponMessage}</p>
                {/if}
              </div>
            {/if}
          </div>

          <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 class="text-sm font-semibold text-slate-900">Payment method</h3>
            <label class="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-3 hover:bg-slate-50">
              <input
                type="radio"
                name="payment-method"
                value="stripe"
                bind:group={paymentMethod}
                class="mt-1 h-4 w-4 text-slate-900"
              />
              <div>
                <p class="text-sm font-semibold text-slate-900">Pay with card</p>
              </div>
            </label>

            <label class="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-3 hover:bg-slate-50">
              <input
                type="radio"
                name="payment-method"
                value="crypto"
                bind:group={paymentMethod}
                class="mt-1 h-4 w-4 text-slate-900"
              />
              <div>
                <p class="text-sm font-semibold text-slate-900">Pay with crypto</p>
              </div>
            </label>

            {#if $auth.isAuthenticated}
              <label class="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-3 hover:bg-slate-50">
                <input
                  type="radio"
                  name="payment-method"
                  value="credits"
                  bind:group={paymentMethod}
                  class="mt-1 h-4 w-4 text-slate-900"
                />
                <div>
                  <p class="text-sm font-semibold text-slate-900">Pay with credits</p>
                </div>
              </label>
            {/if}

            {#if paymentMethod === 'crypto'}
              <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 space-y-2">
                <p class="text-xs font-semibold text-slate-600">Select crypto</p>
                {#if currenciesLoading}
                  <div class="flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 class="h-4 w-4 animate-spin" />
                    Loading currencies...
                  </div>
                {:else if currenciesError}
                  <p class="text-xs text-rose-600">{currenciesError}</p>
                {:else}
                  <div class="space-y-2">
                    <div>
                      <p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Coin
                      </p>
                      <select
                        class="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                        bind:value={payCoin}
                        on:change={() => {
                          invoice = null;
                          invoiceError = '';
                          cryptoMinimum = null;
                          cryptoMinimumError = '';
                          lastCryptoMinimumKey = '';
                        }}
                      >
                        {#each cryptoCoinOptions as coinOption}
                          <option value={coinOption.value}>{coinOption.label}</option>
                        {/each}
                      </select>
                    </div>

                    <div>
                      <p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        Network
                      </p>
                      <select
                        class="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                        bind:value={payCurrency}
                        on:change={() => {
                          invoice = null;
                          invoiceError = '';
                          cryptoMinimum = null;
                          cryptoMinimumError = '';
                          lastCryptoMinimumKey = '';
                        }}
                      >
                        {#each cryptoNetworkOptions as networkOption}
                          <option value={networkOption.code}>
                            {networkOption.networkLabel}
                          </option>
                        {/each}
                      </select>
                    </div>
                  </div>
                {/if}

                {#if cryptoMinimumLoading}
                  <div class="flex justify-end text-slate-400">
                    <Loader2 class="h-4 w-4 animate-spin" />
                  </div>
                {:else if cryptoMinimumError}
                  <p class="text-xs text-rose-600">{cryptoMinimumError}</p>
                {:else if cryptoMinimum && !cryptoMinimum.meets_minimum}
                  <p class="text-xs text-amber-700">
                    {selectedCryptoCoinLabel} on {selectedCryptoNetworkLabel} requires minimum {formatCurrency(cryptoMinimum.min_price_amount, orderCurrency)}.
                  </p>
                {/if}

                {#if invoiceError}
                  <p class="text-xs text-rose-600">{invoiceError}</p>
                {/if}

                {#if invoice}
                  <div class="rounded-lg border border-slate-200 bg-white px-3 py-3 text-xs text-slate-600 space-y-1">
                    <p class="font-semibold text-slate-900">Invoice ready</p>
                    <a
                      href={invoice.invoice_url}
                      class="mt-2 inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open invoice
                    </a>
                    <p class="pt-1 text-[11px] text-slate-500">
                      To generate a different invoice, change coin or network.
                    </p>
                  </div>
                {/if}
              </div>
            {/if}

            {#if $auth.isAuthenticated && paymentMethod === 'credits'}
              <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 space-y-2 text-xs text-slate-600">
                {#if creditsQuoteLoading}
                  <div class="flex items-center gap-2">
                    <Loader2 class="h-4 w-4 animate-spin" />
                    Loading credits estimate...
                  </div>
                {:else}
                  <div class="flex items-center justify-between">
                    <span>Available credits</span>
                    <span class="font-semibold text-slate-900">{$credits.balance ?? '--'}</span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span>Credits required</span>
                    <span class="font-semibold text-slate-900">
                      {creditsRequired ?? '--'}
                    </span>
                  </div>
                {/if}
                {#if creditsQuoteMessage}
                  <p class="text-xs text-amber-700">{creditsQuoteMessage}</p>
                {/if}
                {#if creditsInsufficient}
                  <p class="text-xs text-amber-700">You do not have enough credits for this purchase.</p>
                {/if}
              </div>
            {/if}

            {#if actionError}
              <div class="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">
                {actionError}
              </div>
            {/if}

            {#if showPrimaryActionButton}
              <button
                type="button"
                class="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-pink-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:shadow-xl disabled:opacity-60"
                disabled={
                  !paymentMethod ||
                  redirecting ||
                  invoiceLoading ||
                  creditsInsufficient
                }
                on:click={() => {
                  if (paymentMethod === 'stripe') {
                    void handleStripeCheckout();
                  } else if (paymentMethod === 'crypto') {
                    void handleCryptoInvoice();
                  } else if (paymentMethod === 'credits') {
                    void handleCreditsCheckout();
                  }
                }}
              >
                {#if redirecting || invoiceLoading}
                  <Loader2 class="h-4 w-4 animate-spin" />
                  {invoiceLoading ? 'Generating invoice...' : 'Processing...'}
                {:else}
                  {#if paymentMethod === 'stripe'}
                    CONTINUE TO PAYMENT
                  {:else if paymentMethod === 'crypto'}
                    Generate invoice
                  {:else if paymentMethod === 'credits'}
                    Pay with credits
                  {:else}
                    Choose payment method
                  {/if}
                {/if}
              </button>
            {/if}
          </div>

        </aside>
      </div>
    {/if}
  </div>

  <Footer />
</div>
