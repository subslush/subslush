<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { slide, fly } from 'svelte/transition';
  import {
    ChevronDown,
    Filter,
    X,
    Euro,
    Users,
    TrendingDown,
    Star,
    SlidersHorizontal
  } from 'lucide-svelte';
  import type { BrowseFilters, SortOption, FilterOption } from '$lib/types/browse.js';

  export let filters: BrowseFilters;
  export let totalResults = 0;
  export let isLoading = false;

  const dispatch = createEventDispatcher<{
    filtersChange: BrowseFilters;
    sortChange: string;
    filterClear: void;
  }>();

  let showFiltersModal = false;
  let sortDropdownOpen = false;

  type SortBy = BrowseFilters['sortBy'];
  type Availability = BrowseFilters['availability'];

  const sortOptions: Array<SortOption & { value: SortBy }> = [
    { value: 'recommended', label: 'Recommended', icon: '⭐' },
    { value: 'price_low', label: 'Price: Low to High', icon: '💰' },
    { value: 'price_high', label: 'Price: High to Low', icon: '💎' },
    { value: 'savings', label: 'Highest Savings', icon: '🔥' },
    { value: 'popularity', label: 'Most Popular', icon: '👥' }
  ];

  const availabilityOptions: Array<FilterOption & { value: Availability }> = [
    { value: 'all', label: 'All Subscriptions' },
    { value: 'available', label: 'Available Seats' },
    { value: 'filling_fast', label: 'Filling Fast' }
  ];

  function handleSortChange(sortValue: SortBy) {
    filters = { ...filters, sortBy: sortValue };
    dispatch('sortChange', sortValue);
    dispatch('filtersChange', filters);
    sortDropdownOpen = false;
  }

  function handlePriceRangeChange(min: number, max: number) {
    filters = { ...filters, priceRange: { min, max } };
    dispatch('filtersChange', filters);
  }

  function handleAvailabilityChange(availability: Availability) {
    filters = { ...filters, availability };
    dispatch('filtersChange', filters);
  }

  function clearAllFilters() {
    filters = {
      category: 'all',
      searchQuery: '',
      priceRange: { min: 0, max: 150 },
      sortBy: 'recommended',
      availability: 'all'
    };
    dispatch('filterClear');
    dispatch('filtersChange', filters);
    showFiltersModal = false;
  }

  function removeFilter(filterType: string) {
    switch (filterType) {
      case 'price':
        filters = { ...filters, priceRange: { min: 0, max: 150 } };
        break;
      case 'availability':
        filters = { ...filters, availability: 'all' };
        break;
      case 'search':
        filters = { ...filters, searchQuery: '' };
        break;
    }
    dispatch('filtersChange', filters);
  }

  function getCurrentSortLabel(): string {
    const currentSort = sortOptions.find(opt => opt.value === filters.sortBy);
    return currentSort ? currentSort.label : 'Sort by';
  }

  function getActiveFiltersCount(): number {
    let count = 0;
    if (filters.priceRange.min > 0 || filters.priceRange.max < 150) count++;
    if (filters.availability !== 'all') count++;
    if (filters.searchQuery.trim()) count++;
    return count;
  }

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as Element;
    if (!target.closest('.sort-dropdown')) {
      sortDropdownOpen = false;
    }
    if (!target.closest('.filters-modal')) {
      showFiltersModal = false;
    }
  }

  // Setup click outside listener
  if (typeof window !== 'undefined') {
    document.addEventListener('click', handleClickOutside);
  }

  $: activeFiltersCount = getActiveFiltersCount();
  $: hasActiveFilters = activeFiltersCount > 0;
</script>

