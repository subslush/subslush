<script lang="ts">
  import { Check } from 'lucide-svelte';
  import type { ServicePlanDetails } from '$lib/types/subscription.js';

  // Import SVG logos
  import netflixLogo from '$lib/assets/netflixlogo.svg';
  import spotifyLogo from '$lib/assets/spotifylogo.svg';
  import tradingviewLogo from '$lib/assets/tradingviewlogo.svg';
  import hboLogo from '$lib/assets/hbologo.svg';

  export let plans: Array<{
    serviceType: string;
    serviceName: string;
    plan: string;
    price: number;
    features: string[];
    description: string;
  }> = [];
  export let userBalance = 0;

  type ServiceStyle = {
    logo?: string;
    icon?: string;
    color: string;
  };

  const serviceStyles: Record<string, ServiceStyle> = {
    netflix: { logo: netflixLogo, color: 'bg-red-500' },
    spotify: { logo: spotifyLogo, color: 'bg-green-500' },
    tradingview: { logo: tradingviewLogo, color: 'bg-blue-500' },
    hbo: { logo: hboLogo, color: 'bg-purple-600' },
    adobe: { icon: '🎨', color: 'bg-red-600' },
    disney: { icon: '🏰', color: 'bg-blue-600' }
  };

  function getServiceStyle(serviceType: string): ServiceStyle {
    return serviceStyles[serviceType] || { icon: '📦', color: 'bg-gray-500' };
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

  function formatPrice(price: number): string {
    // Convert to .99 ending
    const rounded = Math.floor(price);
    return `${rounded}.99`;
  }

  function getUrgencyIndicator(): string {
    const variants = [
      "⚠️ Only 23 spots left today",
      "🔥 47 people viewing this now",
      "⏰ Special offer expires in 6h 23m"
    ];
    return variants[Math.floor(Math.random() * variants.length)];
  }

  function getSavingsAmount(price: number, originalPrice: number): string {
    return (originalPrice - price).toFixed(2);
  }
</script>

<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
  {#each plans as plan}
    {@const serviceStyle = getServiceStyle(plan.serviceType)}
    {@const originalPrice = getOriginalPrice(plan.price, plan.serviceType)}
    {@const savings = calculateSavings(plan.price, originalPrice)}

    <div class="bg-white border-2 border-gray-200 rounded-xl p-6 hover:shadow-lg hover:border-gray-300 transition-all flex flex-col h-full relative">

      <!-- Discount Badge (absolutely positioned, will not affect layout) -->
      {#if savings > 0}
        <div class="absolute top-4 right-4 bg-red-500 text-white px-3 py-1.5 rounded-lg font-bold text-sm shadow-md z-10">
          SAVE €{getSavingsAmount(plan.price, originalPrice)}
        </div>
      {/if}

      <!-- Content Area (takes available space) -->
      <div class="flex-grow">

        <!-- Service Logo -->
        <div class="w-20 h-20 mb-4 flex items-center justify-center mx-auto">
          {#if serviceStyle.logo}
            <img src={serviceStyle.logo} alt="{plan.serviceType} logo" class="w-full h-full object-contain" />
          {:else if serviceStyle.icon}
            <span class="text-5xl">{serviceStyle.icon}</span>
          {:else}
            <span class="text-5xl">📦</span>
          {/if}
        </div>

        <!-- Service Name (with overflow protection) -->
        <h3 class="text-xl font-bold text-gray-900 mb-1 pr-24 line-clamp-1 text-center" title={plan.serviceName}>
          {plan.serviceName}
        </h3>

        <!-- Plan Name -->
        <p class="text-sm text-gray-600 mb-4 text-center capitalize">{plan.plan}</p>

        <!-- Pricing Section -->
        <div class="mb-4 text-center">
          <span class="text-4xl font-bold text-gray-900">€{formatPrice(plan.price)}</span>
          <span class="text-gray-600 text-base">/month</span>
          {#if savings > 0}
            <div class="text-gray-400 line-through text-sm mt-1">€{originalPrice.toFixed(2)}</div>
          {/if}
        </div>

        <!-- Urgency Indicator -->
        <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-sm font-semibold text-yellow-800 text-center">
          {getUrgencyIndicator()}
        </div>

        <!-- Features List (consistent height with min-height) -->
        <ul class="space-y-2.5 mb-6 min-h-[96px]">
          {#each plan.features.slice(0, 3) as feature}
            <li class="flex items-start text-sm text-gray-700">
              <span class="text-green-500 mr-2 flex-shrink-0 mt-0.5 font-bold">✓</span>
              <span class="line-clamp-2">{feature}</span>
            </li>
          {/each}
        </ul>
      </div>

      <!-- Button Area (pushed to bottom with mt-auto) -->
      <div class="mt-auto">
        <button
          class="w-full bg-orange-500 hover:bg-orange-600 text-white py-3.5 rounded-lg font-bold transition-colors text-base"
        >
          Claim {savings}% Off
        </button>

        <!-- Trust Line -->
        <p class="text-center text-xs text-gray-500 mt-3">
          ✓ Instant setup • Verified account
        </p>
      </div>
    </div>
  {/each}
</div>

{#if plans.length === 0}
  <div class="text-center py-12">
    <p class="text-gray-500 text-lg mb-2">No subscriptions found</p>
    <p class="text-gray-400 text-sm">Try adjusting your search or category filter</p>
  </div>
{/if}