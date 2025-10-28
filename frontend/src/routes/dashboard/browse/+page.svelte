<script lang="ts">
  import { onMount } from 'svelte';
  import { writable, derived } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { fade, fly } from 'svelte/transition';
  import { ChevronRight, Home, AlertCircle } from 'lucide-svelte';

  // Components
  import SavingsSpeedometer from '$lib/components/browse/SavingsSpeedometer.svelte';
  import CategoryFilter from '$lib/components/browse/CategoryFilter.svelte';
  import SearchBar from '$lib/components/browse/SearchBar.svelte';
  import FilterSortControls from '$lib/components/browse/FilterSortControls.svelte';
  import SubscriptionGrid from '$lib/components/browse/SubscriptionGrid.svelte';
  import Pagination from '$lib/components/browse/Pagination.svelte';

  // Types
  import type { PageData } from './$types';
  import type {
    BrowseFilters,
    BrowseSubscription,
    HoveredSubscription,
    SearchResult,
    PaginationInfo
  } from '$lib/types/browse.js';

  export let data: PageData;

  // State management
  const filters = writable<BrowseFilters>({
    category: 'all',
    searchQuery: '',
    priceRange: { min: 0, max: 150 },
    sortBy: 'recommended',
    availability: 'all'
  });

  const currentPage = writable(1);
  const itemsPerPage = writable(24);
  const comparedSubscriptions = writable<BrowseSubscription[]>([]);
  const hoveredSubscription = writable<HoveredSubscription | null>(null);
  const isLoading = writable(false);
  const searchSuggestions = writable<SearchResult[]>([]);

  // Derived stores
  const filteredSubscriptions = derived(
    [filters],
    ([$filters]) => applyFilters(data.subscriptions, $filters)
  );

  const paginatedSubscriptions = derived(
    [filteredSubscriptions, currentPage, itemsPerPage],
    ([$subs, $page, $perPage]) => {
      const start = ($page - 1) * $perPage;
      return $subs.slice(start, start + $perPage);
    }
  );

  const paginationInfo = derived(
    [filteredSubscriptions, currentPage, itemsPerPage],
    ([$subs, $page, $perPage]) => ({
      currentPage: $page,
      totalPages: Math.ceil($subs.length / $perPage),
      itemsPerPage: $perPage,
      totalItems: $subs.length,
      hasNext: $page < Math.ceil($subs.length / $perPage),
      hasPrevious: $page > 1
    } as PaginationInfo)
  );

  const savingsCalculation = derived(
    [comparedSubscriptions, hoveredSubscription],
    ([$compared, $hovered]) => {
      let total = $compared.reduce((sum, sub) => sum + sub.monthlySavings, 0);
      if ($hovered) {
        total += $hovered.monthlySavings;
      }
      return Math.round(total);
    }
  );

  // Filter logic
  function applyFilters(subscriptions: BrowseSubscription[], filters: BrowseFilters): BrowseSubscription[] {
    let filtered = [...subscriptions];

    // Category filter
    if (filters.category !== 'all') {
      filtered = filtered.filter(sub => sub.category === filters.category);
    }

    // Search filter
    if (filters.searchQuery.trim()) {
      const query = filters.searchQuery.toLowerCase().trim();
      filtered = filtered.filter(sub =>
        sub.serviceName.toLowerCase().includes(query) ||
        sub.planName.toLowerCase().includes(query) ||
        sub.description.toLowerCase().includes(query)
      );
    }

    // Price range filter
    filtered = filtered.filter(sub =>
      sub.price >= filters.priceRange.min && sub.price <= filters.priceRange.max
    );

    // Availability filter
    if (filters.availability === 'available') {
      filtered = filtered.filter(sub => sub.availability.availableSeats > 0);
    } else if (filters.availability === 'filling_fast') {
      filtered = filtered.filter(sub => sub.availability.availableSeats <= 2);
    }

    // Sort
    filtered = sortSubscriptions(filtered, filters.sortBy);

    return filtered;
  }

  function sortSubscriptions(subscriptions: BrowseSubscription[], sortBy: string): BrowseSubscription[] {
    const sorted = [...subscriptions];

    switch (sortBy) {
      case 'price_low':
        return sorted.sort((a, b) => a.price - b.price);
      case 'price_high':
        return sorted.sort((a, b) => b.price - a.price);
      case 'savings':
        return sorted.sort((a, b) => b.savingsPercentage - a.savingsPercentage);
      case 'popularity':
        return sorted.sort((a, b) => b.ratings.count - a.ratings.count);
      case 'recommended':
      default:
        // Custom scoring algorithm
        return sorted.sort((a, b) => {
          const scoreA = (a.ratings.average * 0.3) + (a.savingsPercentage * 0.4) + (a.availability.availableSeats > 0 ? 20 : 0) + (a.badges.includes('verified') ? 10 : 0);
          const scoreB = (b.ratings.average * 0.3) + (b.savingsPercentage * 0.4) + (b.availability.availableSeats > 0 ? 20 : 0) + (b.badges.includes('verified') ? 10 : 0);
          return scoreB - scoreA;
        });
    }
  }

  // Event handlers
  function handleCategorySelect(event: CustomEvent<string>) {
    filters.update(f => ({ ...f, category: event.detail }));
    currentPage.set(1);
  }

  function handleSearchChange(event: CustomEvent<string>) {
    filters.update(f => ({ ...f, searchQuery: event.detail }));
    currentPage.set(1);
    generateSearchSuggestions(event.detail);
  }

  function handleSearchClear() {
    filters.update(f => ({ ...f, searchQuery: '' }));
    searchSuggestions.set([]);
  }

  function handleFiltersChange(event: CustomEvent<BrowseFilters>) {
    filters.set(event.detail);
    currentPage.set(1);
  }

  function handleSubscriptionHover(event: CustomEvent<BrowseSubscription>) {
    hoveredSubscription.set({
      serviceType: event.detail.serviceType,
      retailPrice: event.detail.originalPrice,
      subslushPrice: event.detail.price,
      monthlySavings: event.detail.monthlySavings
    });
  }

  function handleSubscriptionHoverEnd() {
    hoveredSubscription.set(null);
  }

  function handleSubscriptionClick(event: CustomEvent<BrowseSubscription>) {
    goto(`/browse/subscriptions/${event.detail.serviceType}/${event.detail.id}`);
  }

  function handleCompareToggle(event: CustomEvent<BrowseSubscription>) {
    comparedSubscriptions.update(subs => {
      const exists = subs.find(s => s.id === event.detail.id);
      if (exists) {
        return subs.filter(s => s.id !== event.detail.id);
      } else {
        return [...subs, event.detail];
      }
    });
  }

  function handlePageChange(event: CustomEvent<number>) {
    currentPage.set(event.detail);
  }

  function handleItemsPerPageChange(event: CustomEvent<number>) {
    itemsPerPage.set(event.detail);
    currentPage.set(1);
  }

  function generateSearchSuggestions(query: string) {
    if (!query.trim()) {
      searchSuggestions.set([]);
      return;
    }

    const suggestions = data.subscriptions
      .filter(sub =>
        sub.serviceName.toLowerCase().includes(query.toLowerCase()) ||
        sub.planName.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, 5)
      .map(sub => ({
        id: sub.id,
        serviceType: sub.serviceType,
        serviceName: sub.serviceName,
        planName: sub.planName,
        price: sub.price,
        logoUrl: sub.logoUrl
      }));

    searchSuggestions.set(suggestions);
  }

  function handleSuggestionSelect(event: CustomEvent<SearchResult>) {
    filters.update(f => ({ ...f, searchQuery: `${event.detail.serviceName} ${event.detail.planName}` }));
    searchSuggestions.set([]);
  }

  // URL sync (optional enhancement)
  function syncFiltersToURL() {
    const params = new URLSearchParams();
    const currentFilters = $filters;

    if (currentFilters.category !== 'all') params.set('category', currentFilters.category);
    if (currentFilters.searchQuery) params.set('search', currentFilters.searchQuery);
    if (currentFilters.sortBy !== 'recommended') params.set('sort', currentFilters.sortBy);
    if (currentFilters.availability !== 'all') params.set('availability', currentFilters.availability);
    if (currentFilters.priceRange.min > 0) params.set('min_price', currentFilters.priceRange.min.toString());
    if (currentFilters.priceRange.max < 150) params.set('max_price', currentFilters.priceRange.max.toString());
    if ($currentPage > 1) params.set('page', $currentPage.toString());

    const newURL = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
    window.history.replaceState({}, '', newURL);
  }

  // Initialize from URL parameters
  onMount(() => {
    const urlParams = new URLSearchParams(window.location.search);

    filters.update(f => ({
      ...f,
      category: urlParams.get('category') || 'all',
      searchQuery: urlParams.get('search') || '',
      sortBy: (urlParams.get('sort') as any) || 'recommended',
      availability: (urlParams.get('availability') as any) || 'all',
      priceRange: {
        min: parseInt(urlParams.get('min_price') || '0'),
        max: parseInt(urlParams.get('max_price') || '150')
      }
    }));

    currentPage.set(parseInt(urlParams.get('page') || '1'));

    // Sync filters to URL when they change
    const unsubscribe = derived([filters, currentPage], ([f, p]) => ({ filters: f, page: p }))
      .subscribe(() => syncFiltersToURL());

    return unsubscribe;
  });
