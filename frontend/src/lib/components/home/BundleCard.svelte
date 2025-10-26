<script lang="ts">
  export let title: string;
  export let subtitle: string;
  export let services: string[];
  export let price: number;
  export let originalPrice: number;
  export let badge: string = '';

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

  <!-- Service Icons -->
  <div class="flex justify-center space-x-2 mb-4">
    {#each services as service}
      <div class="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
        <!-- Service icons placeholder -->
        <span class="text-lg font-bold text-gray-600">{service.charAt(0)}</span>
      </div>
    {/each}
  </div>

  <!-- Services List -->
  <div class="mb-4 space-y-1">
    {#each services as service}
      <p class="text-sm text-gray-600 text-center">• {service}</p>
    {/each}
  </div>

  <!-- Pricing Section -->
  <div class="bg-gray-50 rounded-lg p-4 mb-4">
    <div class="text-center">
      <div class="text-3xl font-bold text-gray-900 mb-2">€{formatPrice(price)}/month</div>
      <div class="text-sm text-gray-400 line-through mb-2">€{separatePrice.toFixed(2)} if purchased separately</div>
      <div class="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold inline-block">
        YOU SAVE: €{youSave.toFixed(2)} ({savingsPercentage}%)
      </div>
    </div>
  </div>

  <!-- Social Proof -->
  <div class="text-center mb-4">
    <p class="text-xs text-gray-600">{getSocialProof()}</p>
  </div>

  <!-- Button -->
  <button
    class="w-full px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-lg transition-colors mb-2"
  >
    Get This Bundle →
  </button>

  <!-- Fine Print -->
  <p class="text-xs text-gray-400 text-center">
    Instant access • Cancel anytime • 30-day money back
  </p>
</div>