<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import HomeNav from '$lib/components/home/HomeNav.svelte';
  import Footer from '$lib/components/home/Footer.svelte';
  import UpgradeSelectionForm from '$lib/components/subscription/UpgradeSelectionForm.svelte';
  import { cart } from '$lib/stores/cart.js';
  import { cartSidebar } from '$lib/stores/cartSidebar.js';
  import { formatCurrency, normalizeCurrencyCode } from '$lib/utils/currency.js';
  import { subscriptionService } from '$lib/api/subscriptions.js';
  import { trackAddToCart, trackViewItem } from '$lib/utils/analytics.js';
  import { Shield } from 'lucide-svelte';
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

  let selectedTerms: Record<string, number> = {};
  let termsConditions: string[] = [];
  let upgradeOptions: UpgradeOptions | null = null;
  let upgradeSelectionType: UpgradeSelectionType | '' = '';
  let manualMonthlyAcknowledged = false;
  let selectionError = '';

  $: upgradeOptions = product?.upgrade_options || null;
  $: hasUpgradeSelection =
    Boolean(
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
  const resolveOwnAccountCredentialRequirement = (
    options: UpgradeOptions | null
  ): OwnAccountCredentialRequirement =>
    options?.own_account_credential_requirement === 'email_only'
      ? 'email_only'
      : 'email_and_password';

  $: termsConditions = (() => {
    const normalize = (value: unknown): string[] => {
      if (Array.isArray(value)) {
        return value.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0
        );
      }
      if (typeof value === 'string') {
        return value
          .split(/[\n,]+/)
          .map(item => item.trim())
          .filter(item => item.length > 0);
      }
      return [];
    };

    const fromSnake = normalize((product as { terms_conditions?: unknown })?.terms_conditions);
    if (fromSnake.length > 0) return fromSnake;
    const fromCamel = normalize((product as { termsConditions?: unknown })?.termsConditions);
    if (fromCamel.length > 0) return fromCamel;
    return normalize((product as { terms?: unknown })?.terms);
  })();

  const resolveDefaultTerm = (variant: ProductVariantOption): ProductTermOption | null => {
    if (!Array.isArray(variant.term_options) || variant.term_options.length === 0) {
      return null;
    }
    const recommended = variant.term_options.find(term => term.is_recommended);
    return recommended || variant.term_options[0] || null;
  };

  const normalizeMonths = (value: unknown): number | null => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  $: if (variants.length > 0) {
    const nextTerms = { ...selectedTerms };
    let changed = false;
    for (const variant of variants) {
      if (!nextTerms[variant.id]) {
        const defaultTerm = resolveDefaultTerm(variant);
        const months = defaultTerm ? normalizeMonths(defaultTerm.months) : null;
        if (months !== null) {
          nextTerms[variant.id] = months;
          changed = true;
        }
      }
    }
    if (changed) {
      selectedTerms = nextTerms;
    }
  }

  const resolveSelectedTerm = (variant: ProductVariantOption): ProductTermOption | null => {
    const selectedMonths = selectedTerms[variant.id];
    if (!Array.isArray(variant.term_options) || variant.term_options.length === 0) {
      return null;
    }
    return (
      variant.term_options.find(
        term => normalizeMonths(term.months) === selectedMonths
      ) ||
      resolveDefaultTerm(variant)
    );
  };

  const handleSelectTerm = (variantId: string, months: number) => {
    const normalized = normalizeMonths(months);
    if (normalized === null) return;
    selectedTerms = { ...selectedTerms, [variantId]: normalized };
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
        autoRenew: true,
        selectionType: upgradeSelectionType,
      }),
      serviceType: product.service_type || product.slug || product.name,
      serviceName: product.name,
      plan: variant.display_name || variant.plan_code || variant.name || 'Plan',
      price: term.total_price,
      currency: variant.currency,
      quantity: 1,
      description: variant.description,
      features: variant.features,
      variantId: variant.id,
      termMonths: term.months,
      autoRenew: true,
      upgradeSelectionType: upgradeSelectionType || null,
      ownAccountCredentialRequirement:
        upgradeSelectionType === 'upgrade_own_account'
          ? resolveOwnAccountCredentialRequirement(upgradeOptions)
          : null,
      manualMonthlyAcknowledged: requiresManualAck ? true : manualMonthlyAcknowledged,
    });
    void goto('/checkout');
  };

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
      selection,
    ].join('|');
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
        autoRenew: true,
        selectionType: upgradeSelectionType,
      }),
      serviceType: product.service_type || product.slug || product.name,
      serviceName: product.name,
      plan: variant.display_name || variant.plan_code || variant.name || 'Plan',
      price: term.total_price,
      currency: variant.currency,
      quantity: 1,
      description: variant.description,
      features: variant.features,
      variantId: variant.id,
      termMonths: term.months,
      autoRenew: true,
      upgradeSelectionType: upgradeSelectionType || null,
      ownAccountCredentialRequirement:
        upgradeSelectionType === 'upgrade_own_account'
          ? resolveOwnAccountCredentialRequirement(upgradeOptions)
          : null,
      manualMonthlyAcknowledged: requiresManualAck ? true : manualMonthlyAcknowledged,
    });
    cartSidebar.open();
  };

  const resolveSelectionValidationError = (
    intent: 'add' | 'checkout'
  ): string | null => {
    if (!hasUpgradeSelection) return null;

    const actionLabel =
      intent === 'checkout' ? 'continue' : 'add this item';
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

  const formatTermLabel = (months: number): string => {
    if (months === 1) return '1 month';
    if (months % 12 === 0) {
      const years = months / 12;
      return years === 1 ? '12 months' : `${years * 12} months`;
    }
    return `${months} months`;
  };

  const formatMonthly = (total: number, months: number, currency: string): string => {
    const monthly = months > 0 ? total / months : total;
    const resolved = normalizeCurrencyCode(currency) || 'USD';
    return formatCurrency(monthly, resolved);
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
      item_variant: variant?.display_name || variant?.plan_code || variant?.name || undefined,
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

  let lastViewedProductId = '';
  $: {
    if (browser) {
      const currentId = product?.id || product?.slug || '';
      if (!currentId) {
        lastViewedProductId = '';
      } else if (currentId !== lastViewedProductId) {
        const primaryVariant = variants[0];
        const defaultTerm = primaryVariant
          ? resolveSelectedTerm(primaryVariant) || resolveDefaultTerm(primaryVariant)
          : null;
        const analyticsItem = buildProductItem(primaryVariant, defaultTerm, 'Product Detail');
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

  <div class="border-b border-gray-200 bg-white">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div class="flex items-center gap-2 text-sm text-gray-500">
        <a href="/browse" class="text-cyan-600 font-semibold">Browse</a>
        <span>/</span>
        <span class="text-gray-800 font-semibold">{product.name}</span>
      </div>
      <h1 class="mt-2 text-2xl font-semibold text-gray-900">{product.name}</h1>
      {#if product.description}
        <p class="mt-1 text-sm text-gray-600 max-w-3xl">{product.description}</p>
      {/if}
    </div>
  </div>

  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    {#if hasUpgradeSelection && upgradeOptions}
      <section class="mb-6">
        <div class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <UpgradeSelectionForm
            upgradeOptions={upgradeOptions}
            title="Choose your upgrade option"
            description="Select how you want us to complete this upgrade. We'll collect any account credentials after checkout."
            locked={false}
            submitting={false}
            errorMessage={selectionError}
            includeCredentials={false}
            showSubmit={false}
            requireManualAck={false}
            bind:selectionType={upgradeSelectionType}
            bind:manualMonthlyAcknowledged
          />
        </div>
      </section>
    {/if}

    <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {#each variants as variant}
        {@const selectedMonths = selectedTerms[variant.id]}
        {@const selectedTerm = Array.isArray(variant.term_options)
          ? variant.term_options.find(term => normalizeMonths(term.months) === selectedMonths) ||
            resolveDefaultTerm(variant)
          : null}
        {@const hasBadges = variant.badges && variant.badges.length > 0}
        {@const variantDescription = (variant.description || '').trim()}
        {@const resolvedCurrency = normalizeCurrencyCode(variant.currency) || 'USD'}
        {@const canProceed = Boolean(selectedTerm)}
        <div class="relative rounded-xl border border-gray-200 bg-white shadow-sm p-3 flex flex-col gap-3">
          {#if hasBadges}
            <div class="absolute left-1/2 -top-3 -translate-x-1/2">
              <div class="flex flex-wrap justify-center gap-1">
                {#each variant.badges as badge}
                  <span class="rounded-full border border-white/60 bg-gradient-to-r from-cyan-500 via-fuchsia-500 to-pink-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-lg">
                    {badge}
                  </span>
                {/each}
              </div>
            </div>
          {/if}
          <div class="rounded-lg bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 p-3 shadow-sm">
            <h2 class="inline-block text-base font-semibold bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-pink-500 bg-clip-text text-transparent">
              {variant.display_name}
            </h2>
            {#if variantDescription}
              <p class="text-sm text-white mt-1">{variantDescription}</p>
            {/if}
          </div>

          {#if variant.features && variant.features.length > 0}
            <div class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <p class="text-[11px] font-semibold uppercase text-gray-500">Features</p>
              <ul class="mt-2 grid gap-1.5 text-xs text-gray-700">
                {#each variant.features as feature}
                  <li class="flex items-start gap-2">
                    <span class="mt-1 h-2 w-2 rounded-full bg-cyan-500"></span>
                    <span>{feature}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}

          <div class="rounded-lg border border-gray-200 px-3 py-2">
            <p class="text-[11px] font-semibold text-gray-700">Choose a duration</p>
            <div class="mt-2 grid gap-2">
              {#each variant.term_options as term}
                {@const discountLabel =
                  term.discount_percent && term.discount_percent > 0
                    ? `${term.discount_percent}% off`
                    : ''}
                {@const recommendedLabel = term.is_recommended ? 'Recommended' : ''}
                <button
                  type="button"
                  class={`w-full rounded-md border px-3 py-1.5 text-left transition ${
                    normalizeMonths(term.months) === selectedMonths
                      ? 'border-cyan-500 bg-cyan-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  on:click={() => handleSelectTerm(variant.id, term.months)}
                >
                  <div class="flex items-center justify-between gap-2">
                    <div>
                      <p class="text-sm font-semibold text-gray-900">{formatTermLabel(term.months)}</p>
                      <p class="text-[11px] text-gray-500">
                        {formatMonthly(term.total_price, term.months, variant.currency)} / month
                      </p>
                    </div>
                    <div class="text-right flex flex-col items-end justify-center min-h-[36px]">
                      <p class="text-sm font-semibold text-gray-900">
                        {formatCurrency(term.total_price, resolvedCurrency)}
                      </p>
                      {#if discountLabel || recommendedLabel}
                        <p class="text-[11px] font-semibold">
                          {#if discountLabel}
                            <span class="text-emerald-600">{discountLabel}</span>
                          {/if}
                          {#if discountLabel && recommendedLabel}
                            <span class="text-slate-400"> · </span>
                          {/if}
                          {#if recommendedLabel}
                            <span class="text-cyan-600">{recommendedLabel}</span>
                          {/if}
                        </p>
                      {/if}
                    </div>
                  </div>
                </button>
              {/each}
            </div>
          </div>

          <div class="mt-auto flex items-center justify-between pt-2 border-t border-gray-200">
            <div>
              <p class="text-[11px] text-gray-500">Selected total</p>
              <p class="text-sm font-semibold text-gray-900">
                {selectedTerm ? formatCurrency(selectedTerm.total_price, resolvedCurrency) : '--'}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                on:click={() => handleAddToCart(variant)}
                disabled={!canProceed}
              >
                ADD TO CART
              </button>
              <button
                type="button"
                class="rounded-md bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
                on:click={() => handleCheckoutNow(variant)}
                disabled={!canProceed}
              >
                BUY NOW
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <section class="mt-8">
      <div class="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gradient-to-r from-cyan-50 via-white to-pink-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-start gap-3">
          <span class="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-semibold text-cyan-700">
            <Shield size={14} class="text-cyan-700" />
            Warranty
          </span>
          <p class="text-sm text-gray-700">
            Your order is covered under our Warranty Policy. We offer replacements or appropriate resolutions for non-functional items or related issues.
          </p>
        </div>
      </div>
    </section>

    {#if termsConditions.length > 0}
      <section class="mt-8">
        <div class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 class="text-lg font-semibold text-gray-900">Terms & Conditions</h3>
          <ul class="mt-3 list-disc space-y-2 pl-5 text-sm text-gray-600">
            {#each termsConditions as term}
              <li>{term}</li>
            {/each}
          </ul>
        </div>
      </section>
    {/if}
  </main>

  <Footer />
</div>