</script>

<svelte:head>
  <title>Browse Premium Subscriptions - SubSlush</title>
  <meta name="description" content="Discover and save up to 90% on 500+ premium subscriptions. Browse Netflix, Spotify, Adobe, TradingView and more." />
  <meta name="keywords" content="subscriptions, Netflix, Spotify, Adobe, savings, deals" />
</svelte:head>

<div class="browse-page min-h-screen bg-gray-50">
  <!-- Breadcrumb -->
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
    <nav class="flex items-center space-x-2 text-sm mb-6" aria-label="Breadcrumb">
      <a href="/dashboard" class="text-gray-600 hover:text-gray-900 transition-colors duration-150">
        <Home size={16} />
      </a>
      <ChevronRight size={14} class="text-gray-400" />
      <a href="/dashboard" class="text-gray-600 hover:text-gray-900 transition-colors duration-150">
        Dashboard
      </a>
      <ChevronRight size={14} class="text-gray-400" />
      <span class="text-gray-900 font-medium">Browse Subscriptions</span>
    </nav>
  </div>

  <!-- Hero Section -->
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="text-center mb-8" transition:fade={{ duration: 600 }}>
      <h1 class="text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
        Browse Premium Subscriptions
      </h1>
      <p class="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
        Save up to 90% on 500+ premium services. Find the perfect subscription plan for your needs.
      </p>

      <!-- Savings Speedometer Widget -->
      <div class="max-w-lg mx-auto mb-8" transition:fly={{ y: 50, duration: 800, delay: 200 }}>
        <SavingsSpeedometer
          currentSavings={$savingsCalculation}
          maxSavings={150}
          userSavingsData={{
            averageSavings: 94,
            comparisonCount: $comparedSubscriptions.length
          }}
        />
      </div>
    </div>

    <!-- Search Bar -->
    <div class="max-w-2xl mx-auto mb-8" transition:fly={{ y: 30, duration: 600, delay: 400 }}>
      <SearchBar
        query={$filters.searchQuery}
        suggestions={$searchSuggestions}
        on:queryChange={handleSearchChange}
        on:clear={handleSearchClear}
        on:suggestionSelect={handleSuggestionSelect}
      />
    </div>

    <!-- Category Filter -->
    <div class="mb-8" transition:fly={{ y: 30, duration: 600, delay: 600 }}>
      <CategoryFilter
        categories={data.categories}
        selectedCategory={$filters.category}
        on:categorySelect={handleCategorySelect}
      />
    </div>

    <!-- Filter & Sort Controls -->
    <div transition:fly={{ y: 30, duration: 600, delay: 800 }}>
      <FilterSortControls
        filters={$filters}
        totalResults={$filteredSubscriptions.length}
        isLoading={$isLoading}
        on:filtersChange={handleFiltersChange}
        on:sortChange={(e) => filters.update(f => ({ ...f, sortBy: e.detail }))}
        on:filterClear={() => {
          filters.set({
            category: 'all',
            searchQuery: '',
            priceRange: { min: 0, max: 150 },
            sortBy: 'recommended',
            availability: 'all'
          });
          currentPage.set(1);
        }}
      />
    </div>

    <!-- Error State -->
    {#if data.error}
      <div class="bg-red-50 border border-red-200 rounded-lg p-6 mb-8" transition:fade>
        <div class="flex items-center space-x-3">
          <AlertCircle class="text-red-600 flex-shrink-0" size={20} />
          <div>
            <h3 class="font-semibold text-red-900">Failed to load subscriptions</h3>
            <p class="text-red-700 text-sm mt-1">{data.error}</p>
            <button
              type="button"
              class="mt-3 bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700 transition-colors duration-150"
              on:click={() => window.location.reload()}
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Subscription Grid -->
    <div id="subscription-grid" transition:fade={{ duration: 600, delay: 1000 }}>
      <SubscriptionGrid
        subscriptions={$paginatedSubscriptions}
        isLoading={$isLoading}
        error={data.error}
        hoveredSubscription={$hoveredSubscription}
        comparedSubscriptions={$comparedSubscriptions}
        showCompareButtons={$comparedSubscriptions.length > 0}
        on:subscription:hover={handleSubscriptionHover}
        on:subscription:hoverEnd={handleSubscriptionHoverEnd}
        on:subscription:click={handleSubscriptionClick}
        on:subscription:compare={handleCompareToggle}
      />
    </div>

    <!-- Pagination -->
    {#if $paginationInfo.totalPages > 1}
      <div transition:fade={{ duration: 600, delay: 1200 }}>
        <Pagination
          pagination={$paginationInfo}
          on:pageChange={handlePageChange}
          on:itemsPerPageChange={handleItemsPerPageChange}
        />
      </div>
    {/if}

    <!-- Comparison Summary (if items compared) -->
    {#if $comparedSubscriptions.length > 0}
      <div
        class="fixed bottom-6 right-6 bg-white border border-gray-200 rounded-xl shadow-lg p-4 max-w-sm z-40"
        transition:fly={{ x: 100, duration: 300 }}
      >
        <div class="flex items-center justify-between mb-2">
          <h4 class="font-semibold text-gray-900">Comparison</h4>
          <button
            type="button"
            class="text-gray-400 hover:text-gray-600"
            on:click={() => comparedSubscriptions.set([])}
          >
            <AlertCircle size={16} />
          </button>
        </div>
        <p class="text-sm text-gray-600 mb-3">
          {$comparedSubscriptions.length} services selected
        </p>
        <div class="text-lg font-bold text-green-600 mb-3">
          Total savings: €{$comparedSubscriptions.reduce((sum, sub) => sum + sub.monthlySavings, 0).toFixed(2)}/mo
        </div>
        <button
          type="button"
          class="w-full bg-gradient-to-r from-cyan-500 to-pink-500 text-white py-2 px-4 rounded-lg text-sm font-medium hover:from-cyan-600 hover:to-pink-600 transition-all duration-200"
        >
          Compare Details
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .browse-page {
    /* Ensure full height and smooth scrolling */
    scroll-behavior: smooth;
  }

  /* Custom scrollbar for webkit browsers */
  .browse-page::-webkit-scrollbar {
    width: 8px;
  }

  .browse-page::-webkit-scrollbar-track {
    background: #f1f5f9;
  }

  .browse-page::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 4px;
  }

  .browse-page::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }

  /* Accessibility improvements */
  @media (prefers-reduced-motion: reduce) {
    .browse-page {
      scroll-behavior: auto;
    }

    * {
      transition: none !important;
      animation: none !important;
    }
  }

  /* Print styles */
  @media print {
    .browse-page {
      background: white;
    }

    .browse-page :global(.fixed) {
      position: static;
    }
  }
</style>