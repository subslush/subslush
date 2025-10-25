<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, Home, ChevronRight, AlertCircle, RefreshCw } from 'lucide-svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  import SubscriptionHero from '$lib/components/subscription/SubscriptionHero.svelte';
  import KeyFeatures from '$lib/components/subscription/KeyFeatures.svelte';
  import AboutPlan from '$lib/components/subscription/AboutPlan.svelte';
  import ReviewsSection from '$lib/components/subscription/ReviewsSection.svelte';
  import PlanComparison from '$lib/components/subscription/PlanComparison.svelte';
  import RelatedPlans from '$lib/components/subscription/RelatedPlans.svelte';
  import PricingSidebar from '$lib/components/subscription/PricingSidebar.svelte';
  import Footer from '$lib/components/home/Footer.svelte';
  import TopNav from '$lib/components/navigation/TopNav.svelte';
  import PurchaseFlow from '$lib/components/PurchaseFlow.svelte';
  import SubscriptionHeroSkeleton from '$lib/components/subscription/SubscriptionHeroSkeleton.svelte';
  import KeyFeaturesSkeleton from '$lib/components/subscription/KeyFeaturesSkeleton.svelte';
  import PricingSidebarSkeleton from '$lib/components/subscription/PricingSidebarSkeleton.svelte';
  import { auth } from '$lib/stores/auth';
  import type { ServicePlanDetails, Subscription } from '$lib/types/subscription';

  import type { PageData } from './$types';

  export let data: PageData;

  let selectedDuration = 1;
  let showPurchaseFlow = false;
  let isLoading = true;
  let error: { type: string; message: string; canRetry?: boolean } | null = null;
  let retryCount = 0;

  $: subscription = data.subscription;
  $: relatedPlans = data.relatedPlans || [];
  $: userCredits = data.userCredits || 0;

  // Simulate loading state on mount
  onMount(() => {
    // Since we're using SSR, data should be available immediately
    // But we can show skeleton briefly for smooth transition
    const timer = setTimeout(() => {
      isLoading = false;
    }, 300);

    return () => clearTimeout(timer);
  });

  async function retryLoading() {
    error = null;
    isLoading = true;
    retryCount++;

    try {
      // Simulate retry with a reload
      window.location.reload();
    } catch (err) {
      error = {
        type: 'network',
        message: 'Failed to reload the page. Please check your internet connection and try again.',
        canRetry: true
      };
      isLoading = false;
    }
  }

  function getErrorMessage(errorType: string) {
    const messages: Record<string, string> = {
      network: 'Unable to connect to our servers. Please check your internet connection.',
      notFound: 'This subscription plan could not be found. It may have been removed or is no longer available.',
      server: 'Our servers are experiencing issues. Please try again in a few moments.',
      auth: 'You need to be logged in to view this subscription plan.',
      generic: 'Something went wrong while loading the subscription details.'
    };
    return messages[errorType] || messages.generic;
  }

  function handleJoinPlan() {
    showPurchaseFlow = true;
  }

  function closePurchaseFlow() {
    showPurchaseFlow = false;
  }

  function handlePurchaseSuccess(purchasedSubscription: Subscription) {
    console.log('Purchase successful:', purchasedSubscription);
    showPurchaseFlow = false;
    goto('/dashboard/subscriptions/active');
  }

  // Convert SubscriptionDetail to ServicePlanDetails for PurchaseFlow
  $: selectedPlan = subscription ? {
    service_type: subscription.serviceType,
    plan: subscription.planType,
    price: subscription.durationOptions.find(opt => opt.months === selectedDuration)?.totalPrice || subscription.price,
    features: subscription.features,
    display_name: `${subscription.serviceName} ${subscription.planName}`,
    description: subscription.description
  } as ServicePlanDetails : null;

  function handleDurationSelect(months: number) {
    selectedDuration = months;
  }

  function goBack() {
    history.back();
  }

  function formatServiceName(serviceType: string) {
    const names: Record<string, string> = {
      spotify: 'Spotify',
      netflix: 'Netflix',
      tradingview: 'TradingView',
      disney: 'Disney+',
      adobe: 'Adobe Creative Cloud',
    };
    return names[serviceType] || serviceType.charAt(0).toUpperCase() + serviceType.slice(1);
  }
</script>

