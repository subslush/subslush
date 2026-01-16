<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { slide } from 'svelte/transition';
  import { ChevronLeft, ChevronRight } from 'lucide-svelte';
  import type { CategoryOption } from '$lib/types/browse.js';

  export let categories: CategoryOption[];
  export let selectedCategory = 'all';
  export let showTitle = true;

  const dispatch = createEventDispatcher<{
    categorySelect: string;
  }>();

  let scrollContainer: HTMLElement;
  let showLeftButton = false;
  let showRightButton = false;

  function handleCategorySelect(categoryId: string) {
    selectedCategory = categoryId;
    dispatch('categorySelect', categoryId);
  }

  function scrollLeft() {
    if (scrollContainer) {
      scrollContainer.scrollBy({ left: -200, behavior: 'smooth' });
    }
  }

  function scrollRight() {
    if (scrollContainer) {
      scrollContainer.scrollBy({ left: 200, behavior: 'smooth' });
    }
  }

  function handleScroll() {
    if (!scrollContainer) return;

    const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;
    showLeftButton = scrollLeft > 0;
    showRightButton = scrollLeft < scrollWidth - clientWidth - 10;
  }

  function handleKeydown(event: KeyboardEvent, categoryId: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleCategorySelect(categoryId);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      const currentIndex = categories.findIndex(cat => cat.id === selectedCategory);
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : categories.length - 1;
      handleCategorySelect(categories[prevIndex].id);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      const currentIndex = categories.findIndex(cat => cat.id === selectedCategory);
      const nextIndex = currentIndex < categories.length - 1 ? currentIndex + 1 : 0;
      handleCategorySelect(categories[nextIndex].id);
    }
  }

  // Update scroll buttons when container or categories change
  $: if (scrollContainer && categories.length > 0) {
    setTimeout(handleScroll, 100);
  }
</script>

<div class="category-filter relative" role="toolbar" aria-label="Filter by category">
  {#if showTitle}
    <h3 class="text-lg font-semibold text-gray-900 mb-4">
      Browse by Category:
    </h3>
  {/if}

  <div class="relative flex items-center">
    <!-- Left scroll button -->
    {#if showLeftButton}
      <button
        type="button"
        class="absolute left-0 z-10 flex items-center justify-center w-8 h-8 bg-white shadow-lg rounded-full border border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all duration-200"
        style="transform: translateX(-50%)"
        on:click={scrollLeft}
        aria-label="Scroll categories left"
        transition:slide={{ axis: 'x', duration: 200 }}
      >
        <ChevronLeft size={16} class="text-gray-600" />
      </button>
    {/if}

    <!-- Categories container -->
    <div
      bind:this={scrollContainer}
      class="flex space-x-3 overflow-x-auto scrollbar-hide py-2 px-1"
      style="scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch;"
      on:scroll={handleScroll}
      role="tablist"
      aria-orientation="horizontal"
    >
      {#each categories as category (category.id)}
        <button
          type="button"
          class={`flex-shrink-0 flex items-center space-x-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 min-w-fit ${
            selectedCategory === category.id
              ? 'bg-gradient-to-br from-cyan-500/5 to-pink-500/5 border border-cyan-200 text-gray-900 font-semibold'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-800'
          }`}
          style="scroll-snap-align: start; min-height: 44px;"
          on:click={() => handleCategorySelect(category.id)}
          on:keydown={(e) => handleKeydown(e, category.id)}
          role="tab"
          aria-selected={selectedCategory === category.id}
          aria-controls="subscription-grid"
          tabindex={selectedCategory === category.id ? 0 : -1}
        >
          <span class="text-lg" aria-hidden="true">{category.icon}</span>
          <span>{category.name}</span>
          <span
            class="px-2 py-0.5 text-xs rounded-full"
            class:bg-cyan-100={selectedCategory === category.id}
            class:text-cyan-700={selectedCategory === category.id}
            class:bg-gray-100={selectedCategory !== category.id}
            class:text-gray-600={selectedCategory !== category.id}
          >
            {category.count}
          </span>
        </button>
      {/each}
    </div>

    <!-- Right scroll button -->
    {#if showRightButton}
      <button
        type="button"
        class="absolute right-0 z-10 flex items-center justify-center w-8 h-8 bg-white shadow-lg rounded-full border border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all duration-200"
        style="transform: translateX(50%)"
        on:click={scrollRight}
        aria-label="Scroll categories right"
        transition:slide={{ axis: 'x', duration: 200 }}
      >
        <ChevronRight size={16} class="text-gray-600" />
      </button>
    {/if}
  </div>

  <!-- Fade gradients for scroll indication -->
  <div
    class="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-white to-transparent pointer-events-none z-5"
    class:opacity-100={showLeftButton}
    class:opacity-0={!showLeftButton}
    style="transition: opacity 0.3s ease;"
  ></div>
  <div
    class="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-white to-transparent pointer-events-none z-5"
    class:opacity-100={showRightButton}
    class:opacity-0={!showRightButton}
    style="transition: opacity 0.3s ease;"
  ></div>
</div>

<style>
  /* Hide scrollbar */
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }

  /* Smooth scrolling behavior */
  .category-filter div {
    scroll-behavior: smooth;
  }

  /* Focus styles for accessibility */
  .category-filter button:focus {
    outline: 2px solid #0ea5e9;
    outline-offset: 2px;
  }

  /* Responsive adjustments */
  @media (max-width: 768px) {
    .category-filter {
      margin: 0 -1rem;
      padding: 0 1rem;
    }

    .category-filter div:first-of-type {
      padding-left: 1rem;
      padding-right: 1rem;
    }
  }

  /* Ensure minimum touch targets on mobile */
  @media (max-width: 768px) {
    .category-filter button {
      min-height: 44px;
      min-width: 44px;
    }
  }

  /* Reduce motion for accessibility */
  @media (prefers-reduced-motion: reduce) {
    .category-filter div,
    .category-filter button {
      transition: none;
      scroll-behavior: auto;
    }
  }

  /* High contrast mode support */
  @media (prefers-contrast: high) {
    .category-filter button {
      border-width: 2px;
    }
  }
</style>
