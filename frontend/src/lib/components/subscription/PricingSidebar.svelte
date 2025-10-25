<script lang="ts">
  import { Check } from 'lucide-svelte';
  import type { SubscriptionDetail, DurationOption } from '$lib/types/subscription';

  export let subscription: SubscriptionDetail;
  export let userCredits: number = 0;
  export let onJoinPlan: () => void;

  let selectedDuration = 1; // Default to 1 month

  $: selectedOption = subscription.durationOptions.find(opt => opt.months === selectedDuration)
    || subscription.durationOptions[0];
  $: finalPrice = selectedOption?.totalPrice || subscription.price;
  $: savingsPercentage = subscription.originalPrice > subscription.price
    ? Math.round(((subscription.originalPrice - subscription.price) / subscription.originalPrice) * 100)
    : 0;
  $: canPurchase = userCredits >= finalPrice;

  function formatCurrency(amount: number) {
    return `€${amount.toFixed(2)}`;
  }
</script>

<div class="lg:sticky lg:top-8 space-y-4 lg:space-y-6">
  <!-- Price Card -->
  <div class="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow duration-300 animate-in slide-in-from-right-4 duration-300">
    <!-- Main Price Display -->
    <div class="text-center mb-6">
      <div class="text-4xl font-bold text-gray-900">
        {formatCurrency(finalPrice)}
      </div>
      <div class="text-gray-600 mt-1">
        per {selectedDuration === 1 ? 'month' : `${selectedDuration} months`}
      </div>

      <!-- Savings Display -->
      {#if savingsPercentage > 0}
        <div class="mt-2">
          <div class="text-sm font-semibold text-green-600">
            Save {savingsPercentage}% vs solo subscription
          </div>
        </div>
      {/if}
    </div>


    <!-- Duration Selector -->
    {#if subscription.durationOptions.length > 1}
      <div class="mb-6">
        <h4 class="text-sm font-medium text-gray-700 mb-3">
          Plan Duration
        </h4>
        <div class="grid grid-cols-2 gap-2">
          {#each subscription.durationOptions as option}
            <button
              class="p-4 text-sm border rounded-lg transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:outline-none {
                selectedDuration === option.months
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-300 hover:border-gray-400'
              }"
              on:click={() => selectedDuration = option.months}
              aria-pressed={selectedDuration === option.months}
              aria-label="Select {option.months === 1 ? '1 month' : `${option.months} months`} duration"
            >
              <div class="font-medium">
                {option.months === 1 ? '1 month' : `${option.months} months`}
              </div>
              {#if option.discount}
                <div class="text-xs text-green-600 mt-1">
                  -{option.discount}%
                </div>
              {/if}
              {#if option.isRecommended}
                <div class="text-xs text-blue-600 mt-1">
                  Recommended
                </div>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Action Buttons -->
    <div class="space-y-4">
      <button
        on:click={onJoinPlan}
        disabled={!canPurchase}
        class="w-full py-3 px-4 rounded-lg font-semibold transition-all duration-300 transform hover:scale-105 focus:ring-2 focus:ring-offset-2 focus:outline-none {
          canPurchase
            ? 'text-white shadow-lg hover:shadow-xl focus:ring-blue-500'
            : 'bg-gray-300 text-gray-500 cursor-not-allowed focus:ring-gray-300'
        }"
        style={canPurchase ? 'background: linear-gradient(45deg, #4FC3F7, #F06292)' : ''}
        aria-describedby={!canPurchase ? 'insufficient-credits-message' : undefined}
      >
        {#if canPurchase}
          Join Plan
        {:else}
          Insufficient Credits
        {/if}
      </button>

    </div>

    <!-- Trust Signals -->
    <div class="mt-4 space-y-2">
      <div class="flex items-center space-x-2">
        <Check size={16} class="text-green-600" />
        <span class="text-sm text-gray-600">30-day money-back guarantee</span>
      </div>
      <div class="flex items-center space-x-2">
        <Check size={16} class="text-green-600" />
        <span class="text-sm text-gray-600">Instant access after purchase</span>
      </div>
      <div class="flex items-center space-x-2">
        <Check size={16} class="text-green-600" />
        <span class="text-sm text-gray-600">Cancel anytime</span>
      </div>
    </div>

    {#if !canPurchase}
      <div class="mt-4 text-center">
        <p class="text-xs text-gray-500" id="insufficient-credits-message">
          You need {formatCurrency(finalPrice - userCredits)} more credits
        </p>
      </div>
    {/if}
  </div>


</div>