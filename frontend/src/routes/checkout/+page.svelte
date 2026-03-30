<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import Footer from '$lib/components/home/Footer.svelte';
  import ResponsiveImage from '$lib/components/common/ResponsiveImage.svelte';
  import { resolveLogoKey, resolveLogoKeyFromName } from '$lib/assets/logoRegistry.js';
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
    CheckoutPricingSummaryItem,
    CheckoutNowPaymentsInvoiceResponse,
    CheckoutNowPaymentsMinimumResponse
  } from '$lib/types/checkout.js';
  import type { Currency } from '$lib/types/payment.js';
  import type { OwnAccountCredentialRequirement } from '$lib/types/subscription.js';
  import { Eye, EyeOff, Loader2, ShieldCheck, Trash2 } from 'lucide-svelte';

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
  let contactEmailCardRef: HTMLDivElement | null = null;
  let contactEmailNeedsAttention = false;
  let contactEmailAttentionMessage = '';
  let contactEmailPulseTimer: ReturnType<typeof setTimeout> | null = null;
  let ownAccountAttentionByItemId: Record<string, boolean> = {};
  let ownAccountAttentionMessageByItemId: Record<string, string> = {};
  let ownAccountAttentionPulseTimers: Record<string, ReturnType<typeof setTimeout>> =
    {};
  let ownAccountPasswordVisibleByItemId: Record<string, boolean> = {};
  let showItemRemoveConfirm = false;
  let pendingRemoveItemId: string | null = null;
  let pendingRemoveItemName = '';

  let couponCode = '';
  let appliedCouponCode: string | null = null;
  let couponMessage = '';
  let showDiscountCodeInput = false;

  let paymentMethod: 'card' | 'crypto' | 'credits' | null = null;
  let immediatePerformanceConsent = false;
  let redirecting = false;
  let actionError = '';
  let lastPaymentMethod: 'card' | 'crypto' | 'credits' | null = null;
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

  const resolveItemQuantity = (item: CartItem): number => {
    if (typeof item.quantity !== 'number' || !Number.isFinite(item.quantity)) {
      return 1;
    }
    return Math.max(1, Math.floor(item.quantity));
  };

  const clampItemQuantity = (value: number): number =>
    Math.min(99, Math.max(1, Math.floor(value)));

  const normalizeEmail = (value: string): string => value.trim().toLowerCase();
  const isValidEmail = (value: string): boolean => EMAIL_REGEX.test(value.trim());
  const isProviderMismatchMessage = (message: string): boolean =>
    message.toLowerCase().includes('payment provider mismatch') ||
    message.toLowerCase().includes('payment_provider_mismatch');
  const normalizeTicker = (value: string | null | undefined): string =>
    (value || '').trim().toLowerCase();
  const normalizeNetworkToken = (value: string | null | undefined): string =>
    (value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
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
      return 'This discount code is not available for the selected product duration.';
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

  const resolveOrderCurrency = (
    items: CartItem[],
    selectedCurrency: string | null | undefined
  ): SupportedCurrency => {
    const normalizedSelectedCurrency = normalizeCurrencyCode(selectedCurrency);
    if (normalizedSelectedCurrency) {
      return normalizedSelectedCurrency;
    }

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
    return 'USD';
  };

  const resolveCheckoutLineTotal = (
    item: CartItem,
    index: number
  ): { amount: number; currency: SupportedCurrency } => {
    if (pricing && Array.isArray(pricing.items) && pricing.items.length > 0) {
      const quantity = resolveItemQuantity(item);
      const startOffset = $cart
        .slice(0, index)
        .reduce((sum, cartItem) => sum + resolveItemQuantity(cartItem), 0);
      const matchedItems = pricing.items.slice(startOffset, startOffset + quantity);

      if (matchedItems.length > 0) {
        const amount = matchedItems.reduce(
          (sum, pricingItem) => sum + pricingItem.final_total_cents,
          0
        ) / 100;
        const currency =
          normalizeCurrencyCode(matchedItems[0]?.currency) || orderCurrency;
        return { amount, currency };
      }
    }

    return {
      amount: item.price * resolveItemQuantity(item),
      currency: normalizeCurrencyCode(item.currency) || orderCurrency
    };
  };

  const updateItemQuantity = (item: CartItem, quantity: number): void => {
    const normalizedQuantity = clampItemQuantity(quantity);
    if (normalizedQuantity === resolveItemQuantity(item)) {
      return;
    }
    cart.updateItem(item.id, { quantity: normalizedQuantity });
  };

  const requestItemRemovalConfirmation = (item: CartItem): void => {
    pendingRemoveItemId = item.id;
    pendingRemoveItemName = item.serviceName;
    showItemRemoveConfirm = true;
  };

  const cancelItemRemovalConfirmation = (): void => {
    showItemRemoveConfirm = false;
    pendingRemoveItemId = null;
    pendingRemoveItemName = '';
  };

  const confirmItemRemoval = (): void => {
    if (pendingRemoveItemId) {
      cart.removeItem(pendingRemoveItemId);
    }
    cancelItemRemovalConfirmation();
  };

  const decrementItemQuantity = (item: CartItem): void => {
    const quantity = resolveItemQuantity(item);
    if (quantity <= 1) {
      requestItemRemovalConfirmation(item);
      return;
    }
    cart.updateItem(item.id, { quantity: quantity - 1 });
  };

  const incrementItemQuantity = (item: CartItem): void => {
    const quantity = resolveItemQuantity(item);
    cart.updateItem(item.id, { quantity: clampItemQuantity(quantity + 1) });
  };

  const handleItemQuantityInput = (item: CartItem, rawValue: string): void => {
    const normalized = rawValue.trim();
    if (!normalized) {
      return;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    updateItemQuantity(item, parsed);
  };

  const handleItemQuantityCommit = (item: CartItem, rawValue: string): void => {
    const normalized = rawValue.trim();
    if (!normalized) {
      cart.updateItem(item.id, { quantity: 1 });
      return;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      cart.updateItem(item.id, { quantity: 1 });
      return;
    }
    updateItemQuantity(item, parsed);
  };

  const focusContactEmailCard = (
    message = 'We need your contact email to deliver this order.'
  ): void => {
    emailTouched = true;
    if (!isValidEmail(contactEmail)) {
      emailError = 'Enter a valid email address.';
    }
    contactEmailAttentionMessage = message;
    contactEmailNeedsAttention = true;

    if (!browser || !$auth.isAuthenticated) {
      requestAnimationFrame(() => {
        contactEmailCardRef?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
        const input = document.getElementById(
          'checkout-contact-email'
        ) as HTMLInputElement | null;
        input?.focus();
      });
    }

    if (contactEmailPulseTimer) {
      clearTimeout(contactEmailPulseTimer);
    }
    contactEmailPulseTimer = setTimeout(() => {
      contactEmailNeedsAttention = false;
    }, 1600);
  };

  const ensureContactEmailBeforeCheckout = (): boolean => {
    if (isValidEmail(contactEmail)) {
      return true;
    }
    focusContactEmailCard();
    return false;
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
  const CRYPTO_NETWORK_LABEL_OVERRIDES: Record<string, string> = {
    trc20: 'TRON (TRC20)',
    erc20: 'Ethereum (ERC20)',
    bep20: 'BNB Smart Chain (BEP20)',
    bep2: 'BNB Beacon Chain (BEP2)',
    bsc: 'BNB Smart Chain (BEP20)',
    arbitrum: 'Arbitrum',
    arb: 'Arbitrum',
    optimism: 'Optimism',
    op: 'Optimism',
    polygon: 'Polygon',
    matic: 'Polygon',
    solana: 'Solana',
    sol: 'Solana',
    avaxc: 'Avalanche C-Chain',
    avax: 'Avalanche',
    base: 'Base',
    ton: 'TON',
    algo: 'Algorand',
    near: 'Near'
  };
  const CRYPTO_NATIVE_NETWORK_NAMES: Record<string, string> = {
    btc: 'Bitcoin Mainnet',
    ltc: 'Litecoin Mainnet',
    xrp: 'Ripple Mainnet',
    sol: 'Solana Mainnet',
    trx: 'Tron Mainnet',
    bch: 'Bitcoin Cash Mainnet',
    ada: 'Cardano Mainnet',
    doge: 'Dogecoin Mainnet',
    xlm: 'Stellar Mainnet',
    xmr: 'Monero Mainnet',
    dot: 'Polkadot Mainnet',
    atom: 'Cosmos Hub',
    algo: 'Algorand Mainnet',
    near: 'Near Mainnet',
    avax: 'Avalanche Mainnet',
    ton: 'TON Mainnet',
    fil: 'Filecoin Mainnet',
    bnb: 'BNB Beacon Chain',
    eth: 'Ethereum Mainnet',
    matic: 'Polygon Mainnet',
    etc: 'Ethereum Classic Mainnet',
    zec: 'Zcash Mainnet',
    dash: 'Dash Mainnet',
    eos: 'EOS Mainnet',
    icp: 'Internet Computer'
  };
  const CRYPTO_NATIVE_TOKEN_NETWORK_OVERRIDES: Record<string, string> = {
    usdc: 'Ethereum (ERC20)',
    usdt: 'Ethereum (ERC20)',
    dai: 'Ethereum (ERC20)',
    tusd: 'Ethereum (ERC20)',
    usdp: 'Ethereum (ERC20)',
    usdr: 'Ethereum (ERC20)',
    busd: 'BNB Smart Chain (BEP20)'
  };
  const resolveCoinRank = (coin: string): number => {
    const index = CRYPTO_COIN_PRIORITY.indexOf(coin);
    return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
  };

  const resolveNetworkRank = (networkCode: string): number => {
    const index = CRYPTO_NETWORK_PRIORITY.indexOf(networkCode);
    return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
  };

  const resolveCheckoutCryptoNetworkLabel = (
    currencyOption: Currency,
    baseCode: string,
    networkCode: string
  ): string => {
    const networkValue = (currencyOption.network || '').toString().trim();
    const normalizedNetworkValue = normalizeNetworkToken(networkValue);
    const normalizedNetworkCode = normalizeNetworkToken(networkCode);
    const isGenericMainnetLabel =
      normalizedNetworkCode === 'mainnet' ||
      normalizedNetworkValue === 'mainnet' ||
      normalizedNetworkCode === `${baseCode}mainnet` ||
      normalizedNetworkValue === `${baseCode}mainnet`;
    const isNativeNetwork =
      normalizedNetworkCode === 'native' ||
      normalizedNetworkValue === 'native' ||
      normalizedNetworkValue === 'nativenetwork';

    if (isNativeNetwork || isGenericMainnetLabel) {
      const tokenOverride = CRYPTO_NATIVE_TOKEN_NETWORK_OVERRIDES[baseCode];
      if (tokenOverride) {
        return tokenOverride;
      }
      return (
        CRYPTO_NATIVE_NETWORK_NAMES[baseCode] || `${baseCode.toUpperCase()} Mainnet`
      );
    }

    if (networkValue) {
      return networkValue;
    }

    const fallbackCode = normalizeNetworkToken(currencyOption.networkCode || networkCode);
    return (
      CRYPTO_NETWORK_LABEL_OVERRIDES[fallbackCode] ||
      (currencyOption.networkCode || networkCode || 'Network').toString().trim()
    );
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
    const networkLabel = resolveCheckoutCryptoNetworkLabel(
      currencyOption,
      baseCode,
      networkCode
    );
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
    items.flatMap(item => {
      const quantity = resolveItemQuantity(item);
      const payload = {
        variant_id: item.variantId || '',
        term_months: item.termMonths ?? null,
        auto_renew: false,
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
      };

      return Array.from({ length: quantity }, () => payload);
    });

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
      quantity: resolveItemQuantity(item),
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
          auto_renew: false,
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
          quantity: resolveItemQuantity(item)
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
    const currencyCode = resolveOrderCurrency(items, $currency);
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
                    .reduce(
                      (sum, item) => sum + item.price * resolveItemQuantity(item),
                      0
                    )
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

    const normalizedCurrency = resolveOrderCurrency($cart, $currency);
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

    const cartItem = $cart.find(item => item.id === itemId);
    if (!cartItem || cartItem.upgradeSelectionType !== 'upgrade_own_account') {
      return;
    }

    const nextAccountIdentifier =
      field === 'accountIdentifier'
        ? value.trim()
        : (ownAccountInputs[itemId]?.accountIdentifier?.trim() || '');
    const nextCredentials =
      field === 'credentials'
        ? value.trim()
        : (ownAccountInputs[itemId]?.credentials?.trim() || '');
    const missingEmail = nextAccountIdentifier.length === 0;
    const missingPassword =
      ownAccountRequiresPassword(cartItem) && nextCredentials.length === 0;

    if (!missingEmail && !missingPassword) {
      const nextAttention = { ...ownAccountAttentionByItemId };
      delete nextAttention[itemId];
      ownAccountAttentionByItemId = nextAttention;

      const nextMessages = { ...ownAccountAttentionMessageByItemId };
      delete nextMessages[itemId];
      ownAccountAttentionMessageByItemId = nextMessages;

      const existingTimer = ownAccountAttentionPulseTimers[itemId];
      if (existingTimer) {
        clearTimeout(existingTimer);
        const nextTimers = { ...ownAccountAttentionPulseTimers };
        delete nextTimers[itemId];
        ownAccountAttentionPulseTimers = nextTimers;
      }
    }
  };

  const toggleOwnAccountPasswordVisibility = (itemId: string): void => {
    ownAccountPasswordVisibleByItemId = {
      ...ownAccountPasswordVisibleByItemId,
      [itemId]: !ownAccountPasswordVisibleByItemId[itemId]
    };
  };

  const resolveOwnAccountAttentionMessage = (
    requiresPassword: boolean
  ): string =>
    requiresPassword
      ? 'Please provide the required account email and password to continue.'
      : 'Please provide the required account email to continue.';

  const ensureOwnAccountDetailsBeforeCheckout = (): boolean => {
    const missingItems = $cart
      .filter(item => item.upgradeSelectionType === 'upgrade_own_account')
      .map(item => {
        const input = ownAccountInputs[item.id];
        const missingEmail = !(input?.accountIdentifier?.trim() ?? '');
        const missingPassword =
          ownAccountRequiresPassword(item) &&
          !(input?.credentials?.trim() ?? '');
        return {
          item,
          missingEmail,
          missingPassword
        };
      })
      .filter(entry => entry.missingEmail || entry.missingPassword);

    if (missingItems.length === 0) {
      return true;
    }

    const nextAttention: Record<string, boolean> = { ...ownAccountAttentionByItemId };
    const nextMessages: Record<string, string> = {
      ...ownAccountAttentionMessageByItemId
    };

    for (const entry of missingItems) {
      nextAttention[entry.item.id] = true;
      nextMessages[entry.item.id] = resolveOwnAccountAttentionMessage(
        ownAccountRequiresPassword(entry.item)
      );

      const existingTimer = ownAccountAttentionPulseTimers[entry.item.id];
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      ownAccountAttentionPulseTimers[entry.item.id] = setTimeout(() => {
        ownAccountAttentionByItemId = {
          ...ownAccountAttentionByItemId,
          [entry.item.id]: false
        };
        const nextTimers = { ...ownAccountAttentionPulseTimers };
        delete nextTimers[entry.item.id];
        ownAccountAttentionPulseTimers = nextTimers;
      }, 1600);
    }

    ownAccountAttentionByItemId = nextAttention;
    ownAccountAttentionMessageByItemId = nextMessages;

    const firstMissing = missingItems[0];
    if (browser && firstMissing) {
      requestAnimationFrame(() => {
        const card = document.getElementById(
          `account-access-card-${firstMissing.item.id}`
        );
        card?.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });

        const firstTargetId = firstMissing.missingEmail
          ? `account-email-${firstMissing.item.id}`
          : `account-password-${firstMissing.item.id}`;
        const firstInput = document.getElementById(firstTargetId) as
          | HTMLInputElement
          | null;
        firstInput?.focus();
      });
    }

    return false;
  };

  const handleCardCheckout = async () => {
    actionError = '';
    if (!immediatePerformanceConsent) {
      actionError =
        'Please confirm that you agree to the Terms and Refund Policy before continuing.';
      return;
    }
    if (!ensureContactEmailBeforeCheckout()) {
      return;
    }
    if (!ensureOwnAccountDetailsBeforeCheckout()) {
      return;
    }

    const draftReady = await refreshDraft(true);
    if (!draftReady || !getDraftCheckoutSessionKey()) {
      actionError = 'Please review your checkout details.';
      return;
    }

    const startCardSession = async (trackingIds?: {
      addPaymentInfoEventId?: string;
    }): Promise<string | null> => {
      const response = await checkoutService.createCardSession({
        checkout_session_key: getDraftCheckoutSessionKey(),
        add_payment_info_event_id:
          trackingIds?.addPaymentInfoEventId ?? null
      });
      return response.session_url || null;
    };

    redirecting = true;
    try {
      const trackingIds = trackCheckoutPaymentStep('card');
      const sessionUrl = await startCardSession(trackingIds);
      if (!sessionUrl) {
        actionError = 'Card session unavailable. Please try again.';
        return;
      }
      window.location.assign(sessionUrl);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to start card checkout.';
      if (isProviderMismatchMessage(message)) {
        const rebuilt = await rebuildDraftForPaymentMethodChange();
        if (rebuilt) {
          try {
            const retryTrackingIds = trackCheckoutPaymentStep('card');
            const retrySessionUrl = await startCardSession(retryTrackingIds);
            if (retrySessionUrl) {
              window.location.assign(retrySessionUrl);
              return;
            }
          } catch (retryError) {
            actionError =
              retryError instanceof Error
                ? retryError.message
                : 'Unable to start card checkout.';
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
    if (!immediatePerformanceConsent) {
      actionError =
        'Please confirm that you agree to the Terms and Refund Policy before continuing.';
      return;
    }
    if (!ensureContactEmailBeforeCheckout()) {
      return;
    }
    if (!ensureOwnAccountDetailsBeforeCheckout()) {
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
    if (!immediatePerformanceConsent) {
      actionError =
        'Please confirm that you agree to the Terms and Refund Policy before continuing.';
      return;
    }
    if (!ensureContactEmailBeforeCheckout()) {
      return;
    }
    if (!ensureOwnAccountDetailsBeforeCheckout()) {
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
      goto('/dashboard/orders');
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

  $: if (contactEmailAttentionMessage && isValidEmail(contactEmail)) {
    contactEmailAttentionMessage = '';
    contactEmailNeedsAttention = false;
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

  $: {
    const cartItemIds = new Set($cart.map(item => item.id));

    const nextAttentionEntries = Object.entries(ownAccountAttentionByItemId).filter(
      ([itemId]) => cartItemIds.has(itemId)
    );
    if (nextAttentionEntries.length !== Object.keys(ownAccountAttentionByItemId).length) {
      ownAccountAttentionByItemId = Object.fromEntries(nextAttentionEntries);
    }

    const nextMessageEntries = Object.entries(
      ownAccountAttentionMessageByItemId
    ).filter(([itemId]) => cartItemIds.has(itemId));
    if (
      nextMessageEntries.length !==
      Object.keys(ownAccountAttentionMessageByItemId).length
    ) {
      ownAccountAttentionMessageByItemId = Object.fromEntries(nextMessageEntries);
    }

    const nextTimerEntries = Object.entries(ownAccountAttentionPulseTimers).filter(
      ([itemId]) => cartItemIds.has(itemId)
    );
    if (nextTimerEntries.length !== Object.keys(ownAccountAttentionPulseTimers).length) {
      for (const [itemId, timer] of Object.entries(ownAccountAttentionPulseTimers)) {
        if (!cartItemIds.has(itemId)) {
          clearTimeout(timer);
        }
      }
      ownAccountAttentionPulseTimers = Object.fromEntries(nextTimerEntries);
    }

    const ownAccountPasswordItemIds = new Set(
      $cart
        .filter(
          item =>
            item.upgradeSelectionType === 'upgrade_own_account' &&
            ownAccountRequiresPassword(item)
        )
        .map(item => item.id)
    );
    const nextVisiblePasswordEntries = Object.entries(
      ownAccountPasswordVisibleByItemId
    ).filter(([itemId]) => ownAccountPasswordItemIds.has(itemId));
    if (
      nextVisiblePasswordEntries.length !==
      Object.keys(ownAccountPasswordVisibleByItemId).length
    ) {
      ownAccountPasswordVisibleByItemId = Object.fromEntries(
        nextVisiblePasswordEntries
      );
    }
  }

  $: if (
    guestIdentityId &&
    contactEmail &&
    isValidEmail(contactEmail) &&
    $cart.length > 0 &&
    typeof $currency === 'string'
  ) {
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

  $: if (paymentMethod === 'credits') {
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
  let settlementCurrency: SupportedCurrency | null = null;
  let settlementTotal = 0;
  let showSettlementNotice = false;

  $: orderCurrency =
    normalizeCurrencyCode(pricing?.display_currency) ||
    resolveOrderCurrency($cart, $currency);
  $: fallbackTotal = $cart.reduce(
    (sum, item) => sum + item.price * resolveItemQuantity(item),
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
  $: settlementCurrency = normalizeCurrencyCode(pricing?.settlement_currency);
  $: settlementTotal =
    pricing?.order_settlement_total_cents !== undefined
      ? pricing.order_settlement_total_cents / 100
      : total;
  $: showSettlementNotice =
    settlementCurrency !== null && settlementCurrency !== orderCurrency;
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
    if (contactEmailPulseTimer) {
      clearTimeout(contactEmailPulseTimer);
    }
    for (const timer of Object.values(ownAccountAttentionPulseTimers)) {
      clearTimeout(timer);
    }
  });

  $: if (
    showItemRemoveConfirm &&
    pendingRemoveItemId &&
    !$cart.some(item => item.id === pendingRemoveItemId)
  ) {
    cancelItemRemovalConfirmation();
  }
</script>

<svelte:head>
  <title>Checkout - SubSlush</title>
  <meta
    name="description"
    content="Confirm your details and complete your order checkout."
  />
</svelte:head>

<div class="min-h-screen bg-white">
  <HomeNav />

  <main class="relative overflow-hidden">
    <div class="checkout-top-glow pointer-events-none absolute inset-x-0 top-0 h-56"></div>

    <section class="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      {#if $cart.length === 0}
        <div class="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
          <p class="text-lg font-semibold text-slate-900">Your cart is empty</p>
          <p class="mt-2 text-sm text-slate-600">
            Browse products to add items before checking out.
          </p>
          <a
            href="/browse"
            class="mt-5 inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-95"
          >
            Browse products
          </a>
        </div>
      {:else}
        <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23.5rem] lg:items-start">
          <section class="space-y-3">
            <h2 class="text-base font-semibold text-slate-900">Your items</h2>

            <div class="space-y-3">
                {#each $cart as item, index (item.id)}
                  {@const displayLineTotal = resolveCheckoutLineTotal(item, index)}
                  {@const itemLogo =
                    resolveLogoKey(item.logoKey || null) ||
                    resolveLogoKey(item.serviceType || item.serviceName) ||
                    resolveLogoKeyFromName(item.serviceType || item.serviceName) ||
                    resolveLogoKeyFromName(item.serviceName) ||
                    resolveLogoKeyFromName(item.plan) ||
                    resolveLogoKeyFromName(item.variantId)}
                  <div class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-start">
                      <div class="flex min-w-0 items-start gap-2.5">
                        <div class="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                          {#if itemLogo}
                            <ResponsiveImage
                              image={itemLogo}
                              alt={`${item.serviceName} logo`}
                              sizes="44px"
                              pictureClass="block h-full w-full"
                              imgClass="h-full w-full object-cover object-center"
                              loading="lazy"
                              decoding="async"
                            />
                          {:else}
                            <span class="text-xs font-black uppercase text-slate-800">
                              {item.serviceName.slice(0, 2)}
                            </span>
                          {/if}
                        </div>
                        <div class="min-w-0">
                          <p class="text-sm font-semibold text-slate-900">{item.serviceName}</p>
                        </div>
                      </div>

                      <div class="justify-self-start sm:justify-self-center">
                        <div class="inline-flex items-center rounded-xl border border-slate-200 bg-white">
                          <button
                            type="button"
                            class="inline-flex h-8 w-8 items-center justify-center text-lg font-medium text-slate-700 transition hover:bg-slate-50"
                            aria-label="Decrease quantity"
                            on:click={() => decrementItemQuantity(item)}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            inputmode="numeric"
                            class="h-8 w-16 border-x border-slate-200 bg-white text-center text-xs font-semibold text-slate-900 focus:outline-none"
                            value={resolveItemQuantity(item)}
                            on:input={(event) =>
                              handleItemQuantityInput(
                                item,
                                (event.currentTarget as HTMLInputElement).value
                              )}
                            on:change={(event) =>
                              handleItemQuantityCommit(
                                item,
                                (event.currentTarget as HTMLInputElement).value
                              )}
                          />
                          <button
                            type="button"
                            class="inline-flex h-8 w-8 items-center justify-center text-lg font-medium text-slate-700 transition hover:bg-slate-50"
                            aria-label="Increase quantity"
                            on:click={() => incrementItemQuantity(item)}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div class="w-full sm:w-auto sm:min-w-[132px]">
                        <div class="flex items-end justify-between sm:block sm:text-right">
                          <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 sm:mb-0.5">
                            Total
                          </p>
                          <p class="text-2xl font-black leading-none tracking-tight text-slate-900 sm:text-2xl">
                            {formatCurrency(displayLineTotal.amount, displayLineTotal.currency)}
                          </p>
                        </div>
                        <div class="mt-1 flex items-center justify-end sm:mt-2">
                          <button
                            type="button"
                            class="rounded-lg p-1.5 text-rose-500 transition hover:bg-rose-50"
                            on:click={() => requestItemRemovalConfirmation(item)}
                            aria-label="Remove item"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {#if item.upgradeSelectionType === 'upgrade_new_account'}
                      <div class="mt-2 border-t border-slate-200"></div>
                    {/if}

                    {#if item.upgradeSelectionType === 'upgrade_own_account'}
                      {@const requiresPassword = ownAccountRequiresPassword(item)}
                      <div class="mt-3 border-t border-slate-200 pt-3">
                        <div
                          id={`account-access-card-${item.id}`}
                          class={`rounded-xl border bg-slate-50/70 p-3 ${
                            ownAccountAttentionByItemId[item.id]
                              ? 'account-attention-pulse border-fuchsia-300'
                              : 'border-slate-200'
                          }`}
                        >
                          <div>
                            <p class="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                              <ShieldCheck size={13} class="text-cyan-600" />
                              Account access details
                            </p>
                          </div>
                          {#if ownAccountAttentionMessageByItemId[item.id]}
                            <p class="mt-2 text-xs font-medium text-fuchsia-700">
                              {ownAccountAttentionMessageByItemId[item.id]}
                            </p>
                          {/if}
                          <div class={`mt-2.5 grid gap-2 ${requiresPassword ? 'md:grid-cols-2' : ''}`}>
                            <div class="space-y-1.5">
                              <label class="text-[10px] font-semibold uppercase tracking-wide text-slate-500" for={`account-email-${item.id}`}>
                                Account email
                              </label>
                              <input
                                id={`account-email-${item.id}`}
                                type="email"
                                class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
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
                                <label class="text-[10px] font-semibold uppercase tracking-wide text-slate-500" for={`account-password-${item.id}`}>
                                  Account password
                                </label>
                                <div class="relative">
                                  <input
                                    id={`account-password-${item.id}`}
                                    type={ownAccountPasswordVisibleByItemId[item.id] ? 'text' : 'password'}
                                    class="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 pr-9 text-xs text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
                                    autocomplete="off"
                                    value={ownAccountInputs[item.id]?.credentials ?? ''}
                                    on:input={(event) =>
                                      updateOwnAccountInput(
                                        item.id,
                                        'credentials',
                                        (event.currentTarget as HTMLInputElement).value
                                      )}
                                  />
                                  <button
                                    type="button"
                                    class="absolute inset-y-0 right-0 inline-flex w-9 items-center justify-center text-slate-500 transition hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
                                    aria-label={ownAccountPasswordVisibleByItemId[item.id]
                                      ? 'Hide password'
                                      : 'Show password'}
                                    on:click={() => toggleOwnAccountPasswordVisibility(item.id)}
                                  >
                                    {#if ownAccountPasswordVisibleByItemId[item.id]}
                                      <EyeOff size={16} />
                                    {:else}
                                      <Eye size={16} />
                                    {/if}
                                  </button>
                                </div>
                              </div>
                            {/if}
                          </div>
                          <p class="mt-2 text-[10px] text-slate-500">
                            Details are encrypted and only used to complete this order.
                          </p>
                          <p class="mt-1 text-[10px] text-slate-500">
                            Personal Information Collection Statement: We collect these details to fulfill your order,
                            run fraud/security checks, and support your request. We may share relevant data with
                            payment, fraud-screening, and fulfillment providers as needed.
                            <a href="/privacy" class="underline underline-offset-2 hover:text-slate-700">Privacy Policy</a>
                          </p>
                        </div>
                      </div>
                    {/if}

                    {#if item.upgradeSelectionType}
                      <div class="mt-3 rounded-xl border border-fuchsia-200 bg-fuchsia-50/45 px-2.5 py-2">
                        <p class="text-[10px] font-semibold uppercase tracking-[0.08em] text-fuchsia-700">
                          Delivery type
                        </p>
                        <p class="mt-1 text-xs text-slate-700">
                          {item.upgradeSelectionType === 'upgrade_new_account'
                            ? 'This order will be fulfilled with a newly created private account and delivered with login credentials.'
                            : 'This order will be fulfilled on your existing account using the details you provide.'}
                        </p>
                      </div>
                    {/if}

                    {#if item.upgradeSelectionType === 'upgrade_new_account'}
                      <div class="mt-2 border-t border-slate-200"></div>
                    {/if}
                  </div>
                {/each}
            </div>
          </section>

          <aside class="space-y-6 lg:sticky lg:top-24">
            {#if !$auth.isAuthenticated}
              <div
                bind:this={contactEmailCardRef}
                class={`rounded-2xl border bg-slate-50/70 p-3 sm:p-4 ${
                  contactEmailNeedsAttention
                    ? 'email-attention-pulse border-fuchsia-300'
                    : 'border-slate-200'
                }`}
              >
                <label class="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500" for="checkout-contact-email">
                  DELIVERY EMAIL
                </label>
                <input
                  id="checkout-contact-email"
                  type="email"
                  class="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
                  placeholder="you@example.com"
                  bind:value={contactEmail}
                  on:input={() => (emailTouched = true)}
                />
                {#if emailError}
                  <p class="mt-2 text-xs text-rose-600">{emailError}</p>
                {/if}
                {#if contactEmailAttentionMessage}
                  <p class="mt-2 text-xs font-medium text-fuchsia-700">
                    {contactEmailAttentionMessage}
                  </p>
                {/if}
                <p class="mt-2 text-[11px] text-slate-500">
                  Personal Information Collection Statement: We collect your delivery email to send order updates and
                  delivery details, monitor fraud/risk signals, and provide support. Relevant data may be shared with
                  payment, fraud-screening, and communication providers.
                  <a href="/privacy" class="underline underline-offset-2 hover:text-slate-700">Privacy Policy</a>
                </p>
              </div>
            {/if}

            <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_28px_rgba(15,23,42,0.08)] sm:p-6">
              <h3 class="text-sm font-semibold text-slate-900">Order summary</h3>
              <div class="mt-3 space-y-2 text-sm text-slate-600">
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
              </div>

              <div class="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  TOTAL
                </p>
                <p class="mt-1 text-3xl font-black leading-none tracking-tight text-slate-900">
                  {draftLoading ? '--' : formatCurrency(total, orderCurrency)}
                </p>
                {#if showSettlementNotice && settlementCurrency}
                  <p class="mt-1 text-[11px] text-slate-500">
                    Charged in {settlementCurrency}: {draftLoading
                      ? '--'
                      : formatCurrency(settlementTotal, settlementCurrency)}
                  </p>
                {/if}
              </div>

              <div class="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                <ShieldCheck size={14} class="text-cyan-600" />
                <span>
                  This order is backed by our
                  <span class="font-bold bg-gradient-to-r from-pink-500 to-purple-700 bg-clip-text text-transparent">Money-Back Guarantee</span>.
                </span>
              </div>

            </div>

            <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_28px_rgba(15,23,42,0.08)] sm:p-6">
              <button
                type="button"
                class="inline-flex items-center gap-1 text-sm font-semibold"
                on:click={() => {
                  showDiscountCodeInput = !showDiscountCodeInput;
                }}
              >
                <span class="gradient-text">Got a discount code?</span>
              </button>
              {#if showDiscountCodeInput}
                <div class="mt-3 space-y-3">
                  <h3 class="text-sm font-semibold text-slate-900">Discount code</h3>
                  <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      class="w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300 sm:flex-1"
                      placeholder="Enter code"
                      bind:value={couponCode}
                    />
                    <div class="flex w-full gap-2 sm:w-auto">
                      <button
                        type="button"
                        class="gradient-outline-btn flex-1 rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 transition hover:brightness-[0.98] disabled:opacity-60 sm:flex-none sm:whitespace-nowrap"
                        on:click={handleApplyCoupon}
                        disabled={draftLoading}
                      >
                        <span class="gradient-text">APPLY</span>
                      </button>
                      {#if appliedCouponCode}
                        <button
                          type="button"
                          class="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 sm:flex-none sm:whitespace-nowrap"
                          on:click={handleClearCoupon}
                        >
                          CLEAR
                        </button>
                      {/if}
                    </div>
                  </div>
                  {#if couponMessage}
                    <p class="text-xs whitespace-pre-line text-slate-500">{couponMessage}</p>
                  {/if}
                </div>
              {/if}
            </div>

            <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_28px_rgba(15,23,42,0.08)] sm:p-6">
              <h3 class="text-sm font-semibold text-slate-900">Payment method</h3>

              <div class="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                <label class="flex items-start gap-2.5 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    class="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-fuchsia-300"
                    bind:checked={immediatePerformanceConsent}
                  />
                  <span>
                    I have read and agree to the
                    <a href="/terms" class="underline underline-offset-2 hover:text-slate-900">Terms &amp; Conditions</a>
                    and
                    <a href="/returns" class="underline underline-offset-2 hover:text-slate-900">Refund Policy</a>.
                  </span>
                </label>
              </div>

              <div class="mt-3 space-y-3">
                <label class="flex cursor-not-allowed items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 opacity-80">
                  <input
                    type="radio"
                    name="payment-method"
                    value="card"
                    bind:group={paymentMethod}
                    class="mt-1 h-4 w-4 text-slate-900"
                    disabled
                  />
                  <div>
                    <p class="text-sm font-semibold text-slate-900">Pay with card</p>
                    <p class="mt-1 text-xs font-medium text-rose-600">
                      Card payments are temporarily disabled while we migrate to a new payment processor. Card
                      checkout will be available again once this migration is complete.
                    </p>
                  </div>
                </label>

                <label class={`flex items-start gap-3 rounded-xl border px-3 py-3 transition ${
                  paymentMethod === 'crypto'
                    ? 'border-fuchsia-300 bg-fuchsia-50/40 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                }`}>
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
              </div>

              {#if paymentMethod === 'crypto'}
                <div class="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <p class="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">
                    Select crypto
                  </p>
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
                          class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
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
                          class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
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
                    <div class="space-y-1 rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-600">
                      <p class="font-semibold text-slate-900">Invoice ready</p>
                      <a
                        href={invoice.invoice_url}
                        class="mt-2 inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
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
                <div class="mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
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
                <div class="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
                  {actionError}
                </div>
              {/if}

              {#if showPrimaryActionButton}
                <button
                  type="button"
                  class="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(126,34,206,0.28)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={
                    !paymentMethod ||
                    !immediatePerformanceConsent ||
                    redirecting ||
                    invoiceLoading ||
                    creditsInsufficient
                  }
                  on:click={() => {
                    if (paymentMethod === 'card') {
                      void handleCardCheckout();
                    } else if (paymentMethod === 'crypto') {
                      void handleCryptoInvoice();
                    }
                  }}
                >
                  {#if redirecting || invoiceLoading}
                    <Loader2 class="h-4 w-4 animate-spin" />
                    {invoiceLoading ? 'Generating invoice...' : 'Processing...'}
                  {:else}
                    {#if paymentMethod === 'card'}
                      CONTINUE TO PAYMENT
                    {:else if paymentMethod === 'crypto'}
                      Generate invoice
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
    </section>
  </main>

  {#if showItemRemoveConfirm}
    <div
      class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 px-4 py-5 sm:py-6"
      role="presentation"
      on:click={(event) => {
        if (event.target === event.currentTarget) {
          cancelItemRemovalConfirmation();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-item-confirm-title"
        class="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.26)]"
      >
        <h2 id="remove-item-confirm-title" class="text-base font-semibold text-slate-900">
          Remove item?
        </h2>
        <p class="mt-2 text-sm text-slate-600">
          Are you sure you want to remove
          <span class="font-semibold text-slate-900">{pendingRemoveItemName || 'this item'}</span>
          from your cart?
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            on:click={cancelItemRemovalConfirmation}
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
            on:click={confirmItemRemoval}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  {/if}

  <Footer />
</div>

<style>
  .checkout-top-glow {
    background:
      radial-gradient(70% 120% at 8% 0%, rgba(192, 132, 252, 0.22), transparent 68%),
      radial-gradient(65% 100% at 92% 0%, rgba(244, 114, 182, 0.2), transparent 64%);
  }

  .gradient-outline-btn {
    border: 1px solid transparent;
    background:
      linear-gradient(#ffffff, #ffffff) padding-box,
      linear-gradient(90deg, #7e22ce, #db2777) border-box;
  }

  .gradient-text {
    background: linear-gradient(90deg, #7e22ce, #db2777);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  @keyframes emailAttentionPulse {
    0% {
      box-shadow: 0 0 0 0 rgba(217, 70, 239, 0.3);
      transform: translateY(0);
    }
    50% {
      box-shadow: 0 0 0 10px rgba(217, 70, 239, 0);
      transform: translateY(-1px);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(217, 70, 239, 0);
      transform: translateY(0);
    }
  }

  .email-attention-pulse {
    animation: emailAttentionPulse 820ms ease-in-out 2;
  }

  .account-attention-pulse {
    animation: emailAttentionPulse 820ms ease-in-out 2;
  }
</style>
