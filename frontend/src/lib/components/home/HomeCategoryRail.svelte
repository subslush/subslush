<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { onMount } from 'svelte';
  import { ChevronLeft, ChevronRight } from 'lucide-svelte';
  import type { ComponentType } from 'svelte';

  type HomeCategory = {
    key: string;
    label: string;
    icon: ComponentType;
  };

  export let categories: HomeCategory[] = [];

  const dispatch = createEventDispatcher<{
    select: string;
  }>();

  let scrollContainer: HTMLDivElement | null = null;
  let canScrollLeft = false;
  let canScrollRight = false;
  let hasOverflow = false;
  let resizeObserver: ResizeObserver | null = null;

  const updateScrollState = () => {
    if (!scrollContainer) {
      hasOverflow = false;
      canScrollLeft = false;
      canScrollRight = false;
      return;
    }

    const maxScrollLeft = Math.max(0, scrollContainer.scrollWidth - scrollContainer.clientWidth);
    hasOverflow = maxScrollLeft > 1;
    canScrollLeft = hasOverflow && scrollContainer.scrollLeft > 1;
    canScrollRight = hasOverflow && scrollContainer.scrollLeft < maxScrollLeft - 1;
  };

  const scrollCategories = (direction: 'left' | 'right') => {
    if (!scrollContainer) return;
    const scrollAmount = Math.max(220, scrollContainer.clientWidth * 0.65);
    const delta = direction === 'left' ? -scrollAmount : scrollAmount;
    scrollContainer.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const handleCategorySelect = (categoryKey: string) => {
    dispatch('select', categoryKey);
  };

  onMount(() => {
    const container = scrollContainer;
    if (!container) return;

    const handleScroll = () => {
      updateScrollState();
    };

    const handleResize = () => {
      updateScrollState();
    };

    updateScrollState();

    container.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        updateScrollState();
      });
      resizeObserver.observe(container);
    }

    return () => {
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
    };
  });

  $: if (categories.length) {
    queueMicrotask(() => {
      updateScrollState();
    });
  }
</script>

<div
  class="home-category-rail"
  class:has-overflow={hasOverflow}
  role="navigation"
  aria-label="Browse product categories"
>
  <button
    type="button"
    class="category-arrow"
    aria-label="Scroll categories left"
    on:click={() => scrollCategories('left')}
    disabled={!canScrollLeft}
  >
    <ChevronLeft size={20} aria-hidden="true" />
  </button>

  <div bind:this={scrollContainer} class="home-category-track">
    {#each categories as category}
      <button
        type="button"
        class="home-category-chip"
        on:click={() => handleCategorySelect(category.key)}
        aria-label={`Browse ${category.label} products`}
      >
        <span class="home-category-icon">
          <svelte:component this={category.icon} size={16} />
        </span>
        <span>{category.label}</span>
      </button>
    {/each}
  </div>

  <button
    type="button"
    class="category-arrow"
    aria-label="Scroll categories right"
    on:click={() => scrollCategories('right')}
    disabled={!canScrollRight}
  >
    <ChevronRight size={20} aria-hidden="true" />
  </button>
</div>

<style>
  .home-category-rail {
    display: grid;
    grid-template-columns: 1fr;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
  }

  .home-category-rail.has-overflow {
    grid-template-columns: auto 1fr auto;
  }

  .category-arrow {
    display: none;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    color: #6b7280;
    border-radius: 9999px;
    background: transparent;
    transition: background-color 160ms ease, color 160ms ease;
  }

  .home-category-rail.has-overflow .category-arrow {
    display: inline-flex;
  }

  .category-arrow:hover:enabled {
    color: #111827;
    background-color: #f3f4f6;
  }

  .category-arrow:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .home-category-track {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    overflow-x: auto;
    scroll-behavior: smooth;
    padding: 0.25rem 0.125rem 0.5rem;
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .home-category-rail.has-overflow .home-category-track {
    justify-content: flex-start;
  }

  .home-category-track::-webkit-scrollbar {
    display: none;
  }

  .home-category-chip {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.45rem 0.75rem;
    border-radius: 9999px;
    color: #1f2937;
    background: transparent;
    font-size: 0.875rem;
    font-weight: 600;
    transition: background-color 160ms ease, color 160ms ease;
  }

  .home-category-chip:hover {
    color: #111827;
    background-color: #f3f4f6;
  }

  .home-category-chip:focus-visible {
    outline: 2px solid #0ea5e9;
    outline-offset: 2px;
  }

  .home-category-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #4b5563;
  }

  @media (max-width: 640px) {
    .home-category-rail {
      gap: 0.25rem;
    }

    .home-category-rail.has-overflow {
      grid-template-columns: auto 1fr auto;
    }

    .home-category-chip {
      padding: 0.4rem 0.65rem;
      font-size: 0.8125rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .home-category-track {
      scroll-behavior: auto;
    }

    .home-category-chip,
    .category-arrow {
      transition: none;
    }
  }
</style>
