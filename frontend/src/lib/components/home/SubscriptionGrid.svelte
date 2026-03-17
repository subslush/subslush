<script lang="ts">
  import { resolveLogoKey } from '$lib/assets/logoRegistry.js';
  import ResponsiveImage from '$lib/components/common/ResponsiveImage.svelte';
  import type { Picture } from 'imagetools-core';
  import { formatCurrency, normalizeCurrencyCode } from '$lib/utils/currency.js';
  import { trackSelectItem, trackViewItemList } from '$lib/utils/analytics.js';

  import type { ProductListing } from '$lib/types/subscription.js';

  export let products: ProductListing[] = [];
  export let listName = 'Browse';
  export let linkMode: 'product' | 'subcategory' = 'product';

  type ServiceStyle = {
    logo?: Picture;
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

  function getSubCategoryHref(product: ProductListing): string | null {
    if (linkMode !== 'subcategory') {
      return null;
    }
    const subCategory = (product.sub_category || '').trim();
    if (!subCategory) {
      return null;
    }
    const params = new URLSearchParams();
    const category = (product.category || '').trim();
    if (category) {
      params.set('category', category.toLowerCase());
    }
    params.set('sub_category', subCategory.toLowerCase());
    return `/browse?${params.toString()}`;
  }

  function getPlanHref(product: ProductListing): string {
    const subCategoryHref = getSubCategoryHref(product);
    if (subCategoryHref) {
      return subCategoryHref;
    }
    if (!product.slug) return '/browse';
    return `/browse/products/${encodeURIComponent(product.slug)}`;
  }

  function getCardAriaLabel(product: ProductListing): string {
    const subCategory = (product.sub_category || '').trim();
    if (linkMode === 'subcategory' && subCategory) {
      return `View ${subCategory} products`;
    }
    return `View ${product.name} details`;
  }

  function shouldContainLogoInTile(product: ProductListing, serviceType: string): boolean {
    const logoHints = [
      product.slug,
      product.logo_key,
      product.logoKey,
      serviceType,
      product.name
    ];
    const darkTileKeywords = [
      'appletv'
    ];

    return logoHints.some(value =>
      typeof value === 'string'
      && darkTileKeywords.some(keyword =>
        value.toLowerCase().replace(/[^a-z0-9]+/g, '').includes(keyword)
      )
    );
  }

  function shouldZoomLogoInTile(product: ProductListing, serviceType: string): boolean {
    const logoHints = [
      product.slug,
      product.logo_key,
      product.logoKey,
      serviceType,
      product.name
    ];

    return logoHints.some(value =>
      typeof value === 'string'
      && value.toLowerCase().replace(/[^a-z0-9]+/g, '').includes('youtube')
    );
  }

  const resolveListName = (): string => (listName || 'Browse').trim() || 'Browse';

  const buildAnalyticsItem = (product: ProductListing, index: number, listLabel: string) => {
    const itemId = product.product_id || product.slug || product.name;
    return {
      item_id: itemId,
      item_name: product.name,
      item_category: product.category || product.service_type || undefined,
      item_list_name: listLabel,
      index: index + 1,
      price: product.from_price,
      currency: product.currency,
      quantity: 1
    };
  };

  const handleSelectItem = (product: ProductListing, index: number) => {
    const listLabel = resolveListName();
    trackSelectItem(listLabel, [buildAnalyticsItem(product, index, listLabel)]);
  };

  let lastListKey = '';
  $: {
    const listLabel = resolveListName();
    if (!products.length) {
      lastListKey = '';
    } else {
      const key = `${listLabel}:${products
        .map(product => product.product_id || product.slug || product.name)
        .join('|')}`;
      if (key !== lastListKey) {
        trackViewItemList(
          listLabel,
          products.map((product, index) => buildAnalyticsItem(product, index, listLabel))
        );
        lastListKey = key;
      }
    }
  }
</script>

<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
  {#each products as product, index}
    {@const serviceType = product.service_type || product.slug || product.name}
    {@const serviceStyle = getServiceStyle(serviceType, product.logoKey ?? product.logo_key)}
    {@const containLogoInTile = shouldContainLogoInTile(product, serviceType)}
    {@const zoomLogoInTile = shouldZoomLogoInTile(product, serviceType)}

    <a
      href={getPlanHref(product)}
      class="subscription-showcase-card group"
      aria-label={getCardAriaLabel(product)}
      on:click={() => handleSelectItem(product, index)}
    >
      <div class="subscription-showcase-surface">
        <div class="subscription-showcase-sheen" aria-hidden="true"></div>

        <div class="subscription-logo-area">
          <div class="subscription-logo-aura" aria-hidden="true"></div>
          <div class={`subscription-logo-tile ${containLogoInTile ? 'subscription-logo-tile--dark' : ''}`}>
            {#if serviceStyle.logo}
              <ResponsiveImage
                image={serviceStyle.logo}
                alt={`${serviceType} logo`}
                sizes="(min-width: 1024px) 220px, (min-width: 640px) 34vw, 52vw"
                pictureClass={containLogoInTile
                  ? 'absolute inset-0 flex items-center justify-center p-4'
                  : 'absolute inset-0'}
                imgClass={containLogoInTile
                  ? 'max-h-full max-w-full object-contain'
                  : zoomLogoInTile
                    ? 'w-full h-full object-cover subscription-logo-image--zoomed'
                    : 'w-full h-full object-cover'}
                loading="lazy"
                decoding="async"
              />
            {:else}
              <div class="flex h-full w-full items-center justify-center text-5xl text-gray-500">
                {serviceStyle.icon || '📦'}
              </div>
            {/if}
          </div>
        </div>

        <div class="subscription-showcase-content">
          <h3 class="text-2xl font-bold text-gray-900 line-clamp-2" title={product.name}>
            {product.name}
          </h3>
          <p class="mt-2 text-lg text-gray-700">
            From <span class="text-gray-900 font-bold text-2xl">{formatPlanPrice(product.from_price, product.currency)}</span> /month
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

<style>
  .subscription-showcase-card {
    position: relative;
    display: block;
    min-height: 24rem;
    border-radius: 1.5rem;
    text-decoration: none;
    isolation: isolate;
    transition: transform 220ms ease, filter 220ms ease;
  }

  .subscription-showcase-surface {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    border-radius: 1.5rem;
    border: 1px solid rgba(148, 163, 184, 0.32);
    background:
      linear-gradient(155deg, rgba(255, 255, 255, 0.96) 0%, rgba(241, 245, 249, 0.92) 74%),
      rgba(248, 250, 252, 0.94);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.88),
      inset 0 -1px 0 rgba(148, 163, 184, 0.24),
      0 14px 26px rgba(148, 163, 184, 0.28);
    padding: 1.3rem 1.05rem 1.1rem;
    overflow: hidden;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .subscription-showcase-sheen {
    position: absolute;
    top: -5%;
    left: -8%;
    right: -8%;
    height: 47%;
    pointer-events: none;
    background: linear-gradient(130deg, rgba(255, 255, 255, 0.65), rgba(255, 255, 255, 0.12));
    transform: translateY(-18%) rotate(-7deg);
  }

  .subscription-logo-area {
    position: relative;
    display: flex;
    justify-content: center;
    padding-top: 0.15rem;
  }

  .subscription-logo-aura {
    position: absolute;
    inset: 4% 17%;
    border-radius: 1.8rem;
    background:
      radial-gradient(circle at 22% 72%, rgba(99, 102, 241, 0.24), transparent 62%),
      radial-gradient(circle at 80% 24%, rgba(236, 72, 153, 0.24), transparent 58%);
    filter: blur(20px);
    pointer-events: none;
  }

  .subscription-logo-tile {
    position: relative;
    width: min(100%, 12.2rem);
    aspect-ratio: 1 / 1;
    border-radius: 1.9rem;
    border: 1px solid rgba(148, 163, 184, 0.35);
    overflow: hidden;
    background:
      linear-gradient(145deg, rgba(248, 250, 252, 0.96) 0%, rgba(226, 232, 240, 0.92) 78%),
      rgba(241, 245, 249, 0.94);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.92),
      0 12px 24px rgba(148, 163, 184, 0.32);
  }

  .subscription-logo-tile--dark {
    border-color: rgba(255, 255, 255, 0.22);
    background:
      linear-gradient(145deg, rgba(32, 35, 42, 0.98) 0%, rgba(8, 10, 16, 0.98) 78%),
      rgba(3, 6, 12, 0.96);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.2),
      0 12px 24px rgba(15, 23, 42, 0.5);
  }

  .subscription-logo-image--zoomed {
    transform: scale(1.7);
    transform-origin: center;
  }

  .subscription-showcase-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    flex: 1 1 auto;
    min-height: 0;
    gap: 0;
    padding: 1.2rem 0.45rem 0.2rem;
  }

  .subscription-showcase-card:hover {
    transform: translateY(-3px);
    filter: saturate(1.06);
  }

  .subscription-showcase-card:focus-visible {
    outline: 2px solid #22d3ee;
    outline-offset: 3px;
  }

  @media (max-width: 1024px) {
    .subscription-showcase-card {
      min-height: 22.8rem;
    }

    .subscription-logo-tile {
      width: min(100%, 11.2rem);
    }
  }

  @media (max-width: 640px) {
    .subscription-showcase-card {
      min-height: 21.6rem;
    }

    .subscription-showcase-content {
      padding-top: 1rem;
    }

    .subscription-showcase-content h3 {
      font-size: 1.4rem;
    }

    .subscription-showcase-content p {
      font-size: 0.95rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .subscription-showcase-card {
      transition: none;
    }
  }
</style>
