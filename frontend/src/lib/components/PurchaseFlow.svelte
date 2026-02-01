<script lang="ts">
  import { goto } from '$app/navigation';
  import { AlertCircle, CheckCircle2, CreditCard, Loader2, X } from 'lucide-svelte';
  import UpgradeSelectionForm from '$lib/components/subscription/UpgradeSelectionForm.svelte';
  import ManualMonthlyAcknowledgement from '$lib/components/subscription/ManualMonthlyAcknowledgement.svelte';
  import { subscriptionService } from '$lib/api/subscriptions.js';
  import { paymentService } from '$lib/api/payments.js';
  import { ordersService } from '$lib/api/orders.js';
  import { user } from '$lib/stores/auth.js';
  import { credits } from '$lib/stores/credits.js';
  import { API_CONFIG, API_ENDPOINTS, ROUTES } from '$lib/utils/constants.js';
  import { formatCurrency, normalizeCurrencyCode } from '$lib/utils/currency.js';
  import type { ServicePlanDetails, Subscription, UpgradeOptions } from '$lib/types/subscription.js';
  import type { CheckoutRequest, CheckoutResponseStripe, PaymentQuoteResponse } from '$lib/types/payment.js';
  import type { UpgradeSelectionSubmission } from '$lib/types/upgradeSelection.js';
  import { loadStripe, type Stripe, type StripeElements, type StripePaymentElement } from '@stripe/stripe-js';
  import { tick, onDestroy, onMount } from 'svelte';
  import { trackAddPaymentInfo, trackPlaceAnOrder, trackPurchase } from '$lib/utils/analytics.js';

  export let selectedPlan: ServicePlanDetails;
  export let selectedDuration = 1;
  export let selectedTotalPrice: number | null = null;
  export let userCredits = 0;
  export let onClose: () => void;
  export let onSuccess: (subscription: Subscription) => void;

  let paymentMethod: 'stripe' | 'credits' | null = null;
  let lastPaymentMethod: 'stripe' | 'credits' | null = null;
  let showCreditsConfirm = false;
  let autoRenew = true;
  let isProcessing = false;
  let errorMessage = '';
  let validationMessage = '';
  let creditsQuoteMessage = '';
  let showCreditsAuthNotice = false;
  let showStripeAuthNotice = false;
  let checkoutResult: CheckoutResponseStripe | null = null;
  let purchaseResult: Subscription | null = null;
  let stripe: Stripe | null = null;
  let elements: StripeElements | null = null;
  let paymentElement: StripePaymentElement | null = null;
  let paymentElementContainer: HTMLElement | null = null;
  let stripeClientSecret: string | null = null;
  let stripeFormOpen = false;
  let checkoutKey: string | null = null;
  let checkoutSnapshotKey: string | null = null;
  let currentCheckoutKey: string | null = null;
  let checkoutPaymentId: string | null = null;
  let checkoutCancelSent = false;
  let cancelInFlight = false;
  let checkoutStale = false;
  let checkoutStaleMessage = '';
  let creditsQuoteLoading = false;
  let lastCreditsQuoteKey = '';
  let creditsQuote:
    | {
        requiredCredits: number | null;
        canPurchase: boolean;
        reason?: string;
        subtotalCents?: number;
        termDiscountCents?: number;
        couponDiscountCents?: number;
        totalCents?: number;
      }
    | null = null;
  let couponCode = '';
  let appliedCouponCode: string | null = null;
  let couponMessage = '';
  let pricingQuoteLoading = false;
  let lastPricingQuoteKey = '';
  let pricingQuote: PaymentQuoteResponse | null = null;
  type PurchaseStage = 'checkout' | 'processing' | 'selection' | 'success';
  let stage: PurchaseStage = 'checkout';
  let orderId: string | null = null;
  let transactionId: string | null = null;
  let upgradeOptions: UpgradeOptions | null = null;
  let selectionLocked = false;
  let selectionError = '';
  let selectionLoading = false;
  let selectionSubmitting = false;
  let manualMonthlyAcknowledged = false;
  let processingError = '';
  let lastPurchaseTrackingId = '';
  let lastPlaceOrderTrackingId = '';
  const POLL_INTERVAL_MS = 3000;
  const POLL_TIMEOUT_MS = 120000;
  let pollSequence = 0;

  onDestroy(() => {
    pollSequence += 1;
  });

  onMount(() => {
    const handlePageExit = () => {
      const payload = resolveCheckoutCancelPayload('checkout_abandoned');
      if (!payload) return;
      if (checkoutCancelSent) return;
      const sent = sendCheckoutCancelBeacon(payload);
      if (sent && payload.order_id === orderId) {
        checkoutCancelSent = true;
      }
    };

    window.addEventListener('pagehide', handlePageExit);
    window.addEventListener('beforeunload', handlePageExit);

    return () => {
      window.removeEventListener('pagehide', handlePageExit);
      window.removeEventListener('beforeunload', handlePageExit);
    };
  });

  const RATE_LIMIT_COUPON_MESSAGE =
    'You have made too many attempts in a short time.\nPlease wait 10 minutes before trying again.';
  const CHECKOUT_STALE_MESSAGE =
    'Your checkout details changed. Please update checkout.';
  const CHECKOUT_CANCEL_ENDPOINT = `${API_CONFIG.BASE_URL}${API_ENDPOINTS.PAYMENTS.CHECKOUT_CANCEL}`;

  const resolveRateLimitMessage = (error: unknown): string | null => {
    if (!error || typeof error !== 'object') return null;
    const statusCode =
      typeof (error as { statusCode?: unknown }).statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : null;
    const errorLabel =
      typeof (error as { error?: unknown }).error === 'string'
        ? (error as { error: string }).error
        : '';
    const message =
      error instanceof Error
        ? error.message
        : typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message
          : '';

    if (
      statusCode === 429 ||
      errorLabel.toLowerCase().includes('too many requests') ||
      message.toLowerCase().includes('rate limit')
    ) {
      return RATE_LIMIT_COUPON_MESSAGE;
    }
    return null;
  };

  const buildCheckoutKey = (params: {
    variantId?: string | null;
    duration?: number | null;
    currency?: string | null;
    autoRenew?: boolean;
    couponCode?: string | null;
  }): string | null => {
    if (!params.variantId) return null;
    const duration = Number.isFinite(params.duration)
      ? Math.max(1, Math.floor(params.duration as number))
      : 1;
    const normalizedCoupon = params.couponCode
      ? params.couponCode.trim().toLowerCase()
      : '';
    const normalizedCurrency = normalizeCurrencyCode(params.currency) || 'USD';
    const autoRenewFlag = params.autoRenew ? '1' : '0';
    return [
      params.variantId,
      duration.toString(),
      normalizedCurrency,
      autoRenewFlag,
      normalizedCoupon,
    ].join('|');
  };

  $: resolvedCurrency = normalizeCurrencyCode(selectedPlan.currency) || 'USD';
  $: isLoggedIn = Boolean($user?.id);
  $: isUsdCurrency = resolvedCurrency === 'USD';
  $: fallbackSubtotal = selectedPlan.price * selectedDuration;
  $: fallbackTermTotal = selectedTotalPrice ?? fallbackSubtotal;
  $: fallbackTermDiscount = Math.max(0, fallbackSubtotal - fallbackTermTotal);
  $: quoteSubtotal = pricingQuote ? pricingQuote.subtotal_cents / 100 : fallbackSubtotal;
  $: quoteTermDiscount = pricingQuote
    ? pricingQuote.term_discount_cents / 100
    : fallbackTermDiscount;
  $: quoteCouponDiscount = pricingQuote
    ? pricingQuote.coupon_discount_cents / 100
    : 0;
  $: hasSelectionOptions = Boolean(
    upgradeOptions?.allow_new_account || upgradeOptions?.allow_own_account
  );
  $: requiresManualMonthlyAck = Boolean(upgradeOptions?.manual_monthly_upgrade);
  $: ackOnly = requiresManualMonthlyAck && !hasSelectionOptions;
  $: totalCost = pricingQuote ? pricingQuote.total_cents / 100 : fallbackTermTotal;
  $: resolvedCredits = $credits.balance ?? userCredits;
  $: creditsRequired = creditsQuote?.requiredCredits ?? (isUsdCurrency ? totalCost : null);
  $: hasEnoughCredits = creditsRequired !== null && resolvedCredits >= creditsRequired;
  $: creditsPurchaseBlocked = creditsQuote?.canPurchase === false;
  $: creditsCostLabel = creditsRequired ?? totalCost;
  $: topUpHref = $user?.id ? ROUTES.CREDITS : ROUTES.AUTH.REGISTER;
  $: currentCheckoutKey = buildCheckoutKey({
    variantId: selectedPlan?.variant_id,
    duration: selectedDuration,
    currency: resolvedCurrency,
    autoRenew,
    couponCode: appliedCouponCode,
  });

  $: if (paymentMethod !== lastPaymentMethod) {
    validationMessage = '';
    errorMessage = '';
    creditsQuoteMessage = '';
    showCreditsConfirm = false;
    if (lastPaymentMethod === 'stripe' && paymentMethod !== 'stripe') {
      invalidateStripeCheckout('payment_method_changed');
    }
    resetSelectionState();
    if (paymentMethod !== 'credits') {
      showCreditsAuthNotice = false;
    }
    if (paymentMethod !== 'stripe') {
      showStripeAuthNotice = false;
    }
    if (paymentMethod === 'credits') {
      void refreshCredits(true);
      void refreshCreditsQuote(true);
    }
    lastPaymentMethod = paymentMethod;
  }

  $: if (stripeFormOpen && stripeClientSecret && !paymentElement) {
    void initStripeElements();
  }

  $: if (
    stage === 'checkout' &&
    checkoutSnapshotKey &&
    currentCheckoutKey &&
    checkoutPaymentId &&
    orderId
  ) {
    if (checkoutSnapshotKey !== currentCheckoutKey) {
      if (!checkoutStale) {
        checkoutStale = true;
        checkoutStaleMessage = CHECKOUT_STALE_MESSAGE;
      }
    } else if (checkoutStale) {
      checkoutStale = false;
      checkoutStaleMessage = '';
    }
  }

  $: checkoutGridClass =
    paymentMethod === 'stripe' && stripeFormOpen
      ? 'lg:grid-cols-[1fr,1.4fr]'
      : 'lg:grid-cols-[1fr,1.2fr]';

  $: primaryLabel =
    stage !== 'checkout'
      ? ''
      : !paymentMethod
        ? 'Select a payment method'
        : paymentMethod === 'stripe'
          ? checkoutStale
            ? stripeFormOpen
              ? 'Update checkout'
              : 'Restart checkout'
            : stripeFormOpen && stripeClientSecret
              ? 'Pay now'
              : 'Continue to payment'
          : showCreditsConfirm
            ? 'Awaiting confirmation'
            : 'Review purchase';

  $: primaryDisabled =
    stage !== 'checkout' ||
    !paymentMethod ||
    isProcessing ||
    (paymentMethod === 'credits' && (creditsRequired === null || !hasEnoughCredits)) ||
    (paymentMethod === 'credits' && creditsPurchaseBlocked) ||
    (paymentMethod === 'credits' && showCreditsConfirm);

  $: headerTitle =
    stage === 'success'
      ? 'Purchase confirmed'
      : stage === 'selection'
        ? 'Select upgrade option'
        : stage === 'processing'
          ? 'Payment received'
          : 'Checkout';

  $: headerSubtitle =
    stage === 'success'
      ? ''
      : stage === 'selection'
        ? 'Choose how you want to complete this upgrade.'
        : stage === 'processing'
          ? 'We are finalizing your subscription.'
          : 'Review your plan and finish checkout.';

  $: closeDisabled = stage === 'processing' && !processingError;

  $: if (paymentMethod === 'credits' && selectedPlan?.variant_id) {
    void refreshCreditsQuote();
  }

  $: if (selectedPlan?.variant_id) {
    void refreshPricingQuote();
  }

  $: if (!isLoggedIn && paymentMethod === 'credits') {
    paymentMethod = null;
  }

  $: if (!isLoggedIn && paymentMethod === 'stripe') {
    paymentMethod = null;
  }

  $: if (isLoggedIn) {
    showCreditsAuthNotice = false;
    showStripeAuthNotice = false;
  }

  function formatDuration(months: number): string {
    if (months === 1) return '1 month';
    if (months < 12) return `${months} months`;
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    if (remainingMonths === 0) return years === 1 ? '1 year' : `${years} years`;
    return `${years} year${years > 1 ? 's' : ''} and ${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`;
  }

  const buildPurchaseItem = () => {
    const itemId =
      selectedPlan.product_id ||
      selectedPlan.variant_id ||
      selectedPlan.service_type ||
      selectedPlan.display_name;
    const itemName = selectedPlan.product_name || selectedPlan.display_name;
    if (!itemId && !itemName) return null;
    return {
      item_id: itemId,
      item_name: itemName,
      item_category: selectedPlan.category || undefined,
      item_variant: selectedPlan.variant_name || selectedPlan.plan || selectedPlan.service_name || undefined,
      price: totalCost,
      currency: resolvedCurrency,
      quantity: 1
    };
  };

  const getPurchaseItems = () => {
    const item = buildPurchaseItem();
    return item ? [item] : [];
  };

  async function initStripeElements() {
    try {
      if (!stripeClientSecret) return;

      if (!stripe) {
        const publishableKey =
          import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ||
          import.meta.env.PUBLIC_VITE_STRIPE_PUBLISHABLE_KEY ||
          '';
        if (!publishableKey) {
          errorMessage = 'Stripe is missing a publishable key.';
          return;
        }
        stripe = await loadStripe(publishableKey);
      }

      if (!stripe) {
        errorMessage = 'Stripe failed to initialize.';
        return;
      }

      await tick();

      elements = stripe.elements({ clientSecret: stripeClientSecret });
      if (paymentElement) {
        paymentElement.destroy();
      }
      paymentElement = elements.create('payment');
      paymentElement.mount(paymentElementContainer as HTMLElement);
    } catch (err) {
      console.error('Stripe elements init failed', err);
      errorMessage = 'Unable to load the secure payment form.';
    }
  }

  const resetStripeCheckoutState = () => {
    stripeClientSecret = null;
    checkoutResult = null;
    checkoutPaymentId = null;
    checkoutKey = null;
    checkoutSnapshotKey = null;
    checkoutCancelSent = false;
    cancelInFlight = false;
    checkoutStale = false;
    checkoutStaleMessage = '';
    orderId = null;
    stripeFormOpen = false;
    if (paymentElement) {
      paymentElement.destroy();
      paymentElement = null;
    }
    elements = null;
  };

  const resolveCheckoutCancelPayload = (reason: string, overrides?: {
    orderId?: string | null;
    paymentId?: string | null;
    checkoutKey?: string | null;
  }): {
    order_id: string;
    payment_id: string;
    reason: string;
    checkout_key?: string;
  } | null => {
    const targetOrderId = overrides?.orderId ?? orderId;
    const targetPaymentId = overrides?.paymentId ?? checkoutPaymentId;
    const targetCheckoutKey =
      overrides?.checkoutKey ?? checkoutKey ?? checkoutSnapshotKey;

    if (!targetOrderId || !targetPaymentId) return null;
    if (stage !== 'checkout') return null;
    if (cancelInFlight) return null;

    return {
      order_id: targetOrderId,
      payment_id: targetPaymentId,
      reason,
      ...(targetCheckoutKey ? { checkout_key: targetCheckoutKey } : {})
    };
  };

  const sendCheckoutCancelBeacon = (payload: {
    order_id: string;
    payment_id: string;
    reason: string;
    checkout_key?: string;
  }): boolean => {
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], {
        type: 'application/json'
      });
      return navigator.sendBeacon(CHECKOUT_CANCEL_ENDPOINT, blob);
    }

    if (typeof fetch !== 'undefined') {
      void fetch(CHECKOUT_CANCEL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(payload),
        keepalive: true
      });
      return true;
    }

    return false;
  };

  const cancelStripeCheckout = async (
    reason: string,
    overrides?: {
      orderId?: string | null;
      paymentId?: string | null;
      checkoutKey?: string | null;
      useBeacon?: boolean;
    }
  ): Promise<boolean> => {
    const payload = resolveCheckoutCancelPayload(reason, overrides);
    if (!payload) return false;

    if (payload.order_id === orderId && checkoutCancelSent) {
      return false;
    }

    if (overrides?.useBeacon) {
      const sent = sendCheckoutCancelBeacon(payload);
      if (sent && payload.order_id === orderId) {
        checkoutCancelSent = true;
      }
      return sent;
    }

    cancelInFlight = true;
    try {
      await paymentService.cancelCheckout(payload);
      if (payload.order_id === orderId) {
        checkoutCancelSent = true;
      }
      return true;
    } catch (error) {
      console.warn('Checkout cancel failed:', error);
      return false;
    } finally {
      cancelInFlight = false;
    }
  };

  const invalidateStripeCheckout = (reason: string) => {
    const payload = resolveCheckoutCancelPayload(reason);
    if (payload) {
      void cancelStripeCheckout(reason, {
        orderId: payload.order_id,
        paymentId: payload.payment_id,
        checkoutKey: payload.checkout_key ?? null
      });
    }
    resetStripeCheckoutState();
  };

  const restartStripeCheckout = async (reason: string) => {
    const shouldKeepFormOpen = stripeFormOpen;
    await cancelStripeCheckout(reason);
    resetStripeCheckoutState();
    if (shouldKeepFormOpen) {
      stripeFormOpen = true;
    }
    await startStripeCheckout();
  };

  const resetSelectionState = () => {
    orderId = null;
    upgradeOptions = null;
    selectionLocked = false;
    selectionError = '';
    selectionLoading = false;
    selectionSubmitting = false;
    manualMonthlyAcknowledged = false;
    processingError = '';
    purchaseResult = null;
    stage = 'checkout';
    resetStripeCheckoutState();
  };

  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  async function pollForSubscription(orderIdValue: string): Promise<Subscription | null> {
    const sequence = ++pollSequence;
    const start = Date.now();

    while (Date.now() - start < POLL_TIMEOUT_MS) {
      if (sequence !== pollSequence) {
        return null;
      }
      try {
        const response = await ordersService.getOrderSubscription(orderIdValue);
        if (response.subscription) {
          return response.subscription;
        }
      } catch (error) {
        console.warn('Order subscription poll failed:', error);
      }

      await wait(POLL_INTERVAL_MS);
    }

    return null;
  }

  async function loadSelection(subscriptionId: string): Promise<void> {
    selectionLoading = true;
    selectionError = '';
    try {
      const response = await subscriptionService.getUpgradeSelection(subscriptionId);
      upgradeOptions = response.selection.upgrade_options_snapshot || upgradeOptions;
      selectionLocked = response.locked;
      manualMonthlyAcknowledged = Boolean(
        response.selection.manual_monthly_acknowledged_at
      );
      if (response.locked) {
        stage = 'success';
      }
    } catch (error) {
      selectionError =
        error instanceof Error
          ? error.message
          : 'Unable to load upgrade selection. Please try again.';
    } finally {
      selectionLoading = false;
    }
  }

  async function advanceAfterSubscription(
    subscription: Subscription,
    options: UpgradeOptions | null
  ): Promise<void> {
    purchaseResult = subscription;
    const trackingId = transactionId || orderId || subscription.id;
    if (trackingId && trackingId !== lastPurchaseTrackingId) {
      const items = getPurchaseItems();
      if (items.length) {
        trackPurchase(trackingId, resolvedCurrency, totalCost, items);
        lastPurchaseTrackingId = trackingId;
      }
    }
    upgradeOptions = options;
    selectionLocked = false;
    selectionError = '';
    processingError = '';

    const nextHasSelectionOptions = Boolean(
      options?.allow_new_account || options?.allow_own_account
    );
    const manualMonthlyRequired =
      Boolean(options?.manual_monthly_upgrade) ||
      subscription.status_reason === 'waiting_for_mmu_acknowledgement';
    const needsSelection =
      nextHasSelectionOptions ||
      manualMonthlyRequired ||
      subscription.status_reason === 'waiting_for_selection';

    if (!needsSelection) {
      stage = 'success';
      return;
    }

    stage = 'selection';
    await loadSelection(subscription.id);
  }

  async function startStripeCheckout() {
    const snapshotKey = buildCheckoutKey({
      variantId: selectedPlan?.variant_id,
      duration: selectedDuration,
      currency: resolvedCurrency,
      autoRenew,
      couponCode: appliedCouponCode,
    });
    if (stripeClientSecret) return;
    isProcessing = true;
    errorMessage = '';

    if (!selectedPlan.variant_id) {
      errorMessage = 'Please select a subscription option.';
      isProcessing = false;
      return;
    }

    const payload: CheckoutRequest = {
      variant_id: selectedPlan.variant_id,
      duration_months: selectedDuration,
      payment_method: 'stripe',
      auto_renew: autoRenew,
      currency: resolvedCurrency,
      ...(appliedCouponCode ? { coupon_code: appliedCouponCode } : {})
    };

    try {
      const response = await paymentService.createCheckout(payload);
      checkoutResult = response as CheckoutResponseStripe;
      orderId = checkoutResult.order_id;
      checkoutPaymentId = checkoutResult.paymentId;
      checkoutKey = checkoutResult.checkoutKey ?? currentCheckoutKey;
      checkoutSnapshotKey = snapshotKey ?? currentCheckoutKey;
      checkoutStale = false;
      checkoutStaleMessage = '';
      checkoutCancelSent = false;
      upgradeOptions = checkoutResult.upgrade_options ?? null;
      stripeClientSecret = checkoutResult.clientSecret;
      if (orderId && orderId !== lastPlaceOrderTrackingId) {
        const items = getPurchaseItems();
        if (items.length) {
          trackPlaceAnOrder(resolvedCurrency, totalCost, items);
          lastPlaceOrderTrackingId = orderId;
        }
      }
      await initStripeElements();
    } catch (err) {
      console.error('Stripe checkout failed', err);
      errorMessage =
        resolveRateLimitMessage(err) ||
        'Unable to start card checkout. Please try again.';
    } finally {
      isProcessing = false;
    }
  }

  async function confirmStripePayment() {
    if (checkoutStale) {
      errorMessage = CHECKOUT_STALE_MESSAGE;
      return;
    }
    if (!stripe || !elements || !stripeClientSecret) {
      errorMessage = 'Stripe is not ready yet.';
      return;
    }

    isProcessing = true;
    errorMessage = '';
    processingError = '';
    selectionError = '';

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required'
    });

    if (error) {
      console.error('Stripe confirm error', error);
      errorMessage = error.message || 'Payment failed. Please try again.';
      isProcessing = false;
      return;
    }

    if (!orderId) {
      errorMessage = 'Checkout is missing an order id.';
      isProcessing = false;
      return;
    }

    const status = paymentIntent?.status;
    if (!status || status === 'succeeded' || status === 'processing') {
      stage = 'processing';
      isProcessing = false;
      const subscription = await pollForSubscription(orderId);
      if (!subscription) {
        processingError =
          'We are still processing your payment. You can close this window and finish selection later in your subscriptions.';
        return;
      }
      await advanceAfterSubscription(subscription, upgradeOptions);
    } else {
      errorMessage = 'Payment did not complete. Please try again.';
    }
  }

  async function handleCreditsPurchase() {
    validationMessage = '';
    errorMessage = '';

    if (!isLoggedIn) {
      errorMessage = 'Please register an account to pay with credits.';
      return;
    }

    if (!selectedPlan.variant_id) {
      errorMessage = 'Please select a subscription option.';
      return;
    }

    if (!hasEnoughCredits) {
      validationMessage = 'You do not have enough credits for this purchase.';
      return;
    }

    isProcessing = true;

    try {
      const validation =
        creditsQuote?.canPurchase === false || creditsQuote?.requiredCredits !== null
          ? creditsQuote
          : await subscriptionService.validatePurchase({
              variant_id: selectedPlan.variant_id,
              duration_months: selectedDuration,
              ...(appliedCouponCode ? { coupon_code: appliedCouponCode } : {})
            });

      const canPurchase =
        (validation as { canPurchase?: boolean }).canPurchase ??
        (validation as { can_purchase?: boolean }).can_purchase ??
        (validation as { valid?: boolean }).valid ??
        false;

      if (!canPurchase) {
        validationMessage =
          (validation as { reason?: string }).reason ||
          'This purchase is not available right now.';
        return;
      }

      const purchase = await subscriptionService.purchaseSubscription({
        variant_id: selectedPlan.variant_id,
        duration_months: selectedDuration,
        auto_renew: autoRenew,
        ...(appliedCouponCode ? { coupon_code: appliedCouponCode } : {})
      });

      orderId = purchase.order_id;
      transactionId = purchase.transaction?.transaction_id ?? null;
      if (orderId && orderId !== lastPlaceOrderTrackingId) {
        const items = getPurchaseItems();
        if (items.length) {
          trackPlaceAnOrder(resolvedCurrency, totalCost, items);
          lastPlaceOrderTrackingId = orderId;
        }
      }
      await refreshCredits(true);
      await advanceAfterSubscription(
        purchase.subscription,
        purchase.upgrade_options ?? null
      );
    } catch (error) {
      console.error('Credit purchase failed:', error);
      errorMessage =
        error instanceof Error
          ? error.message
          : 'Unable to complete purchase. Please try again.';
    } finally {
      isProcessing = false;
    }
  }

  async function refreshCredits(force = false) {
    if (!$user?.id) return;
    if (!force && paymentMethod !== 'credits') return;
    await credits.refresh($user.id, { force: true });
  }

  async function refreshCreditsQuote(force = false) {
    if (!isLoggedIn) {
      creditsQuote = null;
      return;
    }
    if (!selectedPlan?.variant_id) {
      creditsQuote = null;
      return;
    }
    const couponKey = appliedCouponCode ? appliedCouponCode.toLowerCase() : '';
    const quoteKey = `${selectedPlan.variant_id}:${selectedDuration}:${couponKey}`;
    if (!force && quoteKey === lastCreditsQuoteKey && creditsQuote) {
      return;
    }

    creditsQuoteLoading = true;
    creditsQuoteMessage = '';
    try {
      const validation = await subscriptionService.validatePurchase({
        variant_id: selectedPlan.variant_id,
        duration_months: selectedDuration,
        ...(appliedCouponCode ? { coupon_code: appliedCouponCode } : {})
      });
      const currentKey = `${selectedPlan.variant_id}:${selectedDuration}:${couponKey}`;
      if (currentKey !== quoteKey) {
        return;
      }

      const requiredCreditsRaw = (validation as { required_credits?: number }).required_credits;
      const requiredCredits =
        typeof requiredCreditsRaw === 'number' && Number.isFinite(requiredCreditsRaw)
          ? requiredCreditsRaw
          : null;
      const canPurchase =
        (validation as { can_purchase?: boolean }).can_purchase ??
        (validation as { valid?: boolean }).valid ??
        true;
      const reason = (validation as { reason?: string }).reason;
      const subtotalCents = (validation as { subtotal_cents?: number }).subtotal_cents ?? null;
      const termDiscountCents =
        (validation as { term_discount_cents?: number }).term_discount_cents ?? null;
      const couponDiscountCents =
        (validation as { coupon_discount_cents?: number }).coupon_discount_cents ?? null;
      const totalCents = (validation as { total_cents?: number }).total_cents ?? null;

      creditsQuote = {
        requiredCredits,
        canPurchase,
        ...(reason ? { reason } : {}),
        ...(subtotalCents !== null ? { subtotalCents } : {}),
        ...(termDiscountCents !== null ? { termDiscountCents } : {}),
        ...(couponDiscountCents !== null ? { couponDiscountCents } : {}),
        ...(totalCents !== null ? { totalCents } : {})
      };
      lastCreditsQuoteKey = quoteKey;
      if (!canPurchase && reason) {
        creditsQuoteMessage = reason;
      }
    } catch (error) {
      console.error('Credits quote failed:', error);
      creditsQuote = null;
      creditsQuoteMessage = 'Unable to calculate credit pricing right now.';
    } finally {
      creditsQuoteLoading = false;
    }
  }

  async function refreshPricingQuote(force = false) {
    if (!selectedPlan?.variant_id) {
      pricingQuote = null;
      return;
    }
    if (!isLoggedIn) {
      pricingQuote = null;
      if (appliedCouponCode) {
        couponMessage = 'Log in to apply coupon codes.';
      }
      return;
    }

    const couponKey = appliedCouponCode ? appliedCouponCode.toLowerCase() : '';
    const quoteKey = `${selectedPlan.variant_id}:${selectedDuration}:${resolvedCurrency}:${couponKey}`;
    if (!force && quoteKey === lastPricingQuoteKey && pricingQuote) {
      return;
    }

    pricingQuoteLoading = true;
    try {
      const response = await paymentService.getQuote({
        variant_id: selectedPlan.variant_id,
        duration_months: selectedDuration,
        currency: resolvedCurrency,
        ...(appliedCouponCode ? { coupon_code: appliedCouponCode } : {})
      });
      pricingQuote = response;
      lastPricingQuoteKey = quoteKey;
      couponMessage = appliedCouponCode ? 'Coupon applied.' : '';
    } catch (error) {
      pricingQuote = null;
      lastPricingQuoteKey = '';
      if (appliedCouponCode) {
        couponMessage =
          resolveRateLimitMessage(error) ||
          (error instanceof Error ? error.message : 'Coupon not valid for this order.');
        appliedCouponCode = null;
      }
    } finally {
      pricingQuoteLoading = false;
    }
  }

  async function handleApplyCoupon() {
    const nextCode = couponCode.trim();
    if (!isLoggedIn) {
      couponMessage = 'Log in to apply coupon codes.';
      return;
    }
    appliedCouponCode = nextCode || null;
    await refreshPricingQuote(true);
    await refreshCreditsQuote(true);
  }

  async function handleClearCoupon() {
    couponCode = '';
    appliedCouponCode = null;
    couponMessage = '';
    await refreshPricingQuote(true);
    await refreshCreditsQuote(true);
  }

  async function handleCreditsConfirm() {
    showCreditsConfirm = false;
    await handleCreditsPurchase();
  }

  async function handleSelectionSubmit(event: CustomEvent<UpgradeSelectionSubmission>) {
    if (!purchaseResult) {
      selectionError = 'Subscription is not ready yet.';
      return;
    }

    selectionSubmitting = true;
    selectionError = '';

    try {
      const response = await subscriptionService.submitUpgradeSelection(
        purchaseResult.id,
        event.detail
      );
      selectionLocked = response.locked;
      if (response.locked) {
        stage = 'success';
      }
    } catch (error) {
      selectionError =
        error instanceof Error
          ? error.message
          : 'Unable to submit upgrade selection.';
    } finally {
      selectionSubmitting = false;
    }
  }

  async function handleManualMonthlyAck() {
    if (!purchaseResult) {
      selectionError = 'Subscription is not ready yet.';
      return;
    }

    selectionSubmitting = true;
    selectionError = '';

    try {
      const response = await subscriptionService.acknowledgeManualMonthly(
        purchaseResult.id
      );
      selectionLocked = response.locked;
      manualMonthlyAcknowledged = true;
      if (response.locked) {
        stage = 'success';
      }
    } catch (error) {
      selectionError =
        error instanceof Error
          ? error.message
          : 'Unable to submit acknowledgement.';
    } finally {
      selectionSubmitting = false;
    }
  }

  async function handlePrimaryAction() {
    if (stage !== 'checkout') return;
    if (!paymentMethod) return;

    if (paymentMethod === 'stripe') {
      if (checkoutStale) {
        errorMessage = '';
        await restartStripeCheckout('checkout_updated');
        return;
      }
      if (!stripeFormOpen) {
        stripeFormOpen = true;
        trackAddPaymentInfo('card', resolvedCurrency, totalCost, getPurchaseItems());
        if (!stripeClientSecret) {
          await startStripeCheckout();
        } else if (!paymentElement) {
          await initStripeElements();
        }
        return;
      }

      if (stripeClientSecret) {
        await confirmStripePayment();
      } else {
        await startStripeCheckout();
      }
      return;
    }

    if (paymentMethod === 'credits') {
      await refreshCredits(true);
      if (!showCreditsConfirm) {
        trackAddPaymentInfo('credits', resolvedCurrency, totalCost, getPurchaseItems());
        showCreditsConfirm = true;
        return;
      }
      await handleCreditsPurchase();
    }
  }

  function handleCreditsAuthNotice() {
    showCreditsAuthNotice = true;
    validationMessage = '';
    errorMessage = '';
  }

  function handleStripeAuthNotice() {
    showStripeAuthNotice = true;
    validationMessage = '';
    errorMessage = '';
  }

  function handleStripeBack() {
    stripeFormOpen = false;
    if (checkoutStale) {
      invalidateStripeCheckout('checkout_updated');
      return;
    }
    if (paymentElement) {
      paymentElement.destroy();
      paymentElement = null;
    }
    elements = null;
    errorMessage = '';
  }

  async function handleClose() {
    if (closeDisabled) return;
    if (paymentMethod === 'stripe' && stage === 'checkout') {
      await cancelStripeCheckout('checkout_cancelled');
      resetStripeCheckoutState();
    }
    onClose();
  }

  function handleDone() {
    if (purchaseResult) {
      onSuccess(purchaseResult);
    }
    goto(ROUTES.SUBSCRIPTIONS.MY_SUBSCRIPTIONS);
  }

  function resolvePlanTitle(): string {
    const productName = selectedPlan.product_name?.trim() || '';
    const variantName = selectedPlan.variant_name?.trim() || '';
    if (productName && variantName) {
      const normalizedProduct = productName.toLowerCase();
      const normalizedVariant = variantName.toLowerCase();
      if (normalizedProduct === normalizedVariant) return productName;
      if (normalizedProduct.includes(normalizedVariant)) return productName;
      if (normalizedVariant.includes(normalizedProduct)) return variantName;
      return `${productName} ${variantName}`;
    }
    if (productName || variantName) {
      return productName || variantName;
    }
    return selectedPlan.display_name;
  }

  function handleContinueShopping() {
    onClose();
    goto('/browse');
  }
