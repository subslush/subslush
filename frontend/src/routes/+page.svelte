<script lang="ts">
  import { onMount } from 'svelte';
  import { Search, Check } from 'lucide-svelte';
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import Hero from '$lib/components/home/Hero.svelte';
  import SubscriptionGrid from '$lib/components/home/SubscriptionGrid.svelte';
  import BundleCard from '$lib/components/home/BundleCard.svelte';
  import TrustSignals from '$lib/components/home/TrustSignals.svelte';
  import Statistics from '$lib/components/home/Statistics.svelte';
  import Footer from '$lib/components/home/Footer.svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  let searchQuery = '';
  let selectedCategory = 'all';
  let sortBy = 'recommended';

  // TODO: Replace with actual backend data when available
  const bundles = [
    {
      title: 'Entertainment Bundle',
      subtitle: 'Most Popular',
      services: ['Netflix', 'Disney+', 'Spotify'],
      price: 19.99,
      originalPrice: 28.97,
      savings: 31,
      badge: 'Save €8.98'
    },
    {
      title: 'Creator Bundle',
      subtitle: 'Business',
      services: ['Adobe CC', 'Canva Pro', 'Artlist'],
      price: 39.99,
      originalPrice: 52.98,
      savings: 25
    },
    {
      title: 'Productivity Bundle',
      subtitle: 'Business',
      services: ['Microsoft 365', 'NordVPN', 'Notion Pro'],
      price: 27.99,
      originalPrice: 44.97,
      savings: 38
    },
    {
      title: 'Student Bundle',
      subtitle: 'Student Discount',
      services: ['Spotify', 'Notion', 'YouTube Premium'],
      price: 14.99,
      originalPrice: 24.98,
      savings: 40
    }
  ];

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
    // Map service types to categories
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
  <title>SubSlush - Find Your Perfect Subscription</title>
  <meta name="description" content="Browse by category, search for specific services, or discover new subscriptions. Save money on premium subscriptions with our marketplace." />
</svelte:head>

<!-- Home page wrapper with natural scroll -->
<div class="min-h-screen bg-white">
  <!-- Navigation -->
  <HomeNav />

  <!-- Hero Section -->
  <Hero bind:searchQuery bind:selectedCategory />

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
      <SubscriptionGrid plans={filteredPlans} userBalance={0} />
    </div>
  </section>

  <!-- Bundles Section -->
  <section class="py-12 bg-gray-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-2xl font-semibold text-gray-900">
            Featured Bundles & Exclusive Deals
          </h2>
          <p class="text-sm text-gray-600 mt-1">
            Save more with curated packages
          </p>
        </div>
        <span class="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
          Combo Packages
        </span>
      </div>

      <!-- Bundle Cards Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {#each bundles as bundle}
          <BundleCard {...bundle} />
        {/each}
      </div>
    </div>
  </section>

  <!-- Trust Signals -->
  <TrustSignals />

  <!-- Statistics -->
  <Statistics />

  <!-- Footer -->
  <Footer />

  {#if data.error}
    <div class="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
      <p class="text-sm">{data.error}</p>
    </div>
  {/if}
</div>