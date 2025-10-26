<script lang="ts">
  import { Lock, Check, Users, Zap } from 'lucide-svelte';
  import CategoryFilter from './CategoryFilter.svelte';

  export let selectedCategory = 'all';
</script>

<section class="bg-gray-50 py-12 md:py-16 relative overflow-hidden">

  <!-- Background Decoration Layer -->
  <div class="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
    <!-- Top-right gradient blob -->
    <div
      class="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-3xl opacity-20"
      style="background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%);"
    ></div>

    <!-- Bottom-left gradient blob -->
    <div
      class="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-3xl opacity-20"
      style="background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%);"
    ></div>

    <!-- Middle accent blob -->
    <div
      class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-3xl opacity-10"
      style="background: linear-gradient(135deg, #06b6d4 0%, #ec4899 100%);"
    ></div>
  </div>

  <!-- Content Layer (relative z-index to sit above background) -->
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">


    <!-- Heading -->
    <h1 class="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-4">
      Save Up To <span class="bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent">90%</span> On Premium Subscriptions
    </h1>

    <!-- Subtitle -->
    <p class="text-base text-gray-600 text-center mb-8 max-w-2xl mx-auto">
      Join 250,000+ users getting Spotify, Netflix, and 500+ services at a fraction of retail price. Instant access. Verified accounts.
    </p>


    <!-- Category Filter Chips -->
    <CategoryFilter bind:selectedCategory />

    <!-- Primary CTA Button -->
    <div class="text-center mt-8">
      <button class="bg-orange-500 hover:bg-orange-600 text-white px-8 py-4 text-lg font-semibold rounded-lg transition-colors mb-3">
        Get 90% Off Now →
      </button>

      <!-- Secondary Text -->
      <p class="text-sm text-gray-500">
        No credit card required • Cancel anytime
      </p>

      <!-- Mini Trust Badges -->
      <div class="flex flex-wrap items-center justify-center gap-4 mt-4 text-sm text-gray-600">
        <div class="flex items-center space-x-1.5">
          <Lock size={16} class="text-gray-500" />
          <span>Encrypted Payments</span>
        </div>
        <div class="flex items-center space-x-1.5">
          <Check size={16} class="text-green-500" />
          <span>7-Day Guarantee</span>
        </div>
        <div class="flex items-center space-x-1.5">
          <Users size={16} class="text-blue-500" />
          <span>250K+ Users</span>
        </div>
        <div class="flex items-center space-x-1.5">
          <Zap size={16} class="text-yellow-500" />
          <span>99.9% Uptime</span>
        </div>
      </div>
    </div>
  </div>
</section>