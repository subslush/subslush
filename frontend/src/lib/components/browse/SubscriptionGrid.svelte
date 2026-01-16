<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import SubscriptionBrowseCard from './SubscriptionBrowseCard.svelte';
  import EmptyState from './EmptyState.svelte';
  import { Loader2 } from 'lucide-svelte';
  import type { BrowseSubscription } from '$lib/types/browse.js';

  export let subscriptions: BrowseSubscription[] = [];
  export let isLoading = false;
  export let error: string | null = null;
  export let hoveredSubscription: BrowseSubscription | null = null;
  export let comparedSubscriptions: BrowseSubscription[] = [];
  export let showCompareButtons = false;

  const dispatch = createEventDispatcher<{
    'subscription:hover': BrowseSubscription;
    'subscription:hoverEnd': BrowseSubscription;
    'subscription:click': BrowseSubscription;
    'subscription:compare': BrowseSubscription;
    'grid:loaded': void;
    'filters:clear': void;
  }>();

  let gridElement: HTMLElement;
  let observedCards = new Set<Element>();
  let intersectionObserver: IntersectionObserver;

  // Setup intersection observer for performance
  function setupIntersectionObserver() {
    if (typeof window === 'undefined') return;

    intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-in');
            intersectionObserver.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin: '50px',
        threshold: 0.1
      }
    );
  }

  function observeCard(element: Element) {
    if (intersectionObserver && !observedCards.has(element)) {
      intersectionObserver.observe(element);
      observedCards.add(element);
    }
  }

  function handleSubscriptionHover(event: CustomEvent<BrowseSubscription>) {
    hoveredSubscription = event.detail;
    dispatch('subscription:hover', event.detail);
  }

  function handleSubscriptionHoverEnd(event: CustomEvent<BrowseSubscription>) {
    hoveredSubscription = null;
    dispatch('subscription:hoverEnd', event.detail);
  }

  function handleSubscriptionClick(event: CustomEvent<BrowseSubscription>) {
    dispatch('subscription:click', event.detail);
  }

  function handleCompare(event: CustomEvent<BrowseSubscription>) {
    dispatch('subscription:compare', event.detail);
  }

  function isSubscriptionCompared(subscription: BrowseSubscription): boolean {
    return comparedSubscriptions.some(sub => sub.id === subscription.id);
  }

  // Initialize observer when component mounts
  if (typeof window !== 'undefined') {
    setupIntersectionObserver();
  }

  // Cleanup observer on destroy
  import { onDestroy } from 'svelte';
  onDestroy(() => {
    if (intersectionObserver) {
      intersectionObserver.disconnect();
    }
  });

  // Dispatch loaded event when subscriptions change
  $: if (subscriptions.length > 0) {
    dispatch('grid:loaded');
  }
</script>

<div
  bind:this={gridElement}
  class="subscription-grid"
  role="grid"
  aria-label="Browse subscriptions"
>
  <!-- Loading State -->
  {#if isLoading}
    <div
      class="flex flex-col items-center justify-center py-16"
      transition:fade={{ duration: 200 }}
    >
      <Loader2 class="w-8 h-8 animate-spin text-cyan-500 mb-4" />
      <p class="text-gray-600 text-lg">Loading subscriptions...</p>
      <p class="text-gray-500 text-sm">Finding the best deals for you</p>
    </div>

  <!-- Error State -->
  {:else if error}
    <div
      class="col-span-full"
      transition:fade={{ duration: 200 }}
    >
      <EmptyState
        icon="⚠️"
        title="Something went wrong"
        message={error}
        actionLabel="Try again"
        on:action={() => window.location.reload()}
      />
    </div>

  <!-- Empty State -->
  {:else if subscriptions.length === 0}
    <div
      class="col-span-full"
      transition:fade={{ duration: 200 }}
    >
      <EmptyState
        icon="🔍"
        title="No subscriptions found"
        message="Try adjusting your filters or search query to find more options"
        actionLabel="Clear filters"
        on:action={() => dispatch('filters:clear')}
      />
    </div>

  <!-- Subscription Grid -->
  {:else}
    <div
      class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-fr"
      role="grid"
    >
      {#each subscriptions as subscription, index (subscription.id)}
        <div
          class="grid-item opacity-0 transform translate-y-4"
          class:animate-in={true}
          animate:flip={{ duration: 300 }}
          transition:scale={{ duration: 200, delay: index * 50 }}
          style="animation-delay: {index * 100}ms"
          use:observeCard
          role="gridcell"
        >
          <SubscriptionBrowseCard
            {subscription}
            isHovered={hoveredSubscription?.id === subscription.id}
            showCompareButton={showCompareButtons}
            on:hover={handleSubscriptionHover}
            on:hoverEnd={handleSubscriptionHoverEnd}
            on:click={handleSubscriptionClick}
            on:compare={handleCompare}
          />

          <!-- Comparison indicator -->
          {#if isSubscriptionCompared(subscription)}
            <div
              class="absolute -top-2 -right-2 w-6 h-6 bg-cyan-500 text-white rounded-full flex items-center justify-center text-sm font-bold shadow-lg"
              transition:scale={{ duration: 200 }}
            >
              ✓
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .subscription-grid {
    min-height: 400px;
  }

  .grid-item {
    position: relative;
    transition: opacity 0.6s ease-out, transform 0.6s ease-out;
  }

  .grid-item.animate-in {
    opacity: 1;
    transform: translateY(0);
  }

  /* Responsive grid adjustments */
  @media (max-width: 768px) {
    .subscription-grid :global(.grid) {
      grid-template-columns: 1fr;
      gap: 1rem;
    }
  }

  @media (min-width: 769px) and (max-width: 1024px) {
    .subscription-grid :global(.grid) {
      grid-template-columns: repeat(2, 1fr);
      gap: 1.5rem;
    }
  }

  @media (min-width: 1025px) and (max-width: 1280px) {
    .subscription-grid :global(.grid) {
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
    }
  }

  @media (min-width: 1281px) {
    .subscription-grid :global(.grid) {
      grid-template-columns: repeat(4, 1fr);
      gap: 1.5rem;
    }
  }

  /* Staggered animation for grid items */
  .grid-item:nth-child(1) { animation-delay: 0ms; }
  .grid-item:nth-child(2) { animation-delay: 100ms; }
  .grid-item:nth-child(3) { animation-delay: 200ms; }
  .grid-item:nth-child(4) { animation-delay: 300ms; }
  .grid-item:nth-child(5) { animation-delay: 400ms; }
  .grid-item:nth-child(6) { animation-delay: 500ms; }
  .grid-item:nth-child(7) { animation-delay: 600ms; }
  .grid-item:nth-child(8) { animation-delay: 700ms; }

  /* Smooth hover effects for the entire grid */
  .subscription-grid:hover .grid-item:not(:hover) {
    opacity: 0.7;
    transform: scale(0.98);
  }

  .subscription-grid .grid-item:hover {
    opacity: 1;
    transform: scale(1.02) translateY(-4px);
    z-index: 10;
  }

  /* Accessibility improvements */
  @media (prefers-reduced-motion: reduce) {
    .grid-item {
      transition: none;
    }

    .grid-item.animate-in {
      opacity: 1;
      transform: none;
    }
  }
</style>
