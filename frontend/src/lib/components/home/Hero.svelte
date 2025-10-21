<script lang="ts">
  import { Search } from 'lucide-svelte';
  import CategoryFilter from './CategoryFilter.svelte';
  import logoPng from '$lib/assets/logo.png';

  export let searchQuery = '';
  export let selectedCategory = 'all';
</script>

<section class="bg-gray-50 py-12 md:py-16">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

    <!-- LARGE LOGO - Prominently displayed -->
    <div class="flex justify-center mb-8">
      <img
        src={logoPng}
        alt="SubSlush Logo"
        class="h-24 w-auto md:h-32 lg:h-40 object-contain"
      />
    </div>

    <!-- Heading -->
    <h1 class="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-4">
      Find Your Perfect Subscription
    </h1>

    <!-- Subtitle -->
    <p class="text-base text-gray-600 text-center mb-8 max-w-2xl mx-auto">
      Browse by category, search for specific services, or discover new subscriptions
    </p>

    <!-- Search Bar -->
    <div class="max-w-2xl mx-auto mb-6">
      <div class="relative">
        <input
          type="text"
          placeholder="Search Netflix, Spotify, Adobe..."
          class="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          bind:value={searchQuery}
        />
        <button class="absolute right-3 top-1/2 transform -translate-y-1/2">
          <Search size={20} class="text-gray-400" />
        </button>
      </div>
    </div>

    <!-- Category Filter Chips -->
    <CategoryFilter bind:selectedCategory />
  </div>
</section>