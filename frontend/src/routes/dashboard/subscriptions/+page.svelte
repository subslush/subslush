<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { createMutation } from '@tanstack/svelte-query';
  import { CreditCard, Plus, ShoppingBag, AlertCircle } from 'lucide-svelte';

  import { subscriptionService } from '$lib/api/subscriptions.js';
  import { user } from '$lib/stores/auth.js';
  import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '$lib/utils/constants.js';

  import SubscriptionCard from '$lib/components/subscription/SubscriptionCard.svelte';
  import SubscriptionFilters from '$lib/components/subscription/SubscriptionFilters.svelte';
  import PurchaseModal from '$lib/components/subscription/PurchaseModal.svelte';

  import type { ServicePlanDetails, ServiceType } from '$lib/types/subscription.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let selectedFilter: ServiceType | 'all' = 'all';
  let selectedPlan: ServicePlanDetails | null = null;
  let showPurchaseModal = false;
  let userBalance = data.userBalance || 0;
  let errorMessage = '';
  let successMessage = '';

  // Filter plans based on selected service type
  $: filteredPlans = selectedFilter === 'all'
    ? data.plans
    : data.plans.filter(plan => plan.service_type === selectedFilter);

  // Load user credit balance on mount
  onMount(async () => {
    if ($user?.id) {
      try {
        const balanceResponse = await subscriptionService.getCreditBalance($user.id);
        userBalance = balanceResponse.balance;
      } catch (err) {
        console.warn('Could not load user credit balance:', err);
      }
    }
  });

  // Purchase mutation
  const purchaseMutation = createMutation({
    mutationFn: async (purchaseData: { plan: ServicePlanDetails; duration: number; autoRenew: boolean }) => {
      // First validate the purchase
      await subscriptionService.validatePurchase({
        service_type: purchaseData.plan.service_type,
        service_plan: purchaseData.plan.plan,
        duration_months: purchaseData.duration
      });

      // Then make the purchase
      return subscriptionService.purchaseSubscription({
        service_type: purchaseData.plan.service_type,
        service_plan: purchaseData.plan.plan,
        duration_months: purchaseData.duration,
        auto_renew: purchaseData.autoRenew
      });
    },
    onSuccess: (data) => {
      successMessage = SUCCESS_MESSAGES.PURCHASE_SUCCESS;
      userBalance = data.remaining_credits;
      showPurchaseModal = false;
      selectedPlan = null;

      // Clear success message after a few seconds
      setTimeout(() => {
        successMessage = '';
      }, 5000);

      // Redirect to active subscriptions after a short delay
      setTimeout(() => {
        goto('/dashboard/subscriptions/active');
      }, 2000);
    },
    onError: (error: any) => {
      console.error('Purchase failed:', error);

      if (error.response?.status === 402) {
        errorMessage = ERROR_MESSAGES.INSUFFICIENT_CREDITS;
      } else if (error.response?.status === 400) {
        errorMessage = error.response?.data?.message || ERROR_MESSAGES.PURCHASE_FAILED;
      } else if (error.response?.status === 409) {
        errorMessage = ERROR_MESSAGES.SUBSCRIPTION_EXISTS;
      } else {
        errorMessage = ERROR_MESSAGES.PURCHASE_FAILED;
      }

      // Clear error message after a few seconds
      setTimeout(() => {
        errorMessage = '';
      }, 5000);
    }
  });

  function handlePurchaseClick(plan: ServicePlanDetails) {
    selectedPlan = plan;
    showPurchaseModal = true;
    errorMessage = '';
    successMessage = '';
  }

  function handlePurchaseConfirm(event: CustomEvent<{ plan: ServicePlanDetails; duration: number; autoRenew: boolean }>) {
    $purchaseMutation.mutate(event.detail);
  }

  function handlePurchaseCancel() {
    showPurchaseModal = false;
    selectedPlan = null;
  }

  function clearMessages() {
    errorMessage = '';
    successMessage = '';
  }
</script>

<svelte:head>
  <title>Browse Subscriptions - Subscription Platform</title>
  <meta name="description" content="Browse and purchase premium subscription plans at discounted prices." />
</svelte:head>

