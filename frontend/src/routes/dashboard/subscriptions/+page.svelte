<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { createMutation } from '@tanstack/svelte-query';
  import { CreditCard, Plus, ShoppingBag, AlertCircle, Search } from 'lucide-svelte';

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
  import SubscriptionFilters from '$lib/components/subscription/SubscriptionFilters.svelte';
  import PurchaseModal from '$lib/components/subscription/PurchaseModal.svelte';

  import type { ServicePlanDetails, ServiceType } from '$lib/types/subscription.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let searchQuery = '';
  let selectedCategory = 'all';
  let selectedFilter: ServiceType | 'all' = 'all';
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

  // Filter plans based on search, category, and filter
  $: filteredPlans = transformedPlans.filter(plan => {
    const matchesSearch = searchQuery === '' ||
      plan.serviceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      plan.plan.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesCategory = selectedCategory === 'all' ||
      getCategoryForService(plan.serviceType) === selectedCategory;

    const matchesFilter = selectedFilter === 'all' ||
      plan.serviceType === selectedFilter;

    return matchesSearch && matchesCategory && matchesFilter;
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
</script>

<svelte:head>
  <title>Browse Subscriptions - SubSlush</title>
  <meta name="description" content="Browse and purchase premium subscription plans at discounted prices. Find your perfect subscription with instant delivery." />
</svelte:head>

<div class="min-h-screen bg-white">

  <!-- Hero Section -->
  <Hero bind:searchQuery bind:selectedCategory />

  <!-- All Subscription Plans Section -->
  <section class="py-12 bg-white">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

      <!-- Header with View All -->
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-semibold text-gray-900">
          All Subscription Plans
        </h2>
        <a href="/dashboard/subscriptions/active" class="text-sm font-medium text-blue-500 hover:text-blue-600 transition-colors">
          View My Subscriptions →
        </a>
      </div>

      <!-- User Balance Card -->
      <div class="mb-6 bg-primary-50 border border-primary-200 rounded-lg p-4 inline-flex items-center space-x-4">
        <div class="flex items-center space-x-2">
          <CreditCard size={20} class="text-primary-600" />
          <span class="text-sm font-medium text-primary-700">Your Balance:</span>
          <span class="text-lg font-bold text-primary-900">{userBalance}</span>
          <span class="text-primary-600">credits</span>
        </div>
        <a
          href="/dashboard/credits"
          class="inline-flex items-center bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
        >
          <Plus size={16} class="mr-2" />
          Add Credits
        </a>
      </div>

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
        <div class="flex items-center space-x-4">
          <div class="flex items-center space-x-2">
            <span class="text-sm text-gray-600">Sort by:</span>
            <select bind:value={sortBy} class="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="recommended">Recommended</option>
              <option value="price_low">Price: Low to High</option>
              <option value="price_high">Price: High to Low</option>
              <option value="popularity">Popularity</option>
            </select>
          </div>

          <!-- Subscription Filters -->
          <SubscriptionFilters bind:selected={selectedFilter} />
        </div>

        <div class="text-sm text-gray-500">
          {filteredPlans.length} of {data.totalPlans} plans
        </div>
      </div>

      <!-- Subscription Cards Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {#each data.plans.filter(plan => {
          const matchesSearch = searchQuery === '' ||
            plan.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            plan.plan.toLowerCase().includes(searchQuery.toLowerCase());
          const matchesCategory = selectedCategory === 'all' ||
            getCategoryForService(plan.service_type) === selectedCategory;
          const matchesFilter = selectedFilter === 'all' ||
            plan.service_type === selectedFilter;
          return matchesSearch && matchesCategory && matchesFilter;
        }) as plan (plan.service_type + plan.plan)}
          <SubscriptionCard
            {plan}
            {userBalance}
            onPurchase={handlePurchaseClick}
          />
        {:else}
          <div class="col-span-full text-center py-12">
            <div class="bg-gray-100 rounded-lg p-8">
              <ShoppingBag size={48} class="mx-auto text-gray-400 mb-4" />
              <h3 class="text-lg font-medium text-gray-900 mb-2">
                No plans available
              </h3>
              <p class="text-gray-600">
                {selectedFilter === 'all'
                  ? 'No subscription plans match your current search criteria.'
                  : `No plans available for ${selectedFilter}. Try selecting a different service.`}
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