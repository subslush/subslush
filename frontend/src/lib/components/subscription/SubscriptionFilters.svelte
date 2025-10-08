<script lang="ts">
  import { Filter, Music, Film, TrendingUp } from 'lucide-svelte';
  import type { ServiceType } from '$lib/types/subscription.js';

  export let selected: ServiceType | 'all' = 'all';

  const filters = [
    { value: 'all' as const, label: 'All Services', icon: Filter },
    { value: 'spotify' as const, label: 'Spotify', icon: Music },
    { value: 'netflix' as const, label: 'Netflix', icon: Film },
    { value: 'tradingview' as const, label: 'TradingView', icon: TrendingUp }
  ] as const;

  function handleFilterChange(filterValue: ServiceType | 'all') {
    selected = filterValue;
  }
</script>

<div class="mb-8">
  <h3 class="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-4">
    Filter by Service
  </h3>

  <div class="flex flex-wrap gap-3">
    {#each filters as filter}
      <button
        on:click={() => handleFilterChange(filter.value)}
        class="flex items-center space-x-2 px-4 py-2 rounded-lg border transition-all duration-200 {selected === filter.value
          ? 'bg-primary-600 text-white border-primary-600 shadow-md'
          : 'bg-surface-50 dark:bg-surface-800 text-surface-700 dark:text-surface-300 border-surface-300 dark:border-surface-600 hover:bg-surface-100 dark:hover:bg-surface-700'}"
      >
        <svelte:component this={filter.icon} size={18} />
        <span class="font-medium">{filter.label}</span>
      </button>
    {/each}
  </div>
</div>