<div class="filter-sort-controls flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
  <!-- Results count -->
  <div class="flex items-center space-x-2">
    {#if isLoading}
      <div class="flex items-center space-x-2 text-gray-500">
        <div class="w-4 h-4 border-2 border-gray-300 border-t-cyan-500 rounded-full animate-spin"></div>
        <span class="text-sm">Loading...</span>
      </div>
    {:else}
      <span class="text-gray-600 text-sm">
        Showing <span class="font-semibold text-gray-900">{totalResults}</span>
        {totalResults === 1 ? 'subscription' : 'subscriptions'}
      </span>
    {/if}
  </div>

  <!-- Controls -->
  <div class="flex items-center space-x-4">
    <!-- Sort dropdown -->
    <div class="sort-dropdown relative">
      <button
        type="button"
        class="flex items-center space-x-2 bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-colors duration-150"
        on:click={() => sortDropdownOpen = !sortDropdownOpen}
        aria-haspopup="true"
        aria-expanded={sortDropdownOpen}
      >
        <span>Sort: {getCurrentSortLabel()}</span>
          <ChevronDown
            size={16}
            class={`transform transition-transform duration-200 ${sortDropdownOpen ? 'rotate-180' : ''}`}
          />
      </button>

      {#if sortDropdownOpen}
        <div
          class="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50"
          transition:slide={{ duration: 200 }}
        >
          {#each sortOptions as option}
            <button
              type="button"
              class="w-full flex items-center space-x-3 px-4 py-3 text-left text-sm hover:bg-gray-50 transition-colors duration-150 first:rounded-t-lg last:rounded-b-lg"
              class:bg-cyan-50={filters.sortBy === option.value}
              class:text-cyan-700={filters.sortBy === option.value}
              class:font-medium={filters.sortBy === option.value}
              on:click={() => handleSortChange(option.value)}
            >
              <span class="text-lg">{option.icon}</span>
              <span>{option.label}</span>
              {#if filters.sortBy === option.value}
                <div class="ml-auto w-2 h-2 bg-cyan-500 rounded-full"></div>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Filters button -->
    <button
      type="button"
      class="relative flex items-center space-x-2 bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-colors duration-150"
      class:bg-cyan-50={hasActiveFilters}
      class:border-cyan-200={hasActiveFilters}
      class:text-cyan-700={hasActiveFilters}
      on:click={() => showFiltersModal = true}
    >
      <SlidersHorizontal size={16} />
      <span>Filters</span>
      {#if activeFiltersCount > 0}
        <div class="absolute -top-2 -right-2 w-5 h-5 bg-cyan-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
          {activeFiltersCount}
        </div>
      {/if}
    </button>

    <!-- Clear filters (if any active) -->
    {#if hasActiveFilters}
      <button
        type="button"
        class="text-sm text-cyan-600 hover:text-cyan-700 font-medium"
        on:click={clearAllFilters}
        transition:fly={{ x: 20, duration: 200 }}
      >
        Clear all
      </button>
    {/if}
  </div>
</div>

<!-- Active filters pills -->
{#if hasActiveFilters}
  <div class="flex flex-wrap gap-2 mb-4" transition:slide={{ duration: 200 }}>
    {#if filters.searchQuery.trim()}
      <div class="flex items-center space-x-2 bg-cyan-50 text-cyan-700 px-3 py-1.5 rounded-full text-sm border border-cyan-200">
        <span>Search: "{filters.searchQuery}"</span>
        <button
          type="button"
          class="hover:bg-cyan-100 rounded-full p-0.5"
          on:click={() => removeFilter('search')}
        >
          <X size={12} />
        </button>
      </div>
    {/if}

    {#if filters.priceRange.min > 0 || filters.priceRange.max < 150}
      <div class="flex items-center space-x-2 bg-green-50 text-green-700 px-3 py-1.5 rounded-full text-sm border border-green-200">
        <Euro size={12} />
        <span>€{filters.priceRange.min} - €{filters.priceRange.max}</span>
        <button
          type="button"
          class="hover:bg-green-100 rounded-full p-0.5"
          on:click={() => removeFilter('price')}
        >
          <X size={12} />
        </button>
      </div>
    {/if}

    {#if filters.availability !== 'all'}
      <div class="flex items-center space-x-2 bg-purple-50 text-purple-700 px-3 py-1.5 rounded-full text-sm border border-purple-200">
        <Users size={12} />
        <span>{availabilityOptions.find(opt => opt.value === filters.availability)?.label}</span>
        <button
          type="button"
          class="hover:bg-purple-100 rounded-full p-0.5"
          on:click={() => removeFilter('availability')}
        >
          <X size={12} />
        </button>
      </div>
    {/if}
  </div>
{/if}

<!-- Filters Modal -->
{#if showFiltersModal}
  <div
    class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
    transition:fly={{ y: -50, duration: 300 }}
  >
    <div
      class="filters-modal bg-white rounded-xl max-w-md w-full max-h-[80vh] overflow-y-auto"
      transition:fly={{ y: 50, duration: 300, delay: 100 }}
    >
      <!-- Modal header -->
      <div class="flex items-center justify-between p-6 border-b border-gray-200">
        <h3 class="text-lg font-semibold text-gray-900">Filter Subscriptions</h3>
        <button
          type="button"
          class="text-gray-400 hover:text-gray-600 focus:outline-none"
          on:click={() => showFiltersModal = false}
        >
          <X size={20} />
        </button>
      </div>

      <!-- Modal content -->
      <div class="p-6 space-y-6">
        <!-- Price range -->
        <fieldset>
          <legend class="block text-sm font-medium text-gray-900 mb-3">
            Price Range (per month)
          </legend>
          <div class="space-y-4">
            <div class="flex items-center space-x-4">
              <div class="flex-1">
                <label for="price-min" class="block text-xs text-gray-600 mb-1">Min Price</label>
                <div class="relative">
                  <Euro size={16} class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    id="price-min"
                    type="number"
                    min="0"
                    max="150"
                    bind:value={filters.priceRange.min}
                    class="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    on:change={() => handlePriceRangeChange(filters.priceRange.min, filters.priceRange.max)}
                  />
                </div>
              </div>
              <div class="flex-1">
                <label for="price-max" class="block text-xs text-gray-600 mb-1">Max Price</label>
                <div class="relative">
                  <Euro size={16} class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    id="price-max"
                    type="number"
                    min="0"
                    max="150"
                    bind:value={filters.priceRange.max}
                    class="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    on:change={() => handlePriceRangeChange(filters.priceRange.min, filters.priceRange.max)}
                  />
                </div>
              </div>
            </div>

            <!-- Price range slider visualization -->
            <div class="relative">
              <div class="h-2 bg-gray-200 rounded-full">
                <div
                  class="h-2 bg-gradient-to-r from-cyan-500 to-pink-500 rounded-full"
                  style="margin-left: {(filters.priceRange.min / 150) * 100}%; width: {((filters.priceRange.max - filters.priceRange.min) / 150) * 100}%"
                ></div>
              </div>
              <div class="flex justify-between text-xs text-gray-500 mt-1">
                <span>€0</span>
                <span>€150+</span>
              </div>
            </div>
          </div>
        </fieldset>

        <!-- Availability -->
        <fieldset>
          <legend class="block text-sm font-medium text-gray-900 mb-3">
            Availability
          </legend>
          <div class="space-y-2">
            {#each availabilityOptions as option}
              <label class="flex items-center space-x-3">
                <input
                  type="radio"
                  name="availability"
                  value={option.value}
                  bind:group={filters.availability}
                  class="w-4 h-4 text-cyan-600 border-gray-300 focus:ring-cyan-500"
                  on:change={() => handleAvailabilityChange(option.value)}
                />
                <span class="text-sm text-gray-700">{option.label}</span>
              </label>
            {/each}
          </div>
        </fieldset>
      </div>

      <!-- Modal footer -->
      <div class="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl">
        <button
          type="button"
          class="text-sm text-gray-600 hover:text-gray-800 font-medium"
          on:click={clearAllFilters}
        >
          Clear all filters
        </button>
        <button
          type="button"
          class="bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 text-white font-medium py-2 px-6 rounded-lg transition-all duration-200"
          on:click={() => showFiltersModal = false}
        >
          Apply Filters
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Ensure dropdowns appear above other content */
  .sort-dropdown {
    isolation: isolate;
  }

  /* Custom radio button styling */
  input[type="radio"]:checked {
    background-color: #06b6d4;
    border-color: #06b6d4;
  }

  /* Smooth animations */
  .filter-sort-controls button {
    transition: all 0.15s ease-in-out;
  }

  /* Mobile responsiveness */
  @media (max-width: 640px) {
    .filter-sort-controls {
      flex-direction: column;
      align-items: stretch;
    }

    .filter-sort-controls > div:last-child {
      justify-content: center;
    }
  }

  /* Accessibility improvements */
  @media (prefers-reduced-motion: reduce) {
    * {
      transition: none !important;
    }
  }
</style>
