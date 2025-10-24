<script lang="ts">
  import { Star } from 'lucide-svelte';
  import type { SubscriptionDetail } from '$lib/types/subscription';

  export let subscription: SubscriptionDetail;

  // Get service-specific branding
  function getServiceColors(serviceType: string) {
    const colors: Record<string, { bg: string; text: string; border: string }> = {
      spotify: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
      netflix: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
      tradingview: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
    };
    return colors[serviceType] || { bg: 'bg-surface-50', text: 'text-surface-700', border: 'border-surface-200' };
  }

  function getServiceLogo(serviceType: string) {
    // This would normally use actual service logos
    const logos: Record<string, string> = {
      spotify: '🎵',
      netflix: '🎬',
      tradingview: '📈',
    };
    return logos[serviceType] || '📱';
  }

  function formatJoinDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric'
    });
  }

  $: serviceColors = getServiceColors(subscription.serviceType);
  $: serviceLogo = getServiceLogo(subscription.serviceType);
</script>

<div class="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow duration-300 animate-in slide-in-from-bottom-4 duration-500">
  <!-- Service Logo and Name -->
  <div class="flex items-start justify-between mb-6">
    <div class="flex items-center space-x-4">
      <div class="w-16 h-16 {serviceColors.bg} {serviceColors.border} border-2 rounded-lg flex items-center justify-center text-2xl">
        {serviceLogo}
      </div>
      <div>
        <h1 class="text-3xl font-bold text-gray-900">
          {subscription.serviceName}
        </h1>
        <h2 class="text-xl font-semibold {serviceColors.text} mt-1">
          {subscription.planName}
        </h2>
      </div>
    </div>
  </div>

  <!-- Badges -->
  <div class="flex flex-wrap gap-2 mb-4">
    {#each subscription.badges.filter(badge => badge !== 'shared_plan') as badge}
      <span class="px-3 py-1 text-xs font-medium rounded-full
        {badge === 'verified' ? 'bg-green-100 text-green-800' :
         badge === 'popular' ? 'bg-purple-100 text-purple-800' :
         'bg-gray-200 text-gray-700'}">
        {badge === 'verified' ? 'Verified' :
         badge === 'popular' ? 'Popular' :
         badge.charAt(0).toUpperCase() + badge.slice(1)}
      </span>
    {/each}
  </div>

  <!-- Rating and Reviews -->
  <div class="flex items-center space-x-4 mb-4">
    <div class="flex items-center space-x-1">
      {#each Array(5) as _, i}
        <Star
          size={20}
          class={i < Math.floor(subscription.ratings.average)
            ? 'text-yellow-400 fill-current'
            : 'text-gray-300'}
        />
      {/each}
      <span class="text-lg font-semibold text-gray-900 ml-2">
        {subscription.ratings.average.toFixed(1)}
      </span>
      <span class="text-gray-600">
        ({subscription.ratings.count} reviews)
      </span>
    </div>
  </div>


  <!-- Description -->
  <div class="space-y-3">
    <p class="text-gray-700 leading-relaxed">
      {subscription.description}
    </p>
  </div>
</div>