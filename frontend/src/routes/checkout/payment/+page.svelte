<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import Footer from '$lib/components/home/Footer.svelte';
  import { checkoutService } from '$lib/api/checkout.js';
  import type {
    CheckoutDraftLegalConsentState,
    CheckoutDraftState,
  } from '$lib/utils/checkoutDraftState.js';
  import {
    loadCheckoutDraftState,
    saveCheckoutDraftState,
  } from '$lib/utils/checkoutDraftState.js';
  import type { CheckoutPayopMethodQuote } from '$lib/types/checkout.js';
  import { formatCurrency, normalizeCurrencyCode } from '$lib/utils/currency.js';
  import {
    ArrowLeft,
    Loader2,
  } from 'lucide-svelte';

  const countryNames =
    browser && typeof Intl !== 'undefined' && 'DisplayNames' in Intl
      ? new Intl.DisplayNames(['en'], { type: 'region' })
      : null;

  const methodTypeLabels: Record<CheckoutPayopMethodQuote['type'], string> = {
    ewallet: 'E-wallet',
    bank_transfer: 'Bank transfer',
  };

  let draftState: CheckoutDraftState | null = null;
  let checkoutSessionKey: string | null = null;
  let orderId: string | null = null;
  let draftEmail = '';
  let draftGuestIdentityId: string | null = null;
  let appliedCouponCode: string | null = null;
  let legalConsent: CheckoutDraftLegalConsentState = {
    immediateFulfillmentConsent: false,
    termsPolicyConsent: false,
  };

  let loading = true;
  let refreshingMethods = false;
  let creatingSession = false;
  let loadError = '';
  let actionError = '';

  let displayCurrency = 'USD';
  let displayTotalCents = 0;
  let selectedCountry: string | null = null;
  let countryOptions: string[] = [];
  let methods: CheckoutPayopMethodQuote[] = [];
  let selectedMethodId: number | null = null;
  let selectedMethod: CheckoutPayopMethodQuote | null = null;
  let summaryCurrency = 'USD';
  let summarySubtotalCents = 0;
  let summaryFeeCents: number | null = null;
  let summaryTotalCents = 0;
  let requestCounter = 0;
  let consentNeedsAttention = false;
  let consentAttentionTimer: ReturnType<typeof setTimeout> | null = null;

  const resolveCountryLabel = (countryCode: string | null | undefined): string => {
    const normalized = (countryCode || '').trim().toUpperCase();
    if (!normalized) {
      return 'Unknown';
    }
    return countryNames?.of(normalized) || normalized;
  };

  const formatCents = (amountCents: number, currencyCode: string): string =>
    formatCurrency(amountCents / 100, normalizeCurrencyCode(currencyCode) || 'USD');

  const clearConsentAttention = (): void => {
    consentNeedsAttention = false;
    if (consentAttentionTimer) {
      clearTimeout(consentAttentionTimer);
      consentAttentionTimer = null;
    }
  };

  const focusConsentSection = (): void => {
    consentNeedsAttention = true;

    if (browser) {
      requestAnimationFrame(() => {
        const card = document.getElementById('payment-consent-card');
        card?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });

        const firstUncheckedCheckbox = !legalConsent.immediateFulfillmentConsent
          ? document.getElementById(
              'payment-consent-immediate'
            )
          : !legalConsent.termsPolicyConsent
            ? document.getElementById('payment-consent-terms')
            : null;
        (firstUncheckedCheckbox as HTMLInputElement | null)?.focus();
      });
    }

    if (consentAttentionTimer) {
      clearTimeout(consentAttentionTimer);
    }
    consentAttentionTimer = setTimeout(() => {
      consentNeedsAttention = false;
      consentAttentionTimer = null;
    }, 1600);
  };

  const ensureConsentBeforeContinuing = (): boolean => {
    if (
      legalConsent.immediateFulfillmentConsent &&
      legalConsent.termsPolicyConsent
    ) {
      clearConsentAttention();
      return true;
    }

    focusConsentSection();
    return false;
  };

  const handleLegalConsentChange = (): void => {
    actionError = '';
    clearConsentAttention();
    persistDraftState();
  };

  const persistDraftState = () => {
    if (!draftState?.email && !draftEmail) {
      return;
    }

    saveCheckoutDraftState({
      email: draftEmail || draftState?.email || '',
      guestIdentityId: draftGuestIdentityId,
      checkoutSessionKey,
      orderId,
      appliedCouponCode,
      selectedPaymentCountry: selectedCountry,
      legalConsent,
    });
  };

  const getAccessPayload = (): { checkout_session_key: string } | { order_id: string } | null => {
    if (checkoutSessionKey) {
      return { checkout_session_key: checkoutSessionKey };
    }
    if (orderId) {
      return { order_id: orderId };
    }
    return null;
  };

  const resolvePreferredMethodId = (
    nextMethods: CheckoutPayopMethodQuote[],
    recommendedMethodId?: number | null
  ): number | null => {
    const currentMatch = nextMethods.find(
      method => method.method_id === selectedMethodId
    );
    if (currentMatch) {
      return currentMatch.method_id;
    }

    const recommendedMatch = nextMethods.find(
      method => method.method_id === recommendedMethodId
    );
    if (recommendedMatch) {
      return recommendedMatch.method_id;
    }

    return nextMethods[0]?.method_id ?? null;
  };

  const loadPaymentOptions = async (options?: {
    countryCode?: string | null;
    silent?: boolean;
  }): Promise<void> => {
    const accessPayload = getAccessPayload();
    if (!accessPayload) {
      await goto('/checkout');
      return;
    }

    const requestId = ++requestCounter;
    if (options?.silent) {
      refreshingMethods = true;
    } else {
      loading = true;
    }
    loadError = '';

    try {
      const response = await checkoutService.getPayopOptions({
        ...accessPayload,
        country_code: options?.countryCode ?? selectedCountry ?? null,
      });

      if (requestId !== requestCounter) {
        return;
      }

      orderId = response.order_id;
      displayCurrency = response.display_currency;
      displayTotalCents = response.display_total_cents;
      selectedCountry =
        response.selected_country ??
        options?.countryCode ??
        selectedCountry ??
        response.detected_country ??
        null;
      countryOptions = response.country_options;
      methods = response.methods;
      selectedMethodId = resolvePreferredMethodId(
        response.methods,
        response.selected_method_id
      );
      persistDraftState();
    } catch (error) {
      if (requestId !== requestCounter) {
        return;
      }
      loadError =
        error instanceof Error
          ? error.message
          : 'Unable to load payment methods.';
      methods = [];
      selectedMethodId = null;
    } finally {
      if (requestId === requestCounter) {
        loading = false;
        refreshingMethods = false;
      }
    }
  };

  const handleCountryChange = async (event: Event) => {
    const nextCountry = (event.currentTarget as HTMLSelectElement).value || null;
    selectedCountry = nextCountry;
    selectedMethodId = null;
    persistDraftState();
    await loadPaymentOptions({
      countryCode: nextCountry,
      silent: true,
    });
  };

  const handleContinueToProvider = async () => {
    actionError = '';

    if (!ensureConsentBeforeContinuing()) {
      return;
    }

    const selectedMethod = methods.find(
      method => method.method_id === selectedMethodId
    );
    if (!selectedMethod) {
      actionError = 'Please choose an available payment method.';
      return;
    }

    const accessPayload = getAccessPayload();
    if (!accessPayload) {
      await goto('/checkout');
      return;
    }

    creatingSession = true;
    try {
      const response = await checkoutService.createPayopSession({
        ...accessPayload,
        method_id: selectedMethod.method_id,
        country_code: selectedCountry,
        legal_consent: {
          immediate_fulfillment_consent:
            legalConsent.immediateFulfillmentConsent,
          terms_policy_consent: legalConsent.termsPolicyConsent,
          consent_timestamp: new Date().toISOString(),
          checkout_session_key_snapshot: checkoutSessionKey,
          consent_source: 'checkout_payment_page',
        },
      });

      orderId = response.order_id;
      persistDraftState();
      window.location.assign(response.session_url);
    } catch (error) {
      actionError =
        error instanceof Error ? error.message : 'Unable to start payment.';
    } finally {
      creatingSession = false;
    }
  };

  $: selectedMethod =
    methods.find(method => method.method_id === selectedMethodId) ?? null;

  $: summaryCurrency = selectedMethod?.processing_currency || displayCurrency;

  $: summarySubtotalCents =
    selectedMethod?.processing_subtotal_cents ?? displayTotalCents;

  $: summaryFeeCents = selectedMethod?.processing_fee_cents ?? null;

  $: summaryTotalCents =
    selectedMethod?.processing_total_cents ?? displayTotalCents;

  onMount(async () => {
    draftState = loadCheckoutDraftState();
    checkoutSessionKey = draftState?.checkoutSessionKey ?? null;
    orderId = draftState?.orderId ?? null;
    draftEmail = draftState?.email ?? '';
    draftGuestIdentityId = draftState?.guestIdentityId ?? null;
    appliedCouponCode = draftState?.appliedCouponCode ?? null;
    legalConsent = draftState?.legalConsent ?? {
      immediateFulfillmentConsent: false,
      termsPolicyConsent: false,
    };
    selectedCountry = draftState?.selectedPaymentCountry ?? null;

    if (!checkoutSessionKey && !orderId) {
      await goto('/checkout');
      return;
    }

    await loadPaymentOptions({
      countryCode: selectedCountry,
    });
  });

  onDestroy(() => {
    if (consentAttentionTimer) {
      clearTimeout(consentAttentionTimer);
    }
  });
