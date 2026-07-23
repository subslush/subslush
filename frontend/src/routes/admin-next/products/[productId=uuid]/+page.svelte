<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import AdminCard from '$lib/components/admin-next/AdminCard.svelte';
  import ErrorBanner from '$lib/components/admin-next/ErrorBanner.svelte';
  import StatusChip from '$lib/components/admin-next/StatusChip.svelte';
  import { adminService } from '$lib/api/admin.js';
  import { logoKeys } from '$lib/assets/logoRegistry.js';
  import { formatMoney } from '$lib/utils/adminNext.js';
  import type { AdminNextUpgradeOptionsSnapshot } from '$lib/types/adminNext.js';
  import type { PageData } from './$types';

  export let data: PageData;

  const tabs = ['Basics', 'Fixed Catalog Fields', 'Catalog', 'Pricing', 'Media', 'Fulfillment settings'];
  let activeTab = 'Basics';
  let actionError = '';
  let actionMessage = '';
  let saving = false;
  let product = structuredClone(data.product);
  let legacyCompatibility = structuredClone(data.legacyCompatibility);
  let newMedia = { product_id: data.product.id, media_type: 'image' as 'image' | 'video', url: '', alt_text: '', is_primary: false };
  let categoryCsv = (data.product.categories || [data.product.category].filter(Boolean)).join(', ');
  let selectedSubCategoryIds = [...(data.product.sub_category_ids || [])];
  let labelId = '';
  let newLabel = { name: '', slug: '', description: '', color: '#64748b' };
  let newSubCategory = { category: '', name: '', slug: '' };
  let presentation: Record<string, any> = structuredClone(data.product.metadata || {});

  const metadataComparisonPrice = (metadata: Record<string, unknown> | null | undefined): string => {
    const value = metadata?.comparison_price_cents ?? metadata?.comparisonPriceCents ?? metadata?.compare_at_price_cents;
    return typeof value === 'number' || typeof value === 'string' ? String(value) : '';
  };

  let fixedDraft = {
    duration_months: Number(data.product.duration_months || 1),
    fixed_price_cents: data.product.fixed_price_cents ? String(data.product.fixed_price_cents) : '',
    fixed_price_currency: data.product.fixed_price_currency || data.product.default_currency || 'USD',
    comparison_price_cents: metadataComparisonPrice(data.product.metadata),
  };
  let priceDraft = {
    price_cents: fixedDraft.fixed_price_cents,
    currency: fixedDraft.fixed_price_currency,
    comparison_price_cents: fixedDraft.comparison_price_cents,
  };

  type ProductMetadata = {
    upgrade_options?: AdminNextUpgradeOptionsSnapshot;
    upgradeOptions?: AdminNextUpgradeOptionsSnapshot;
  };

  $: metadata = (product.metadata || {}) as ProductMetadata;
  $: upgradeOptions = metadata.upgrade_options || metadata.upgradeOptions || {};
  $: termsPreview = buildPreview(Number(upgradeOptions.manual_monthly_upgrade_interval_months || 1));

  const setOptions = (updates: Record<string, unknown>) => {
    product.metadata = {
      ...(product.metadata || {}),
      upgrade_options: { ...upgradeOptions, ...updates },
    };
  };
  const setOption = (key: string, value: unknown) => setOptions({ [key]: value });

  const buildPreview = (interval: number) => {
    const safeInterval = Number.isFinite(interval) && interval > 0 ? Math.floor(interval) : 1;
    const duration = Number(fixedDraft.duration_months || 1);
    const chunks: string[] = [];
    for (let start = 1; start <= duration; start += safeInterval) {
      const end = Math.min(duration, start + safeInterval - 1);
      chunks.push(start === end ? `Month ${start}` : `Months ${start}-${end}`);
    }
    return `For this ${duration}-month product: initial delivery covers ${chunks[0]}, then renewal tasks are created for ${chunks.slice(1).join(', ') || 'no later cycles'}.`;
  };

  const beginAction = () => {
    actionError = '';
    actionMessage = '';
    saving = true;
  };
  const finishAction = () => (saving = false);
  const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

  const validateFixed = (priceValue = fixedDraft.fixed_price_cents, comparisonValue = fixedDraft.comparison_price_cents) => {
    const duration = Number(fixedDraft.duration_months);
    const price = Number(priceValue);
    const comparison = comparisonValue === '' ? null : Number(comparisonValue);
    if (!Number.isInteger(duration) || duration < 1) return 'Duration must be a positive whole number of months.';
    if (!Number.isInteger(price) || price < 1) return 'Fixed price must be a positive whole number of cents.';
    if (!fixedDraft.fixed_price_currency) return 'Select a fixed price currency.';
    if (comparison !== null && (!Number.isInteger(comparison) || comparison <= price)) return 'Comparison price must be a whole number of cents greater than the fixed price.';
    const interval = Number(upgradeOptions.manual_monthly_upgrade_interval_months || 1);
    if (upgradeOptions.manual_monthly_upgrade === true && duration % interval !== 0) return 'Duration must be divisible by the manual monthly upgrade interval.';
    return '';
  };

  const metadataWithComparison = (comparisonValue: string, currency: string) => {
    const next = { ...(product.metadata || {}) } as Record<string, unknown>;
    delete next.comparisonPriceCents;
    delete next.compare_at_price_cents;
    delete next.compareAtPriceCents;
    if (comparisonValue === '') {
      delete next.comparison_price_cents;
      delete next.comparison_price_currency;
    } else {
      next.comparison_price_cents = Number(comparisonValue);
      next.comparison_price_currency = currency;
    }
    return next;
  };

  const saveProduct = async () => {
    beginAction();
    try {
      product.metadata = {
        ...(product.metadata || {}),
        platform: presentation.platform || '',
        region: presentation.region || '',
      };
      const updated = await adminService.updateProduct(product.id, {
        name: product.name,
        slug: product.slug,
        description: product.description ?? null,
        service_type: product.service_type ?? null,
        logo_key: product.logo_key ?? null,
        category: product.category ?? null,
        sub_category: product.sub_category ?? null,
        default_currency: product.default_currency ?? null,
        max_subscriptions: product.max_subscriptions ?? null,
        status: product.status,
        metadata: product.metadata,
      });
      product = { ...product, ...updated };
      actionMessage = product.status === 'active' ? 'Product saved and published.' : 'Product draft saved.';
      await invalidateAll();
    } catch (error) {
      actionError = errorMessage(error, 'Failed to save product.');
    } finally { finishAction(); }
  };

  const saveFixedFields = async () => {
    actionError = validateFixed();
    actionMessage = '';
    if (actionError) return;
    beginAction();
    try {
      const nextMetadata = metadataWithComparison(fixedDraft.comparison_price_cents, fixedDraft.fixed_price_currency);
      await adminService.setCurrentFixedProductPrice(product.id, {
        duration_months: Number(fixedDraft.duration_months),
        price_cents: Number(fixedDraft.fixed_price_cents),
        currency: fixedDraft.fixed_price_currency,
        comparison_price_cents: fixedDraft.comparison_price_cents === '' ? null : Number(fixedDraft.comparison_price_cents),
      });
      product = {
        ...product,
        duration_months: Number(fixedDraft.duration_months),
        fixed_price_cents: Number(fixedDraft.fixed_price_cents),
        fixed_price_currency: fixedDraft.fixed_price_currency,
        default_currency: product.default_currency || fixedDraft.fixed_price_currency,
        metadata: nextMetadata,
      };
      presentation = structuredClone(nextMetadata);
      priceDraft = {
        price_cents: fixedDraft.fixed_price_cents,
        currency: fixedDraft.fixed_price_currency,
        comparison_price_cents: fixedDraft.comparison_price_cents,
      };
      actionMessage = 'Fixed Catalog Fields saved. Price history was updated.';
      await invalidateAll();
    } catch (error) {
      actionError = errorMessage(error, 'Failed to save Fixed Catalog Fields.');
    } finally { finishAction(); }
  };

  const setPrice = async () => {
    if (!Number.isInteger(Number(product.duration_months)) || Number(product.duration_months) < 1) {
      actionError = 'Save a valid duration in Fixed Catalog Fields before updating price history.';
      actionMessage = '';
      return;
    }
    fixedDraft.fixed_price_currency = priceDraft.currency;
    actionError = validateFixed(priceDraft.price_cents, priceDraft.comparison_price_cents);
    actionMessage = '';
    if (actionError) return;
    beginAction();
    try {
      await adminService.setCurrentFixedProductPrice(product.id, {
        price_cents: Number(priceDraft.price_cents),
        currency: priceDraft.currency,
        comparison_price_cents: priceDraft.comparison_price_cents === '' ? null : Number(priceDraft.comparison_price_cents),
      });
      fixedDraft.fixed_price_cents = priceDraft.price_cents;
      fixedDraft.fixed_price_currency = priceDraft.currency;
      fixedDraft.comparison_price_cents = priceDraft.comparison_price_cents;
      product.fixed_price_cents = Number(priceDraft.price_cents);
      product.fixed_price_currency = priceDraft.currency;
      product.metadata = metadataWithComparison(priceDraft.comparison_price_cents, priceDraft.currency);
      actionMessage = 'Current fixed price saved. The previous price remains in history.';
      await invalidateAll();
    } catch (error) {
      actionError = errorMessage(error, 'Failed to save current fixed price.');
    } finally { finishAction(); }
  };

  const recoverFixedCatalog = async () => {
    if (!confirm('Switch this product to its fixed catalog configuration? Historical records will be preserved and active legacy catalog rows will be deactivated.')) return;
    beginAction();
    try {
      const result = await adminService.recoverFixedCatalog(product.id);
      legacyCompatibility = result.compatibility;
      actionMessage = result.already_product_only
        ? 'This product already uses fixed catalog mode.'
        : `Fixed catalog mode restored. ${result.deactivated_variant_count} legacy catalog row${result.deactivated_variant_count === 1 ? '' : 's'} deactivated; historical evidence was preserved.`;
      await invalidateAll();
    } catch (error) {
      actionError = errorMessage(error, 'Failed to restore fixed catalog mode.');
    } finally { finishAction(); }
  };

  const addMedia = async () => {
    beginAction();
    try {
      await adminService.createMedia(newMedia);
      newMedia = { product_id: data.product.id, media_type: 'image', url: '', alt_text: '', is_primary: false };
      actionMessage = 'Media added.';
      await invalidateAll();
    } catch (error) { actionError = errorMessage(error, 'Failed to add media.'); }
    finally { finishAction(); }
  };

  const saveCatalog = async () => {
    beginAction();
    try {
      product.categories = categoryCsv.split(',').map(value => value.trim()).filter(Boolean);
      product.sub_category_ids = selectedSubCategoryIds;
      product.metadata = {
        ...(product.metadata || {}),
        platform: presentation.platform,
        region: presentation.region,
        info_box_text: presentation.info_box_text,
        activation_guide: presentation.activation_guide,
        delivery_format_label: presentation.delivery_format_label,
        delivery_format_description: presentation.delivery_format_description,
        features: presentation.features,
        extra_features: presentation.extra_features,
      };
      const updated = await adminService.updateProduct(product.id, {
        categories: product.categories,
        sub_category_ids: product.sub_category_ids,
        metadata: product.metadata,
      });
      product = { ...product, ...updated };
      actionMessage = 'Catalog settings saved.';
      await invalidateAll();
    } catch (error) { actionError = errorMessage(error, 'Failed to save catalog settings.'); }
    finally { finishAction(); }
  };

  const createLabel = async () => {
    beginAction();
    try { await adminService.createLabel(newLabel); newLabel = { name: '', slug: '', description: '', color: '#64748b' }; actionMessage = 'Label created.'; await invalidateAll(); }
    catch (error) { actionError = errorMessage(error, 'Failed to create label.'); }
    finally { finishAction(); }
  };
  const assignLabel = async () => {
    if (!labelId) return;
    beginAction();
    try { await adminService.attachProductLabel(product.id, labelId); actionMessage = 'Label assigned.'; await invalidateAll(); }
    catch (error) { actionError = errorMessage(error, 'Failed to assign label.'); }
    finally { finishAction(); }
  };
  const removeLabel = async (id: string) => {
    beginAction();
    try { await adminService.detachProductLabel(product.id, id); actionMessage = 'Label removed.'; await invalidateAll(); }
    catch (error) { actionError = errorMessage(error, 'Failed to remove label.'); }
    finally { finishAction(); }
  };
  const createSubCategory = async () => {
    beginAction();
    try {
      await adminService.createProductSubCategory({ category: newSubCategory.category.trim(), name: newSubCategory.name.trim(), ...(newSubCategory.slug.trim() ? { slug: newSubCategory.slug.trim() } : {}) });
      newSubCategory = { category: '', name: '', slug: '' };
      actionMessage = 'Sub-category created.';
      await invalidateAll();
    } catch (error) { actionError = errorMessage(error, 'Failed to create sub-category.'); }
    finally { finishAction(); }
  };
