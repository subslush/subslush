<script lang="ts">
  import { resolveLogoKeyFromName } from '$lib/assets/logoRegistry.js';

  export let title: string;
  export let subtitle: string;
  export let services: string[];
  export let price: number;
  export let originalPrice: number;
  export let badge: string = '';

  /**
   * Get display information for a service
   * Returns logo path if available, otherwise returns first letter
   */
  function getServiceDisplay(serviceName: string) {
    // Normalize service name (trim, handle case variations)
    const normalizedName = serviceName.trim();
    const logoPath = resolveLogoKeyFromName(normalizedName);

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

  function getBadgeVariant(subtitle: string, badgeOverride?: string) {
    if (badgeOverride) {
      return { text: badgeOverride, color: 'bg-cyan-100 text-cyan-800 border border-cyan-200' };
    }
    if (subtitle.toLowerCase().includes('popular')) {
      return { text: 'MOST POPULAR', color: 'bg-green-100 text-green-800 border border-green-200' };
    } else if (subtitle.toLowerCase().includes('business')) {
      return { text: 'BUSINESS', color: 'bg-cyan-100 text-cyan-800 border border-cyan-200' };
    } else if (subtitle.toLowerCase().includes('student')) {
      return { text: 'STUDENT', color: 'bg-amber-100 text-amber-800 border border-amber-200' };
    }
    return { text: 'FEATURED', color: 'bg-cyan-100 text-cyan-800 border border-cyan-200' };
  }

  function getSocialProof(): string {
    const proofVariants = [
      '🔥 1,247 purchased this week',
      '🔥 892 purchased this week',
      '🔥 1,531 purchased this week'
    ];
    return proofVariants[Math.floor(Math.random() * proofVariants.length)];
  }

  $: badgeInfo = getBadgeVariant(subtitle, badge.trim() || undefined);
  $: separatePrice = originalPrice;
  $: youSave = originalPrice - price;
  $: savingsPercentage = Math.round((youSave / originalPrice) * 100);
</script>

<div class="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md
            transition-shadow duration-200">

  <!-- Badge (if has special status) -->
  {#if subtitle || badge.trim()}
    <span class="inline-block px-2 py-1 {badgeInfo.color} text-xs font-medium rounded mb-3">
      {badgeInfo.text}
    </span>
  {/if}

  <!-- Title -->
  <h3 class="text-lg font-semibold text-gray-900 mb-2">
    {title}
  </h3>

  <!-- Services List -->
  <ul class="space-y-1 mb-4">
    {#each services as service}
      <li class="flex items-center gap-2 text-sm text-gray-600">
        <span class="text-cyan-500 text-sm">✓</span>
        <span>{service}</span>
      </li>
    {/each}
  </ul>

  <!-- Price -->
  <div class="mb-4">
    <div class="flex items-baseline gap-2">
      <span class="text-2xl font-bold text-gray-900">€{formatPrice(price)}</span>
      <span class="text-sm text-gray-500 line-through">€{separatePrice.toFixed(2)}</span>
    </div>
    <span class="inline-block mt-2 px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded border border-green-200">
      Save {savingsPercentage}%
    </span>
  </div>

  <!-- CTA -->
  <button class="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-medium py-2.5 px-4
                 rounded-lg transition-colors">
    Get Bundle
  </button>
</div>
