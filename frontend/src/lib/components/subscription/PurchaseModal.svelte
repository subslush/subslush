<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Music, Film, TrendingUp, X, CreditCard, Calendar, RotateCcw } from 'lucide-svelte';
  import type { ServicePlanDetails } from '$lib/types/subscription.js';

  export let isOpen: boolean;
  export let plan: ServicePlanDetails | null;
  export let userBalance: number;
  export let isLoading: boolean = false;

  const dispatch = createEventDispatcher<{
    confirm: { plan: ServicePlanDetails; duration: number; autoRenew: boolean };
    cancel: void;
  }>();

  let selectedDuration = 1;
  let autoRenew = false;
  let termsAccepted = false;

  // Service icons mapping
  const serviceIcons = {
    spotify: Music,
    netflix: Film,
    tradingview: TrendingUp
  };

  $: serviceIcon = plan ? serviceIcons[plan.service_type] : null;
  $: totalCost = plan ? plan.price * selectedDuration : 0;
  $: balanceAfter = userBalance - totalCost;
  $: canPurchase = termsAccepted && totalCost <= userBalance;

  function formatServiceName(): string {
    if (!plan) return '';
    const names = {
      spotify: 'Spotify',
      netflix: 'Netflix',
      tradingview: 'TradingView'
    };
    return names[plan.service_type] || plan.service_type;
  }

  function handleConfirm() {
    if (!plan || !canPurchase) return;

    dispatch('confirm', {
      plan,
      duration: selectedDuration,
      autoRenew
    });
  }

  function handleCancel() {
    dispatch('cancel');
  }

  // Reset form when modal opens/closes
  $: if (isOpen) {
    selectedDuration = 1;
    autoRenew = false;
    termsAccepted = false;
  }
</script>

