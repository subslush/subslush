<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { Loader2, Music, Tv, TrendingUp, AlertCircle, ShoppingBag } from 'lucide-svelte';
  import { subscriptionService } from '$lib/api/subscriptions.js';
  import { ERROR_MESSAGES } from '$lib/utils/constants.js';
  import SubscriptionCard from '$lib/components/SubscriptionCard.svelte';
  import PurchaseFlow from '$lib/components/PurchaseFlow.svelte';
  import type { ServicePlanDetails, ServiceType } from '$lib/types/subscription.js';

  let selectedPlan: ServicePlanDetails | null = null;
  let showPurchaseFlow = false;

  const plansQuery = createQuery({
    queryKey: ['subscriptions', 'available'],
    queryFn: () => subscriptionService.getAvailablePlans(),
    staleTime: 300000, // 5 minutes
    retry: 2
  });

  const serviceDisplayNames = {
    spotify: 'Spotify',
    netflix: 'Netflix',
    tradingview: 'TradingView'
  };

  const serviceIcons = {
    spotify: Music,
    netflix: Tv,
    tradingview: TrendingUp
  };

  function handlePlanSelect(plan: ServicePlanDetails) {
    selectedPlan = plan;
    showPurchaseFlow = true;
  }

  function handlePurchaseSuccess() {
    showPurchaseFlow = false;
    selectedPlan = null;
    // Could navigate to My Subscriptions or show success message
  }

  function handlePurchaseClose() {
    showPurchaseFlow = false;
    selectedPlan = null;
  }

  $: groupedData = $plansQuery.data?.services || {} as Record<ServiceType, ServicePlanDetails[]>;
  $: serviceTypes = Object.keys(groupedData) as ServiceType[];
</script>

<svelte:head>
  <title>Browse Subscriptions - Subscription Platform</title>
</svelte:head>

<div class="space-y-6">
  <!-- Page Header -->
  <div class="bg-surface-100-800-token border border-surface-300-600-token rounded-lg shadow-lg p-6">
    <div class="flex items-center space-x-3 mb-2">
      <div class="p-3 bg-primary-500 text-white rounded-full">
        <ShoppingBag class="w-6 h-6" />
      </div>
      <h1 class="text-3xl font-bold text-surface-900-50-token">Browse Subscriptions</h1>
    </div>
    <p class="text-surface-600-300-token">
      Choose from our premium subscription plans for your favorite services
    </p>
  </div>

  <!-- Main Content -->
  {#if $plansQuery.isLoading}
    <div class="flex items-center justify-center h-64">
      <div class="flex items-center space-x-3">
        <Loader2 class="w-8 h-8 animate-spin text-primary-500" />
        <span class="text-lg text-surface-600-300-token">Loading subscription plans...</span>
      </div>
    </div>

  {:else if $plansQuery.isError}
    <div class="bg-error-100-800-token border border-error-300-600-token rounded-lg p-6">
      <div class="flex items-center space-x-3 mb-4">
        <AlertCircle class="w-6 h-6 text-error-600-300-token" />
        <h2 class="text-lg font-semibold text-error-600-300-token">Failed to Load Plans</h2>
      </div>
      <p class="text-error-600-300-token mb-4">
        {ERROR_MESSAGES.LOAD_PLANS_FAILED}
      </p>
      <button
        on:click={() => $plansQuery.refetch()}
        class="btn variant-filled-error"
      >
        Try Again
      </button>
    </div>

  {:else if serviceTypes.length === 0}
    <div class="bg-surface-100-800-token border border-surface-300-600-token rounded-lg shadow-lg p-12">
      <div class="text-center">
        <div class="p-4 bg-surface-50-900-token rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
          <ShoppingBag class="w-8 h-8 text-surface-600-300-token" />
        </div>
        <h2 class="text-xl font-semibold text-surface-900-50-token mb-2">No Plans Available</h2>
        <p class="text-surface-600-300-token mb-4">
          There are currently no subscription plans available. Please check back later.
        </p>
        <button
          on:click={() => $plansQuery.refetch()}
          class="btn variant-filled-primary"
        >
          Refresh
        </button>
      </div>
    </div>

  {:else}
    <!-- Service Sections -->
    {#each serviceTypes as serviceType}
      {@const IconComponent = serviceIcons[serviceType]}
      {@const serviceName = serviceDisplayNames[serviceType]}
      {@const plans = groupedData[serviceType]}

      <div class="bg-surface-100-800-token border border-surface-300-600-token rounded-lg shadow-lg p-6">
        <!-- Service Header -->
        <div class="flex items-center space-x-3 mb-6">
          <div class="p-3 bg-gradient-to-r from-primary-500 to-secondary-500 text-white rounded-full">
            <IconComponent class="w-6 h-6" />
          </div>
          <div>
            <h2 class="text-2xl font-bold text-surface-900-50-token">{serviceName}</h2>
            <p class="text-surface-600-300-token">Choose the perfect plan for your needs</p>
          </div>
        </div>

        <!-- Plans Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {#each plans as plan}
            <SubscriptionCard
              serviceName={serviceName}
              planName={plan.display_name}
              price={plan.price}
              features={plan.features}
              serviceType={plan.service_type}
              isSelected={selectedPlan?.service_type === plan.service_type && selectedPlan?.plan === plan.plan}
              onSelect={() => handlePlanSelect(plan)}
            />
          {/each}
        </div>
      </div>
    {/each}
  {/if}
</div>

<!-- Purchase Flow Modal -->
{#if showPurchaseFlow && selectedPlan}
  <PurchaseFlow
    {selectedPlan}
    onClose={handlePurchaseClose}
    onSuccess={handlePurchaseSuccess}
  />
{/if}