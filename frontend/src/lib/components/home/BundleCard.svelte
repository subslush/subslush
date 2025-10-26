<script lang="ts">
  // Import SVG logos
  import netflixLogo from '$lib/assets/netflixlogo.svg';
  import spotifyLogo from '$lib/assets/spotifylogo.svg';
  import tradingviewLogo from '$lib/assets/tradingviewlogo.svg';
  import hboLogo from '$lib/assets/hbologo.svg';

  export let title: string;
  export let subtitle: string;
  export let services: string[];
  export let price: number;
  export let originalPrice: number;
  export let badge: string = '';

  // Logo mapping - add more as logos become available
  const logoMap: Record<string, string> = {
    'Netflix': netflixLogo,
    'Spotify': spotifyLogo,
    'TradingView': tradingviewLogo,
    'HBO': hboLogo,
    // Add aliases for common variations
    'HBO Max': hboLogo,
    'Spotify Premium': spotifyLogo,
  };

  /**
   * Get display information for a service
   * Returns logo path if available, otherwise returns first letter
   */
  function getServiceDisplay(serviceName: string) {
    // Normalize service name (trim, handle case variations)
    const normalizedName = serviceName.trim();
    const logoPath = logoMap[normalizedName];

    return {
      hasLogo: !!logoPath,
      logoPath: logoPath || '',
      letter: normalizedName.charAt(0).toUpperCase(),
      fullName: normalizedName
    };
  }

  function formatPrice(price: number): string {
    // Convert to .99 ending
    const rounded = Math.floor(price);
    return `${rounded}.99`;
  }

  function getBadgeVariant(subtitle: string) {
    if (subtitle.toLowerCase().includes('popular')) {
      return { text: 'MOST POPULAR', color: 'bg-green-500 text-white' };
    } else if (subtitle.toLowerCase().includes('business')) {
      return { text: 'BUSINESS', color: 'bg-blue-500 text-white' };
    } else if (subtitle.toLowerCase().includes('student')) {
      return { text: 'STUDENT', color: 'bg-orange-500 text-white' };
    }
    return { text: 'FEATURED', color: 'bg-gray-500 text-white' };
  }

  function getSocialProof(): string {
    const proofVariants = [
      '🔥 1,247 purchased this week',
      '🔥 892 purchased this week',
      '🔥 1,531 purchased this week'
    ];
    return proofVariants[Math.floor(Math.random() * proofVariants.length)];
  }

  $: badgeInfo = getBadgeVariant(subtitle);
  $: separatePrice = originalPrice;
  $: youSave = originalPrice - price;
  $: savingsPercentage = Math.round((youSave / originalPrice) * 100);
</script>

<div class="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 relative">
  <!-- Badge at top -->
  <div class="absolute top-4 left-1/2 transform -translate-x-1/2">
    <span class="px-3 py-1 {badgeInfo.color} text-xs font-bold rounded-full shadow-md">
      {badgeInfo.text}
    </span>
  </div>

  <h3 class="font-semibold text-gray-900 mb-4 mt-8 text-center text-lg">{title}</h3>

  <!-- Service Icons/Logos -->
  <div class="flex items-center justify-center space-x-3 mb-6">
    {#each services as service}
      {@const display = getServiceDisplay(service)}

      <div
        class="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200"
        title={display.fullName}
      >
        {#if display.hasLogo}
          <!-- Display actual logo -->
          <img
            src={display.logoPath}
            alt="{display.fullName} logo"
            class="w-12 h-12 object-contain p-1"
          />
        {:else}
          <!-- Fallback to letter -->
          <span class="text-2xl font-bold text-gray-700">
            {display.letter}
          </span>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Pricing Section -->
  <div class="mb-4">
    <div class="text-3xl font-bold text-gray-900 mb-2 text-center">
      €{formatPrice(price)}/month
    </div>
    <div class="text-sm text-gray-500 line-through mb-3 text-center">
      €{separatePrice.toFixed(2)} if purchased separately
    </div>
    <div class="bg-red-500 text-white text-center py-2.5 px-4 rounded-lg font-bold text-lg">
      YOU SAVE: €{youSave.toFixed(2)} ({savingsPercentage}%)
    </div>
  </div>

  <!-- Social Proof -->
  {#if getSocialProof()}
    <div class="text-center text-sm text-gray-600 mb-4">
      {getSocialProof()}
    </div>
  {/if}

  <!-- Features -->
  <ul class="space-y-2 mb-6 text-sm text-gray-700">
    <li class="flex items-start">
      <span class="text-green-500 mr-2 flex-shrink-0">✓</span>
      <span>Instant access to all services</span>
    </li>
    <li class="flex items-start">
      <span class="text-green-500 mr-2 flex-shrink-0">✓</span>
      <span>One payment, manage all subscriptions</span>
    </li>
    <li class="flex items-start">
      <span class="text-green-500 mr-2 flex-shrink-0">✓</span>
      <span>Cancel individual items anytime</span>
    </li>
  </ul>

  <!-- CTA Button -->
  <button class="w-full bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-lg font-bold transition-colors">
    Get This Bundle →
  </button>

  <!-- Trust line -->
  <p class="text-center text-xs text-gray-500 mt-3">
    Instant access • Cancel anytime • 30-day money back
  </p>
</div>