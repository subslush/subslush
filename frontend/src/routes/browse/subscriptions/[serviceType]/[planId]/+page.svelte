<script lang="ts">
  import { onMount } from 'svelte';
  import { ArrowLeft, Home, ChevronRight } from 'lucide-svelte';
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
  import { auth } from '$lib/stores/auth';

  import type { PageData } from './$types';

  export let data: PageData;

  let selectedDuration = 1;
  let userCredits = 247.83; // This would come from user store/context

  $: subscription = data.subscription;
  $: relatedPlans = data.relatedPlans || [];

  function handleJoinPlan() {
    // This would integrate with existing purchase flow
    console.log('Join plan clicked', {
      subscription: subscription.id,
      duration: selectedDuration
    });
    // Could open purchase modal or navigate to checkout
  }

  function handleAskHost() {
    // This would open a chat/message modal with the host
    console.log('Ask host clicked', { hostId: subscription.host.id });
  }

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
      <nav class="flex items-center space-x-2 text-sm">
        <a href="/" class="text-gray-600 hover:text-gray-900 transition-colors">
          <Home size={16} />
        </a>
        <ChevronRight size={14} class="text-gray-400" />
        <a href="/browse" class="text-gray-600 hover:text-gray-900 transition-colors">
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
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
      <!-- Left Column - Main Content -->
      <div class="lg:col-span-2 space-y-6 lg:space-y-8">
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
      </div>

      <!-- Right Column - Pricing Sidebar -->
      <div class="lg:col-span-1 order-first lg:order-last">
        <PricingSidebar
          {subscription}
          {userCredits}
          onJoinPlan={handleJoinPlan}
          onAskHost={handleAskHost}
        />
      </div>
    </div>

    <!-- Plan Comparison Section -->
    <div class="mt-12">
      <PlanComparison
        durationOptions={subscription.durationOptions}
        onSelectDuration={handleDurationSelect}
        {selectedDuration}
      />
    </div>

    <!-- Related Plans Section -->
    <div class="mt-12">
      <RelatedPlans {relatedPlans} />
    </div>
  </div>

  <!-- Footer -->
  <Footer />

  <!-- Mobile Sticky CTA -->
  <div class="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-50 animate-in slide-in-from-bottom-4 duration-700">
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