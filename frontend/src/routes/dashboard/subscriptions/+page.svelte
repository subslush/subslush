<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { createMutation } from '@tanstack/svelte-query';
  import { CreditCard, Plus, ShoppingBag, AlertCircle, Search, Check } from 'lucide-svelte';

  // Import SVG logos
  import netflixLogo from '$lib/assets/netflixlogo.svg';
  import spotifyLogo from '$lib/assets/spotifylogo.svg';
  import tradingviewLogo from '$lib/assets/tradingviewlogo.svg';
  import hboLogo from '$lib/assets/hbologo.svg';

  import { subscriptionService } from '$lib/api/subscriptions.js';
  import { user } from '$lib/stores/auth.js';
  import { ERROR_MESSAGES, SUCCESS_MESSAGES } from '$lib/utils/constants.js';

  // Import home page components to reuse
  import Hero from '$lib/components/home/Hero.svelte';
  import SubscriptionGrid from '$lib/components/home/SubscriptionGrid.svelte';
  import BundleCard from '$lib/components/home/BundleCard.svelte';
  import TrustSignals from '$lib/components/home/TrustSignals.svelte';
  import Statistics from '$lib/components/home/Statistics.svelte';
  import Footer from '$lib/components/home/Footer.svelte';

  import SubscriptionCard from '$lib/components/subscription/SubscriptionCard.svelte';
  import PurchaseModal from '$lib/components/subscription/PurchaseModal.svelte';

  import type { ServicePlanDetails, ServiceType } from '$lib/types/subscription.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let searchQuery = '';
  let selectedCategory = 'all';
  let selectedPlan: ServicePlanDetails | null = null;
  let showPurchaseModal = false;
  let userBalance = data.userBalance || 0;
  let errorMessage = '';
  let successMessage = '';
  let sortBy = 'recommended';

  // ============================================
  // TODO: BACKEND PLACEHOLDER
  // ============================================
  // This section uses mock data. Replace with
  // actual API integration when backend endpoint
  // is available: /api/bundles/featured
  // Expected data structure:
  // {
  //   bundles: Array<{
  //     id: string;
  //     title: string;
  //     services: string[];
  //     price: number;
  //     originalPrice: number;
  //   }>
  // }
  // ============================================
  const bundles = [
    {
      title: 'Entertainment Bundle',
      subtitle: 'Most Popular',
      services: ['Netflix', 'Disney+', 'Spotify'],
      price: 19.99,
      originalPrice: 28.97,
      badge: 'Save €8.98'
    },
    {
      title: 'Creator Bundle',
      subtitle: 'Business',
      services: ['Adobe CC', 'Canva Pro', 'Artlist'],
      price: 39.99,
      originalPrice: 52.98,
      badge: 'Save 25%'
    },
    {
      title: 'Productivity Bundle',
      subtitle: 'Business',
      services: ['Microsoft 365', 'NordVPN', 'Notion Pro'],
      price: 27.99,
      originalPrice: 44.97,
      badge: 'Save 38%'
    },
    {
      title: 'Student Bundle',
      subtitle: 'Student Discount',
      services: ['Spotify', 'Notion', 'YouTube Premium'],
      price: 14.99,
      originalPrice: 24.98,
      badge: 'Save 40%'
    }
  ];

  // Transform data.plans to match home page format - with safety check
  $: transformedPlans = (data.plans || []).map(plan => ({
    serviceType: plan.service_type,
    serviceName: plan.display_name,
    plan: plan.plan,
    price: plan.price,
    features: plan.features,
    description: plan.description
  }));

  // Filter plans based on search and category - with safety check
  $: filteredPlans = (data.plans || []).filter(plan => {
    const matchesSearch = searchQuery === '' ||
      plan.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plan.plan.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === 'all' ||
      getCategoryForService(plan.service_type) === selectedCategory;

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

  // Load user credit balance on mount
  onMount(async () => {
    if ($user?.id) {
      try {
        const balanceResponse = await subscriptionService.getCreditBalance($user.id);
        userBalance = balanceResponse.balance;
      } catch (err) {
        console.warn('Could not load user credit balance:', err);
      }
    }
  });

  // Purchase mutation
  const purchaseMutation = createMutation({
    mutationFn: async (purchaseData: { plan: ServicePlanDetails; duration: number; autoRenew: boolean }) => {
      await subscriptionService.validatePurchase({
        service_type: purchaseData.plan.service_type,
        service_plan: purchaseData.plan.plan,
        duration_months: purchaseData.duration
      });

      return subscriptionService.purchaseSubscription({
        service_type: purchaseData.plan.service_type,
        service_plan: purchaseData.plan.plan,
        duration_months: purchaseData.duration,
        auto_renew: purchaseData.autoRenew
      });
    },
    onSuccess: (data) => {
      successMessage = SUCCESS_MESSAGES.PURCHASE_SUCCESS;
      userBalance = data.remaining_credits;
      showPurchaseModal = false;
      selectedPlan = null;

      setTimeout(() => {
        successMessage = '';
      }, 5000);

      setTimeout(() => {
        goto('/dashboard/subscriptions/active');
      }, 2000);
    },
    onError: (error: any) => {
      console.error('Purchase failed:', error);

      if (error.response?.status === 402) {
        errorMessage = ERROR_MESSAGES.INSUFFICIENT_CREDITS;
      } else if (error.response?.status === 400) {
        errorMessage = error.response?.data?.message || ERROR_MESSAGES.PURCHASE_FAILED;
      } else if (error.response?.status === 409) {
        errorMessage = ERROR_MESSAGES.SUBSCRIPTION_EXISTS;
      } else {
        errorMessage = ERROR_MESSAGES.PURCHASE_FAILED;
      }

      setTimeout(() => {
        errorMessage = '';
      }, 5000);
    }
  });

  function handlePurchaseClick(plan: ServicePlanDetails) {
    selectedPlan = plan;
    showPurchaseModal = true;
    errorMessage = '';
    successMessage = '';
  }

  function handlePurchaseConfirm(event: CustomEvent<{ plan: ServicePlanDetails; duration: number; autoRenew: boolean }>) {
    $purchaseMutation.mutate(event.detail);
  }

  function handlePurchaseCancel() {
    showPurchaseModal = false;
    selectedPlan = null;
  }

  function clearMessages() {
    errorMessage = '';
    successMessage = '';
  }

  // Helper functions for service display
  const serviceStyles = {
    netflix: { logo: netflixLogo },
    spotify: { logo: spotifyLogo },
    tradingview: { logo: tradingviewLogo },
    hbo: { logo: hboLogo },
    adobe: { icon: '🎨' },
    disney: { icon: '🏰' }
  };

  function getServiceStyle(serviceType: string) {
    return serviceStyles[serviceType as keyof typeof serviceStyles] || { icon: '📦' };
  }

  function calculateSavings(price: number, originalPrice?: number) {
    if (!originalPrice || originalPrice <= price) return 0;
    return Math.round(((originalPrice - price) / originalPrice) * 100);
  }

  function getOriginalPrice(price: number, serviceType: string) {
    const markupRates = {
      netflix: 1.2,
      spotify: 1.15,
      tradingview: 1.3,
      adobe: 1.25,
      disney: 1.2
    };
    const rate = markupRates[serviceType as keyof typeof markupRates] || 1.2;
    return price * rate;
  }
</script>

<svelte:head>
  <title>Browse Subscriptions - SubSlush</title>
  <meta name="description" content="Browse and purchase premium subscription plans at discounted prices. Find your perfect subscription with instant delivery." />
</svelte:head>

<style>
  /* Break out of dashboard layout constraints - ONLY for subscriptions page */
  :global(body:has([data-subscriptions-page]) .dashboard-content > div) {
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
  }

  /* Fallback for browsers that don't support :has() */
  :global(.subscriptions-page-layout .dashboard-content > div) {
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
  }

</style>

<div class="min-h-screen bg-white subscriptions-page-layout" data-subscriptions-page>

  <!-- Hero Section -->
  <Hero bind:searchQuery bind:selectedCategory />

  <!-- Subscription Plans Section -->
  <section class="py-12 bg-white">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

      <!-- Success/Error Messages -->
      {#if successMessage}
        <div class="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <Check size={20} class="text-green-600" />
              <p class="text-sm font-medium text-green-800">{successMessage}</p>
            </div>
            <button on:click={clearMessages}
                    class="text-green-600 hover:text-green-700 transition-colors">
              <span class="sr-only">Close</span>
              ×
            </button>
          </div>
        </div>
      {/if}

      {#if errorMessage}
        <div class="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <AlertCircle size={20} class="text-red-600" />
              <p class="text-sm font-medium text-red-800">{errorMessage}</p>
            </div>
            <button on:click={clearMessages}
                    class="text-red-600 hover:text-red-700 transition-colors">
              <span class="sr-only">Close</span>
              ×
            </button>
          </div>
        </div>
      {/if}

      <!-- Header with View All -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">
            All Subscription Plans
          </h2>
          <p class="text-sm text-gray-600 mt-1">
            Browse 560+ premium services at unbeatable prices
          </p>
        </div>
        <a href="/browse"
           class="text-sm font-medium text-cyan-600 hover:text-cyan-700 transition-colors inline-flex items-center gap-1">
          <span>View All</span>
          <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </a>
      </div>

      <!-- Sort & Filter Controls -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-600">Sort by:</span>
          <select bind:value={sortBy}
                  class="bg-white border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium text-gray-900
                         focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500
                         transition-colors">
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

      <!-- Subscription Cards Grid - Home Page Style -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {#each filteredPlans as plan}
          {@const serviceStyle = getServiceStyle(plan.service_type)}
          {@const originalPrice = getOriginalPrice(plan.price, plan.service_type)}
          {@const savings = calculateSavings(plan.price, originalPrice)}
          {@const canPurchase = userBalance >= plan.price}

          <div class="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md
                      transition-shadow duration-200 flex flex-col h-full">

            <!-- Header -->
            <div class="flex items-center gap-3 mb-4">
              <div class="p-3 bg-cyan-50 rounded-lg flex-shrink-0">
                {#if serviceStyle.logo}
                  <img src={serviceStyle.logo} alt="{plan.service_type} logo" class="w-8 h-8 object-contain" />
                {:else}
                  <span class="text-2xl">{serviceStyle.icon}</span>
                {/if}
              </div>
              <div class="min-w-0 flex-1">
                <h3 class="text-lg font-semibold text-gray-900 truncate">
                  {plan.display_name}
                </h3>
                <p class="text-sm text-gray-500 capitalize">{plan.plan} Plan</p>
              </div>
            </div>

            <!-- Price Section -->
            <div class="mb-4">
              <div class="flex items-baseline gap-2">
                <span class="text-3xl font-bold text-gray-900">€{plan.price.toFixed(2)}</span>
                {#if originalPrice && originalPrice > plan.price}
                  <span class="text-sm text-gray-500 line-through">€{originalPrice.toFixed(2)}</span>
                {/if}
              </div>
              {#if savings > 0}
                <span class="inline-block mt-2 px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded border border-green-200">
                  Save {savings}%
                </span>
              {/if}
            </div>

            <!-- Features List -->
            <ul class="space-y-2 mb-6 flex-1">
              {#each plan.features.slice(0, 4) as feature}
                <li class="flex items-start gap-2 text-sm text-gray-600">
                  <Check size={16} class="text-cyan-500 flex-shrink-0 mt-0.5" />
                  <span class="leading-tight">{feature}</span>
                </li>
              {/each}
            </ul>

            <!-- Action Buttons -->
            <div class="space-y-2">
              <!-- Primary Action - Cyan (NOT gradient, gradient is for highest priority only) -->
              <a href="/browse/subscriptions/{plan.service_type}/{plan.plan}"
                 class="w-full py-2.5 px-4 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium
                        rounded-lg transition-colors text-center block">
                View Details
              </a>

              <!-- Secondary Action -->
              {#if canPurchase}
                <button on:click={() => handlePurchaseClick(plan)}
                        class="w-full py-2 px-4 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300
                               text-sm font-medium rounded-lg transition-colors">
                  Quick Purchase
                </button>
              {:else}
                <button disabled
                        class="w-full py-2 px-4 bg-gray-100 text-gray-400 text-sm font-medium rounded-lg
                               cursor-not-allowed">
                  Insufficient Credits
                </button>
              {/if}
            </div>
          </div>
        {:else}
          <div class="col-span-full text-center py-12">
            <div class="bg-white rounded-xl border border-gray-200 p-8">
              <div class="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <ShoppingBag size={32} class="text-gray-400" />
              </div>
              <h3 class="text-lg font-semibold text-gray-900 mb-2">
                No plans available
              </h3>
              <p class="text-base text-gray-600 mb-6">
                No subscription plans match your current search criteria.
              </p>
              <button on:click={() => { searchQuery = ''; selectedCategory = 'all'; }}
                      class="bg-cyan-500 hover:bg-cyan-600 text-white font-medium py-2.5 px-6 rounded-lg
                             transition-colors inline-flex items-center gap-2">
                <span>Clear Filters</span>
              </button>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </section>

  <!-- Featured Bundles Section -->
  <section class="py-12 bg-gray-50">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">
            Featured Bundles & Exclusive Deals
          </h2>
          <p class="text-sm text-gray-600 mt-1">
            Save more with curated packages
          </p>
        </div>
        <span class="px-3 py-1 bg-cyan-100 text-cyan-800 text-xs font-medium rounded border border-cyan-200">
          Combo Packages
        </span>
      </div>

      <!-- Bundle Cards Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
</div>

<!-- Purchase Modal -->
<PurchaseModal
  bind:isOpen={showPurchaseModal}
  plan={selectedPlan}
  {userBalance}
  isLoading={$purchaseMutation.isPending}
  on:confirm={handlePurchaseConfirm}
  on:cancel={handlePurchaseCancel}
/>