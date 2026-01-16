<script lang="ts">
  import { resolveLogoKey } from '$lib/assets/logoRegistry.js';
  import { formatCurrency, normalizeCurrencyCode } from '$lib/utils/currency.js';

  import type { ProductListing } from '$lib/types/subscription.js';

  export let products: ProductListing[] = [];

  type ServiceStyle = {
    logo?: string;
    icon?: string;
    color: string;
  };

  const serviceStyles: Record<string, ServiceStyle> = {
    netflix: { color: 'bg-red-500' },
    spotify: { color: 'bg-green-500' },
    tradingview: { color: 'bg-blue-500' },
    hbo: { color: 'bg-purple-600' },
    adobe: { icon: '🎨', color: 'bg-red-600' },
    disney: { icon: '🏰', color: 'bg-blue-600' }
  };

  function getServiceStyle(serviceType: string, logoKey?: string | null): ServiceStyle {
    const normalizedType = serviceType.toLowerCase();
    const baseStyle = serviceStyles[normalizedType] || { icon: '📦', color: 'bg-gray-500' };
    const logo = resolveLogoKey(logoKey || normalizedType);
    return { ...baseStyle, logo };
  }

  function formatPlanPrice(price: number, currency?: string | null): string {
    const resolvedCurrency = normalizeCurrencyCode(currency) || 'USD';
    return formatCurrency(price, resolvedCurrency);
  }

  function getPlanHref(product: { slug?: string | null }): string {
    if (!product.slug) return '/browse';
    return `/browse/products/${encodeURIComponent(product.slug)}`;
  }
</script>

<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
  {#each products as product}
    {@const serviceType = product.service_type || product.slug || product.name}
    {@const serviceStyle = getServiceStyle(serviceType, product.logoKey ?? product.logo_key)}

    <a
      href={getPlanHref(product)}
      class="group block rounded-2xl border border-gray-200 bg-white overflow-hidden hover:shadow-lg hover:border-gray-300 transition"
      aria-label={`View ${product.name} details`}
    >
      <div class="flex flex-col h-80">
        <div class="relative flex-1 bg-gray-50 overflow-hidden">
          {#if serviceStyle.logo}
            <img
              src={serviceStyle.logo}
              alt="{serviceType} logo"
              class="absolute inset-0 w-full h-full object-cover"
            />
          {:else}
            <div class="flex h-full w-full items-center justify-center text-5xl">
              {serviceStyle.icon || '📦'}
            </div>
          {/if}
        </div>
        <div class="flex-1 flex flex-col items-center px-5 pt-4 pb-5 text-center">
          <h3 class="text-lg font-semibold text-gray-900 line-clamp-2" title={product.name}>
            {product.name}
          </h3>
          <p class="mt-2 text-base text-gray-700">
            From <span class="text-gray-900 font-semibold text-lg">{formatPlanPrice(product.from_price, product.currency)}</span> /month
          </p>
          <p class="mt-auto text-[11px] leading-snug text-gray-500">
            Warranty included for the full subscription period
          </p>
        </div>
      </div>
    </a>
  {/each}
</div>

{#if products.length === 0}
  <div class="text-center py-12">
    <p class="text-gray-500 text-lg mb-2">No subscriptions found</p>
    <p class="text-gray-400 text-sm">Try adjusting your search or category filter</p>
  </div>
{/if}
