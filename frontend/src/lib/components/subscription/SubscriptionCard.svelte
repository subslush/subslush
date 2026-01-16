<script lang="ts">
  import { Music, Film, TrendingUp, Check } from 'lucide-svelte';
  import type { ServicePlanDetails } from '$lib/types/subscription.js';

  export let plan: ServicePlanDetails;
  export let onPurchase: (plan: ServicePlanDetails) => void;
  export let userBalance: number;

  // Map service types to icons
  const serviceIcons: Record<string, typeof Music> = {
    spotify: Music,
    netflix: Film,
    tradingview: TrendingUp
  };

  $: serviceIcon = serviceIcons[plan.service_type] || Music;
  $: canPurchase = userBalance >= plan.price;
  $: detailHref = plan.productSlug || plan.product_slug
    ? `/browse/products/${plan.productSlug || plan.product_slug}`
    : '';

  function formatServiceName(): string {
    const names: Record<string, string> = {
      spotify: 'Spotify',
      netflix: 'Netflix',
      tradingview: 'TradingView'
    };
    return names[plan.service_type] || plan.service_type;
  }
</script>

<div class="bg-surface-50 dark:bg-surface-800 shadow-lg rounded-lg p-6 hover:shadow-xl hover:bg-surface-100 dark:hover:bg-surface-700 transition-all duration-200 border border-surface-200 dark:border-surface-600">
  <!-- Header with icon and discount badge -->
  <div class="flex items-center justify-between mb-4">
    <div class="flex items-center space-x-4">
      <svelte:component this={serviceIcon} size={32} class="text-primary-500" />
      <span class="text-lg font-semibold text-surface-900 dark:text-surface-100">
        {formatServiceName()}
      </span>
    </div>
  </div>

  <!-- Plan details -->
  <div class="mb-4">
    <h3 class="text-xl font-bold text-surface-900 dark:text-surface-100 mb-2">
      {plan.display_name}
    </h3>
    <p class="text-surface-600 dark:text-surface-300 text-sm mb-4">
      {plan.description}
    </p>
  </div>

  <!-- Features list -->
  <div class="mb-6">
    <h4 class="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-3">
      What's included:
    </h4>
    <ul class="space-y-2">
      {#each plan.features as feature}
        <li class="flex items-center text-sm text-surface-600 dark:text-surface-300">
          <Check size={16} class="text-success-500 mr-2 flex-shrink-0" />
          <span>{feature}</span>
        </li>
      {/each}
    </ul>
  </div>

  <!-- Pricing and purchase button -->
  <div class="border-t border-surface-200 dark:border-surface-600 pt-4">
    <div class="flex items-end justify-between mb-4">
      <div>
        <span class="text-2xl font-bold text-surface-900 dark:text-surface-100">
          {plan.price}
        </span>
        <span class="text-surface-600 dark:text-surface-300 text-sm ml-1">credits</span>
      </div>
    </div>

    <div class="space-y-2">
      {#if detailHref}
        <a
          href={detailHref}
          class="w-full py-3 px-4 rounded-lg font-semibold transition-all duration-200 bg-primary-600 hover:bg-primary-700 text-white text-center block hover:scale-105 shadow-lg hover:shadow-xl"
        >
          View Details
        </a>
      {:else}
        <span
          class="w-full py-3 px-4 rounded-lg font-semibold bg-surface-200 dark:bg-surface-600 text-surface-500 dark:text-surface-400 text-center block cursor-not-allowed"
        >
          View Details
        </span>
      {/if}

      <button
        on:click={() => onPurchase(plan)}
        class="w-full py-2 px-4 rounded-lg font-medium transition-colors duration-200 {canPurchase
          ? 'border border-primary-600 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20'
          : 'bg-surface-300 dark:bg-surface-600 text-surface-500 dark:text-surface-400 cursor-not-allowed'}"
        disabled={!canPurchase}
      >
        {#if canPurchase}
          Quick Purchase
        {:else}
          Insufficient Credits
        {/if}
      </button>
    </div>

    {#if !canPurchase}
      <p class="text-xs text-surface-500 dark:text-surface-400 mt-2 text-center">
        You need {plan.price - userBalance} more credits
      </p>
    {/if}
  </div>
</div>
