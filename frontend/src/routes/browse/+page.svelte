<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { ChevronDown } from 'lucide-svelte';
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import SubscriptionGrid from '$lib/components/home/SubscriptionGrid.svelte';
  import type { PageData } from './$types';
  import type { ProductListing } from '$lib/types/subscription.js';

  export let data: PageData;

  type BrowseProduct = ProductListing;

  const categories = [
    { key: 'all', label: 'All products' },
    { key: 'streaming', label: 'Streaming' },
    { key: 'music', label: 'Music' },
    { key: 'ai', label: 'AI' },
    { key: 'productivity', label: 'Productivity' },
    { key: 'software', label: 'Software' },
    { key: 'gaming', label: 'Gaming' },
    { key: 'security', label: 'Security' },
    { key: 'social', label: 'Social' },
    { key: 'education', label: 'Education' },
    { key: 'fitness', label: 'Fitness' },
    { key: 'design', label: 'Design' }
  ];

  let searchQuery = '';
  let selectedCategory = 'all';
  let sortBy = 'recommended';
  let categoriesOpen = false;
  let listName = 'Browse';

  $: products = Array.isArray(data.products) ? (data.products as BrowseProduct[]) : [];
  $: urlCategory = $page.url.searchParams.get('category')?.toLowerCase() || 'all';
  $: urlSearch = $page.url.searchParams.get('search')?.trim() || '';
  $: if (urlSearch !== searchQuery) {
    searchQuery = urlSearch;
  }
  $: trimmedSearchQuery = searchQuery.trim();
  $: normalizedSearchQuery = trimmedSearchQuery.toLowerCase();
  $: hasSearchQuery = trimmedSearchQuery.length > 0;
  $: if (urlCategory !== selectedCategory) {
    selectedCategory = urlCategory;
  }

  const resolveListName = (categoryKey: string): string => {
    if (categoryKey === 'all') return 'Browse';
    return categories.find(category => category.key === categoryKey)?.label || 'Browse';
  };

  $: listName = resolveListName(selectedCategory);

  function selectCategory(category: string) {
    selectedCategory = category;
    categoriesOpen = false;
    const url = new URL($page.url);
    if (category === 'all') {
      url.searchParams.delete('category');
    } else {
      url.searchParams.set('category', category);
    }
    goto(`${url.pathname}${url.search ? `?${url.searchParams.toString()}` : ''}`, { replaceState: true, noScroll: true });
  }

  const getCategoryForProduct = (product: BrowseProduct): string => {
    const category =
      typeof product.category === 'string' ? product.category.trim().toLowerCase() : '';
    if (category) {
      return category;
    }
    const serviceType = product.service_type || product.slug || product.name;
    return getCategoryForService(serviceType);
  };

  // Filter products based on search and category
  $: filteredProducts = products.filter((product: BrowseProduct) => {
    const matchesSearch = !hasSearchQuery ||
      product.name.toLowerCase().includes(normalizedSearchQuery);

    const matchesCategory = selectedCategory === 'all' ||
      getCategoryForProduct(product) === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  $: sortedProducts = (() => {
    if (sortBy === 'price_low') {
      return [...filteredProducts].sort((a, b) => a.from_price - b.from_price);
    }
    if (sortBy === 'price_high') {
      return [...filteredProducts].sort((a, b) => b.from_price - a.from_price);
    }
    return filteredProducts;
  })();

  // Count per category
  $: categoryCounts = categories.reduce<Record<string, number>>((acc, category) => {
    acc[category.key] = category.key === 'all'
      ? products.length
      : products.filter((product: BrowseProduct) => getCategoryForProduct(product) === category.key).length;
    return acc;
  }, {});

  function getCategoryForService(serviceType: string): string {
    const categoryMap: Record<string, string> = {
      'netflix': 'streaming',
      'disney': 'streaming',
      'spotify': 'music',
      'apple_music': 'music',
      'deezer': 'music',
      'adobe': 'design',
      'figma': 'design',
      'canva': 'design',
      'notion': 'productivity',
      'microsoft': 'software',
      'office': 'productivity',
      'tradingview': 'productivity',
      'slack': 'productivity',
      'jira': 'software',
      'psn': 'gaming',
      'xbox': 'gaming',
      'steam': 'gaming',
      'nintendo': 'gaming',
      'openai': 'ai',
      'chatgpt': 'ai',
      'midjourney': 'ai',
      'copilot': 'ai',
      '1password': 'security',
      'dashlane': 'security',
      'nordvpn': 'security',
      'expressvpn': 'security',
      'twitter': 'social',
      'facebook': 'social',
      'instagram': 'social',
      'tiktok': 'social',
      'udemy': 'education',
      'coursera': 'education',
      'skillshare': 'education',
      'calm': 'fitness',
      'fitbit': 'fitness',
      'peloton': 'fitness'
    };
    return categoryMap[serviceType.toLowerCase()] || 'software';
  }

  function clearSearch() {
    goto('/browse');
  }
</script>

<svelte:head>
  <title>Browse All Subscriptions - SubSlush</title>
  <meta name="description" content="Browse all available subscription plans. Find the perfect subscription for your needs." />
</svelte:head>

<div class="min-h-screen bg-white">
  <!-- Navigation -->
  <HomeNav searchQuery={searchQuery} />

  <!-- Subscriptions Section -->
  <section class="py-12 bg-white">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-8">
        <!-- Left panel -->
        <div class="space-y-6">
          <div class="border border-gray-200 rounded-xl p-4 shadow-sm">
            <p class="text-xs font-semibold text-cyan-600 uppercase tracking-wide">Selected category</p>
            <h2 class="text-xl font-bold text-gray-900 mt-1">{categories.find(c => c.key === selectedCategory)?.label || 'All products'}</h2>
            <p class="text-sm text-gray-600">{filteredProducts.length} items</p>
          </div>
          <div class="border border-gray-200 rounded-xl p-4 shadow-sm space-y-2">
            <div class="flex items-center justify-between">
              <p class="text-sm font-semibold text-gray-800">Categories</p>
              <button
                type="button"
                class="md:hidden inline-flex items-center justify-center rounded-lg border border-gray-200 px-2 py-1 text-xs font-semibold text-gray-700"
                aria-expanded={categoriesOpen}
                aria-controls="browse-category-list"
                on:click={() => (categoriesOpen = !categoriesOpen)}
              >
                <ChevronDown
                  size={14}
                  class={`transition-transform ${categoriesOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                />
              </button>
            </div>
            <div
              id="browse-category-list"
              class={`flex flex-col gap-2 ${categoriesOpen ? 'mt-2' : 'hidden'} md:flex md:mt-2`}
            >
              {#each categories as category}
                <button
                  class="flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors {selectedCategory === category.key ? 'bg-cyan-50 text-cyan-700 border border-cyan-200' : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-transparent'}"
                  on:click={() => selectCategory(category.key)}
                >
                  <span>{category.label}</span>
                  <span class="text-xs text-gray-500">{categoryCounts[category.key] ?? 0}</span>
                </button>
              {/each}
            </div>
          </div>
        </div>

        <!-- Results -->
        <div class="space-y-4">
          <div class="flex items-center justify-end">
            <div class="flex items-center space-x-2">
              <span class="text-sm text-gray-600">Sort by:</span>
              <select bind:value={sortBy} class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="recommended">Recommended</option>
                <option value="price_low">Price: Low to High</option>
                <option value="price_high">Price: High to Low</option>
              </select>
            </div>
          </div>
          {#if hasSearchQuery && filteredProducts.length === 0}
            <div class="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
              <p class="text-sm font-semibold text-cyan-600 uppercase tracking-wide">No matches found</p>
              <h3 class="mt-2 text-xl font-bold text-gray-900">
                We could not find any products for "{trimmedSearchQuery}"
              </h3>
              <p class="mt-2 text-sm text-gray-600">
                Try a different search above or browse all products instead.
              </p>
              <button
                type="button"
                class="mt-6 inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-cyan-500 to-pink-500 px-5 py-2 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40"
                on:click={clearSearch}
              >
                Browse all products
              </button>
            </div>
          {:else}
            <SubscriptionGrid products={sortedProducts} listName={listName} />
          {/if}
        </div>
      </div>
    </div>
  </section>
</div>

{#if data.error}
  <div class="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
    <p class="text-sm">{data.error}</p>
  </div>
{/if}
