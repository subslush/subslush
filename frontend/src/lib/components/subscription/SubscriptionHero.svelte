<script lang="ts">
  import type { SubscriptionDetail } from '$lib/types/subscription';
  import { resolveLogoKey } from '$lib/assets/logoRegistry.js';

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

  function getServiceLogo(serviceType: string, logoKey?: string | null): string {
    return resolveLogoKey(logoKey || serviceType) || '';
  }

  function formatJoinDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric'
    });
  }

  $: serviceColors = getServiceColors(subscription.serviceType);
  $: serviceLogo = getServiceLogo(
    subscription.serviceType,
    subscription.logoKey ?? subscription.logo_key
  );
</script>

<div class="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow duration-300 animate-in slide-in-from-bottom-4 duration-500">
  <!-- Service Logo and Name -->
  <div class="flex items-start justify-between mb-6">
    <div class="flex items-center space-x-4">
      <div class="w-16 h-16 {serviceColors.bg} {serviceColors.border} border-2 rounded-lg flex items-center justify-center">
        {#if serviceLogo}
          <img
            src={serviceLogo}
            alt="{subscription.serviceName} logo"
            class="w-12 h-12 object-contain"
            loading="lazy"
          />
        {:else}
          <div class="w-12 h-12 bg-gray-200 rounded flex items-center justify-center text-gray-500 text-sm font-medium">
            {subscription.serviceName.charAt(0).toUpperCase()}
          </div>
        {/if}
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

  <!-- Description -->
  <div class="space-y-4">
    <p class="text-gray-700 leading-relaxed">
      {subscription.description}
    </p>
  </div>
</div>