</script>

<svelte:head>
  <title>Payment Methods - SubSlush</title>
  <meta
    name="description"
    content="Choose your payment method and review your final payment total."
  />
</svelte:head>

<div class="min-h-screen bg-white">
  <HomeNav />

  <main class="relative overflow-hidden">
    <div class="payment-top-glow pointer-events-none absolute inset-x-0 top-0 h-56"></div>

    <section class="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <a
        href="/checkout"
        class="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-slate-900"
      >
        <ArrowLeft class="h-4 w-4" />
        Back to checkout
      </a>

      <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_23.5rem] lg:items-start">
        <section class="space-y-4">
          <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_36px_rgba(15,23,42,0.08)] sm:p-6">
            <h1 class="text-xl font-bold text-slate-900">Payment methods</h1>
            <div class="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <p class="text-sm text-slate-700">
                Choose your country to see the payment methods available to you.
              </p>
              <div class="mt-3 max-w-sm">
                <select
                  class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300"
                  bind:value={selectedCountry}
                  on:change={handleCountryChange}
                  disabled={loading || creatingSession}
                >
                  <option value="" disabled={!selectedCountry}>Select country</option>
                  {#each countryOptions as countryCode}
                    <option value={countryCode}>{resolveCountryLabel(countryCode)}</option>
                  {/each}
                </select>
              </div>
            </div>

            <div class="mt-4 rounded-2xl border border-slate-200 bg-white">
              <div class="border-b border-slate-200 px-4 py-3">
                <div class="flex items-center justify-between gap-3">
                  <p class="text-sm font-semibold text-slate-900">Available methods</p>
                  {#if refreshingMethods}
                    <div class="inline-flex items-center gap-2 text-xs text-slate-500">
                      <Loader2 class="h-4 w-4 animate-spin" />
                      Updating...
                    </div>
                  {/if}
                </div>
              </div>

              {#if loading}
                <div class="space-y-3 p-4">
                  {#each Array.from({ length: 3 }) as _, index}
                    <div class="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4" aria-hidden="true">
                      <div class="h-4 w-40 animate-pulse rounded bg-slate-200"></div>
                      <div class="mt-3 h-3 w-56 animate-pulse rounded bg-slate-100"></div>
                    </div>
                  {/each}
                </div>
              {:else if loadError}
                <div class="p-4">
                  <div class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                    {loadError}
                  </div>
                  <button
                    type="button"
                    class="mt-3 inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    on:click={() => {
                      void loadPaymentOptions({
                        countryCode: selectedCountry,
                      });
                    }}
                  >
                    Try again
                  </button>
                </div>
              {:else if methods.length === 0}
                <div class="p-4">
                  <div class="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
                    No payment methods are currently available for {selectedCountry ? resolveCountryLabel(selectedCountry) : 'the selected country'}.
                    Choose another country or return to checkout.
                  </div>
                </div>
              {:else}
                <div class="p-4">
                  <div class="space-y-3">
                    {#each methods as method}
                      <button
                        type="button"
                        class={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                          selectedMethodId === method.method_id
                            ? 'border-fuchsia-300 bg-fuchsia-50/40 shadow-sm'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                        }`}
                        on:click={() => {
                          selectedMethodId = method.method_id;
                          actionError = '';
                        }}
                      >
                        <div class="flex items-start gap-3">
                          <div class={`mt-1 h-4 w-4 rounded-full border ${
                            selectedMethodId === method.method_id
                              ? 'border-fuchsia-500 ring-4 ring-fuchsia-100'
                              : 'border-slate-300'
                          }`}></div>
                          <div class="min-w-0 flex-1">
                            <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div class="min-w-0">
                                <p class="text-sm font-semibold text-slate-900">
                                  {method.title}
                                </p>
                                <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                                  <span class="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                                    {methodTypeLabels[method.type]}
                                  </span>
                                </div>
                              </div>
                              <div class="shrink-0 text-left sm:text-right">
                                <p class="text-sm font-semibold text-slate-900">
                                  {formatCents(method.processing_total_cents, method.processing_currency)}
                                </p>
                                <p class="mt-1 text-xs text-slate-500">
                                  Fee {formatCents(method.processing_fee_cents, method.processing_currency)}
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          </div>
        </section>

        <aside class="lg:sticky lg:top-24">
          <div class="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_36px_rgba(15,23,42,0.08)] sm:p-6">
            <div class="space-y-3 text-sm text-slate-600">
              <div class="flex items-center justify-between gap-4">
                <span>Cart total</span>
                <span class="font-semibold text-slate-900">
                  {formatCents(summarySubtotalCents, summaryCurrency)}
                </span>
              </div>
              <div class="flex items-center justify-between gap-4">
                <span>Payment fee</span>
                <span class="font-semibold text-slate-900">
                  {#if summaryFeeCents !== null}
                    {formatCents(summaryFeeCents, summaryCurrency)}
                  {:else}
                    --
                  {/if}
                </span>
              </div>
            </div>

            <div class="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p class="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                Total
              </p>
              <p class="mt-1 text-3xl font-black leading-none tracking-tight text-slate-900">
                {formatCents(summaryTotalCents, summaryCurrency)}
              </p>
            </div>

            <div
              id="payment-consent-card"
              class={`mt-4 rounded-2xl border px-4 py-4 transition ${
                consentNeedsAttention
                  ? 'consent-attention-pulse border-fuchsia-300 bg-fuchsia-50/50'
                  : 'border-slate-200 bg-slate-50/80'
              }`}
            >
              <label
                class={`flex items-start gap-2.5 rounded-xl border px-3 py-3 text-xs transition ${
                  consentNeedsAttention &&
                  !legalConsent.immediateFulfillmentConsent
                    ? 'border-fuchsia-300 bg-white'
                    : 'border-transparent'
                } text-slate-700`}
              >
                <input
                  id="payment-consent-immediate"
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-fuchsia-300"
                  bind:checked={legalConsent.immediateFulfillmentConsent}
                  on:change={handleLegalConsentChange}
                />
                <span>
                  I request immediate digital delivery and understand that my 14-day withdrawal right may end once fulfillment begins.
                </span>
              </label>

              <label
                class={`mt-3 flex items-start gap-2.5 rounded-xl border px-3 py-3 text-xs transition ${
                  consentNeedsAttention && !legalConsent.termsPolicyConsent
                    ? 'border-fuchsia-300 bg-white'
                    : 'border-transparent'
                } text-slate-700`}
              >
                <input
                  id="payment-consent-terms"
                  type="checkbox"
                  class="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-fuchsia-300"
                  bind:checked={legalConsent.termsPolicyConsent}
                  on:change={handleLegalConsentChange}
                />
                <span>
                  I agree to the
                  <a href="/terms" class="ml-1 underline underline-offset-2 hover:text-slate-900">Terms and Conditions</a>,
                  <a href="/returns" class="ml-1 underline underline-offset-2 hover:text-slate-900">Refund Policy</a>,
                  and
                  <a href="/privacy" class="ml-1 underline underline-offset-2 hover:text-slate-900">Privacy Policy</a>.
                </span>
              </label>
            </div>

            <p class="mt-3 text-xs text-slate-600">
              Sold by 2Sneaks AB.
              <a
                href="/terms#trader-identity-company-information"
                class="ml-1 underline underline-offset-2 hover:text-slate-900"
              >
                Full legal details
              </a>.
            </p>

            {#if actionError}
              <div class="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {actionError}
              </div>
            {/if}

            <button
              type="button"
              class="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(126,34,206,0.28)] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              on:click={() => {
                void handleContinueToProvider();
              }}
              disabled={!selectedMethod || creatingSession || refreshingMethods || loading}
            >
              {#if creatingSession}
                <Loader2 class="h-4 w-4 animate-spin" />
                Redirecting...
              {:else if selectedMethod}
                Continue with {selectedMethod.title}
              {:else}
                Select a payment method
              {/if}
            </button>
          </div>
        </aside>
      </div>
    </section>
  </main>

  <Footer />
</div>

<style>
  .payment-top-glow {
    background:
      radial-gradient(70% 120% at 8% 0%, rgba(192, 132, 252, 0.22), transparent 68%),
      radial-gradient(65% 100% at 92% 0%, rgba(244, 114, 182, 0.2), transparent 64%);
  }

  @keyframes paymentConsentAttentionPulse {
    0% {
      box-shadow: 0 0 0 0 rgba(217, 70, 239, 0.2);
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

  .consent-attention-pulse {
    animation: paymentConsentAttentionPulse 820ms ease-in-out 2;
  }
</style>
