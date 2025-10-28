<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { RefreshCw, Search, Filter } from 'lucide-svelte';

  export let icon = '🔍';
  export let title = 'No results found';
  export let message = 'Try adjusting your search or filters';
  export let actionLabel = '';
  export let showSearchSuggestions = false;
  export let suggestions: string[] = [];

  const dispatch = createEventDispatcher<{
    action: void;
    suggestion: string;
  }>();

  function handleAction() {
    dispatch('action');
  }

  function handleSuggestion(suggestion: string) {
    dispatch('suggestion', suggestion);
  }

  // Default suggestions if none provided
  const defaultSuggestions = [
    'Netflix',
    'Spotify',
    'Adobe Creative Cloud',
    'TradingView',
    'YouTube Premium',
    'Disney+'
  ];

  $: displaySuggestions = suggestions.length > 0 ? suggestions : defaultSuggestions;
</script>

<div
  class="flex flex-col items-center justify-center py-16 px-6 text-center max-w-md mx-auto"
  transition:fade={{ duration: 300 }}
>
  <!-- Icon -->
  <div
    class="text-6xl mb-6 opacity-80"
    transition:scale={{ duration: 400, delay: 100 }}
  >
    {icon}
  </div>

  <!-- Title -->
  <h3
    class="text-xl font-bold text-gray-900 mb-3"
    transition:fade={{ duration: 300, delay: 200 }}
  >
    {title}
  </h3>

  <!-- Message -->
  <p
    class="text-gray-600 mb-6 leading-relaxed"
    transition:fade={{ duration: 300, delay: 300 }}
  >
    {message}
  </p>

  <!-- Action Button -->
  {#if actionLabel}
    <button
      type="button"
      class="inline-flex items-center space-x-2 bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 text-white font-medium py-3 px-6 rounded-lg transition-all duration-200 hover:shadow-lg hover:scale-105 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2"
      on:click={handleAction}
      transition:scale={{ duration: 300, delay: 400 }}
    >
      <RefreshCw size={16} />
      <span>{actionLabel}</span>
    </button>
  {/if}

  <!-- Search Suggestions -->
  {#if showSearchSuggestions}
    <div
      class="mt-8 w-full"
      transition:fade={{ duration: 300, delay: 500 }}
    >
      <div class="flex items-center justify-center space-x-2 mb-4">
        <Search size={16} class="text-gray-400" />
        <span class="text-sm font-medium text-gray-600">Popular searches:</span>
      </div>

      <div class="flex flex-wrap gap-2 justify-center">
        {#each displaySuggestions.slice(0, 6) as suggestion}
          <button
            type="button"
            class="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors duration-150 hover:scale-105 transform focus:outline-none focus:ring-2 focus:ring-cyan-500"
            on:click={() => handleSuggestion(suggestion)}
          >
            {suggestion}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Filter suggestions -->
  <div
    class="mt-6 flex items-center space-x-4 text-sm text-gray-500"
    transition:fade={{ duration: 300, delay: 600 }}
  >
    <div class="flex items-center space-x-1">
      <Filter size={14} />
      <span>Try:</span>
    </div>
    <div class="flex space-x-2">
      <button
        type="button"
        class="text-cyan-600 hover:text-cyan-700 hover:underline"
        on:click={() => dispatch('action')}
      >
        Clear filters
      </button>
      <span class="text-gray-300">•</span>
      <button
        type="button"
        class="text-cyan-600 hover:text-cyan-700 hover:underline"
        on:click={() => handleSuggestion('')}
      >
        Browse all
      </button>
    </div>
  </div>
</div>

<style>
  /* Subtle animation for the icon */
  @keyframes float {
    0%, 100% {
      transform: translateY(0px);
    }
    50% {
      transform: translateY(-10px);
    }
  }

  div:first-child {
    animation: float 3s ease-in-out infinite;
  }

  /* Accessibility improvements */
  @media (prefers-reduced-motion: reduce) {
    div:first-child {
      animation: none;
    }
  }
</style>