</script>

<div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
  <div class="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto overscroll-contain">
    <div class="flex items-center justify-between px-6 py-5 border-b border-slate-200">
      <div>
        <h2 class="text-2xl font-bold text-slate-900">{headerTitle}</h2>
        {#if headerSubtitle}
          <p class="text-sm text-slate-500">{headerSubtitle}</p>
        {/if}
      </div>
      <button
        on:click={handleClose}
        class={`p-2 rounded-full transition-colors ${
          closeDisabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-slate-100'
        }`}
        aria-label="Close"
        disabled={closeDisabled}
      >
        <X class="w-5 h-5 text-slate-600" />
      </button>
    </div>

    {#if showCreditsConfirm && hasEnoughCredits && stage === 'checkout'}
      <div class="absolute inset-0 z-30 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
        <div class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
          <h3 class="text-lg font-semibold text-slate-900">Confirm purchase</h3>
          <p class="mt-2 text-sm text-slate-600">
            You're about to purchase <span class="font-semibold">{resolvePlanTitle()}</span>{' '}
            <span class="font-semibold">({formatDuration(selectedDuration)})</span>{' '}
            for <span class="font-semibold">{creditsCostLabel} credits</span>.
          </p>
          <div class="mt-5 flex items-center justify-end gap-3">
            <button
              on:click={() => (showCreditsConfirm = false)}
              class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              disabled={isProcessing}
            >
              No, go back
            </button>
            <button
              on:click={handleCreditsConfirm}
              class="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              disabled={isProcessing}
            >
              Confirm purchase
            </button>
          </div>
        </div>
      </div>
    {/if}

    {#if stage === 'success'}
      <div class="px-6 py-10 text-center">
        <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white">
          <CheckCircle2 class="h-7 w-7" />
        </div>
        <h3 class="text-2xl font-bold text-slate-900">You're all set</h3>
        <p class="mt-2 text-sm text-slate-600">
          Your purchase is confirmed. We'll activate your subscription shortly.
        </p>
        <p class="mt-3 text-sm text-slate-600">
          Orders are typically completed and delivered within 24 hours of placement; during business hours delivery
          is often faster. While we consistently meet this window, delivery may take up to 72 hours in rare cases.
        </p>
        <div class="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            on:click={handleContinueShopping}
            class="inline-flex items-center justify-center rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Continue shopping
          </button>
          <button
            on:click={handleDone}
            class="inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            View my subscriptions
          </button>
        </div>
      </div>
    {:else if stage === 'processing'}
      <div class="px-6 py-12 text-center">
        <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-600">
          <Loader2 class="h-7 w-7 animate-spin" />
        </div>
        <h3 class="text-2xl font-bold text-slate-900">We're processing your payment</h3>
        <p class="mt-2 text-sm text-slate-600">
          We're currently processing your payment, do not close this window.
        </p>
        {#if processingError}
          <p class="mt-3 text-xs text-amber-600">{processingError}</p>
          <button
            on:click={handleDone}
            class="mt-5 inline-flex items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Check my subscriptions
          </button>
        {/if}
      </div>
    {:else if stage === 'selection'}
      <div class="px-6 py-6">
        {#if selectionLoading}
          <div class="flex flex-col items-center gap-3 py-10 text-slate-600">
            <Loader2 class="h-6 w-6 animate-spin" />
            <p class="text-sm">Loading upgrade options...</p>
          </div>
        {:else if upgradeOptions}
          {#if ackOnly}
            <ManualMonthlyAcknowledgement
              bind:acknowledged={manualMonthlyAcknowledged}
              showSubmit={true}
              submitting={selectionSubmitting}
              errorMessage={selectionError}
              submitLabel="Confirm acknowledgement"
              on:submit={handleManualMonthlyAck}
            />
          {:else}
            <UpgradeSelectionForm
              upgradeOptions={upgradeOptions}
              locked={selectionLocked}
              submitting={selectionSubmitting}
              errorMessage={selectionError}
              on:submit={handleSelectionSubmit}
            />
          {/if}
        {:else}
          <div class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            {selectionError || 'Upgrade selection is unavailable right now. Please try again shortly.'}
          </div>
        {/if}
      </div>
    {:else}
      <div class={`grid gap-6 px-6 py-6 ${checkoutGridClass}`}>
        <section class="space-y-4">
          <div class="rounded-xl border border-slate-200 p-4">
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Your plan</p>
            <h3 class="mt-2 text-xl font-semibold text-slate-900">{resolvePlanTitle()}</h3>
            <div class="mt-4 space-y-2 text-sm text-slate-600">
              <div class="flex items-center justify-between">
                <span>Subtotal</span>
                <span>
                  {pricingQuoteLoading ? '--' : formatCurrency(quoteSubtotal, resolvedCurrency)}
                </span>
              </div>
              {#if quoteTermDiscount > 0}
                <div class="flex items-center justify-between">
                  <span>Term discount</span>
                  <span class="text-emerald-600">
                    -{pricingQuoteLoading ? '--' : formatCurrency(quoteTermDiscount, resolvedCurrency)}
                  </span>
                </div>
              {/if}
              {#if quoteCouponDiscount > 0}
                <div class="flex items-center justify-between">
                  <span>Coupon discount</span>
                  <span class="text-emerald-600">
                    -{pricingQuoteLoading ? '--' : formatCurrency(quoteCouponDiscount, resolvedCurrency)}
                  </span>
                </div>
              {/if}
            </div>
            <div class="mt-4 flex items-baseline gap-3">
              <span class="text-3xl font-bold text-slate-900">
                {pricingQuoteLoading ? '--' : formatCurrency(totalCost, resolvedCurrency)}
              </span>
              <span class="text-sm text-slate-500">total</span>
            </div>
            <div class="mt-2 text-sm text-slate-600">Duration: {formatDuration(selectedDuration)}</div>
          </div>

          <div class="rounded-xl border border-slate-200 p-4 space-y-3">
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Promo code</p>
            <div class="flex items-center gap-2">
              <input
                class="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Enter code"
                bind:value={couponCode}
              />
              <button
                type="button"
                class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                on:click={handleApplyCoupon}
                disabled={pricingQuoteLoading}
              >
                Apply
              </button>
              {#if appliedCouponCode}
                <button
                  type="button"
                  class="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50"
                  on:click={handleClearCoupon}
                >
                  Clear
                </button>
              {/if}
            </div>
            {#if couponMessage}
              <p class="text-xs text-slate-500 whitespace-pre-line">{couponMessage}</p>
            {/if}
          </div>

          <div class="rounded-xl border border-slate-200 p-4">
            <label class="flex items-start gap-3">
              <input
                type="checkbox"
                bind:checked={autoRenew}
                class="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
              />
              <div>
                <p class="text-sm font-semibold text-slate-900">Auto-renew</p>
                <p class="text-xs text-slate-500">
                  Keep this plan active and renew automatically before it expires.
                </p>
              </div>
            </label>
          </div>
        </section>

        <section class="space-y-4">
          {#if paymentMethod === 'stripe' && stripeFormOpen}
            <div class="rounded-xl border border-slate-200 p-5 space-y-4">
              <div class="flex items-center gap-2 text-sm text-slate-600">
                <CreditCard class="h-4 w-4" />
                <span>Card details</span>
              </div>
              {#if stripeClientSecret}
                <div class="rounded-lg border border-slate-200 p-4">
                  <div bind:this={paymentElementContainer}></div>
                </div>
                {#if checkoutStaleMessage}
                  <p class="text-sm text-amber-600">{checkoutStaleMessage}</p>
                {/if}
                {#if errorMessage}
                  <p class="text-sm text-red-600 whitespace-pre-line">{errorMessage}</p>
                {/if}
              {:else}
                <div class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-xs text-slate-500 whitespace-pre-line">
                  {errorMessage || 'Loading the secure card form...'}
                </div>
                {#if checkoutStaleMessage}
                  <p class="text-sm text-amber-600">{checkoutStaleMessage}</p>
                {/if}
              {/if}
            </div>
          {:else}
            <div class="rounded-xl border border-slate-200 p-4 space-y-3">
              <h4 class="text-sm font-semibold text-slate-900">Payment method</h4>
              {#if isLoggedIn}
                <label class="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-3 transition-colors hover:bg-slate-50">
                  <input
                    type="radio"
                    name="payment-method"
                    value="stripe"
                    bind:group={paymentMethod}
                    class="mt-1 h-4 w-4 text-slate-900 focus:ring-slate-300"
                  />
                  <div>
                    <p class="text-sm font-semibold text-slate-900">Pay with card</p>
                    <p class="text-xs text-slate-500">Secure checkout powered by Stripe.</p>
                  </div>
                </label>
              {:else if !showStripeAuthNotice}
                <button
                  type="button"
                  class="w-full text-left flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-3 transition-colors hover:bg-slate-50"
                  on:click={handleStripeAuthNotice}
                >
                  <div>
                    <p class="text-sm font-semibold text-slate-900">Pay with card</p>
                    <p class="text-xs text-slate-500">Requires an account.</p>
                  </div>
                </button>
              {:else}
                <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <p class="text-xs text-slate-600">
                    To pay with card, please
                    <a href={ROUTES.AUTH.LOGIN} class="font-semibold text-slate-900 underline">login</a>
                    or
                    <a href={ROUTES.AUTH.REGISTER} class="font-semibold text-slate-900 underline">register</a>
                    an account.
                  </p>
                </div>
              {/if}
              {#if isLoggedIn}
                <label class="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-3 transition-colors hover:bg-slate-50">
                  <input
                    type="radio"
                    name="payment-method"
                    value="credits"
                    bind:group={paymentMethod}
                    class="mt-1 h-4 w-4 text-slate-900 focus:ring-slate-300"
                  />
                  <div>
                    <p class="text-sm font-semibold text-slate-900">Pay with crypto (credits)</p>
                    <p class="text-xs text-slate-500">
                      Use your available balance.
                    </p>
                    {#if !isUsdCurrency}
                      <p class="mt-1 text-[11px] text-slate-500">
                        Crypto payments are based on USD pricing.
                      </p>
                    {/if}
                  </div>
                </label>
              {:else if !showCreditsAuthNotice}
                <button
                  type="button"
                  class="w-full text-left flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-3 transition-colors hover:bg-slate-50"
                  on:click={handleCreditsAuthNotice}
                >
                  <div>
                    <p class="text-sm font-semibold text-slate-900">Pay with crypto (credits)</p>
                    <p class="text-xs text-slate-500">Requires an account.</p>
                  </div>
                </button>
              {:else}
                <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <p class="text-xs text-slate-600">
                    To pay with crypto (credits), please
                    <a href={ROUTES.AUTH.LOGIN} class="font-semibold text-slate-900 underline">login</a>
                    or
                    <a href={ROUTES.AUTH.REGISTER} class="font-semibold text-slate-900 underline">register</a>
                    an account.
                  </p>
                </div>
              {/if}
              {#if paymentMethod === 'stripe' && checkoutStaleMessage}
                <p class="text-xs text-amber-700">{checkoutStaleMessage}</p>
              {/if}
            </div>
          {/if}

          {#if paymentMethod === 'credits'}
            <div class="rounded-xl border border-slate-200 p-4 space-y-3">
              <div class="flex items-center justify-between text-sm">
                <span class="text-slate-600">Available credits</span>
                <span class="font-semibold text-slate-900">{resolvedCredits}</span>
              </div>
              <div class="flex items-center justify-between text-sm">
                <span class="text-slate-600">Credits needed</span>
                <span class="font-semibold text-slate-900">
                  {creditsQuoteLoading ? '--' : creditsRequired ?? '--'}
                </span>
              </div>
              {#if !isUsdCurrency}
                <p class="text-[11px] text-slate-500">
                  Credit totals use USD pricing even when browsing another currency.
                </p>
              {/if}
            {#if !hasEnoughCredits}
              <div class="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                <AlertCircle class="mt-0.5 h-4 w-4" />
                <p class="text-xs">
                  You don't have enough credits. <a href={topUpHref} class="font-semibold underline">Top up</a> to continue.
                </p>
              </div>
            {/if}
            {#if creditsQuoteMessage}
              <p class="text-xs text-amber-700">{creditsQuoteMessage}</p>
            {/if}
            {#if validationMessage}
              <p class="text-xs text-amber-700">{validationMessage}</p>
            {/if}
              {#if errorMessage}
                <p class="text-xs text-red-600">{errorMessage}</p>
              {/if}
            </div>
          {/if}
        </section>
      </div>

      <div class="flex items-center justify-between px-6 pb-6">
        <button
          on:click={handleClose}
          class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          disabled={isProcessing}
        >
          Cancel
        </button>
        <div class="flex items-center gap-3">
          {#if paymentMethod === 'stripe' && stripeFormOpen}
            <button
              type="button"
              on:click={handleStripeBack}
              class="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              disabled={isProcessing}
            >
              Go back
            </button>
          {/if}
          <button
            on:click={handlePrimaryAction}
            class="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-pink-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={primaryDisabled}
          >
            {#if isProcessing}
              <Loader2 class="h-4 w-4 animate-spin" />
              <span>Working...</span>
            {:else}
              <span>{primaryLabel}</span>
            {/if}
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>
