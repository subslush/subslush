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
  } from '$lib/utils/checkoutDraftState.js';
  import { formatCurrency, normalizeCurrencyCode } from '$lib/utils/currency.js';
  import {
    CheckCircle2,
    Clock3,
    Loader2,
    ShieldCheck,
    XCircle,
  } from 'lucide-svelte';

  const POLL_INTERVAL_MS = 3000;
  const POLL_TIMEOUT_MS = 120000;

  let queryStatus = '';
  let orderId: string | null = null;
  let invoiceId: string | null = null;
  let txid: string | null = null;
  let checkoutSessionKey: string | null = null;

  let loading = true;
  let pollComplete = false;
  let actionError = '';
  let finalizedState: 'pending' | 'success' | 'failed' = 'pending';
  let paymentStatus: string | null = null;
  let providerStatus: string | null = null;
  let methodTitle: string | null = null;
  let processingCurrency: string | null = null;
  let processingTotalCents: number | null = null;
  let checkoutContactEmail: string | null = null;
  let confirmationEmail: string | null = null;
  let canRetry = false;
  let cartCleared = false;
  let pollingActive = true;

  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const getStatusPayload = () => {
    if (checkoutSessionKey) {
      return {
        checkout_session_key: checkoutSessionKey,
        invoice_id: invoiceId,
        txid,
      };
    }
    if (orderId) {
      return {
        order_id: orderId,
        invoice_id: invoiceId,
        txid,
      };
    }
    return null;
  };

  const updateResolvedState = (orderStatus: string | null | undefined) => {
    if (orderStatus && ['in_process', 'paid', 'delivered'].includes(orderStatus)) {
      finalizedState = 'success';
      return;
    }

    if (
      paymentStatus &&
      ['failed', 'expired', 'canceled'].includes(paymentStatus)
    ) {
      finalizedState = 'failed';
      return;
    }

    finalizedState = 'pending';
  };

  const pollStatus = async () => {
    const statusPayload = getStatusPayload();
    if (!statusPayload) {
      await goto('/checkout');
      return;
    }

    loading = true;
    pollComplete = false;
    actionError = '';
    const startedAt = Date.now();

    while (pollingActive && Date.now() - startedAt < POLL_TIMEOUT_MS) {
      try {
        const response = await checkoutService.getPayopStatus(statusPayload);
        orderId = response.order_id;
        paymentStatus = response.payment_status ?? null;
        providerStatus = response.provider_status ?? null;
        invoiceId = response.invoice_id ?? invoiceId;
        txid = response.txid ?? txid;
        methodTitle = response.method_title ?? null;
        processingCurrency = response.processing_currency ?? null;
        processingTotalCents = response.processing_total_cents ?? null;
        canRetry = response.can_retry === true;

        updateResolvedState(response.order_status);
        if (finalizedState !== 'pending') {
          loading = false;
          pollComplete = true;
          return;
        }
      } catch (error) {
        actionError =
          error instanceof Error
            ? error.message
            : 'Unable to confirm payment status.';
      }

      await wait(POLL_INTERVAL_MS);
    }

    loading = false;
    pollComplete = true;
  };

  const unsubscribe = page.subscribe($page => {
    queryStatus = $page.url.searchParams.get('status') ?? '';
    orderId = $page.url.searchParams.get('order_id') ?? orderId;
    invoiceId = $page.url.searchParams.get('invoice_id') ?? invoiceId;
    txid = $page.url.searchParams.get('txid') ?? txid;
  });

  $: confirmationEmail =
    $auth.user?.email?.trim() || checkoutContactEmail || null;

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
    content="Confirming your payment status and finalizing your order."
  />
</svelte:head>

<div class="min-h-screen bg-slate-50">
  <HomeNav />

  <main class="relative overflow-hidden">
    <div class="pointer-events-none absolute inset-x-0 top-0 h-60 bg-gradient-to-br from-purple-100/70 via-purple-100/30 to-pink-100/70"></div>

    <section class="relative mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <div class="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
        <div class="border-b border-slate-100 bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-6 sm:px-8">
          <div class="flex items-center gap-4">
            <div class={`flex h-12 w-12 items-center justify-center rounded-full ${
              finalizedState === 'success'
                ? 'bg-emerald-500/15 text-emerald-300'
                : finalizedState === 'failed'
                  ? 'bg-rose-500/15 text-rose-300'
                  : 'bg-white/10 text-white'
            }`}>
              {#if finalizedState === 'success'}
                <CheckCircle2 class="h-7 w-7" />
              {:else if finalizedState === 'failed'}
                <XCircle class="h-7 w-7" />
              {:else}
                <Clock3 class="h-7 w-7" />
              {/if}
            </div>
            <div>
              <p class="text-sm font-semibold uppercase tracking-[0.16em] text-white/60">
                Payop checkout
              </p>
              <h1 class="mt-1 text-2xl font-bold text-white">
                {#if finalizedState === 'success'}
                  Payment confirmed
                {:else if finalizedState === 'failed'}
                  Payment not completed
                {:else}
                  Confirming your payment
                {/if}
              </h1>
            </div>
          </div>
        </div>

        <div class="space-y-5 px-6 py-6 sm:px-8">
          {#if finalizedState === 'pending'}
            <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
              <div class="flex items-center gap-3">
                <Loader2 class="h-5 w-5 animate-spin text-fuchsia-600" />
                <p>
                  We are waiting for the final payment confirmation from the provider. This page updates automatically.
                </p>
              </div>
            </div>
          {/if}

          {#if finalizedState === 'success'}
            <div class="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
              Your payment was confirmed and your order is now being processed. Orders are usually delivered within 24 hours, but in rare cases it may take up to 72 hours. We will email you as soon as your order has been delivered.
            </div>
          {/if}

          {#if finalizedState === 'failed'}
            <div class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
              The payment was not completed. You can return and choose another payment method.
            </div>
          {/if}

          {#if actionError && finalizedState === 'pending'}
            <div class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
              {actionError}
            </div>
          {/if}

          {#if finalizedState === 'success' && confirmationEmail}
            <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
              We’ve sent your order and payment confirmation to <span class="font-semibold text-slate-900">{confirmationEmail}</span>.
            </div>
          {/if}

          <div class="grid gap-4 md:grid-cols-2">
            <div class="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Payment details
              </p>
              <dl class="mt-3 space-y-3 text-sm">
                <div class="flex items-center justify-between gap-4">
                  <dt class="text-slate-600">Method</dt>
                  <dd class="font-semibold text-slate-900">{methodTitle || 'Payop'}</dd>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <dt class="text-slate-600">Invoice ID</dt>
                  <dd class="font-medium text-slate-900">{invoiceId || '--'}</dd>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <dt class="text-slate-600">Transaction ID</dt>
                  <dd class="font-medium text-slate-900">{txid || '--'}</dd>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <dt class="text-slate-600">Provider status</dt>
                  <dd class="font-medium text-slate-900">{providerStatus || queryStatus || '--'}</dd>
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
              </div>
              <div class="mt-3 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-xs text-slate-600">
                <ShieldCheck class="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />
                <p>
                  Final order fulfillment is only completed after secure server-to-server payment confirmation.
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
        </div>
      </div>
    </section>
  </main>

  <Footer />
</div>
