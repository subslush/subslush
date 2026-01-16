<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { loadStripe, type Stripe, type StripeElements, type StripePaymentElement } from '@stripe/stripe-js';
  import { subscriptionService } from '$lib/api/subscriptions.js';
  import type { Subscription } from '$lib/types/subscription.js';

  let subscription: Subscription | null = null;
  let clientSecret: string | null = null;
  let setupIntentId: string | null = null;
  let stripe: Stripe | null = null;
  let elements: StripeElements | null = null;
  let paymentElement: StripePaymentElement | null = null;
  let paymentElementContainer: HTMLElement | null = null;
  let isLoading = true;
  let isSaving = false;
  let errorMessage = '';
  let successMessage = '';

  $: subscriptionId = $page.params.subscriptionId;
  $: isAutoRenewEnabled = subscription?.auto_renew === true;

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

  async function loadSetupIntent() {
    errorMessage = '';
    isLoading = true;

    try {
      const currentId = subscriptionId;
      if (!currentId) {
        errorMessage = 'Missing subscription ID.';
        return;
      }

      const subscriptionResponse = await subscriptionService.getSubscriptionById(currentId);
      subscription = subscriptionResponse.subscription;

      const enableResponse = await subscriptionService.enableStripeAutoRenew(currentId);
      clientSecret = enableResponse.clientSecret;
      setupIntentId = enableResponse.setup_intent_id;
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to load billing form.';
    } finally {
      isLoading = false;
    }

    if (clientSecret) {
      await initStripeElements();
    }
  }

  async function confirmSetup() {
    if (!stripe || !elements || !setupIntentId) {
      errorMessage = 'Stripe is not ready yet.';
      return;
    }

    const currentId = subscriptionId;
    if (!currentId) {
      errorMessage = 'Missing subscription ID.';
      return;
    }

    isSaving = true;
    errorMessage = '';

    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required'
    });

    if (error) {
      errorMessage = error.message || 'Failed to save card.';
      isSaving = false;
      return;
    }

    try {
      const intentId = setupIntent?.id || setupIntentId;
      await subscriptionService.confirmStripeAutoRenew(currentId, intentId);
      successMessage = isAutoRenewEnabled
        ? 'Card saved for auto-renewal.'
        : 'Auto-renew enabled. Your card is saved.';
      setTimeout(() => goto('/dashboard/subscriptions'), 1200);
    } catch (err) {
      errorMessage =
        err instanceof Error ? err.message : 'Failed to enable auto-renew.';
    } finally {
      isSaving = false;
    }
  }

  onMount(() => {
    void loadSetupIntent();
  });
</script>

<svelte:head>
  <title>Update Card - SubSlush</title>
</svelte:head>

<section class="max-w-2xl space-y-6">
  <div>
    <h1 class="text-2xl font-semibold text-gray-900">Update card</h1>
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

  {#if subscription}
    <div class="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700">
      <p class="font-medium text-gray-900">
        {subscription.service_type} {subscription.service_plan}
      </p>
      <p class="text-xs text-gray-500 mt-1">Subscription {subscription.id.slice(0, 8)}</p>
    </div>
  {/if}

  <div class="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
    {#if isLoading}
      <p class="text-sm text-gray-600">Loading secure form...</p>
    {:else}
      <div bind:this={paymentElementContainer} class="min-h-[120px]"></div>
      <button
        on:click={confirmSetup}
        class="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
        disabled={isSaving}
      >
        {isSaving ? 'Saving...' : 'Save card'}
      </button>
      <button
        on:click={() => goto('/dashboard/subscriptions')}
        class="ml-3 inline-flex items-center justify-center rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        type="button"
      >
        Back to subscriptions
      </button>
    {/if}
  </div>
</section>
