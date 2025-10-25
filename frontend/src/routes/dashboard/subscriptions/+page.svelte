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

  // Transform data.plans to match home page format
  $: transformedPlans = data.plans.map(plan => ({
    serviceType: plan.service_type,
    serviceName: plan.display_name,
    plan: plan.plan,
    price: plan.price,
    features: plan.features,
    description: plan.description
  }));

  // Filter plans based on search and category
  $: filteredPlans = data.plans.filter(plan => {
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

  // Helper functions for home page style cards
  const serviceStyles = {
    netflix: { logo: netflixLogo, color: 'bg-red-500' },
    spotify: { logo: spotifyLogo, color: 'bg-green-500' },
    tradingview: { logo: tradingviewLogo, color: 'bg-blue-500' },
    hbo: { logo: hboLogo, color: 'bg-purple-600' },
    adobe: { icon: '🎨', color: 'bg-red-600' },
    disney: { icon: '🏰', color: 'bg-blue-600' }
  };

  function getServiceStyle(serviceType: string) {
    return serviceStyles[serviceType as keyof typeof serviceStyles] || { icon: '📦', color: 'bg-gray-500' };
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

  /* Title text truncation for consistent card heights */
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
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
        <div class="mb-6 bg-success-50 border border-success-200 rounded-lg p-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <ShoppingBag size={20} class="text-success-600 mr-3" />
              <p class="text-success-700 font-medium">{successMessage}</p>
            </div>
            <button on:click={clearMessages} class="text-success-600 hover:text-success-700">
              <span class="sr-only">Close</span>
              ×
            </button>
          </div>
        </div>
      {/if}

      {#if errorMessage}
        <div class="mb-6 bg-error-50 border border-error-200 rounded-lg p-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <AlertCircle size={20} class="text-error-600 mr-3" />
              <p class="text-error-700 font-medium">{errorMessage}</p>
            </div>
            <button on:click={clearMessages} class="text-error-600 hover:text-error-700">
              <span class="sr-only">Close</span>
              ×
            </button>
          </div>
        </div>
      {/if}

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

      <!-- Subscription Cards Grid - Home Page Style -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {#each filteredPlans as plan}
          {@const serviceStyle = getServiceStyle(plan.service_type)}
          {@const originalPrice = getOriginalPrice(plan.price, plan.service_type)}
          {@const savings = calculateSavings(plan.price, originalPrice)}
          {@const canPurchase = userBalance >= plan.price}

          <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow">
            <!-- Header -->
            <div class="flex items-start justify-between mb-3 h-12">
              <div class="flex items-start space-x-2">
                {#if serviceStyle.logo}
                  <img src={serviceStyle.logo} alt="{plan.service_type} logo" class="w-8 h-8 object-contain flex-shrink-0" />
                {:else}
                  <span class="text-2xl flex-shrink-0">{serviceStyle.icon}</span>
                {/if}
                <div class="min-w-0 flex-1">
                  <h3 class="font-semibold text-gray-900 text-sm leading-tight line-clamp-2">{plan.display_name}</h3>
                  <p class="text-xs text-gray-500 capitalize leading-tight">{plan.plan}</p>
                </div>
              </div>

              {#if savings > 0}
                <span class="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                  Save {savings}%
                </span>
              {/if}
            </div>

            <!-- Price -->
            <div class="mb-3">
              <div class="flex items-baseline space-x-2">
                <span class="text-xl font-bold text-gray-900">€{plan.price.toFixed(2)}</span>
                <span class="text-xs text-gray-500">/monthly</span>
              </div>
              {#if savings > 0}
                <p class="text-xs text-gray-400 line-through">€{originalPrice.toFixed(2)}</p>
              {/if}
              <p class="text-xs text-gray-500 mt-1">
                {#if savings > 0}
                  Save €{(originalPrice - plan.price).toFixed(2)}
                {:else}
                  Regular price
                {/if}
              </p>
            </div>

            <!-- Features -->
            <ul class="space-y-1.5 mb-4">
              {#each plan.features.slice(0, 4) as feature}
                <li class="flex items-start space-x-2 text-xs text-gray-600">
                  <Check size={14} class="mt-0.5 flex-shrink-0" style="color: #4FC3F7;" />
                  <span class="leading-tight">{feature}</span>
                </li>
              {/each}
            </ul>

            <!-- Action Buttons -->
            <div class="space-y-2">
              <!-- View Details Button -->
              <a
                href="/browse/subscriptions/{plan.service_type}/{plan.plan}"
                class="w-full py-2.5 px-4 text-white text-sm font-medium rounded-lg transition-colors hover:opacity-90 text-center block"
                style="background-color: #4FC3F7;"
              >
                View Details
              </a>

              <!-- Quick Purchase Button -->
              <button
                on:click={() => handlePurchaseClick(plan)}
                class="w-full py-2 px-4 text-sm font-medium rounded-lg transition-colors border"
                class:text-gray-700={canPurchase}
                class:border-gray-300={canPurchase}
                class:hover:bg-gray-50={canPurchase}
                class:bg-gray-100={!canPurchase}
                class:text-gray-400={!canPurchase}
                class:cursor-not-allowed={!canPurchase}
                disabled={!canPurchase}
              >
                {#if canPurchase}
                  Quick Purchase
                {:else}
                  Insufficient Credits
                {/if}
              </button>
            </div>
          </div>
        {:else}
          <div class="col-span-full text-center py-12">
            <div class="bg-gray-100 rounded-lg p-8">
              <ShoppingBag size={48} class="mx-auto text-gray-400 mb-4" />
              <h3 class="text-lg font-medium text-gray-900 mb-2">
                No plans available
              </h3>
              <p class="text-gray-600">
                No subscription plans match your current search criteria.
              </p>
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