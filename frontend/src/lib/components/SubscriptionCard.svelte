<script lang="ts">
  import { Music, Tv, TrendingUp, Check } from 'lucide-svelte';
  import type { ServiceType } from '$lib/types/subscription.js';

  export let serviceName: string;
  export let planName: string;
  export let price: number;
  export let features: string[];
  export let serviceType: ServiceType;
  export let onSelect: () => void;
  export let isSelected: boolean = false;
  export let disabled: boolean = false;

  const serviceIcons: Record<string, typeof Music> = {
    spotify: Music,
    netflix: Tv,
    tradingview: TrendingUp
  };

  const serviceColors: Record<string, string> = {
    spotify: 'bg-green-500',
    netflix: 'bg-red-500',
    tradingview: 'bg-blue-500'
  };

  $: IconComponent = serviceIcons[serviceType] || Music;
  $: serviceColor = serviceColors[serviceType] || 'bg-primary-500';
  $: cardClasses = [
    'bg-surface-100-800-token border rounded-lg shadow-lg p-6 transition-all duration-200 cursor-pointer',
    isSelected ? 'border-primary-500 ring-2 ring-primary-200 dark:ring-primary-800' : 'border-surface-300-600-token',
    disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-xl hover:border-primary-400',
    disabled ? '' : 'transform hover:scale-[1.02]'
  ].join(' ');
</script>

<div
  class={cardClasses}
  on:click={() => !disabled && onSelect()}
  role="button"
  tabindex={disabled ? -1 : 0}
  on:keydown={(e) => {
    if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onSelect();
    }
  }}
>
  <!-- Service Header -->
  <div class="flex items-center justify-between mb-4">
    <div class="flex items-center space-x-3">
      <div class="p-3 {serviceColor} text-white rounded-full">
        <svelte:component this={IconComponent} class="w-6 h-6" />
      </div>
      <div>
        <h3 class="text-lg font-semibold text-surface-900-50-token">{serviceName}</h3>
        <p class="text-sm text-surface-600-300-token">{planName}</p>
      </div>
    </div>
    {#if isSelected}
      <div class="p-2 bg-primary-500 text-white rounded-full">
        <Check class="w-4 h-4" />
      </div>
    {/if}
  </div>

  <!-- Price -->
  <div class="mb-4">
    <div class="flex items-baseline space-x-1">
      <span class="text-3xl font-bold text-surface-900-50-token">{price.toFixed(2)}</span>
      <span class="text-sm text-surface-600-300-token">credits</span>
    </div>
    <p class="text-xs text-surface-500-400-token">per month</p>
  </div>

  <!-- Features -->
  <div class="space-y-2 mb-6">
    {#each features as feature}
      <div class="flex items-center space-x-2">
        <Check class="w-4 h-4 text-success-500 flex-shrink-0" />
        <span class="text-sm text-surface-700-200-token">{feature}</span>
      </div>
    {/each}
  </div>

  <!-- Select Button -->
  <button
    class="w-full btn {isSelected ? 'variant-filled-primary' : 'variant-ghost-primary'}"
    {disabled}
    on:click|stopPropagation={() => !disabled && onSelect()}
  >
    {#if disabled}
      Insufficient Credits
    {:else if isSelected}
      Selected
    {:else}
      Select Plan
    {/if}
  </button>
</div>
