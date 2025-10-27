<script lang="ts">
  import { Lock, Check, Users, Zap } from 'lucide-svelte';
  import CategoryFilter from './CategoryFilter.svelte';

  export let selectedCategory = 'all';
</script>

<section class="bg-gray-50 py-12 md:py-16">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">


    <!-- Heading -->
    <h1 class="text-3xl md:text-4xl font-bold text-gray-900 text-center mb-4">
      Save Up To <span class="bg-gradient-to-r from-cyan-500 to-pink-500 bg-clip-text text-transparent">90%</span> On Premium Subscriptions
    </h1>

    <!-- Subtitle -->
    <p class="text-base text-gray-600 text-center mb-8 max-w-2xl mx-auto">
      Join 250,000+ users getting Spotify, Netflix, and 500+ services at a fraction of retail price. Instant access. Verified accounts.
    </p>


    <!-- Category Filter Chips -->
    <CategoryFilter bind:selectedCategory />

    <!-- Primary CTA Button -->
    <div class="text-center mt-8">
      <button class="bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600
                     text-white font-semibold px-8 py-4 text-lg rounded-lg shadow-lg hover:shadow-xl
                     transition-all duration-200 hover:scale-105 inline-flex items-center gap-2">
        <span>Browse All Subscriptions</span>
        <svg class="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd" />
        </svg>
      </button>

      <!-- Secondary Text -->
      <p class="text-sm text-gray-500 mt-3">
        No credit card required • Cancel anytime
      </p>

      <!-- Mini Trust Badges -->
      <div class="flex flex-wrap items-center justify-center gap-4 mt-4 text-sm text-gray-600">
        <div class="flex items-center gap-1.5">
          <Lock size={16} class="text-gray-500" />
          <span>Encrypted Payments</span>
        </div>
        <div class="flex items-center gap-1.5">
          <Check size={16} class="text-green-600" />
          <span>7-Day Guarantee</span>
        </div>
        <div class="flex items-center gap-1.5">
          <Users size={16} class="text-cyan-600" />
          <span>250K+ Users</span>
        </div>
        <div class="flex items-center gap-1.5">
          <Zap size={16} class="text-amber-500" />
          <span>99.9% Uptime</span>
        </div>
      </div>
    </div>
  </div>
</section>