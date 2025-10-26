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

    <div class="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 relative">
      <!-- Discount Badge -->
      {#if savings > 0}
        <span class="absolute top-3 right-3 px-2 py-1 bg-red-500 text-white text-xs font-bold rounded shadow-md">
          SAVE €{getSavingsAmount(plan.price, originalPrice)}
        </span>
      {/if}

      <!-- Header -->
      <div class="text-center mb-3">
        <h3 class="font-semibold text-gray-900 text-lg">{plan.serviceName}</h3>
        <p class="text-sm text-gray-500 capitalize">{plan.plan}</p>
      </div>

      <!-- Service Logo (Larger) -->
      <div class="flex justify-center mb-3">
        {#if serviceStyle.logo}
          <img src={serviceStyle.logo} alt="{plan.serviceType} logo" class="w-20 h-20 object-contain" />
        {:else}
          <span class="text-5xl">{serviceStyle.icon}</span>
        {/if}
      </div>

      <!-- Price -->
      <div class="mb-3">
        <div class="flex items-baseline justify-center space-x-2">
          <span class="text-4xl font-bold text-gray-900">€{formatPrice(plan.price)}</span>
          <span class="text-sm text-gray-500">/month</span>
        </div>
        {#if savings > 0}
          <p class="text-center text-sm text-gray-400 line-through mt-1">€{originalPrice.toFixed(2)}</p>
        {/if}
      </div>

      <!-- Urgency Indicator -->
      <div class="mb-3 text-center">
        <span class="inline-block px-3 py-1 bg-yellow-100 text-yellow-800 text-xs font-bold rounded-md">
          {getUrgencyIndicator()}
        </span>
      </div>

      <!-- Features (Max 3) -->
      <ul class="space-y-2 mb-4">
        {#each plan.features.slice(0, 3) as feature}
          <li class="flex items-start space-x-2 text-sm text-gray-600">
            <span class="text-green-500 mt-0.5 flex-shrink-0">✓</span>
            <span>{feature}</span>
          </li>
        {/each}
      </ul>

      <!-- CTA Button -->
      <button
        class="w-full px-6 py-3 text-white text-sm font-bold rounded-lg transition-colors hover:bg-orange-600 mb-2 bg-orange-500"
      >
        Claim {savings}% Off
      </button>

      <!-- Trust Line -->
      <p class="text-xs text-gray-500 text-center">
        ✓ Instant setup • Verified account
      </p>
    </div>
  {/each}
</div>

{#if plans.length === 0}
  <div class="text-center py-12">
    <p class="text-gray-500 text-lg mb-2">No subscriptions found</p>
    <p class="text-gray-400 text-sm">Try adjusting your search or category filter</p>
  </div>
{/if}