<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import Footer from '$lib/components/home/Footer.svelte';
  import { checkoutService } from '$lib/api/checkout.js';
  import { auth } from '$lib/stores/auth.js';
  import { cart } from '$lib/stores/cart.js';
  import {
    clearCheckoutDraftStorage,
    loadCheckoutDraftState,
    saveCheckoutDraftState,
  } from '$lib/utils/checkoutDraftState.js';
  import { formatCurrency, normalizeCurrencyCode } from '$lib/utils/currency.js';
  import { trackPurchase, type AnalyticsItem } from '$lib/utils/analytics.js';
  import type { CheckoutAntomStatusResponse } from '$lib/types/checkout.js';
  import { CheckCircle2, Clock3, Loader2, ShieldCheck, XCircle } from 'lucide-svelte';

  const POLL_INTERVAL_MS = 8000;
  const POLL_TIMEOUT_MS = 120000;
  const PURCHASE_TRACKED_STORAGE_KEY = 'tiktok:checkout_purchase';
  const RETRYABLE_FAILURE_STATUSES = new Set([
    'f',
    'fail',
    'failed',
    'failure',
    'cancel',
    'canceled',
    'cancelled',
    'expired',
    'declined',
    'rejected',
    'payment_fail',
    'payment_failed',
    'capture_failed',
    'payment_declined',
    'card_declined',
    'risk_reject',
    'fraud_reject',
  ]);

  let orderId: string | null = null;
  let paymentRequestId: string | null = null;
  let antomPaymentId: string | null = null;
  let checkoutSessionKey: string | null = null;

  let loading = true;
  let pollComplete = false;
  let actionError = '';
  let finalizedState: 'pending' | 'success' | 'failed' = 'pending';
  let paymentStatus: string | null = null;
  let methodTitle: string | null = null;
  let orderCreatedAt: string | null = null;
  let processingCurrency: string | null = null;
  let processingTotalCents: number | null = null;
  let processingTaxCents: number | null = null;
  let taxResidenceLabel: string | null = null;
  let checkoutContactEmail: string | null = null;
  let confirmationEmail: string | null = null;
  let canRetry = false;
  let cartCleared = false;
  let pollingActive = true;
  let pollingInProgress = false;
  let redirectingToPayment = false;
  let returnFailureSignal = false;
  let hostedCheckoutReturn = false;

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const isSuccessfulOrderStatus = (value: string | null | undefined): boolean =>
    Boolean(value && ['in_process', 'paid', 'delivered'].includes(value));

  const hasTrackedPurchase = (eventId: string): boolean => {
    if (!browser) return false;
    try {
      return sessionStorage.getItem(`${PURCHASE_TRACKED_STORAGE_KEY}:${eventId}`) === '1';
    } catch {
      return false;
    }
  };

  const markPurchaseTracked = (eventId: string): void => {
    if (!browser) return;
    try {
      sessionStorage.setItem(`${PURCHASE_TRACKED_STORAGE_KEY}:${eventId}`, '1');
    } catch {
      // Ignore storage failures; tracking should not block the checkout status UI.
    }
  };

  const formatDateOnly = (value: string | null | undefined): string | null => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value.slice(0, 10) || null;
    }
    return parsed.toISOString().slice(0, 10);
  };

  const normalizePaymentMethodLabel = (value: string | null | undefined): string => {
    const label = value?.trim();
    if (!label || label.toLowerCase() === 'cards') {
      return 'Card';
    }
    return label;
  };

  const normalizeStatusValue = (value: string | null | undefined): string =>
    (value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_');

  const isRetryableFailureStatus = (value: string | null | undefined): boolean => {
    const normalized = normalizeStatusValue(value);
    return (
      RETRYABLE_FAILURE_STATUSES.has(normalized) ||
      normalized.endsWith('_failed') ||
      normalized.endsWith('_fail') ||
      normalized.includes('declin') ||
      normalized.includes('reject') ||
      normalized.includes('cancel')
    );
  };

  const hasFailureReturnSignal = (params: URLSearchParams): boolean => {
    for (const [key, value] of params.entries()) {
      const normalizedKey = key
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_');
      const isRelevantKey =
        normalizedKey === 'status' ||
        normalizedKey.includes('payment') ||
        normalizedKey.includes('result') ||
        normalizedKey.includes('error');
      if (isRelevantKey && isRetryableFailureStatus(value)) {
        return true;
      }
    }

    return false;
  };

  const isHostedCheckoutReturn = (params: URLSearchParams): boolean =>
    normalizeStatusValue(params.get('status')) === 'return';

  const shouldReturnToPaymentPage = (params: {
    paymentStatus?: string | null;
    providerStatus?: string | null;
    canRetry?: boolean;
  }): boolean => {
    return (
      isRetryableFailureStatus(params.paymentStatus ?? null) ||
      (params.canRetry === true && isRetryableFailureStatus(params.providerStatus ?? null))
    );
  };

  $: shortOrderId = orderId ? orderId.slice(0, 8) : null;
  $: orderDate = formatDateOnly(orderCreatedAt);
  $: paymentMethodLabel = normalizePaymentMethodLabel(methodTitle);
  $: paymentSuccessLabel =
    paymentMethodLabel.toLowerCase() === 'card'
      ? 'Your card payment was successful.'
      : `Your ${paymentMethodLabel} payment was successful.`;

  const getStatusPayload = () => {
    const identifierPayload: {
      payment_request_id?: string;
      payment_id?: string;
    } = {};
    if (paymentRequestId) {
      identifierPayload.payment_request_id = paymentRequestId;
    }
    if (antomPaymentId) {
      identifierPayload.payment_id = antomPaymentId;
    }

    if (checkoutSessionKey) {
      return {
        checkout_session_key: checkoutSessionKey,
        ...identifierPayload,
      };
    }
    if (orderId) {
      return {
        order_id: orderId,
        ...identifierPayload,
      };
    }
    return null;
  };

  const updateResolvedState = (orderStatus: string | null | undefined) => {
    if (isSuccessfulOrderStatus(orderStatus)) {
      finalizedState = 'success';
      return;
    }

    if (paymentStatus && ['failed', 'expired', 'canceled'].includes(paymentStatus)) {
      finalizedState = 'failed';
      return;
    }

    finalizedState = 'pending';
  };

  const trackPurchaseFromStatus = (response: CheckoutAntomStatusResponse): void => {
    const tracking = response.purchase_tracking;
    if (
      !browser ||
      !isSuccessfulOrderStatus(response.order_status) ||
      !tracking ||
      !tracking.event_id ||
      !Array.isArray(tracking.items) ||
      hasTrackedPurchase(tracking.event_id)
    ) {
      return;
    }

    const items: AnalyticsItem[] = tracking.items.map((item) => ({ ...item }));
    if (items.length === 0) {
      return;
    }

    trackPurchase(
      tracking.transaction_id || response.order_id,
      tracking.currency || 'USD',
      tracking.value,
      items,
      tracking.event_id
    );
    markPurchaseTracked(tracking.event_id);
  };

  const applyStatusResponse = (response: CheckoutAntomStatusResponse): void => {
    orderId = response.order_id;
    paymentStatus = response.payment_status ?? null;
    orderCreatedAt = response.order_created_at ?? orderCreatedAt;
    paymentRequestId = response.payment_request_id ?? paymentRequestId;
    antomPaymentId = response.antom_payment_id ?? antomPaymentId;
    methodTitle = response.method_title ?? null;
    processingCurrency = response.processing_currency ?? null;
    processingTotalCents = response.processing_total_cents ?? null;
    processingTaxCents = response.processing_tax_cents ?? null;
    taxResidenceLabel = response.tax_residence_label ?? null;
    canRetry = response.can_retry === true;
    trackPurchaseFromStatus(response);
  };

  const resolveHostedCheckoutReturn = async () => {
    const statusPayload = getStatusPayload();
    if (!statusPayload) {
      await goto('/checkout');
      return;
    }

    loading = true;
    pollComplete = false;
    actionError = '';

    try {
      const response = await checkoutService.getAntomStatus(statusPayload);
      applyStatusResponse(response);

      if (isSuccessfulOrderStatus(response.order_status)) {
        updateResolvedState(response.order_status);
        loading = false;
        pollComplete = true;
        return;
      }
    } catch {
      // The preserved checkout draft is enough to return the customer to payment.
    }

    await redirectToPaymentPage();
  };

  const preserveCheckoutReturnState = (): void => {
    const draft = loadCheckoutDraftState();
    if (!draft?.email) {
      return;
    }

    saveCheckoutDraftState({
      ...draft,
      checkoutSessionKey: checkoutSessionKey ?? draft.checkoutSessionKey,
      orderId: orderId ?? draft.orderId,
      selectedPaymentProvider: draft.selectedPaymentProvider ?? 'antom',
      selectedAntomOptionId: draft.selectedAntomOptionId ?? 'cards',
    });
  };

  const pollStatus = async () => {
    if (pollingInProgress || redirectingToPayment) {
      return;
    }

    const statusPayload = getStatusPayload();
    if (!statusPayload) {
      await goto('/checkout');
      return;
    }

    pollingInProgress = true;
    loading = true;
    pollComplete = false;
    actionError = '';
    const startedAt = Date.now();

    try {
      while (pollingActive && Date.now() - startedAt < POLL_TIMEOUT_MS) {
        try {
          const response = await checkoutService.getAntomStatus(statusPayload);
          applyStatusResponse(response);

          if (
            shouldReturnToPaymentPage({
              paymentStatus,
              providerStatus: response.provider_status ?? null,
              canRetry,
            })
          ) {
            await redirectToPaymentPage();
            return;
          }

          updateResolvedState(response.order_status);
          if (finalizedState === 'success') {
            loading = false;
            pollComplete = true;
            return;
          }
        } catch (error) {
          actionError =
            error instanceof Error ? error.message : 'Unable to confirm payment status.';
          loading = false;
          pollComplete = true;
          return;
        }

        await wait(POLL_INTERVAL_MS);
      }

      loading = false;
      pollComplete = true;
    } finally {
      pollingInProgress = false;
    }
  };

  const redirectToPaymentPage = async (options?: { reconcile?: boolean }) => {
    if (redirectingToPayment) {
      return;
    }

    redirectingToPayment = true;
    pollingActive = false;
    preserveCheckoutReturnState();

    if (options?.reconcile) {
      const statusPayload = getStatusPayload();
      if (statusPayload) {
        try {
          await checkoutService.getAntomStatus(statusPayload);
        } catch {
          // The payment page can still reload the preserved checkout state.
        }
      }
    }

    await goto('/checkout/payment', { replaceState: true });
  };

  const unsubscribe = page.subscribe(($page) => {
    orderId = $page.url.searchParams.get('order_id') ?? orderId;
    paymentRequestId = $page.url.searchParams.get('payment_request_id') ?? paymentRequestId;
    antomPaymentId = $page.url.searchParams.get('payment_id') ?? antomPaymentId;
    returnFailureSignal = hasFailureReturnSignal($page.url.searchParams);
    hostedCheckoutReturn = isHostedCheckoutReturn($page.url.searchParams);
  });

  $: confirmationEmail = $auth.user?.email?.trim() || checkoutContactEmail || null;

  $: returningToPayment = finalizedState === 'pending' && redirectingToPayment;

  $: if (browser && finalizedState === 'success' && !cartCleared) {
    cart.clear();
    clearCheckoutDraftStorage();
    cartCleared = true;
  }

  onMount(async () => {
    const draft = loadCheckoutDraftState();
    checkoutSessionKey = draft?.checkoutSessionKey ?? null;
    orderId = orderId ?? draft?.orderId ?? null;
    checkoutContactEmail = draft?.email?.trim().toLowerCase() ?? null;

    if (!checkoutSessionKey && !orderId) {
      await goto('/checkout');
      return;
    }

    if (returnFailureSignal || hostedCheckoutReturn) {
      await resolveHostedCheckoutReturn();
      return;
    }

    await pollStatus();
  });

  onDestroy(() => {
    pollingActive = false;
    unsubscribe();
  });
</script>

<svelte:head>
  <title>Payment Status - SubSlush</title>
  <meta
    name="description"
    content="Confirming your card payment status and finalizing your order."
  />
</svelte:head>

<div class="min-h-screen bg-slate-50">
  <HomeNav />

  <main class="relative overflow-hidden">
    <div
      class="pointer-events-none absolute inset-x-0 top-0 h-60 bg-gradient-to-br from-purple-100/70 via-purple-100/30 to-pink-100/70"
    ></div>

    <section class="relative mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div class="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
        <div
          class="border-b border-slate-100 bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-6 sm:px-8"
        >
          <div class="flex items-center gap-4">
            <div
              class={`flex h-12 w-12 items-center justify-center rounded-full ${
                finalizedState === 'success'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : finalizedState === 'failed'
                    ? 'bg-rose-500/15 text-rose-300'
                    : 'bg-white/10 text-white'
              }`}
            >
              {#if finalizedState === 'success'}
                <CheckCircle2 class="h-7 w-7" />
              {:else if finalizedState === 'failed'}
                <XCircle class="h-7 w-7" />
              {:else}
                <Clock3 class="h-7 w-7" />
              {/if}
            </div>
            <div>
              <h1 class="mt-1 text-2xl font-bold text-white">
                {#if finalizedState === 'success'}
                  Payment confirmed
                {:else if finalizedState === 'failed'}
                  Payment not completed
                {:else if returningToPayment}
                  Returning to checkout
                {:else}
                  Confirming your payment
                {/if}
              </h1>
            </div>
          </div>
        </div>

        <div class="space-y-5 px-6 py-6 sm:px-8">
          {#if returningToPayment}
            <div
              class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700"
            >
              <div class="flex items-center gap-3">
                <Loader2 class="h-5 w-5 animate-spin text-fuchsia-600" />
                <p>Returning you to checkout so you can try again.</p>
              </div>
            </div>
          {:else if finalizedState === 'pending'}
            <div
              class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700"
            >
              <div class="flex items-center gap-3">
                <Loader2 class="h-5 w-5 animate-spin text-fuchsia-600" />
                <p>
                  We are waiting for the final payment confirmation from the provider. This page
                  updates automatically.
                </p>
              </div>
            </div>
          {/if}

          {#if finalizedState === 'success'}
            <div
              class="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800"
            >
              {paymentSuccessLabel} Your order is now being processed. Orders are usually delivered within
              24 hours, but in rare cases it may take up to 72 hours. We will email you as soon as your
              order has been delivered.
            </div>
          {/if}

          {#if finalizedState === 'failed'}
            <div
              class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700"
            >
              The payment was not completed. You can return and choose another payment method.
            </div>
          {/if}

          {#if actionError && finalizedState === 'pending' && !returningToPayment}
            <div
              class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700"
            >
              {actionError}
            </div>
          {/if}

          {#if finalizedState === 'success' && confirmationEmail}
            <div
              class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700"
            >
              We’ve sent your order and payment confirmation to <span
                class="font-semibold text-slate-900">{confirmationEmail}</span
              >.
            </div>
          {/if}

          {#if !returningToPayment}
            <div class="grid gap-4 md:grid-cols-2">
              <div class="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Order details
                </p>
                <dl class="mt-3 space-y-3 text-sm">
                  <div class="flex items-center justify-between gap-4">
                    <dt class="text-slate-600">SubSlush order ID</dt>
                    <dd class="font-semibold text-slate-900">{shortOrderId || '--'}</dd>
                  </div>
                  <div class="flex items-center justify-between gap-4">
                    <dt class="text-slate-600">Order date</dt>
                    <dd class="font-medium text-slate-900">{orderDate || '--'}</dd>
                  </div>
                  <div class="flex items-center justify-between gap-4">
                    <dt class="text-slate-600">Payment method</dt>
                    <dd class="font-medium text-slate-900">{paymentMethodLabel}</dd>
                  </div>
                </dl>
              </div>

              <div class="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Charge summary
                </p>
                <div class="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Total
                  </p>
                  <p class="mt-1 text-3xl font-black leading-none tracking-tight text-slate-900">
                    {#if processingCurrency && processingTotalCents !== null}
                      {formatCurrency(
                        processingTotalCents / 100,
                        normalizeCurrencyCode(processingCurrency) || 'USD'
                      )}
                    {:else}
                      --
                    {/if}
                  </p>
                  {#if processingCurrency && processingTaxCents !== null}
                    <p class="mt-2 text-sm font-medium text-slate-500">
                      Tax included {formatCurrency(
                        processingTaxCents / 100,
                        normalizeCurrencyCode(processingCurrency) || 'USD'
                      )}{taxResidenceLabel ? ` (${taxResidenceLabel})` : ''}
                    </p>
                  {/if}
                </div>
                <div
                  class="mt-3 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-xs text-slate-600"
                >
                  <ShieldCheck class="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />
                  <p>
                    Final order fulfillment is only completed after secure server-to-server payment
                    confirmation.
                  </p>
                </div>
              </div>
            </div>

            <div class="flex flex-col gap-3 sm:flex-row">
              {#if finalizedState === 'failed' || (pollComplete && canRetry)}
                <a
                  href="/checkout/payment"
                  class="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(126,34,206,0.28)] transition hover:opacity-95"
                >
                  Choose another payment method
                </a>
              {/if}

              {#if finalizedState === 'success'}
                <a
                  href="/browse"
                  class="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Continue shopping
                </a>
              {/if}

              {#if finalizedState === 'pending'}
                <button
                  type="button"
                  class="inline-flex items-center justify-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  on:click={() => {
                    void pollStatus();
                  }}
                  disabled={loading}
                >
                  {#if loading}
                    <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                  {/if}
                  Refresh status
                </button>
              {/if}
            </div>
          {/if}
        </div>
      </div>
    </section>
  </main>

  <Footer />
</div>
