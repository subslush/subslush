<script lang="ts">
  import { Check } from 'lucide-svelte';
  import type { ServicePlanDetails } from '$lib/types/subscription.js';

  export let plans: Array<{
    serviceType: string;
    serviceName: string;
    plan: string;
    price: number;
    features: string[];
    description: string;
  }> = [];
  export let userBalance = 0;

  const serviceStyles = {
    netflix: { icon: '🎬', color: 'bg-red-500' },
    spotify: { icon: '🎵', color: 'bg-green-500' },
    tradingview: { icon: '📈', color: 'bg-blue-500' },
    adobe: { icon: '🎨', color: 'bg-red-600' },
    disney: { icon: '🏰', color: 'bg-blue-600' }
  };

  function getServiceStyle(serviceType: string) {
    return serviceStyles[serviceType as keyof typeof serviceStyles] || { icon: '📦', color: 'bg-gray-500' };
  }

  function calculateSavings(price: number, originalPrice?: number) {
    if (!originalPrice || originalPrice <= price) return 0;
    return Math.round(((originalPrice - price) / originalPrice) * 100);
  }

  function getOriginalPrice(price: number, serviceType: string) {
    const markupRates = {
      netflix: 1.2,
      spotify: 1.15,
      tradingview: 1.3,
      adobe: 1.25,
      disney: 1.2
    };
    const rate = markupRates[serviceType as keyof typeof markupRates] || 1.2;
    return price * rate;
  }
</script>

<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
  {#each plans as plan}
    {@const serviceStyle = getServiceStyle(plan.serviceType)}
    {@const originalPrice = getOriginalPrice(plan.price, plan.serviceType)}
    {@const savings = calculateSavings(plan.price, originalPrice)}

    <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow">
      <!-- Header -->
      <div class="flex items-start justify-between mb-3">
        <div class="flex items-center space-x-2">
          <span class="text-2xl">{serviceStyle.icon}</span>
          <div>
            <h3 class="font-semibold text-gray-900 text-base">{plan.serviceName}</h3>
            <p class="text-xs text-gray-500 capitalize">{plan.plan}</p>
          </div>
        </div>

        {#if savings > 0}
          <span class="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
            Save {savings}%
          </span>
        {/if}
      </div>

      <!-- Price -->
      <div class="mb-3">
        <div class="flex items-baseline space-x-2">
          <span class="text-2xl font-bold text-gray-900">€{plan.price.toFixed(2)}</span>
          <span class="text-sm text-gray-500">/monthly</span>
        </div>
        {#if savings > 0}
          <p class="text-xs text-gray-400 line-through">€{originalPrice.toFixed(2)}</p>
        {/if}
        <p class="text-xs text-gray-500 mt-1">
          {#if savings > 0}
            Save €{(originalPrice - plan.price).toFixed(2)}
          {:else}
            Regular price
          {/if}
        </p>
      </div>

      <!-- Features -->
      <ul class="space-y-2 mb-4">
        {#each plan.features.slice(0, 4) as feature}
          <li class="flex items-start space-x-2 text-sm text-gray-600">
            <Check size={16} class="text-green-500 mt-0.5 flex-shrink-0" />
            <span>{feature}</span>
          </li>
        {/each}
      </ul>

      <!-- CTA Button -->
      <button
        class="w-full px-6 py-2.5 text-white text-sm font-medium rounded-lg transition-colors hover:opacity-90"
        style="background-color: #4FC3F7;"
      >
        Subscribe Now
      </button>
    </div>
  {/each}
</div>

{#if plans.length === 0}
  <div class="text-center py-12">
    <p class="text-gray-500 text-lg mb-2">No subscriptions found</p>
    <p class="text-gray-400 text-sm">Try adjusting your search or category filter</p>
  </div>
{/if}