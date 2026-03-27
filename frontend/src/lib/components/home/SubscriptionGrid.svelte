<script lang="ts">
  import { page } from '$app/stores';
  import { resolveLogoKey, resolveLogoKeyFromName } from '$lib/assets/logoRegistry.js';
  import ResponsiveImage from '$lib/components/common/ResponsiveImage.svelte';
  import { Plus, ShoppingCart } from 'lucide-svelte';
  import { cart } from '$lib/stores/cart.js';
  import { cartSidebar } from '$lib/stores/cartSidebar.js';
  import type { Picture } from 'imagetools-core';
  import { formatCurrency, normalizeCurrencyCode } from '$lib/utils/currency.js';
  import { trackSelectItem, trackViewItemList } from '$lib/utils/analytics.js';

  import type { ProductListing } from '$lib/types/subscription.js';

  export let products: ProductListing[] = [];
  export let listName = 'Browse';
  export let linkMode: 'product' | 'subcategory' = 'product';
  export let cardMode: 'default' | 'subcategory-page' = 'default';
  export let subCategoryDiscounts: Record<string, number> = {};

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
    const logo =
      resolveLogoKey(logoKey || normalizedType) ||
      resolveLogoKeyFromName(logoKey || serviceType);
    return { ...baseStyle, logo };
  }

  function getCardTitle(product: ProductListing): string {
    if (linkMode === 'subcategory') {
      const subCategory = (product.sub_category || '').trim();
      if (subCategory.length > 0) {
        return subCategory;
      }
    }
    return product.name;
  }

  function formatPlanPrice(price: number, currency?: string | null): string {
    const resolvedCurrency = normalizeCurrencyCode(currency) || 'USD';
    return formatCurrency(price, resolvedCurrency);
  }

  function resolveDisplayPrice(product: ProductListing): number {
    const actualPrice = Number(product.actual_price);
    if (Number.isFinite(actualPrice) && actualPrice >= 0) {
      return actualPrice;
    }
    return Number(product.from_price);
  }

  function resolveComparisonPrice(product: ProductListing): number | null {
    const comparisonPrice = Number(product.comparison_price);
    if (Number.isFinite(comparisonPrice) && comparisonPrice > 0) {
      return comparisonPrice;
    }
    return null;
  }

  function normalizeSubCategoryKey(value?: string | null): string {
    return (value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function resolveComparisonDiscountPercent(product: ProductListing): number | null {
    const displayPrice = resolveDisplayPrice(product);
    const comparisonPrice = resolveComparisonPrice(product);
    if (
      !Number.isFinite(displayPrice) ||
      displayPrice <= 0 ||
      comparisonPrice === null ||
      comparisonPrice <= displayPrice
    ) {
      return null;
    }
    return Math.round(((comparisonPrice - displayPrice) / comparisonPrice) * 100);
  }

  function resolveMainCardDiscountPercent(product: ProductListing): number | null {
    const subCategoryKey = normalizeSubCategoryKey(product.sub_category);
    const mappedDiscount = Number(subCategoryDiscounts[subCategoryKey]);
    const maxDiscountPercent = Number(product.max_discount_percent);
    const fromDiscountPercent = Number(product.from_discount_percent);
    const comparisonDiscountPercent = resolveComparisonDiscountPercent(product);

    let best = 0;
    if (Number.isFinite(mappedDiscount) && mappedDiscount > 0) {
      best = Math.max(best, mappedDiscount);
    }
    if (Number.isFinite(maxDiscountPercent) && maxDiscountPercent > 0) {
      best = Math.max(best, maxDiscountPercent);
    }
    if (Number.isFinite(fromDiscountPercent) && fromDiscountPercent > 0) {
      best = Math.max(best, fromDiscountPercent);
    }
    if (
      comparisonDiscountPercent !== null &&
      Number.isFinite(comparisonDiscountPercent) &&
      comparisonDiscountPercent > 0
    ) {
      best = Math.max(best, comparisonDiscountPercent);
    }

    return best > 0 ? Math.round(best) : null;
  }

  function resolvePlatformRegion(product: ProductListing): string {
    const platform = (product.platform || product.name || '').trim();
    const regionRaw = (product.region || 'GLOBAL').trim();
    const region = regionRaw.length > 0 ? regionRaw.toUpperCase() : 'GLOBAL';
    if (!platform) {
      return region;
    }
    return `${platform} | ${region}`;
  }

  function resolveTermMonths(product: ProductListing): number {
    const value = Number(product.from_term_months);
    if (Number.isInteger(value) && value > 0) {
      return value;
    }
    return 1;
  }

  function handleQuickAddToCart(event: MouseEvent, product: ProductListing): void {
    event.preventDefault();
    event.stopPropagation();

    const variantId = (product.variant_id || product.product_id || '').trim();
    if (!variantId) {
      return;
    }

    const price = resolveDisplayPrice(product);
    if (!Number.isFinite(price) || price < 0) {
      return;
    }

    const termMonths = resolveTermMonths(product);
    const planLabel = `${termMonths} month${termMonths === 1 ? '' : 's'}`;

    cart.addItem({
      id: `${variantId}|${termMonths}|no-renew`,
      serviceType: product.service_type || product.slug || product.name,
      serviceName: product.name,
      plan: planLabel,
      price,
      currency: product.currency,
      quantity: 1,
      description: product.description,
      variantId,
      termMonths,
      autoRenew: false
    });
    cartSidebar.open();
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
    const searchParams = new URLSearchParams();
    const currentCategory = ($page.url.searchParams.get('category') || '').trim();
    const currentSubCategory = ($page.url.searchParams.get('sub_category') || '').trim();
    const shouldCarryBrowseFilters = $page.url.pathname === '/browse';

    if (shouldCarryBrowseFilters) {
      if (currentCategory && currentCategory.toLowerCase() !== 'all') {
        searchParams.set('category', currentCategory.toLowerCase());
      }
      if (currentSubCategory) {
        searchParams.set('sub_category', currentSubCategory.toLowerCase());
      }
    }

    const query = searchParams.toString();
    return `/browse/products/${encodeURIComponent(product.slug)}${query ? `?${query}` : ''}`;
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

<div
  class={
    cardMode === 'default' && linkMode === 'subcategory'
      ? 'subscription-showcase-home-row'
      : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'
  }
>
  {#each products as product, index}
    {@const cardTitle = getCardTitle(product)}
    {@const isSubCategoryPageCard = cardMode === 'subcategory-page'}
    {@const isHomeShowcaseCard = !isSubCategoryPageCard && linkMode === 'subcategory'}
    {@const serviceType =
      (linkMode === 'subcategory' && (product.sub_category || '').trim()) ||
      product.service_type ||
      product.slug ||
      product.name}
    {@const serviceStyle = getServiceStyle(serviceType, product.logoKey ?? product.logo_key)}
    {@const containLogoInTile = shouldContainLogoInTile(product, serviceType)}
    {@const zoomLogoInTile = shouldZoomLogoInTile(product, serviceType)}
    {@const displayPrice = resolveDisplayPrice(product)}
    {@const comparisonPrice = resolveComparisonPrice(product)}
    {@const subCategoryDiscountPercent = resolveComparisonDiscountPercent(product)}
    {@const mainCardDiscountPercent = resolveMainCardDiscountPercent(product)}
    {@const platformRegion = resolvePlatformRegion(product)}

    <article
      class={`subscription-showcase-card group ${
        isSubCategoryPageCard
          ? 'subscription-showcase-card--subcategory'
          : 'subscription-showcase-card--main'
      } ${isHomeShowcaseCard ? 'subscription-showcase-card--home' : ''}`}
    >
      <a
        href={getPlanHref(product)}
        class="subscription-showcase-link"
        aria-label={getCardAriaLabel(product)}
        on:click={() => handleSelectItem(product, index)}
      ></a>
      {#if !isSubCategoryPageCard && mainCardDiscountPercent !== null}
        <span class="subscription-main-discount-badge" aria-hidden="true">
          -{mainCardDiscountPercent}%
        </span>
      {/if}
      {#if isSubCategoryPageCard && subCategoryDiscountPercent !== null}
        <span class="subscription-subcategory-discount-badge" aria-hidden="true">
          -{subCategoryDiscountPercent}%
        </span>
      {/if}
      <div class="subscription-showcase-surface">
        <div class="subscription-showcase-sheen" aria-hidden="true"></div>

        <div class="subscription-logo-area">
          <div class="subscription-logo-aura" aria-hidden="true"></div>
          <div class={`subscription-logo-tile ${isSubCategoryPageCard ? 'subscription-logo-tile--compact' : 'subscription-logo-tile--main'} ${containLogoInTile ? 'subscription-logo-tile--dark' : ''}`}>
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

        {#if isSubCategoryPageCard}
          <div class="subscription-subcategory-divider">
            <span class="subscription-subcategory-divider-line" aria-hidden="true"></span>
          </div>

          <div class="subscription-showcase-content subscription-showcase-content--subcategory">
            <h3 class="subscription-subcategory-title line-clamp-2" title={cardTitle}>
              {cardTitle}
            </h3>
            <p class="subscription-subcategory-meta">{platformRegion}</p>

            <div class="subscription-subcategory-footer">
              <div class="subscription-subcategory-pricing">
                {#if comparisonPrice !== null}
                  <p class="subscription-subcategory-price-compare">
                    {formatPlanPrice(comparisonPrice, product.currency)}
                  </p>
                {/if}
                <p class="subscription-subcategory-price-current">
                  {formatPlanPrice(displayPrice, product.currency)}
                </p>
              </div>

              <button
                type="button"
                class="subscription-subcategory-cart-button"
                aria-label={`Add ${product.name} to cart`}
                on:click={(event) => handleQuickAddToCart(event, product)}
              >
                <span class="subscription-subcategory-cart-icon" aria-hidden="true">
                  <ShoppingCart size={20} class="subscription-subcategory-cart-glyph" />
                  <Plus size={12} class="subscription-subcategory-cart-plus" />
                </span>
              </button>
            </div>

            <p class="subscription-subcategory-guarantee text-[11px] leading-snug text-gray-500">
              Money Back Guarantee included
            </p>
          </div>
        {:else}
          <div class="subscription-showcase-content">
            <h3 class="text-2xl font-bold text-gray-900 line-clamp-2" title={cardTitle}>
              {cardTitle}
            </h3>
            <p class="mt-2 text-base leading-tight text-gray-700 whitespace-nowrap">
              From <span class="text-gray-900 font-bold text-xl">{formatPlanPrice(product.from_price, product.currency)}</span> /month
            </p>
            <p class="subscription-main-guarantee text-[11px] leading-snug text-gray-500">
              Money Back Guarantee included
            </p>
          </div>
        {/if}
      </div>
    </article>
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
    min-height: 16rem;
    border-radius: 1.5rem;
    isolation: isolate;
    transition: transform 220ms ease, filter 220ms ease;
  }

  .subscription-showcase-link {
    position: absolute;
    inset: 0;
    z-index: 2;
    border-radius: inherit;
    text-decoration: none;
  }

  .subscription-showcase-card--subcategory {
    min-height: 17rem;
  }

  .subscription-showcase-card--main .subscription-showcase-surface {
    padding: 1rem 0.9rem 0.85rem;
  }

  .subscription-showcase-home-row {
    display: flex;
    flex-wrap: nowrap;
    align-items: stretch;
    gap: 0.56rem;
    overflow-x: auto;
    padding-top: 0.22rem;
    padding-bottom: 0.3rem;
    padding-left: 0.42rem;
    padding-right: 0.2rem;
  }

  .subscription-showcase-home-row .subscription-showcase-card--home {
    flex: 0 0 calc((100% - 2.8rem) / 6);
    min-width: 0;
    min-height: 14.35rem;
  }

  .subscription-showcase-card--home .subscription-showcase-surface {
    background: #ffffff;
    border-color: rgba(203, 213, 225, 0.85);
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .subscription-showcase-card--home .subscription-logo-tile {
    box-shadow: none;
  }

  .subscription-showcase-card--home .subscription-showcase-sheen,
  .subscription-showcase-card--home .subscription-logo-aura {
    display: none;
  }

  .subscription-showcase-card--home::before {
    content: '';
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    padding: 2px;
    background: linear-gradient(
      120deg,
      rgba(147, 51, 234, 0.98),
      rgba(236, 72, 153, 0.98)
    );
    -webkit-mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    opacity: 0;
    transition: opacity 180ms ease;
    pointer-events: none;
    z-index: 4;
  }

  .subscription-showcase-card--home:hover::before {
    opacity: 1;
  }

  .subscription-showcase-card--home:hover {
    transform: none;
    filter: saturate(1.04);
  }

  .subscription-showcase-surface {
    position: relative;
    z-index: 2;
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
    pointer-events: none;
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

  .subscription-main-discount-badge {
    position: absolute;
    left: -0.22rem;
    top: 50%;
    transform: translateY(-50%);
    z-index: 5;
    pointer-events: none;
    border-radius: 0 0.78rem 0.78rem 0;
    border: 1px solid rgba(147, 51, 234, 0.34);
    background: linear-gradient(
      105deg,
      rgba(147, 51, 234, 0.94),
      rgba(236, 72, 153, 0.94)
    );
    box-shadow: 0 8px 16px rgba(147, 51, 234, 0.32);
    padding: 0.3rem 0.66rem;
    font-size: 0.74rem;
    font-weight: 700;
    line-height: 1.1;
    color: #ffffff;
    letter-spacing: 0.02em;
    white-space: nowrap;
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
    width: min(100%, 8.1rem);
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

  .subscription-logo-tile--compact {
    width: min(100%, 6.8rem);
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

  .subscription-subcategory-divider {
    position: relative;
    margin: 0.9rem 0 0.55rem;
  }

  .subscription-subcategory-divider-line {
    display: block;
    width: 100%;
    height: 1px;
    background: linear-gradient(
      to right,
      rgba(148, 163, 184, 0.48),
      rgba(148, 163, 184, 0.14)
    );
  }

  .subscription-subcategory-discount-badge {
    position: absolute;
    left: -0.22rem;
    top: calc(1.3rem + 0.15rem + 6.8rem + 0.9rem + 0.5px);
    transform: translateY(-50%);
    z-index: 5;
    pointer-events: none;
    border-radius: 0 0.78rem 0.78rem 0;
    border: 1px solid rgba(147, 51, 234, 0.34);
    background: linear-gradient(105deg, rgba(147, 51, 234, 0.94), rgba(236, 72, 153, 0.94));
    box-shadow: 0 8px 16px rgba(147, 51, 234, 0.32);
    padding: 0.3rem 0.66rem;
    font-size: 0.74rem;
    font-weight: 700;
    line-height: 1.1;
    color: #ffffff;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }

  .subscription-showcase-content--subcategory {
    align-items: stretch;
    text-align: left;
    padding-top: 0.6rem;
    gap: 0.1rem;
  }

  .subscription-subcategory-title {
    font-size: 1.18rem;
    line-height: 1.35;
    font-weight: 700;
    color: #111827;
  }

  .subscription-subcategory-meta {
    margin-top: 0.2rem;
    font-size: 0.68rem;
    line-height: 1.2;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #64748b;
  }

  .subscription-subcategory-footer {
    margin-top: auto;
    padding-top: 0.9rem;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .subscription-subcategory-pricing {
    min-width: 0;
  }

  .subscription-subcategory-price-compare {
    margin: 0;
    font-size: 0.76rem;
    line-height: 1.2;
    font-weight: 500;
    color: #64748b;
    text-decoration: line-through;
    text-decoration-thickness: 1.5px;
    text-decoration-color: #64748b;
  }

  .subscription-subcategory-price-current {
    margin: 0.2rem 0 0;
    font-size: 1.26rem;
    line-height: 1.15;
    font-weight: 700;
    color: #111827;
  }

  .subscription-subcategory-cart-button {
    flex: 0 0 auto;
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: none;
    background: transparent;
    color: inherit;
    transition: transform 160ms ease, filter 160ms ease;
    cursor: pointer;
    z-index: 3;
    pointer-events: auto;
  }

  .subscription-subcategory-cart-button:hover {
    transform: translateY(-1px) scale(1.04);
    filter: saturate(1.08);
  }

  .subscription-subcategory-cart-icon {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .subscription-subcategory-cart-glyph {
    color: #9333ea;
  }

  .subscription-subcategory-cart-plus {
    position: absolute;
    right: -0.36rem;
    bottom: -0.26rem;
    color: #ec4899;
    background: #ffffff;
    border-radius: 999px;
  }

  .subscription-subcategory-guarantee {
    margin-top: 0.95rem;
    width: 100%;
    text-align: center;
  }

  .subscription-main-guarantee {
    margin-top: auto;
    padding-top: 1.25rem;
  }

  .subscription-showcase-card:hover {
    transform: translateY(-3px);
    filter: saturate(1.06);
  }

  .subscription-showcase-link:focus-visible {
    outline: 2px solid #22d3ee;
    outline-offset: 3px;
  }

  @media (max-width: 1024px) {
    .subscription-showcase-card {
      min-height: 15.2rem;
    }

    .subscription-showcase-card--subcategory {
      min-height: 16rem;
    }

    .subscription-logo-tile {
      width: min(100%, 7.5rem);
    }

    .subscription-logo-tile--compact {
      width: min(100%, 6rem);
    }

    .subscription-subcategory-discount-badge {
      top: calc(1.3rem + 0.15rem + 6rem + 0.9rem + 0.5px);
    }
  }

  @media (max-width: 1200px) {
    .subscription-showcase-home-row .subscription-showcase-card--home {
      flex-basis: clamp(9.3rem, 28vw, 10.6rem);
    }
  }

  @media (max-width: 640px) {
    .subscription-showcase-card {
      min-height: 14.5rem;
    }

    .subscription-showcase-card--subcategory {
      min-height: 15.2rem;
    }

    .subscription-showcase-content {
      padding-top: 1rem;
    }

    .subscription-showcase-content:not(.subscription-showcase-content--subcategory) h3 {
      font-size: 1.4rem;
    }

    .subscription-showcase-content:not(.subscription-showcase-content--subcategory) p {
      font-size: 0.95rem;
    }

    .subscription-subcategory-discount-badge {
      left: -0.22rem;
      transform: translateY(-50%);
    }

    .subscription-subcategory-title {
      font-size: 1.02rem;
    }

    .subscription-subcategory-price-current {
      font-size: 1.08rem;
    }

    .subscription-showcase-home-row {
      gap: 0.48rem;
      padding-left: 0.34rem;
      padding-right: 0.12rem;
    }

    .subscription-showcase-home-row .subscription-showcase-card--home {
      flex-basis: min(78vw, 10.1rem);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .subscription-showcase-card {
      transition: none;
    }
  }
</style>