{#if isOpen && plan}
  <!-- Modal backdrop -->
  <div
    class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
    on:click={handleCancel}
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
  >
    <!-- Modal content -->
    <div
      class="bg-surface-50 dark:bg-surface-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
      on:click|stopPropagation
    >
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-surface-200 dark:border-surface-600">
        <div class="flex items-center space-x-3">
          {#if serviceIcon}
            <svelte:component this={serviceIcon} size={24} class="text-primary-500" />
          {/if}
          <h2 id="modal-title" class="text-xl font-bold text-surface-900 dark:text-surface-100">
            Purchase {formatServiceName()}
          </h2>
        </div>
        <button
          on:click={handleCancel}
          class="p-2 hover:bg-surface-200 dark:hover:bg-surface-700 rounded-lg transition-colors"
          aria-label="Close modal"
        >
          <X size={20} class="text-surface-600 dark:text-surface-300" />
        </button>
      </div>

      <!-- Content -->
      <div class="p-6 space-y-6">
        <!-- Plan summary -->
        <div class="bg-surface-100 dark:bg-surface-700 rounded-lg p-4">
          <h3 class="font-semibold text-surface-900 dark:text-surface-100 mb-2">
            {plan.display_name}
          </h3>
          <p class="text-sm text-surface-600 dark:text-surface-300 mb-3">
            {plan.description}
          </p>
          <div class="text-sm text-surface-700 dark:text-surface-300">
            <span class="font-semibold">{plan.price} credits</span> per month
          </div>
        </div>

        <!-- Duration selector -->
        <div>
          <label class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-3">
            <Calendar size={16} class="inline mr-2" />
            Subscription Duration
          </label>
          <select
            bind:value={selectedDuration}
            class="w-full p-3 border border-surface-300 dark:border-surface-600 rounded-lg bg-surface-50 dark:bg-surface-800 text-surface-900 dark:text-surface-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            {#each Array.from({length: 12}, (_, i) => i + 1) as months}
              <option value={months}>
                {months} month{months > 1 ? 's' : ''}
                {#if months >= 3}
                  ({months === 3 ? '5%' : months === 6 ? '10%' : months >= 12 ? '20%' : '0%'} discount)
                {/if}
              </option>
            {/each}
          </select>
        </div>

        <!-- Auto-renew toggle -->
        <div>
          <label class="flex items-center space-x-3 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={autoRenew}
              class="w-4 h-4 text-primary-600 bg-surface-100 border-surface-300 rounded focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-surface-800 focus:ring-2 dark:bg-surface-700 dark:border-surface-600"
            />
            <div class="flex items-center">
              <RotateCcw size={16} class="text-surface-600 dark:text-surface-300 mr-2" />
              <span class="text-sm font-medium text-surface-700 dark:text-surface-300">
                Enable auto-renewal
              </span>
            </div>
          </label>
          <p class="text-xs text-surface-500 dark:text-surface-400 mt-1 ml-7">
            Automatically renew your subscription when it expires
          </p>
        </div>

        <!-- Cost breakdown -->
        <div class="bg-surface-100 dark:bg-surface-700 rounded-lg p-4">
          <h4 class="font-medium text-surface-900 dark:text-surface-100 mb-3 flex items-center">
            <CreditCard size={16} class="mr-2" />
            Payment Summary
          </h4>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-surface-600 dark:text-surface-300">Plan cost:</span>
              <span class="text-surface-900 dark:text-surface-100">{plan.price} credits/month</span>
            </div>
            <div class="flex justify-between">
              <span class="text-surface-600 dark:text-surface-300">Duration:</span>
              <span class="text-surface-900 dark:text-surface-100">{selectedDuration} month{selectedDuration > 1 ? 's' : ''}</span>
            </div>
            <div class="border-t border-surface-300 dark:border-surface-600 pt-2 mt-2">
              <div class="flex justify-between font-medium">
                <span class="text-surface-900 dark:text-surface-100">Total cost:</span>
                <span class="text-surface-900 dark:text-surface-100">{totalCost} credits</span>
              </div>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-surface-500 dark:text-surface-400">Current balance:</span>
              <span class="text-surface-600 dark:text-surface-300">{userBalance} credits</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-surface-500 dark:text-surface-400">Balance after purchase:</span>
              <span class="text-surface-600 dark:text-surface-300 {balanceAfter < 0 ? 'text-error-600' : ''}">{balanceAfter} credits</span>
            </div>
          </div>
        </div>

        <!-- Terms checkbox -->
        <div>
          <label class="flex items-start space-x-3 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={termsAccepted}
              class="w-4 h-4 mt-0.5 text-primary-600 bg-surface-100 border-surface-300 rounded focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-surface-800 focus:ring-2 dark:bg-surface-700 dark:border-surface-600"
            />
            <span class="text-xs text-surface-600 dark:text-surface-300">
              I agree to the <a href="/terms" class="text-primary-600 hover:text-primary-700 underline">Terms of Service</a> and understand that this purchase is non-refundable. The subscription will start immediately after purchase.
            </span>
          </label>
        </div>

        <!-- Error message for insufficient credits -->
        {#if totalCost > userBalance}
          <div class="bg-error-50 dark:bg-error-900 border border-error-200 dark:border-error-700 rounded-lg p-3">
            <p class="text-sm text-error-700 dark:text-error-200">
              Insufficient credits. You need {totalCost - userBalance} more credits to complete this purchase.
            </p>
            <a
              href="/dashboard/credits"
              class="text-sm text-error-600 dark:text-error-300 underline hover:text-error-700 dark:hover:text-error-200"
            >
              Add more credits
            </a>
          </div>
        {/if}
      </div>

      <!-- Footer buttons -->
      <div class="flex gap-3 p-6 border-t border-surface-200 dark:border-surface-600">
        <button
          on:click={handleCancel}
          class="flex-1 py-3 px-4 border border-surface-300 dark:border-surface-600 text-surface-700 dark:text-surface-300 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors font-medium"
          disabled={isLoading}
        >
          Cancel
        </button>
        <button
          on:click={handleConfirm}
          disabled={!canPurchase || isLoading}
          class="flex-1 py-3 px-4 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-surface-300 disabled:text-surface-500 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {#if isLoading}
            <div class="flex items-center justify-center">
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Processing...
            </div>
          {:else}
            Confirm Purchase
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}