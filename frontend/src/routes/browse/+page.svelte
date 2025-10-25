<script lang="ts">
  import { onMount } from 'svelte';
  import { Search } from 'lucide-svelte';
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import SubscriptionGrid from '$lib/components/home/SubscriptionGrid.svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  let searchQuery = '';
  let selectedCategory = 'all';
  let sortBy = 'recommended';

  // Filter plans based on search and category
  $: filteredPlans = data.plans.filter(plan => {
    const matchesSearch = searchQuery === '' ||
      plan.serviceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plan.plan.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === 'all' ||
      getCategoryForService(plan.serviceType) === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  function getCategoryForService(serviceType: string): string {
    const categoryMap: Record<string, string> = {
      'netflix': 'streaming',
      'disney': 'streaming',
      'spotify': 'music',
      'apple_music': 'music',
      'adobe': 'design',
      'figma': 'design',
      'notion': 'productivity',
      'microsoft': 'productivity',
      'tradingview': 'productivity',
    };
    return categoryMap[serviceType.toLowerCase()] || 'other';
  }
</script>

<svelte:head>
  <title>Browse All Subscriptions - SubSlush</title>
  <meta name="description" content="Browse all available subscription plans. Find the perfect subscription for your needs." />
</svelte:head>

<div class="min-h-screen bg-white">
  <!-- Navigation -->
  <HomeNav />

  <!-- Header Section -->
  <section class="py-12 bg-white border-b">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-8">
        <h1 class="text-3xl font-bold text-gray-900 mb-4">
          All Subscription Plans
        </h1>
        <p class="text-lg text-gray-600 max-w-2xl mx-auto">
          Discover and compare all available subscription plans. Find the perfect match for your needs.
        </p>
      </div>

      <!-- Search and Filters -->
      <div class="max-w-2xl mx-auto mb-8">
        <div class="relative">
          <Search class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search subscriptions..."
            bind:value={searchQuery}
            class="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <!-- Category Filters -->
      <div class="flex flex-wrap gap-2 justify-center mb-8">
        {#each [
          { value: 'all', label: 'All Categories' },
          { value: 'streaming', label: 'Streaming' },
          { value: 'music', label: 'Music' },
          { value: 'design', label: 'Design' },
          { value: 'productivity', label: 'Productivity' },
          { value: 'other', label: 'Other' }
        ] as category}
          <button
            on:click={() => selectedCategory = category.value}
            class="px-4 py-2 rounded-lg text-sm font-medium transition-colors
              {selectedCategory === category.value
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
          >
            {category.label}
          </button>
        {/each}
      </div>
    </div>
  </section>

  <!-- Subscriptions Section -->
  <section class="py-12 bg-white">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header with View All -->
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-semibold text-gray-900">
          All Subscription Plans
        </h2>
        <a href="/browse" class="text-sm font-medium text-blue-500 hover:text-blue-600 transition-colors">
          View All →
        </a>
      </div>

      <!-- Sort & Filter Controls -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center space-x-2">
          <span class="text-sm text-gray-600">Sort by:</span>
          <select bind:value={sortBy} class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="recommended">Recommended</option>
            <option value="price_low">Price: Low to High</option>
            <option value="price_high">Price: High to Low</option>
            <option value="popularity">Popularity</option>
          </select>
        </div>

        <div class="text-sm text-gray-500">
          {filteredPlans.length} of {data.totalPlans} plans
        </div>
      </div>

      <!-- Subscription Cards Grid -->
      <SubscriptionGrid plans={filteredPlans} userBalance={data.userBalance || 0} />
    </div>
  </section>
</div>

{#if data.error}
  <div class="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
    <p class="text-sm">{data.error}</p>
  </div>
{/if}