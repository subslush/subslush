<script lang="ts">
  export let title: string;
  export let subtitle: string;
  export let services: string[];
  export let price: number;
  export let originalPrice: number;
  export let badge: string = '';
</script>

<div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow">
  <div class="flex items-center justify-between mb-2">
    <span class="text-xs font-medium text-gray-500 uppercase">{subtitle}</span>
    {#if badge}
      <span class="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
        {badge}
      </span>
    {/if}
  </div>

  <h3 class="font-semibold text-gray-900 mb-2">{title}</h3>

  <!-- Services List -->
  <div class="mb-3 space-y-1">
    {#each services as service}
      <p class="text-sm text-gray-600">• {service}</p>
    {/each}
  </div>

  <!-- Price -->
  <div class="mb-3">
    <div class="flex items-baseline space-x-2">
      <span class="text-2xl font-bold text-gray-900">€{price.toFixed(2)}</span>
      <span class="text-sm text-gray-400 line-through">€{originalPrice.toFixed(2)}</span>
    </div>
    <p class="text-xs text-gray-500">/month • save €{(originalPrice - price).toFixed(2)}/month</p>
  </div>

  <!-- Button -->
  <button
    class="w-full px-6 py-2.5 text-white text-sm font-medium rounded-lg transition-colors hover:opacity-90"
    style="background-color: #4FC3F7;"
  >
    Subscribe Now →
  </button>

  <!-- Fine Print -->
  <p class="text-xs text-gray-400 mt-2 text-center">
    Instant access • Cancel anytime • 30-day money back
  </p>
</div>