<div class="container mx-auto p-6 max-w-7xl">
  <!-- Header Section -->
  <div class="mb-8">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
      <!-- Title and description -->
      <div>
        <h1 class="text-3xl font-bold text-surface-900 dark:text-surface-100 mb-2">
          Browse Subscription Plans
        </h1>
        <p class="text-surface-600 dark:text-surface-300 text-lg">
          Get premium subscriptions at unbeatable prices with instant delivery
        </p>
      </div>

      <!-- User balance card -->
      <div class="bg-primary-50 dark:bg-primary-900 border border-primary-200 dark:border-primary-700 rounded-lg p-6 min-w-[280px]">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center space-x-2">
            <CreditCard size={20} class="text-primary-600 dark:text-primary-400" />
            <span class="text-sm font-medium text-primary-700 dark:text-primary-300">Your Balance</span>
          </div>
        </div>
        <div class="mb-3">
          <span class="text-2xl font-bold text-primary-900 dark:text-primary-100">{userBalance}</span>
          <span class="text-primary-600 dark:text-primary-400 ml-1">credits</span>
        </div>
        <a
          href="/dashboard/credits"
          class="inline-flex items-center justify-center w-full bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
        >
          <Plus size={16} class="mr-2" />
          Add Credits
        </a>
      </div>
    </div>

    <!-- Success/Error Messages -->
    {#if successMessage}
      <div class="mt-6 bg-success-50 dark:bg-success-900 border border-success-200 dark:border-success-700 rounded-lg p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <ShoppingBag size={20} class="text-success-600 dark:text-success-400 mr-3" />
            <p class="text-success-700 dark:text-success-200 font-medium">{successMessage}</p>
          </div>
          <button on:click={clearMessages} class="text-success-600 dark:text-success-400 hover:text-success-700 dark:hover:text-success-300">
            <span class="sr-only">Close</span>
            ×
          </button>
        </div>
      </div>
    {/if}

    {#if errorMessage}
      <div class="mt-6 bg-error-50 dark:bg-error-900 border border-error-200 dark:border-error-700 rounded-lg p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center">
            <AlertCircle size={20} class="text-error-600 dark:text-error-400 mr-3" />
            <p class="text-error-700 dark:text-error-200 font-medium">{errorMessage}</p>
          </div>
          <button on:click={clearMessages} class="text-error-600 dark:text-error-400 hover:text-error-700 dark:hover:text-error-300">
            <span class="sr-only">Close</span>
            ×
          </button>
        </div>
      </div>
    {/if}
  </div>

  <!-- Filters -->
  <SubscriptionFilters bind:selected={selectedFilter} />

  <!-- Plans Grid -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {#each filteredPlans as plan (plan.service_type + plan.plan)}
      <SubscriptionCard
        {plan}
        {userBalance}
        onPurchase={handlePurchaseClick}
      />
    {:else}
      <div class="col-span-full text-center py-12">
        <div class="bg-surface-100 dark:bg-surface-800 rounded-lg p-8">
          <ShoppingBag size={48} class="mx-auto text-surface-400 dark:text-surface-500 mb-4" />
          <h3 class="text-lg font-medium text-surface-900 dark:text-surface-100 mb-2">
            No plans available
          </h3>
          <p class="text-surface-600 dark:text-surface-300">
            {selectedFilter === 'all'
              ? 'No subscription plans are currently available.'
              : `No plans available for ${selectedFilter}. Try selecting a different service.`}
          </p>
        </div>
      </div>
    {/each}
  </div>

  <!-- Quick links section -->
  <div class="mt-12 bg-surface-100 dark:bg-surface-800 rounded-lg p-6">
    <h2 class="text-xl font-semibold text-surface-900 dark:text-surface-100 mb-4">
      Quick Actions
    </h2>
    <div class="flex flex-wrap gap-4">
      <a
        href="/dashboard/subscriptions/active"
        class="inline-flex items-center bg-surface-50 dark:bg-surface-700 hover:bg-surface-200 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-300 px-4 py-2 rounded-lg transition-colors"
      >
        <ShoppingBag size={16} class="mr-2" />
        View My Subscriptions
      </a>
      <a
        href="/dashboard/credits"
        class="inline-flex items-center bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition-colors"
      >
        <CreditCard size={16} class="mr-2" />
        Manage Credits
      </a>
    </div>
  </div>
</div>

<!-- Purchase Modal -->
<PurchaseModal
  bind:isOpen={showPurchaseModal}
  plan={selectedPlan}
  {userBalance}
  isLoading={$purchaseMutation.isPending}
  on:confirm={handlePurchaseConfirm}
  on:cancel={handlePurchaseCancel}
/>