</script>

<svelte:head><title>{data.product.name} - Admin Next</title></svelte:head>

<div class="page">
  <a class="back" href="/admin-next/products">← Products</a>
  <header><div><h1>{data.product.name}</h1><p>{data.product.slug}</p></div><StatusChip status={product.status === 'active' ? 'active' : 'draft'} /></header>
  <ErrorBanner message={actionError} />
  {#if actionMessage}<div class="success" role="status">{actionMessage}</div>{/if}

  {#if legacyCompatibility.variant_count > 0}
    <div class="legacy" role="note">
      <div><strong>Legacy compatibility records detected</strong><p>{legacyCompatibility.variant_count} historical catalog row(s), {legacyCompatibility.term_count} term row(s), and {legacyCompatibility.price_history_count} price row(s) remain readable. Orders: {legacyCompatibility.order_item_count}; subscriptions: {legacyCompatibility.subscription_count}; payments: {legacyCompatibility.payment_count}; credits: {legacyCompatibility.credit_transaction_count}.</p></div>
      {#if legacyCompatibility.active_variant_count > 0}<button type="button" disabled={saving} on:click={recoverFixedCatalog}>Restore fixed catalog mode</button>{/if}
    </div>
  {/if}

  <div class="tabs" role="tablist" aria-label="Product settings">{#each tabs as tab}<button role="tab" aria-selected={activeTab === tab} class:active={activeTab === tab} type="button" on:click={() => (activeTab = tab)}>{tab}</button>{/each}</div>

  {#if activeTab === 'Basics'}
    <AdminCard><div class="form">
      <label><span>Name</span><input bind:value={product.name} /></label>
      <label><span>Slug</span><input bind:value={product.slug} /></label>
      <label><span>Status</span><select bind:value={product.status}><option value="inactive">Draft</option><option value="active">Published</option></select><small>Publishing requires valid Fixed Catalog Fields. A variant is never required.</small></label>
      <label><span>Service type</span><input bind:value={product.service_type} /></label>
      <label><span>Category</span><input bind:value={product.category} /></label>
      <label><span>Sub-category</span><input bind:value={product.sub_category} /></label>
      <label><span>Logo key</span><select aria-label="Logo key" bind:value={product.logo_key}><option value="">Select logo (optional)</option>{#each logoKeys as key}<option value={key}>{key}</option>{/each}</select></label>
      <label><span>Platform</span><input bind:value={presentation.platform} placeholder="e.g. Netflix" /></label>
      <label><span>Region</span><input bind:value={presentation.region} placeholder="Global" /></label>
      <label><span>Max subscriptions (informational)</span><input type="number" min="0" bind:value={product.max_subscriptions} /></label>
      <label><span>Default display currency</span><input bind:value={product.default_currency} /></label>
      <label class="wide"><span>Description</span><textarea bind:value={product.description}></textarea></label>
      <button type="button" disabled={saving} on:click={saveProduct}>{saving ? 'Saving…' : 'Save basics'}</button>
    </div></AdminCard>
  {:else if activeTab === 'Fixed Catalog Fields'}
    <AdminCard>
      <h2>Fixed Catalog Fields</h2>
      <p class="hint">This product is one sellable item. Duration is the full entitlement term and fixed price is the full-term charge in minor currency units (for example, 999 = $9.99 USD). Create separate products for separate durations.</p>
      <div class="form">
        <label><span>Duration (months)</span><input aria-describedby="duration-help" required type="number" min="1" step="1" bind:value={fixedDraft.duration_months} /><small id="duration-help">Fixed for every cart, order, subscription, and fulfillment record created from this product.</small></label>
        <label><span>Fixed price (cents)</span><input aria-describedby="fixed-price-help" required type="number" min="1" step="1" bind:value={fixedDraft.fixed_price_cents} /><small id="fixed-price-help">The total current price for the complete duration, not a monthly multiplier.</small></label>
        <label><span>Fixed price currency</span><select aria-describedby="fixed-currency-help" bind:value={fixedDraft.fixed_price_currency}><option value="USD">USD</option></select><small id="fixed-currency-help">USD is canonical; regional display prices are published from this value.</small></label>
        <label><span>Comparison price (cents, optional)</span><input aria-describedby="comparison-help" type="number" min="1" step="1" bind:value={fixedDraft.comparison_price_cents} /><small id="comparison-help">Shown as “was” pricing only when greater than the current fixed price.</small></label>
        <button type="button" disabled={saving} on:click={saveFixedFields}>{saving ? 'Saving…' : 'Save Fixed Catalog Fields'}</button>
      </div>
    </AdminCard>
  {:else if activeTab === 'Catalog'}
    <AdminCard><h2>Taxonomy</h2><div class="form"><label class="wide"><span>Categories (comma-separated)</span><input bind:value={categoryCsv} /></label><label class="wide"><span>Mapped sub-categories</span><select multiple bind:value={selectedSubCategoryIds}>{#each data.subCategories as sub}<option value={sub.id}>{sub.category} · {sub.name}</option>{/each}</select></label><button type="button" disabled={saving} on:click={saveCatalog}>Save taxonomy</button></div></AdminCard>
    <AdminCard><h2>Create sub-category</h2><div class="form compact"><input aria-label="New sub-category category" placeholder="Category" bind:value={newSubCategory.category} /><input aria-label="New sub-category name" placeholder="Name" bind:value={newSubCategory.name} /><input aria-label="New sub-category slug" placeholder="Slug (optional)" bind:value={newSubCategory.slug} /><button type="button" disabled={saving} on:click={createSubCategory}>Create sub-category</button></div></AdminCard>
    <AdminCard><h2>Labels</h2><div class="list">{#each data.labels as label}<p><span>{label.name}</span><button type="button" disabled={saving} on:click={() => removeLabel(label.id)}>Remove</button></p>{:else}<p>No labels assigned.</p>{/each}</div><div class="form compact"><select aria-label="Label to assign" bind:value={labelId}><option value="">Select label</option>{#each data.allLabels as label}<option value={label.id}>{label.name}</option>{/each}</select><button type="button" disabled={saving} on:click={assignLabel}>Assign label</button></div><div class="form compact"><input aria-label="New label name" placeholder="New label name" bind:value={newLabel.name} /><input aria-label="New label slug" placeholder="Slug" bind:value={newLabel.slug} /><input aria-label="New label color" placeholder="Color" bind:value={newLabel.color} /><button type="button" disabled={saving} on:click={createLabel}>Create label</button></div></AdminCard>
    <AdminCard><h2>Public presentation</h2><div class="form"><label><span>Info box</span><textarea bind:value={presentation.info_box_text}></textarea></label><label><span>Activation guide</span><textarea bind:value={presentation.activation_guide}></textarea></label><label><span>Delivery format title</span><input maxlength="160" bind:value={presentation.delivery_format_label} placeholder="Digital account delivery" /></label><label><span>Delivery format details</span><textarea maxlength="1000" bind:value={presentation.delivery_format_description} placeholder="See activation guide for exact fulfillment steps."></textarea></label><label><span>Features (one per line)</span><textarea bind:value={presentation.features}></textarea></label><label><span>Extra features (one per line)</span><textarea bind:value={presentation.extra_features}></textarea></label><button type="button" disabled={saving} on:click={saveCatalog}>Save presentation</button></div></AdminCard>
  {:else if activeTab === 'Pricing'}
    <AdminCard>
      <h2>Fixed product price history</h2>
      <p class="hint">Saving closes the current fixed-price window and creates an audited snapshot. Historical order prices never change.</p>
      <div class="list">{#each data.fixedPriceHistory as price}<p>{formatMoney(Number(price.price_cents ?? price.priceCents ?? 0), price.currency || 'USD')} {price.ends_at || price.endsAt ? '· previous' : '· current'}{#if price.metadata?.comparison_price_cents} · was {formatMoney(Number(price.metadata.comparison_price_cents), String(price.metadata.comparison_price_currency || price.currency || 'USD'))}{/if}</p>{:else}<p>No fixed-price history yet. Save Fixed Catalog Fields first.</p>{/each}</div>
      <div class="form compact"><label><span>Current price (cents)</span><input aria-label="Current fixed price cents" required type="number" min="1" step="1" bind:value={priceDraft.price_cents} /></label><label><span>Currency</span><select aria-label="Current fixed price currency" bind:value={priceDraft.currency}><option value="USD">USD</option></select></label><label><span>Comparison price (optional)</span><input aria-label="Current comparison price cents" type="number" min="1" step="1" bind:value={priceDraft.comparison_price_cents} /></label><button type="button" disabled={saving} on:click={setPrice}>{saving ? 'Saving…' : 'Save current fixed price'}</button></div>
    </AdminCard>
  {:else if activeTab === 'Media'}
    <AdminCard><h2>Media</h2><div class="list">{#each data.media as media}<p>{media.media_type} · {media.url}</p>{:else}<p>No media attached.</p>{/each}</div><div class="form compact"><select aria-label="Media type" bind:value={newMedia.media_type}><option value="image">Image</option><option value="video">Video</option></select><input aria-label="Media URL" placeholder="URL" bind:value={newMedia.url} /><input aria-label="Media alt text" placeholder="Alt text" bind:value={newMedia.alt_text} /><button type="button" disabled={saving} on:click={addMedia}>Add media</button></div></AdminCard>
  {:else}
    <AdminCard><div class="fulfillment">
      <label class="check"><input type="checkbox" checked={upgradeOptions.allow_new_account === true} on:change={(event) => setOption('allow_new_account', event.currentTarget.checked)} /><span><b>New account</b> Admin creates a fresh provider account and delivers its credentials.</span></label>
      <label class="check"><input type="checkbox" checked={upgradeOptions.allow_own_account === true} on:change={(event) => setOption('allow_own_account', event.currentTarget.checked)} /><span><b>Own account</b> Customer submits credentials.</span></label>
      {#if upgradeOptions.allow_own_account}<label><span>Own-account credential requirement</span><select value={upgradeOptions.own_account_credential_requirement || ''} on:change={(event) => setOption('own_account_credential_requirement', event.currentTarget.value || null)}><option value="">Email and password (default)</option><option value="email_and_password">Email and password</option><option value="email_only">Email only</option></select></label>{/if}
      <label class="check"><input type="checkbox" checked={upgradeOptions.manual_monthly_upgrade === true} on:change={(event) => setOption('manual_monthly_upgrade', event.currentTarget.checked)} /><span><b>Manual monthly upgrade (MMU)</b></span></label>
      {#if upgradeOptions.manual_monthly_upgrade}<label><span>Interval (months)</span><input type="number" min="1" max="12" value={upgradeOptions.manual_monthly_upgrade_interval_months || 1} on:input={(event) => setOption('manual_monthly_upgrade_interval_months', Number(event.currentTarget.value))} /><small>Fixed duration must be divisible by the interval.</small><p>{termsPreview}</p></label>{/if}
      <label class="check"><input type="checkbox" checked={upgradeOptions.activation_link_handshake === true} on:change={(event) => setOption('activation_link_handshake', event.currentTarget.checked)} /><span><b>Activation-link handshake</b></span></label>
      {#if upgradeOptions.activation_link_handshake}<label><span>Default instruction template</span><textarea maxlength="4000" value={upgradeOptions.activation_instructions_template || ''} on:input={(event) => setOption('activation_instructions_template', event.currentTarget.value)}></textarea></label>{/if}
      <label class="check"><input type="checkbox" checked={upgradeOptions.strict_rules === true} on:change={(event) => setOption('strict_rules', event.currentTarget.checked)} /><span><b>Strict rules</b></span></label>
      {#if upgradeOptions.strict_rules}<label><span>Rules text</span><textarea maxlength="8000" value={upgradeOptions.strict_rules_text || ''} on:input={(event) => setOptions({ strict_rules_text: event.currentTarget.value, strict_rules_version: Number(upgradeOptions.strict_rules_version || 1) + 1 })}></textarea><small>Customers must accept these rules before credentials are revealed. Acceptance is logged as evidence. Rules are versioned — current: v{upgradeOptions.strict_rules_version || 1}.</small></label>{/if}
      <button type="button" disabled={saving} on:click={saveProduct}>Save fulfillment settings</button>
    </div></AdminCard>
  {/if}
</div>

<style>
  .page { display: grid; gap: 18px; }
  .back { color: #5f5f66; text-decoration: none; font-weight: 700; }
  header { display: flex; justify-content: space-between; gap: 16px; }
  h1, h2, p { margin: 0; } h1 { font-size: 23px; } h2 { margin-bottom: 12px; font-size: 16px; }
  .success { border: 1px solid #bde7ce; border-radius: 10px; background: #e7f6ee; padding: 12px; color: #1a7f45; font-weight: 700; }
  .legacy { display: flex; justify-content: space-between; align-items: center; gap: 16px; border: 1px solid #f0c36d; border-radius: 12px; background: #fff8e7; padding: 14px; color: #664d03; }
  .legacy p { margin-top: 4px; font-size: 13px; }
  .tabs { display: flex; flex-wrap: wrap; gap: 8px; }
  button { min-height: 38px; border: 0; border-radius: 10px; background: #1a1a1c; color: white; padding: 0 14px; font-weight: 750; cursor: pointer; }
  button:disabled { opacity: .55; cursor: not-allowed; }
  .tabs button { background: #fff; color: #5f5f66; border: 1px solid #ececee; }
  .tabs button.active { color: #fff; background: #1a1a1c; border-color: #1a1a1c; }
  .form { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; align-items: end; }
  .compact { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-top: 12px; }
  label { display: grid; gap: 6px; color: #71717a; font-size: 12px; font-weight: 650; }
  .wide { grid-column: 1 / -1; }
  input, select, textarea { min-height: 38px; border: 1px solid #dedee4; border-radius: 10px; padding: 8px 10px; font: inherit; background: white; }
  textarea { min-height: 100px; resize: vertical; }
  .list { display: grid; gap: 8px; color: #1a1a1c; }
  .list p { padding: 8px 0; border-bottom: 1px solid #ececee; }
  .hint { color: #5f5f66; margin-bottom: 14px; line-height: 1.5; }
  .fulfillment { display: grid; gap: 14px; }
  .check { grid-template-columns: 18px 1fr; align-items: start; border: 1px solid #ececee; border-radius: 10px; padding: 12px; color: #1a1a1c; }
  small { color: #71717a; font-size: 12px; line-height: 1.35; }
  @media (max-width: 900px) { .form, .compact { grid-template-columns: 1fr; } .legacy { align-items: stretch; flex-direction: column; } }
</style>
