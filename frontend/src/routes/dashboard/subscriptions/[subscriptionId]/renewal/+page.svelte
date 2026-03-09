<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { subscriptionService } from '$lib/api/subscriptions.js';
  import type { Subscription } from '$lib/types/subscription.js';

  let subscription: Subscription | null = null;
  let isLoading = true;
  let isRedirecting = false;
  let errorMessage = '';

  $: subscriptionId = $page.params.subscriptionId;

  async function loadSubscription() {
    const currentId = subscriptionId;
    if (!currentId) {
      errorMessage = 'Missing subscription ID.';
      return;
    }

    const response = await subscriptionService.getSubscriptionById(currentId);
    subscription = response.subscription;
  }

  async function startRenewalCheckout() {
    const currentId = subscriptionId;
    if (!currentId) {
      errorMessage = 'Missing subscription ID.';
      return;
    }

    isRedirecting = true;
    errorMessage = '';
    try {
      const response = await subscriptionService.startCardRenewalCheckout(currentId);
      if (!response.session_url) {
        errorMessage = 'Renewal checkout link is unavailable.';
        return;
      }
      window.location.assign(response.session_url);
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to start renewal checkout.';
      isRedirecting = false;
    }
  }

  onMount(() => {
    void (async () => {
      try {
        await loadSubscription();
      } catch (error) {
        errorMessage =
          error instanceof Error
            ? error.message
            : 'Unable to load subscription details.';
      } finally {
        isLoading = false;
      }

      if (!errorMessage) {
        await startRenewalCheckout();
      }
    })();
  });
</script>

<svelte:head>
  <title>Renew Subscription - SubSlush</title>
</svelte:head>

<section class="max-w-2xl space-y-6">
  <div>
    <h1 class="text-2xl font-semibold text-gray-900">Renew subscription</h1>
    <p class="text-sm text-gray-600 mt-1">
      You will be redirected to secure hosted card checkout.
    </p>
  </div>

  {#if errorMessage}
    <div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {errorMessage}
    </div>
  {/if}

  {#if subscription}
    <div class="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700 space-y-1">
      <p class="font-medium text-gray-900">
        {subscription.service_type} {subscription.service_plan}
      </p>
      <p class="text-xs text-gray-500">Subscription {subscription.id.slice(0, 8)}</p>
    </div>
  {/if}

  <div class="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
    {#if isLoading}
      <p class="text-sm text-gray-600">Preparing renewal checkout...</p>
    {:else if isRedirecting}
      <p class="text-sm text-gray-600">Redirecting to payment provider...</p>
    {:else}
      <button
        on:click={startRenewalCheckout}
        class="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
      >
        Retry renewal checkout
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
