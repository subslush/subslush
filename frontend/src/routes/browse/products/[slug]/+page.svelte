<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import Footer from '$lib/components/home/Footer.svelte';
  import ResponsiveImage from '$lib/components/common/ResponsiveImage.svelte';
  import { resolveLogoKey, resolveLogoKeyFromName } from '$lib/assets/logoRegistry.js';
  import visaLogo from '$lib/assets/visa.svg';
  import mastercardIcon from '$lib/assets/mastercard-icon.svg';
  import paypalIcon from '$lib/assets/paypal-icon.svg';
  import btcIcon from '$lib/assets/bitcoin-icon.svg';
  import ethIcon from '$lib/assets/eth-icon.svg';
  import usdtLogo from '$lib/assets/usdt.svg';
  import usdcLogo from '$lib/assets/usdc.svg';
  import ltcIcon from '$lib/assets/litecoin-icon.svg';
  import solIcon from '$lib/assets/solana-icon.svg';
  import xrpIcon from '$lib/assets/xrp-icon.svg';
  import { cart } from '$lib/stores/cart.js';
  import { cartSidebar } from '$lib/stores/cartSidebar.js';
  import { formatCurrency, normalizeCurrencyCode } from '$lib/utils/currency.js';
  import { subscriptionService } from '$lib/api/subscriptions.js';
  import { trackAddToCart, trackViewItem } from '$lib/utils/analytics.js';
  import {
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    Globe,
    Headphones,
    ListChecks,
    Lock,
    Shield,
    X,
    Zap
  } from 'lucide-svelte';
  import type {
    OwnAccountCredentialRequirement,
    ProductVariantOption,
    ProductTermOption,
    UpgradeOptions
  } from '$lib/types/subscription.js';
  import type { UpgradeSelectionType } from '$lib/types/upgradeSelection.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let product = data.product;
  let variants = data.variants || [];

  $: product = data.product;
  $: variants = data.variants || [];

  let selectedVariant: ProductVariantOption | null = null;
  let selectedTerm: ProductTermOption | null = null;
  let selectedFeatures: string[] = [];
  let upgradeOptions: UpgradeOptions | null = null;
  let productLogoNeedsDarkTile = false;
  let upgradeSelectionType: UpgradeSelectionType | '' = '';
  let manualMonthlyAcknowledged = false;
  let showActivationGuide = false;
  let showFeaturesGuide = false;
  let descriptionExpanded = false;
  let selectionError = '';

  const DESCRIPTION_MAX_WORDS = 600;
  const DESCRIPTION_MAX_CHARS = 3900;

  const normalizeStringList = (value: unknown): string[] => {
    if (Array.isArray(value)) {
      return value
        .filter((item): item is string => typeof item === 'string')
        .map(item => item.trim())
        .filter(item => item.length > 0);
    }
    if (typeof value === 'string') {
      return value
        .split(/[\n,]+/)
        .map(item => item.trim())
        .filter(item => item.length > 0);
    }
    return [];
  };

  const collectVariantFeatures = (source: ProductVariantOption[]): string[] => {
    const unique = new Set<string>();
    for (const variant of source) {
      for (const feature of normalizeStringList(variant.features)) {
        unique.add(feature);
      }
    }
    return Array.from(unique);
  };

  const resolveVariantLabel = (variant: ProductVariantOption): string =>
    variant.display_name || variant.plan_code || variant.name || 'Plan';

  $: productLogo =
    resolveLogoKey(
      product?.logoKey ??
        product?.logo_key ??
        product?.service_type ??
        product?.slug
    ) ||
    resolveLogoKeyFromName(
      product?.service_type ?? product?.name ?? product?.slug
    ) ||
    resolveLogoKeyFromName(product?.name) ||
    resolveLogoKeyFromName(product?.slug);
  $: productLogoNeedsDarkTile = [
    product?.slug,
    product?.logoKey,
    product?.logo_key,
    product?.service_type,
    product?.name
  ].some(value =>
    typeof value === 'string' &&
    value.toLowerCase().replace(/[^a-z0-9]+/g, '').includes('appletv')
  );

  $: upgradeOptions = product?.upgrade_options || null;
  $: hasUpgradeSelection = Boolean(
    upgradeOptions?.allow_new_account ||
      upgradeOptions?.allow_own_account ||
      upgradeOptions?.manual_monthly_upgrade
  );
  $: hasSelectionChoices = Boolean(
    upgradeOptions?.allow_new_account || upgradeOptions?.allow_own_account
  );
  $: requiresManualAck = Boolean(upgradeOptions?.manual_monthly_upgrade);
  $: selectionReady =
    !hasUpgradeSelection || !hasSelectionChoices || Boolean(upgradeSelectionType);
  $: if (selectionReady && selectionError) {
    selectionError = '';
  }
  $: if (hasUpgradeSelection && hasSelectionChoices && !upgradeSelectionType) {
    if (upgradeOptions?.allow_new_account && !upgradeOptions?.allow_own_account) {
      upgradeSelectionType = 'upgrade_new_account';
    } else if (upgradeOptions?.allow_own_account && !upgradeOptions?.allow_new_account) {
      upgradeSelectionType = 'upgrade_own_account';
    }
  }

  const resolveOwnAccountCredentialRequirement = (
    options: UpgradeOptions | null
  ): OwnAccountCredentialRequirement =>
    options?.own_account_credential_requirement === 'email_only'
      ? 'email_only'
      : 'email_and_password';

  const readProductText = (keys: string[]): string => {
    const record = product as Record<string, unknown>;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return '';
  };

  const escapeHtml = (value: string): string =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const renderInfoBoxHtml = (value: string): string => {
    if (!value) return '';

    const renderLine = (line: string): string => {
      let html = '';
      let cursor = 0;
      const boldPattern = /\*\*(.+?)\*\*/g;

      for (const match of line.matchAll(boldPattern)) {
        const index = match.index ?? 0;
        html += escapeHtml(line.slice(cursor, index));
        html += `<strong>${escapeHtml(match[1] || '')}</strong>`;
        cursor = index + match[0].length;
      }

      html += escapeHtml(line.slice(cursor));
      return html;
    };

    return value
      .split(/\r?\n/)
      .map(renderLine)
      .join('<br />');
  };

  const buildDescriptionPreview = (
    value: string,
    maxWords: number,
    maxChars: number
  ): { text: string; truncated: boolean } => {
    const text = value.trim();
    if (!text) return { text: '', truncated: false };

    const words = Array.from(text.matchAll(/\S+/g));
    const exceedsWordLimit = words.length > maxWords;
    const exceedsCharLimit = text.length > maxChars;

    if (!exceedsWordLimit && !exceedsCharLimit) {
      return { text, truncated: false };
    }

    let cutIndex = text.length;
    if (exceedsCharLimit) {
      cutIndex = Math.min(cutIndex, maxChars);
    }
    if (exceedsWordLimit) {
      const overflowWord = words[maxWords];
      if (overflowWord && typeof overflowWord.index === 'number') {
        cutIndex = Math.min(cutIndex, overflowWord.index);
      }
    }

    if (cutIndex <= 0 || cutIndex >= text.length) {
      return { text, truncated: false };
    }

    const preview = text.slice(0, cutIndex).trimEnd();
    return {
      text: `${preview}...`,
      truncated: true
    };
  };

  const normalizeFilterValue = (value?: string | null): string =>
    typeof value === 'string' ? value.trim().toLowerCase() : '';

  const toDisplayLabel = (value: string): string =>
    value
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

  const buildBrowseHref = (categoryKey: string, subCategoryKey: string): string => {
    const params = new URLSearchParams();
    if (categoryKey && categoryKey !== 'all') {
      params.set('category', categoryKey);
    }
    if (subCategoryKey) {
      params.set('sub_category', subCategoryKey);
    }
    const query = params.toString();
    return query ? `/browse?${query}` : '/browse';
  };

  $: infoBoxText = readProductText([
    'info_box_text',
    'infoBoxText',
    'info_text',
    'infoText'
  ]);
  $: breadcrumbCategoryKey = normalizeFilterValue(
    $page.url.searchParams.get('category')
  );
  $: breadcrumbSubCategoryKey = normalizeFilterValue(
    $page.url.searchParams.get('sub_category')
  );
  $: productSubCategoryLabel = (product?.sub_category || '').trim();
  $: breadcrumbSubCategoryLabel =
    breadcrumbSubCategoryKey.length > 0
      ? productSubCategoryLabel &&
        normalizeFilterValue(productSubCategoryLabel) === breadcrumbSubCategoryKey
        ? productSubCategoryLabel
        : toDisplayLabel(breadcrumbSubCategoryKey)
      : '';
  $: browseHref = buildBrowseHref(
    breadcrumbCategoryKey,
    breadcrumbSubCategoryKey
  );
  $: infoBoxHtml = renderInfoBoxHtml(infoBoxText);
  $: platformLabel =
    readProductText(['platform', 'platform_name', 'platformName']) ||
    product.name ||
    '';
  $: platformLogo = resolveLogoKeyFromName(platformLabel);
  $: regionLabel = readProductText(['region', 'region_name', 'regionName']) || 'Global';
  $: activationGuideText = readProductText([
    'activation_guide',
    'activationGuide',
    'activation_guide_text',
    'activationGuideText'
  ]);
  $: hasActivationGuide = activationGuideText.length > 0;
  $: activationGuideSteps = activationGuideText
    ? activationGuideText
        .split(/\n+/)
        .map(step => step.trim())
        .filter(step => step.length > 0)
    : [];
  $: productDescription = (product?.description || '').trim();
  $: descriptionPreview = buildDescriptionPreview(
    productDescription,
    DESCRIPTION_MAX_WORDS,
    DESCRIPTION_MAX_CHARS
  );
  $: hasTruncatedDescription = descriptionPreview.truncated;
  $: visibleDescription =
    descriptionExpanded || !hasTruncatedDescription
      ? productDescription
      : descriptionPreview.text;
  $: if (!hasTruncatedDescription) {
    descriptionExpanded = false;
  }

  const resolveCountryName = (countryCode?: string | null): string => {
    const normalized = typeof countryCode === 'string' ? countryCode.trim().toUpperCase() : '';
    if (!normalized) return 'your country';
    if (typeof Intl !== 'undefined' && 'DisplayNames' in Intl) {
      try {
        const formatter = new Intl.DisplayNames(['en'], { type: 'region' });
        return formatter.of(normalized) || normalized;
      } catch {
        return normalized;
      }
    }
    return normalized;
  };

  $: visitorCountry = resolveCountryName(data.requestCountryCode);
  $: usersOnPage = data.usersOnPage ?? 12;
  $: unitsLeft = data.unitsLeft ?? 6;

  const resolveDefaultTerm = (variant: ProductVariantOption): ProductTermOption | null => {
    if (!Array.isArray(variant.term_options) || variant.term_options.length === 0) {
      return null;
    }
    const recommended = variant.term_options.find(term => term.is_recommended);
    return recommended || variant.term_options[0] || null;
  };

  const resolveSelectedTerm = (variant: ProductVariantOption): ProductTermOption | null =>
    resolveDefaultTerm(variant);

  $: selectedVariant = variants[0] || null;
  $: selectedTerm = selectedVariant ? resolveDefaultTerm(selectedVariant) : null;
  $: selectedFeatures =
    selectedVariant && normalizeStringList(selectedVariant.features).length > 0
      ? normalizeStringList(selectedVariant.features)
      : collectVariantFeatures(variants);
  $: selectedVariantCurrency =
    normalizeCurrencyCode(selectedVariant?.currency) || 'USD';

  const buildCartItemId = (params: {
    variantId: string;
    termMonths: number;
    autoRenew: boolean;
    selectionType?: UpgradeSelectionType | '';
  }): string => {
    const selection = params.selectionType || 'none';
    return [
      params.variantId,
      params.termMonths,
      params.autoRenew ? 'renew' : 'no-renew',
      selection
    ].join('|');
  };

  const resolveSelectionValidationError = (
    intent: 'add' | 'checkout'
  ): string | null => {
    if (!hasUpgradeSelection) return null;

    const actionLabel = intent === 'checkout' ? 'continue' : 'add this item';
    const hasMultipleChoices = Boolean(
      upgradeOptions?.allow_new_account && upgradeOptions?.allow_own_account
    );

    if (hasMultipleChoices && !upgradeSelectionType) {
      return `Please choose an upgrade option before you ${actionLabel}.`;
    }

    if (!selectionReady) {
      return `Please choose an upgrade option before you ${actionLabel}.`;
    }

    return null;
  };

  const getOrCreateGuestId = (): string => {
    if (typeof window === 'undefined') return 'guest';
    try {
      const key = 'tiktok_guest_id';
      const existing = localStorage.getItem(key);
      if (existing) return existing;
      const generated =
        typeof crypto?.randomUUID === 'function'
          ? crypto.randomUUID()
          : `guest_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(key, generated);
      return generated;
    } catch {
      return 'guest';
    }
  };

  const buildAddToCartEventId = (): string => {
    const ownerId = getOrCreateGuestId();
    const nonce = Math.random().toString(16).slice(2, 8);
    return `cart_${ownerId}_${Date.now()}_${nonce}`;
  };

  const buildViewContentEventId = (contentId: string): string => {
    const ownerId = getOrCreateGuestId();
    const nonce = Math.random().toString(16).slice(2, 8);
    return `view_${ownerId}_${contentId}_${Date.now()}_${nonce}`;
  };

  const buildProductItem = (
    variant?: ProductVariantOption | null,
    term?: ProductTermOption | null,
    listName?: string
  ) => {
    const itemId = product?.id || product?.slug || product?.name;
    const itemName = product?.name || product?.slug;
    if (!itemId && !itemName) return null;
    return {
      item_id: itemId,
      item_name: itemName,
      item_category: product?.category || product?.service_type || undefined,
      item_variant: variant ? resolveVariantLabel(variant) : undefined,
      item_list_name: listName,
      price: term?.total_price,
      currency: variant?.currency,
      quantity: 1
    };
  };

  const trackCartIntent = (
    variant: ProductVariantOption,
    term: ProductTermOption
  ) => {
    const analyticsItem = buildProductItem(variant, term, 'Product Detail');
    if (!analyticsItem) return;
    const eventId = buildAddToCartEventId();
    trackAddToCart(analyticsItem.currency, term.total_price, [analyticsItem], eventId);
    void subscriptionService.trackAddToCart({
      contentId: product.slug || product.id || variant.id,
      contentName: product.name || product.service_type || variant.display_name,
      contentCategory: product.category || product.service_type || undefined,
      price: term.total_price,
      currency: analyticsItem.currency,
      brand: product.service_type || undefined,
      value: term.total_price,
      externalId: getOrCreateGuestId(),
      eventId
    });
  };

  const handleCheckoutNow = (variant: ProductVariantOption) => {
    const term = resolveSelectedTerm(variant);
    if (!term) return;
    const selectionValidationError = resolveSelectionValidationError('checkout');
    if (selectionValidationError) {
      selectionError = selectionValidationError;
      return;
    }
    trackCartIntent(variant, term);
    cart.addItem({
      id: buildCartItemId({
        variantId: variant.id,
        termMonths: term.months,
        autoRenew: false,
        selectionType: upgradeSelectionType
      }),
      serviceType: product.service_type || product.slug || product.name,
      serviceName: product.name,
      logoKey: product.logoKey || product.logo_key || undefined,
      plan: resolveVariantLabel(variant),
      price: term.total_price,
      currency: variant.currency,
      quantity: 1,
      description: variant.description,
      features: variant.features,
      variantId: variant.id,
      termMonths: term.months,
      autoRenew: false,
      upgradeSelectionType: upgradeSelectionType || null,
      ownAccountCredentialRequirement:
        upgradeSelectionType === 'upgrade_own_account'
          ? resolveOwnAccountCredentialRequirement(upgradeOptions)
          : null,
      manualMonthlyAcknowledged: requiresManualAck ? true : manualMonthlyAcknowledged
    });
    void goto('/checkout');
  };

  const handleAddToCart = (variant: ProductVariantOption) => {
    const term = resolveSelectedTerm(variant);
    if (!term) return;
    const selectionValidationError = resolveSelectionValidationError('add');
    if (selectionValidationError) {
      selectionError = selectionValidationError;
      return;
    }
    trackCartIntent(variant, term);
    cart.addItem({
      id: buildCartItemId({
        variantId: variant.id,
        termMonths: term.months,
        autoRenew: false,
        selectionType: upgradeSelectionType
      }),
      serviceType: product.service_type || product.slug || product.name,
      serviceName: product.name,
      logoKey: product.logoKey || product.logo_key || undefined,
      plan: resolveVariantLabel(variant),
      price: term.total_price,
      currency: variant.currency,
      quantity: 1,
      description: variant.description,
      features: variant.features,
      variantId: variant.id,
      termMonths: term.months,
      autoRenew: false,
      upgradeSelectionType: upgradeSelectionType || null,
      ownAccountCredentialRequirement:
        upgradeSelectionType === 'upgrade_own_account'
          ? resolveOwnAccountCredentialRequirement(upgradeOptions)
          : null,
      manualMonthlyAcknowledged: requiresManualAck ? true : manualMonthlyAcknowledged
    });
    cartSidebar.open();
  };

  let lastViewedProductId = '';
  $: {
    if (browser) {
      const currentId = product?.id || product?.slug || '';
      if (!currentId) {
        lastViewedProductId = '';
      } else if (currentId !== lastViewedProductId) {
        const trackedVariant = selectedVariant || variants[0];
        const defaultTerm = trackedVariant
          ? resolveSelectedTerm(trackedVariant) || resolveDefaultTerm(trackedVariant)
          : null;
        const analyticsItem = buildProductItem(
          trackedVariant,
          defaultTerm,
          'Product Detail'
        );
        if (analyticsItem) {
          const contentId = product?.slug || product?.id || currentId;
          const eventId = buildViewContentEventId(contentId);
          trackViewItem(analyticsItem, eventId);
          void subscriptionService.trackTikTokEvent({
            event: 'view_content',
            contentId,
            contentName: product?.name || product?.service_type || undefined,
            contentCategory: product?.category || product?.service_type || undefined,
            price: defaultTerm?.total_price,
            currency: analyticsItem.currency,
            brand: product?.service_type || undefined,
            value: defaultTerm?.total_price,
            externalId: getOrCreateGuestId(),
            eventId
          });
        }
        lastViewedProductId = currentId;
      }
    }
  }
</script>

<svelte:head>
  <title>{product.name} - SubSlush</title>
  <meta name="description" content={product.description} />
</svelte:head>

<div class="min-h-screen bg-white">
  <HomeNav />

  <main class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
    <div class="mb-6 flex flex-wrap items-center gap-2 text-sm">
      <a href={browseHref} class="font-semibold text-fuchsia-700 hover:text-fuchsia-800">
        Browse
      </a>
      {#if breadcrumbSubCategoryLabel}
        <span class="text-slate-400">/</span>
        <a
          href={browseHref}
          class="font-semibold text-slate-700 transition-colors hover:text-fuchsia-700"
        >
          {breadcrumbSubCategoryLabel}
        </a>
      {/if}
      <span class="text-slate-400">/</span>
      <span class="font-semibold text-slate-800">{product.name}</span>
    </div>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_23.5rem] lg:items-start">
      <section class="space-y-6">
        <article>
          <div class="grid gap-5 lg:grid-cols-[255px_minmax(0,1fr)] lg:items-center">
            <div class={`relative mx-auto flex aspect-square w-full max-w-[250px] items-center justify-center overflow-hidden rounded-3xl border border-slate-200 shadow-[0_20px_34px_rgba(15,23,42,0.12)] ${productLogoNeedsDarkTile ? 'bg-slate-950' : 'bg-white'}`}>
              {#if productLogo}
                <ResponsiveImage
                  image={productLogo}
                  alt={`${product.name} logo`}
                  sizes="(min-width: 1024px) 250px, 46vw"
                  pictureClass={productLogoNeedsDarkTile
                    ? 'relative z-10 flex h-full w-full items-center justify-center p-6'
                    : 'relative z-10 block h-full w-full'}
                  imgClass={productLogoNeedsDarkTile
                    ? 'max-h-full max-w-full object-contain'
                    : 'h-full w-full object-cover object-center'}
                  loading="eager"
                  decoding="async"
                />
              {:else}
                <span class={`relative z-10 text-6xl font-black uppercase ${productLogoNeedsDarkTile ? 'text-white/90' : 'text-slate-900/90'}`}>
                  {product.name.slice(0, 2)}
                </span>
              {/if}
            </div>

            <div>
              <h1 class="text-3xl font-semibold tracking-tight text-slate-900 sm:text-[2.15rem]">
                {product.name}
              </h1>

              <div class="mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4">
                <section class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                    Platform
                  </p>
                  <p class="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    {#if platformLogo}
                      <ResponsiveImage
                        image={platformLogo}
                        alt={`${platformLabel || 'Platform'} logo`}
                        sizes="18px"
                        pictureClass="h-[18px] w-[18px] shrink-0 overflow-hidden rounded"
                        imgClass="h-full w-full object-contain"
                        loading="lazy"
                        decoding="async"
                      />
                    {:else}
                      <Globe size={14} class="text-fuchsia-600" />
                    {/if}
                    {platformLabel}
                  </p>
                  <button
                    type="button"
                    class="mt-2 inline-flex items-center text-xs font-semibold text-pink-600 transition hover:text-pink-700 disabled:cursor-not-allowed disabled:opacity-60"
                    on:click={() => (showActivationGuide = true)}
                    disabled={!hasActivationGuide}
                  >
                    Check activation guide
                  </button>
                </section>

                <section class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <p class="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                    Region
                  </p>
                  <p class="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span class="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-r from-purple-600 to-pink-500 text-white">
                      <Globe size={12} />
                    </span>
                    {regionLabel}
                  </p>
                  <p class="mt-2 flex items-center gap-1 text-xs text-slate-700">
                    <CheckCircle2 size={12} class="text-emerald-600" />
                    <span>
                      Works in: <strong class="font-semibold text-slate-900">{visitorCountry}</strong>
                    </span>
                  </p>
                </section>
              </div>

              <div class="mt-4 flex flex-wrap gap-2">
                <span class="inline-flex items-center gap-1 rounded-full border border-fuchsia-200 bg-white px-3 py-1 text-[11px] font-semibold">
                  <Shield size={13} class="text-purple-600" />
                  <span class="text-slate-700">Money back guarantee</span>
                </span>
                <span class="inline-flex items-center gap-1 rounded-full border border-fuchsia-200 bg-white px-3 py-1 text-[11px] font-semibold">
                  <Lock size={13} class="text-fuchsia-600" />
                  <span class="text-slate-700">Secure checkout</span>
                </span>
                <span class="inline-flex items-center gap-1 rounded-full border border-fuchsia-200 bg-white px-3 py-1 text-[11px] font-semibold">
                  <Headphones size={13} class="text-pink-600" />
                  <span class="text-slate-700">24/7 Customer support</span>
                </span>
              </div>
            </div>
          </div>
        </article>

        {#if infoBoxText}
          <section class="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
            <div class="flex items-center gap-3">
              <span class="info-leading-icon inline-flex h-6 w-6 shrink-0 items-center justify-center" aria-hidden="true">
                <svg viewBox="0 0 24 24" class="h-6 w-6" fill="none">
                  <defs>
                    <linearGradient id="product-info-icon-gradient" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stop-color="#7e22ce" />
                      <stop offset="100%" stop-color="#db2777" />
                    </linearGradient>
                  </defs>
                  <circle cx="12" cy="12" r="8.5" stroke="url(#product-info-icon-gradient)" stroke-width="1.75" />
                  <path d="M12 11v4" stroke="url(#product-info-icon-gradient)" stroke-width="1.75" stroke-linecap="round" />
                  <circle cx="12" cy="8" r="1.2" fill="url(#product-info-icon-gradient)" />
                </svg>
              </span>
              <p class="info-box-content min-w-0 text-xs leading-snug text-slate-700">
                {@html infoBoxHtml}
              </p>
            </div>
          </section>
        {/if}

        <section>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="text-2xl font-semibold tracking-tight text-slate-900">Description</h2>
            <button
              type="button"
              class="gradient-outline-darkbtn inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold"
              on:click={() => (showFeaturesGuide = true)}
            >
              <ListChecks size={14} class="text-fuchsia-600" />
              View features
            </button>
          </div>
          {#if visibleDescription}
            <div class="relative mt-3">
              <p class="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {visibleDescription}
              </p>
              {#if !descriptionExpanded && hasTruncatedDescription}
                <div class="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent"></div>
              {/if}
            </div>
            {#if hasTruncatedDescription}
              <button
                type="button"
                class="gradient-outline-darkbtn mt-4 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold"
                on:click={() => (descriptionExpanded = !descriptionExpanded)}
              >
                {descriptionExpanded ? 'Show less' : 'Show more'}
                {#if descriptionExpanded}
                  <ChevronUp size={14} />
                {:else}
                  <ChevronDown size={14} />
                {/if}
              </button>
            {/if}
          {:else}
            <p class="mt-3 text-sm text-slate-500">No description available.</p>
          {/if}
        </section>

      </section>

      <aside class="lg:sticky lg:top-24">
        <div class="mb-3 flex items-center justify-center gap-2 text-center">
          <span class="live-dot" aria-hidden="true"></span>
          <p class="text-xs font-medium text-slate-600">
            <span class="font-semibold text-slate-900">{usersOnPage}</span> users on this page
          </p>
        </div>
        <div class="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_14px_28px_rgba(15,23,42,0.1)]">
          <div>
            <p class="text-5xl font-black tracking-tight text-slate-900">
              {selectedTerm
                ? formatCurrency(selectedTerm.total_price, selectedVariantCurrency)
                : '--'}
            </p>
          </div>
          <div class="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <span
              class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-purple-600 to-pink-500 text-xs font-bold text-white"
              aria-hidden="true"
            >
              !
            </span>
            <p class="text-xs font-medium text-slate-700">
              Hurry up! Only <span class="font-semibold text-slate-900">{unitsLeft}</span> units left in this price.
            </p>
          </div>

          {#if hasUpgradeSelection && upgradeOptions}
            <section class="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <h3 class="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">Upgrade option</h3>
              {#if upgradeOptions.allow_new_account || upgradeOptions.allow_own_account}
                <div class="mt-2 space-y-2">
                  {#if upgradeOptions.allow_new_account}
                    <button
                      type="button"
                      class={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                        upgradeSelectionType === 'upgrade_new_account'
                          ? 'border-fuchsia-300 bg-white'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                      on:click={() => (upgradeSelectionType = 'upgrade_new_account')}
                    >
                      <span class="flex items-center gap-2.5">
                        <span class={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          upgradeSelectionType === 'upgrade_new_account'
                            ? 'border-fuchsia-500'
                            : 'border-slate-300'
                        }`}>
                          {#if upgradeSelectionType === 'upgrade_new_account'}
                            <span class="h-2 w-2 rounded-full bg-fuchsia-500"></span>
                          {/if}
                        </span>
                        <span class="min-w-0">
                          <span class="block text-sm font-semibold text-slate-900">New account</span>
                          <span class="mt-0.5 block text-xs leading-relaxed text-slate-600">
                            We create and deliver a ready-to-use account for this product.
                          </span>
                        </span>
                      </span>
                    </button>
                  {/if}
                  {#if upgradeOptions.allow_own_account}
                    <button
                      type="button"
                      class={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                        upgradeSelectionType === 'upgrade_own_account'
                          ? 'border-fuchsia-300 bg-white'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                      on:click={() => (upgradeSelectionType = 'upgrade_own_account')}
                    >
                      <span class="flex items-center gap-2.5">
                        <span class={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          upgradeSelectionType === 'upgrade_own_account'
                            ? 'border-fuchsia-500'
                            : 'border-slate-300'
                        }`}>
                          {#if upgradeSelectionType === 'upgrade_own_account'}
                            <span class="h-2 w-2 rounded-full bg-fuchsia-500"></span>
                          {/if}
                        </span>
                        <span class="min-w-0">
                          <span class="block text-sm font-semibold text-slate-900">Your account</span>
                          <span class="mt-0.5 block text-xs leading-relaxed text-slate-600">
                            {resolveOwnAccountCredentialRequirement(upgradeOptions) === 'email_only'
                              ? 'We only require your account email after checkout.'
                              : 'We require account email and password after checkout.'}
                          </span>
                        </span>
                      </span>
                    </button>
                  {/if}
                </div>
              {:else}
                <p class="mt-2 text-xs text-slate-600">
                  This plan requires a manual upgrade workflow after purchase.
                </p>
              {/if}
              {#if selectionError}
                <p class="mt-2 text-xs font-medium text-red-600">{selectionError}</p>
              {/if}
            </section>
          {/if}

          <div class="mt-4 space-y-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              class="w-full rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 px-4 py-3.5 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              on:click={() => selectedVariant && handleCheckoutNow(selectedVariant)}
              disabled={!selectedVariant || !selectedTerm}
            >
              BUY NOW
            </button>
            <button
              type="button"
              class="gradient-outline-btn w-full rounded-xl px-4 py-3.5 text-sm font-semibold transition hover:brightness-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              on:click={() => selectedVariant && handleAddToCart(selectedVariant)}
              disabled={!selectedVariant || !selectedTerm}
            >
              <span class="gradient-text">ADD TO CART</span>
            </button>
          </div>

          <div class="mt-3 grid grid-cols-5 gap-2">
            <span class="flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2">
              <img src={visaLogo} alt="Visa" class="h-4 w-auto object-contain" loading="lazy" />
            </span>
            <span class="flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2">
              <img
                src={mastercardIcon}
                alt="Mastercard"
                class="h-6 w-auto object-contain"
                loading="lazy"
              />
            </span>
            <span class="flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2">
              <img
                src={paypalIcon}
                alt="PayPal"
                class="h-5 w-auto object-contain"
                loading="lazy"
              />
            </span>
            <span class="flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2">
              <img src={btcIcon} alt="Bitcoin" class="h-5 w-auto object-contain" loading="lazy" />
            </span>
            <span class="flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2">
              <img src={ethIcon} alt="Ethereum" class="h-6 w-auto object-contain" loading="lazy" />
            </span>
          </div>
          <div class="mt-2 grid grid-cols-5 gap-2">
            <span class="flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2">
              <img src={usdtLogo} alt="USDT" class="h-5 w-5 object-contain" loading="lazy" />
            </span>
            <span class="flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2">
              <img src={usdcLogo} alt="USDC" class="h-5 w-5 object-contain" loading="lazy" />
            </span>
            <span class="flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2">
              <img src={ltcIcon} alt="Litecoin" class="h-5 w-5 object-contain" loading="lazy" />
            </span>
            <span class="flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2">
              <img src={solIcon} alt="Solana" class="h-5 w-5 object-contain" loading="lazy" />
            </span>
            <span class="flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-2">
              <img src={xrpIcon} alt="XRP" class="h-5 w-5 object-contain" loading="lazy" />
            </span>
          </div>
          <div class="mt-4 space-y-2 border-t border-slate-200 pt-3">
            <details class="group rounded-xl border border-slate-200 bg-white">
              <summary class="flex cursor-pointer list-none items-center justify-between px-3 py-2.5">
                <span class="flex items-center gap-2">
                  <span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-r from-purple-600 to-pink-500 text-white">
                    <Zap size={13} />
                  </span>
                  <span class="text-sm font-semibold text-slate-800">Delivery</span>
                </span>
                <span class="text-slate-400 transition group-open:rotate-180">⌄</span>
              </summary>
              <p class="px-3 pb-3 text-xs text-slate-600">
                Every order is manually fulfilled through a fair queue. Most orders are delivered
                within 24 hours, and in rare cases delivery can take up to 72 hours.
              </p>
            </details>
            <details class="group rounded-xl border border-slate-200 bg-white">
              <summary class="flex cursor-pointer list-none items-center justify-between px-3 py-2.5">
                <span class="flex items-center gap-2">
                  <span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-r from-purple-600 to-pink-500 text-white">
                    <Lock size={13} />
                  </span>
                  <span class="text-sm font-semibold text-slate-800">Money Back Guarantee</span>
                </span>
                <span class="text-slate-400 transition group-open:rotate-180">⌄</span>
              </summary>
              <p class="px-3 pb-3 text-xs text-slate-600">
                Shop with confidence. If an issue occurs with your purchase, our support team will
                review it and provide a refund or replacement when eligible under our Terms &
                Conditions.
              </p>
            </details>
            <details class="group rounded-xl border border-slate-200 bg-white">
              <summary class="flex cursor-pointer list-none items-center justify-between px-3 py-2.5">
                <span class="flex items-center gap-2">
                  <span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-r from-purple-600 to-pink-500 text-white">
                    <Shield size={13} />
                  </span>
                  <span class="text-sm font-semibold text-slate-800">Ultra Secure Checkout</span>
                </span>
                <span class="text-slate-400 transition group-open:rotate-180">⌄</span>
              </summary>
              <p class="px-3 pb-3 text-xs text-slate-600">
                Fast, seamless checkout secured with advanced encryption and continuous monitoring.
                Backed by TrustGuard and anti-fraud partners, with extra verification for
                PCI-DSS-secure payment methods.
              </p>
            </details>
          </div>
        </div>
      </aside>
    </div>
  </main>

  {#if showFeaturesGuide}
    <div
      class="activation-guide-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-5 sm:py-6"
      role="presentation"
      on:click={(event) => {
        if (event.target === event.currentTarget) {
          showFeaturesGuide = false;
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="features-guide-title"
        class="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_30px_70px_rgba(15,23,42,0.32)]"
      >
        <header class="border-b border-slate-200 bg-white px-4 py-4 sm:px-6 sm:py-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 id="features-guide-title" class="text-xl font-semibold tracking-tight text-slate-900">
                Included features
              </h2>
              <p class="mt-1 text-sm text-slate-600">
                Everything included with this product plan.
              </p>
            </div>
            <button
              type="button"
              class="rounded-full border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
              aria-label="Close features"
              on:click={() => (showFeaturesGuide = false)}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div class="max-h-[60vh] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {#if selectedFeatures.length > 0}
            <ul class="space-y-2">
              {#each selectedFeatures as feature}
                <li class="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm text-slate-700">
                  <Check size={15} class="mt-0.5 shrink-0 text-fuchsia-600" />
                  <span>{feature}</span>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="text-sm text-slate-600">Feature details are not available for this product yet.</p>
          {/if}
        </div>

        <footer class="flex justify-end border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            on:click={() => (showFeaturesGuide = false)}
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  {/if}

  {#if showActivationGuide && hasActivationGuide}
    <div
      class="activation-guide-overlay fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-5 sm:py-6"
      role="presentation"
      on:click={(event) => {
        if (event.target === event.currentTarget) {
          showActivationGuide = false;
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="activation-guide-title"
        class="w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_30px_70px_rgba(15,23,42,0.32)]"
      >
        <header class="border-b border-slate-200 bg-white px-4 py-4 sm:px-6 sm:py-5">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 id="activation-guide-title" class="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                {platformLabel || product.name}
              </h2>
              <p class="mt-1 text-sm text-slate-600">
                Follow these steps to activate your plan quickly and correctly.
              </p>
            </div>
            <button
              type="button"
              class="rounded-full border border-slate-200 bg-white p-1.5 text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
              aria-label="Close activation guide"
              on:click={() => (showActivationGuide = false)}
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div class="max-h-[68vh] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {#if activationGuideSteps.length > 0}
            <ol class="space-y-3">
              {#each activationGuideSteps as step, index}
                <li class="guide-step rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-3.5 sm:px-4 sm:py-4">
                  <div class="flex items-start gap-3">
                    <span class="guide-step-index inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-slate-900">
                      {index + 1}
                    </span>
                    <div class="min-w-0">
                      <p class="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Step {index + 1}
                      </p>
                      <p class="mt-1 text-sm leading-relaxed text-slate-700">{step}</p>
                    </div>
                  </div>
                </li>
              {/each}
            </ol>
          {:else}
            <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p class="text-sm leading-relaxed text-slate-700">{activationGuideText}</p>
            </div>
          {/if}
        </div>

        <footer class="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <p class="text-xs text-slate-500">
            If you need help, contact support and include your order number.
          </p>
          <button
            type="button"
            class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
            on:click={() => (showActivationGuide = false)}
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  {/if}

  <Footer />
</div>

<style>
  .live-dot {
    width: 10px;
    height: 10px;
    border-radius: 9999px;
    background: #22c55e;
    box-shadow: 0 0 0 rgba(34, 197, 94, 0.6);
    animation: livePulse 1.8s ease-in-out infinite;
  }

  @keyframes livePulse {
    0% {
      opacity: 0.45;
      transform: scale(0.95);
      box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5);
    }
    50% {
      opacity: 1;
      transform: scale(1);
      box-shadow: 0 0 0 7px rgba(34, 197, 94, 0);
    }
    100% {
      opacity: 0.45;
      transform: scale(0.95);
      box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
    }
  }

  .gradient-outline-btn {
    border: 1px solid transparent;
    background:
      linear-gradient(#ffffff, #ffffff) padding-box,
      linear-gradient(90deg, #7e22ce, #db2777) border-box;
  }

  .gradient-outline-darkbtn {
    border: 1px solid transparent;
    background:
      linear-gradient(#ffffff, #ffffff) padding-box,
      linear-gradient(90deg, #7e22ce, #db2777) border-box;
    color: #0f172a;
  }

  .gradient-text {
    background: linear-gradient(90deg, #7e22ce, #db2777);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .info-box-content :global(strong) {
    font-weight: 700;
    color: #0f172a;
  }

  .info-leading-icon {
    color: #c026d3;
  }

  .activation-guide-overlay {
    backdrop-filter: blur(5px);
  }

  .guide-step {
    position: relative;
  }

  .guide-step-index {
    background:
      linear-gradient(#ffffff, #ffffff) padding-box,
      linear-gradient(135deg, #7e22ce, #db2777, #f472b6) border-box;
    border: 1px solid transparent;
  }

  .guide-step:not(:last-child)::after {
    content: '';
    position: absolute;
    left: 1.95rem;
    top: 3.05rem;
    bottom: -0.95rem;
    width: 1px;
    background: linear-gradient(180deg, rgba(148, 163, 184, 0.52), rgba(226, 232, 240, 0.15));
  }
</style>
