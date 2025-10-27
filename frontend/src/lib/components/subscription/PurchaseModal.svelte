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
      class="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
      on:click|stopPropagation
    >
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-gray-200">
        <div class="flex items-center space-x-3">
          {#if serviceIcon}
            <svelte:component this={serviceIcon} size={24} class="text-cyan-500" />
          {/if}
          <h2 id="modal-title" class="text-xl font-bold text-gray-900">
            Purchase {formatServiceName()}
          </h2>
        </div>
        <button
          on:click={handleCancel}
          class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Close modal"
        >
          <X size={20} class="text-gray-600" />
        </button>
      </div>

      <!-- Content -->
      <div class="p-6 space-y-6">
        <!-- Plan summary -->
        <div class="bg-gray-50 rounded-lg p-4">
          <h3 class="font-semibold text-gray-900 mb-2">
            {plan.display_name}
          </h3>
          <p class="text-sm text-gray-600 mb-3">
            {plan.description}
          </p>
          <div class="text-sm text-gray-700">
            <span class="font-semibold">{plan.price} credits</span> per month
          </div>
        </div>

        <!-- Duration selector -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-3">
            <Calendar size={16} class="inline mr-2" />
            Subscription Duration
          </label>
          <select
            bind:value={selectedDuration}
            class="w-full p-3 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
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
              class="w-4 h-4 text-cyan-600 bg-white border-gray-300 rounded focus:ring-cyan-500 focus:ring-2"
            />
            <div class="flex items-center">
              <RotateCcw size={16} class="text-gray-600 mr-2" />
              <span class="text-sm font-medium text-gray-700">
                Enable auto-renewal
              </span>
            </div>
          </label>
          <p class="text-xs text-gray-500 mt-1 ml-7">
            Automatically renew your subscription when it expires
          </p>
        </div>

        <!-- Cost breakdown -->
        <div class="bg-gray-50 rounded-lg p-4">
          <h4 class="font-medium text-gray-900 mb-3 flex items-center">
            <CreditCard size={16} class="mr-2" />
            Payment Summary
          </h4>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-600">Plan cost:</span>
              <span class="text-gray-900">{plan.price} credits/month</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600">Duration:</span>
              <span class="text-gray-900">{selectedDuration} month{selectedDuration > 1 ? 's' : ''}</span>
            </div>
            <div class="border-t border-gray-300 pt-2 mt-2">
              <div class="flex justify-between font-medium">
                <span class="text-gray-900">Total cost:</span>
                <span class="text-gray-900">{totalCost} credits</span>
              </div>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-gray-500">Current balance:</span>
              <span class="text-gray-600">{userBalance} credits</span>
            </div>
            <div class="flex justify-between text-xs">
              <span class="text-gray-500">Balance after purchase:</span>
              <span class="text-gray-600 {balanceAfter < 0 ? 'text-red-600' : ''}">{balanceAfter} credits</span>
            </div>
          </div>
        </div>

        <!-- Terms checkbox -->
        <div>
          <label class="flex items-start space-x-3 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={termsAccepted}
              class="w-4 h-4 mt-0.5 text-cyan-600 bg-white border-gray-300 rounded focus:ring-cyan-500 focus:ring-2"
            />
            <span class="text-xs text-gray-600">
              I agree to the <a href="/terms" class="text-cyan-600 hover:text-cyan-700 underline">Terms of Service</a> and understand that this purchase is non-refundable. The subscription will start immediately after purchase.
            </span>
          </label>
        </div>

        <!-- Error message for insufficient credits -->
        {#if totalCost > userBalance}
          <div class="bg-red-50 border border-red-200 rounded-lg p-3">
            <p class="text-sm text-red-800">
              Insufficient credits. You need {totalCost - userBalance} more credits to complete this purchase.
            </p>
            <a
              href="/dashboard/credits"
              class="text-sm text-red-600 underline hover:text-red-700"
            >
              Add more credits
            </a>
          </div>
        {/if}
      </div>

      <!-- Footer buttons -->
      <div class="flex gap-3 p-6 border-t border-gray-200">
        <button
          on:click={handleCancel}
          class="flex-1 py-3 px-4 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          disabled={isLoading}
        >
          Cancel
        </button>
        <button
          on:click={handleConfirm}
          disabled={!canPurchase || isLoading}
          class="flex-1 py-3 px-4 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors font-medium"
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