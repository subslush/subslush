<script lang="ts">
  import type { DurationOption } from '$lib/types/subscription';

  export let durationOptions: DurationOption[];
  export let onSelectDuration: (months: number) => void;
  export let selectedDuration: number = 1;

  function formatCurrency(amount: number) {
    return `€${amount.toFixed(2)}`;
  }

  function getMonthlyPrice(option: DurationOption) {
    return option.totalPrice / option.months;
  }
</script>

<div class="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow duration-300">
  <h3 class="text-xl font-semibold text-gray-900 mb-6">
    Plan Comparison
  </h3>

  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    {#each durationOptions as option}
      <div
        class="border rounded-lg p-4 transition-all duration-200 cursor-pointer {
          selectedDuration === option.months
            ? 'border-blue-500 bg-blue-50 shadow-md'
            : 'border-gray-300 hover:border-gray-400 hover:shadow-sm'
        }"
        on:click={() => onSelectDuration(option.months)}
        on:keydown={(e) => e.key === 'Enter' && onSelectDuration(option.months)}
        role="button"
        tabindex="0"
      >
        <!-- Duration Label -->
        <div class="text-center mb-3">
          <h4 class="font-semibold text-gray-900">
            {option.months === 1 ? '1 Month' : `${option.months} Months`}
          </h4>
          {#if option.isRecommended}
            <span class="inline-block px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full mt-1">
              Recommended
            </span>
          {/if}
        </div>

        <!-- Pricing -->
        <div class="text-center mb-3">
          <div class="text-2xl font-bold text-gray-900">
            {formatCurrency(option.totalPrice)}
          </div>
          <div class="text-sm text-gray-600">
            total cost
          </div>
          {#if option.months > 1}
            <div class="text-sm text-gray-500 mt-1">
              {formatCurrency(getMonthlyPrice(option))}/month
            </div>
          {/if}
        </div>

        <!-- Discount Badge -->
        {#if option.discount && option.discount > 0}
          <div class="text-center">
            <span class="inline-block px-2 py-1 text-xs font-bold bg-green-100 text-green-800 rounded-full">
              Save {option.discount}%
            </span>
          </div>
        {/if}

        <!-- Select Button -->
        <button
          class="w-full mt-4 py-2 px-3 text-sm font-medium rounded-lg transition-colors duration-200 {
            selectedDuration === option.months
              ? 'text-white shadow-md'
              : 'border border-gray-300 text-gray-700 hover:bg-gray-100'
          }"
          style={selectedDuration === option.months ? 'background: linear-gradient(45deg, #4FC3F7, #F06292)' : ''}
          on:click|stopPropagation={() => onSelectDuration(option.months)}
        >
          {selectedDuration === option.months ? 'Selected' : 'Select'}
        </button>
      </div>
    {/each}
  </div>

  <!-- Billing Information -->
  <div class="mt-6 p-4 bg-gray-100 rounded-lg">
    <p class="text-sm text-gray-600">
      <strong>Billing:</strong> You'll be charged the full amount upfront for the selected duration.
      Auto-renewal can be managed from your dashboard after purchase.
    </p>
  </div>
</div>