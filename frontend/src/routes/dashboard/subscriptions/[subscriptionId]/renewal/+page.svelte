<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { loadStripe, type Stripe, type StripeElements, type StripePaymentElement } from '@stripe/stripe-js';
  import { subscriptionService } from '$lib/api/subscriptions.js';
  import type { Subscription } from '$lib/types/subscription.js';

  let subscription: Subscription | null = null;
  let clientSecret: string | null = null;
  let paymentId: string | null = null;
  let amount: number | null = null;
  let currency: string | null = null;
  let stripe: Stripe | null = null;
  let elements: StripeElements | null = null;
  let paymentElement: StripePaymentElement | null = null;
  let paymentElementContainer: HTMLElement | null = null;
  let isLoading = true;
  let isPaying = false;
  let isPreparingManual = false;
  let errorMessage = '';
  let successMessage = '';
  let showAutoRenewModal = false;
  let modalError = '';

  $: subscriptionId = $page.params.subscriptionId;

  async function initStripeElements() {
    if (!clientSecret) return;

    const publishableKey =
      import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ||
      import.meta.env.PUBLIC_VITE_STRIPE_PUBLISHABLE_KEY ||
      '';
    if (!publishableKey) {
      errorMessage = 'Stripe publishable key is missing.';
      return;
    }

    stripe = await loadStripe(publishableKey);
    if (!stripe) {
      errorMessage = 'Failed to initialize Stripe.';
      return;
    }

    await tick();
    if (!paymentElementContainer) {
      errorMessage = 'Unable to load the secure payment form.';
      return;
    }

    elements = stripe.elements({ clientSecret });
    if (paymentElement) {
      paymentElement.destroy();
    }
    paymentElement = elements.create('payment');
    paymentElement.mount(paymentElementContainer as HTMLElement);
  }

  async function startCheckout() {
    const currentId = subscriptionId;
    if (!currentId) {
      throw new Error('Missing subscription ID.');
    }

    const checkoutResponse = await subscriptionService.startStripeRenewalCheckout(currentId);
    clientSecret = checkoutResponse.clientSecret;
    paymentId = checkoutResponse.paymentId;
    amount = checkoutResponse.amount;
    currency = checkoutResponse.currency;
  }

  async function loadCheckout() {
    errorMessage = '';
    clientSecret = null;
    paymentId = null;
    amount = null;
    currency = null;
    isLoading = true;

    try {
      const currentId = subscriptionId;
      if (!currentId) {
        errorMessage = 'Missing subscription ID.';
        return;
      }

      const subscriptionResponse = await subscriptionService.getSubscriptionById(currentId);
      subscription = subscriptionResponse.subscription;

      if (subscription.auto_renew) {
        showAutoRenewModal = true;
        return;
      }

      await startCheckout();
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to start renewal checkout.';
    } finally {
      isLoading = false;
    }

    if (clientSecret) {
      await initStripeElements();
    }
  }

  async function disableAutoRenewAndCheckout() {
    if (!subscription) return;
    modalError = '';
    clientSecret = null;
    paymentId = null;
    amount = null;
    currency = null;
    isPreparingManual = true;
    isLoading = true;

    try {
      const currentId = subscriptionId;
      if (!currentId) {
        modalError = 'Missing subscription ID.';
        errorMessage = modalError;
        return;
      }

      const disableResponse = await subscriptionService.disableStripeAutoRenew(currentId);
      subscription = disableResponse.subscription || subscription;
      await startCheckout();
      showAutoRenewModal = false;
    } catch (error) {
      modalError =
        error instanceof Error
          ? error.message
          : 'Failed to disable auto-renew.';
      errorMessage = modalError;
    } finally {
      isPreparingManual = false;
      isLoading = false;
    }

    if (clientSecret) {
      await initStripeElements();
    }
  }

  async function confirmPayment() {
    if (!stripe || !elements || !clientSecret) {
      errorMessage = 'Stripe is not ready yet.';
      return;
    }

    isPaying = true;
    errorMessage = '';

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required'
    });

    if (error) {
      errorMessage = error.message || 'Payment failed.';
      isPaying = false;
      return;
    }

    if (paymentIntent?.status === 'succeeded') {
      successMessage = 'Renewal payment received. We will confirm your renewal shortly.';
      setTimeout(() => goto('/dashboard/subscriptions'), 1500);
    }
    isPaying = false;
  }

  onMount(() => {
    void loadCheckout();
  });
</script>

<svelte:head>
  <title>Renew Subscription - SubSlush</title>
</svelte:head>

<section class="max-w-2xl space-y-6">
  <div>
    <h1 class="text-2xl font-semibold text-gray-900">Renew subscription</h1>
    <p class="text-sm text-gray-600 mt-1">
      Complete a one-time payment to renew your subscription.
    </p>
  </div>

  {#if errorMessage}
    <div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {errorMessage}
    </div>
  {/if}

  {#if successMessage}
    <div class="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
      {successMessage}
    </div>
  {/if}

  {#if showAutoRenewModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 class="text-lg font-semibold text-gray-900">Manual payment requires disabling auto-renew</h2>
        <p class="mt-2 text-sm text-gray-600">
          If you want to pay manually, auto-renew must be disabled first. Auto-renew will stay off after
          payment. You can re-enable it anytime from your subscription page, and you will need to
          <a
            href={`/dashboard/subscriptions/${subscriptionId}/billing`}
            class="text-gray-900 underline underline-offset-2"
          >
            update card
          </a>
          to use auto-renew again.
        </p>

        <div class="mt-5 flex flex-wrap gap-2">
          <a
            href={`/dashboard/subscriptions/${subscriptionId}/billing`}
            class="inline-flex items-center rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Update card
          </a>
          <button
            on:click={disableAutoRenewAndCheckout}
            class="inline-flex items-center rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-black"
            disabled={isPreparingManual}
          >
            {isPreparingManual ? 'Disabling...' : 'Disable auto-renew & pay manually'}
          </button>
        </div>

        {#if modalError}
          <div class="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {modalError}
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if subscription}
    <div class="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700 space-y-1">
      <p class="font-medium text-gray-900">
        {subscription.service_type} {subscription.service_plan}
      </p>
      {#if amount !== null}
        <p class="text-sm text-gray-600">Amount: {amount.toFixed(2)} {currency?.toUpperCase()}</p>
      {/if}
      <p class="text-xs text-gray-500">Subscription {subscription.id.slice(0, 8)}</p>
    </div>
  {/if}

  <div class="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
    {#if isLoading}
      <p class="text-sm text-gray-600">Loading secure payment form...</p>
    {:else if clientSecret}
      <div bind:this={paymentElementContainer} class="min-h-[120px]"></div>
      <button
        on:click={confirmPayment}
        class="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
        disabled={isPaying}
      >
        {isPaying ? 'Processing...' : 'Renew now'}
      </button>
      <button
        on:click={() => goto('/dashboard/subscriptions')}
        class="ml-3 inline-flex items-center justify-center rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        type="button"
      >
        Back to subscriptions
      </button>
    {:else}
      <p class="text-sm text-gray-600">Manual renewal will be available once auto-renew is disabled.</p>
    {/if}
  </div>
</section>
