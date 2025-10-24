<script lang="ts">
  import { ArrowRight } from 'lucide-svelte';
  import type { RelatedPlan } from '$lib/types/subscription';

  export let relatedPlans: RelatedPlan[];
  export let title: string = 'Users also joined these plans';

  function getServiceLogo(serviceType: string) {
    const logos: Record<string, string> = {
      spotify: '🎵',
      netflix: '🎬',
      tradingview: '📈',
      disney: '🏰',
      adobe: '🎨',
      microsoft: '📊',
    };
    return logos[serviceType] || '📱';
  }

  function getServiceColors(serviceType: string) {
    const colors: Record<string, { bg: string; border: string; text: string }> = {
      spotify: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
      netflix: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
      tradingview: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
      disney: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
      adobe: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
      microsoft: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
    };
    return colors[serviceType] || { bg: 'bg-surface-50', border: 'border-surface-200', text: 'text-surface-700' };
  }

  function formatCurrency(amount: number) {
    return `€${amount.toFixed(2)}`;
  }

  function navigateToDetail(plan: RelatedPlan) {
    window.location.href = `/browse/subscriptions/${plan.serviceType}/${plan.id}`;
  }
</script>

<div class="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow duration-300">
  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <h3 class="text-xl font-semibold text-gray-900">
      {title}
    </h3>
    <a
      href="/browse"
      class="inline-flex items-center space-x-1 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
    >
      <span>View All</span>
      <ArrowRight size={14} />
    </a>
  </div>

  <!-- Plans Grid -->
  <div class="flex space-x-4 overflow-x-auto pb-2 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-4 sm:space-x-0 sm:overflow-x-visible">
    {#each relatedPlans as plan}
      <div
        class="flex-shrink-0 w-64 sm:w-auto border border-gray-200 rounded-lg p-4 hover:shadow-md hover:border-gray-300 hover:scale-105 transition-all duration-300 cursor-pointer animate-in fade-in slide-in-from-bottom-2"
        on:click={() => navigateToDetail(plan)}
        on:keydown={(e) => e.key === 'Enter' && navigateToDetail(plan)}
        role="button"
        tabindex="0"
      >
        <!-- Service Logo -->
        <div class="flex items-center justify-center mb-3">
          <div class="w-12 h-12 {getServiceColors(plan.serviceType).bg} {getServiceColors(plan.serviceType).border} border-2 rounded-lg flex items-center justify-center text-xl">
            {getServiceLogo(plan.serviceType)}
          </div>
        </div>

        <!-- Service Info -->
        <div class="text-center">
          <h4 class="font-semibold text-gray-900 mb-1">
            {plan.serviceName}
          </h4>
          <p class="text-sm text-gray-600 mb-3">
            {plan.planName}
          </p>
        </div>

        <!-- Price -->
        <div class="text-center">
          <div class="text-lg font-bold {getServiceColors(plan.serviceType).text}">
            {formatCurrency(plan.price)}
          </div>
          <div class="text-xs text-gray-500">
            per month
          </div>
        </div>

        <!-- Quick Join Button -->
        <button
          class="w-full mt-4 py-2 px-3 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors duration-200"
          on:click|stopPropagation={() => navigateToDetail(plan)}
        >
          View Details
        </button>
      </div>
    {/each}
  </div>

  <!-- Empty State -->
  {#if relatedPlans.length === 0}
    <div class="text-center py-8">
      <div class="text-4xl mb-4">🔍</div>
      <p class="text-surface-600 dark:text-surface-400">
        No related plans available at the moment.
      </p>
      <a
        href="/browse"
        class="inline-flex items-center space-x-1 mt-3 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
      >
        <span>Browse all plans</span>
        <ArrowRight size={14} />
      </a>
    </div>
  {/if}
</div>