<svelte:head>
  <title>{subscription.serviceName} {subscription.planName} - SubSlush</title>
  <meta name="description" content="{subscription.description} Join shared plans and save money on premium subscriptions." />
  <meta property="og:title" content="{subscription.serviceName} {subscription.planName} - SubSlush" />
  <meta property="og:description" content="{subscription.description}" />
  <meta property="og:type" content="product" />
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-pink-50/30 animate-in fade-in duration-300">
  <!-- Navigation -->
  <TopNav user={$auth.user} />

  <!-- Breadcrumb Navigation -->
  <div class="bg-white border-b border-gray-200">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <nav class="flex items-center space-x-2 text-sm" aria-label="Breadcrumb">
        <a href="/" class="text-gray-600 hover:text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none rounded transition-colors" aria-label="Home">
          <Home size={16} />
        </a>
        <ChevronRight size={14} class="text-gray-400" />
        <a href="/browse" class="text-gray-600 hover:text-gray-900 focus:ring-2 focus:ring-blue-500 focus:outline-none rounded transition-colors">
          Browse
        </a>
        <ChevronRight size={14} class="text-gray-400" />
        <span class="text-gray-900 font-medium">
          {formatServiceName(subscription.serviceType)}
        </span>
        <ChevronRight size={14} class="text-gray-400" />
        <span class="text-gray-500">
          {subscription.planName}
        </span>
      </nav>
    </div>
  </div>

  <!-- Page Header -->
  <div class="bg-white border-b border-gray-200">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div class="flex items-center space-x-4">
        <button
          on:click={goBack}
          class="p-2 rounded-lg border border-gray-300 hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 class="text-2xl font-bold text-gray-900">
            {subscription.serviceName} - {subscription.planName}
          </h1>
          <p class="text-gray-600 mt-1">
            Join shared plans or subscribe directly with verified hosts.
          </p>
        </div>
      </div>
    </div>
  </div>

  <!-- Main Content -->
  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
      <!-- Left Column - Main Content -->
      <section class="lg:col-span-2 space-y-6 lg:space-y-8" aria-label="Subscription details">
        {#if error}
          <!-- Error State -->
          <div class="bg-white border border-red-200 rounded-lg p-8 text-center">
            <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={32} class="text-red-600" />
            </div>

            <h2 class="text-xl font-semibold text-gray-900 mb-2">
              {error.type === 'notFound' ? 'Subscription Not Found' : 'Something Went Wrong'}
            </h2>

            <p class="text-gray-600 mb-6">
              {getErrorMessage(error.type)}
            </p>

            <div class="flex flex-col sm:flex-row gap-4 justify-center">
              {#if error.canRetry !== false}
                <button
                  on:click={retryLoading}
                  class="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
                  disabled={isLoading}
                >
                  <RefreshCw size={16} class={isLoading ? 'animate-spin' : ''} />
                  <span>{isLoading ? 'Retrying...' : 'Try Again'}</span>
                </button>
              {/if}

              <a
                href="/browse"
                class="inline-flex items-center space-x-2 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-colors"
              >
                <ArrowLeft size={16} />
                <span>Browse Other Plans</span>
              </a>
            </div>

            {#if retryCount > 0}
              <p class="text-sm text-gray-500 mt-4">
                Retry attempt {retryCount}
              </p>
            {/if}
          </div>
        {:else if isLoading}
          <!-- Hero Section Skeleton -->
          <SubscriptionHeroSkeleton />

          <!-- Key Features Skeleton -->
          <KeyFeaturesSkeleton />

          <!-- About This Plan Skeleton -->
          <KeyFeaturesSkeleton />

          <!-- Reviews Section Skeleton -->
          <KeyFeaturesSkeleton />
        {:else}
          <!-- Hero Section -->
          <SubscriptionHero {subscription} />

          <!-- Key Features -->
          <KeyFeatures features={subscription.features} />

          <!-- About This Plan -->
          <AboutPlan
            description={subscription.description}
            longDescription={subscription.longDescription}
          />

          <!-- Reviews Section -->
          <ReviewsSection
            reviews={subscription.reviews}
            averageRating={subscription.ratings.average}
            totalReviews={subscription.ratings.count}
          />
        {/if}
      </section>

      <!-- Right Column - Pricing Sidebar -->
      <aside class="lg:col-span-1 order-first lg:order-last" aria-label="Pricing and purchase options">
        {#if error}
          <!-- Error State Sidebar -->
          <div class="bg-white border border-gray-200 rounded-lg p-6">
            <div class="text-center">
              <div class="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={24} class="text-gray-400" />
              </div>
              <p class="text-sm text-gray-500">
                Unable to load pricing information
              </p>
            </div>
          </div>
        {:else if isLoading}
          <PricingSidebarSkeleton />
        {:else}
          <PricingSidebar
            {subscription}
            {userCredits}
            onJoinPlan={handleJoinPlan}
          />
        {/if}
      </aside>
    </div>

    <!-- Plan Comparison Section -->
    <section class="mt-12" aria-label="Plan duration options">
      <PlanComparison
        durationOptions={subscription.durationOptions}
        onSelectDuration={handleDurationSelect}
        {selectedDuration}
      />
    </section>

    <!-- Related Plans Section -->
    <section class="mt-12" aria-label="Related subscription plans">
      <RelatedPlans {relatedPlans} />
    </section>
  </main>

  <!-- Footer -->
  <Footer />

  <!-- Mobile Sticky CTA -->
  <div class="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-50 animate-in slide-in-from-bottom-4 duration-300">
    <div class="flex items-center justify-between mb-3">
      <div>
        <div class="text-lg font-bold text-gray-900">
          €{subscription.durationOptions.find(opt => opt.months === selectedDuration)?.totalPrice || subscription.price}
        </div>
        <div class="text-sm text-gray-600">
          {selectedDuration === 1 ? 'per month' : `for ${selectedDuration} months`}
        </div>
      </div>
      <div class="text-right">
        <div class="text-sm text-gray-600">
          Limited time offer
        </div>
      </div>
    </div>
    <button
      on:click={handleJoinPlan}
      disabled={userCredits < (subscription.durationOptions.find(opt => opt.months === selectedDuration)?.totalPrice || subscription.price)}
      class="w-full py-3 px-4 rounded-lg font-semibold transition-all duration-300 {
        userCredits >= (subscription.durationOptions.find(opt => opt.months === selectedDuration)?.totalPrice || subscription.price)
          ? 'text-white shadow-lg'
          : 'bg-surface-300 dark:bg-surface-600 text-surface-500 dark:text-surface-400 cursor-not-allowed'
      }"
      style={userCredits >= (subscription.durationOptions.find(opt => opt.months === selectedDuration)?.totalPrice || subscription.price) ? 'background: linear-gradient(45deg, #4FC3F7, #F06292)' : ''}
    >
      Join Plan
    </button>
  </div>

  <!-- Mobile bottom padding to account for sticky CTA -->
  <div class="lg:hidden h-24"></div>
</div>

<!-- Purchase Flow Modal -->
{#if showPurchaseFlow && selectedPlan}
  <PurchaseFlow
    {selectedPlan}
    onClose={closePurchaseFlow}
    onSuccess={handlePurchaseSuccess}
  />
{/if}