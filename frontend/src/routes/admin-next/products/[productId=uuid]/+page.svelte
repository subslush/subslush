<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import AdminCard from '$lib/components/admin-next/AdminCard.svelte';
  import ErrorBanner from '$lib/components/admin-next/ErrorBanner.svelte';
  import StatusChip from '$lib/components/admin-next/StatusChip.svelte';
  import { adminService } from '$lib/api/admin.js';
  import { formatMoney } from '$lib/utils/adminNext.js';
  import type { AdminNextUpgradeOptionsSnapshot } from '$lib/types/adminNext.js';
  import type { PageData } from './$types';

  export let data: PageData;

  const tabs = ['Basics', 'Catalog', 'Variants & Terms', 'Pricing', 'Media', 'Fulfillment settings'];
  let activeTab = 'Basics';
  let actionError = '';
  let actionMessage = '';
  let product = structuredClone(data.product);
  let newVariant = { name: '', variant_code: '', service_plan: '', is_active: true, product_id: data.product.id };
  let newTerm = { product_variant_id: data.variants[0]?.id || '', months: 1, discount_percent: 0, is_active: true };
  let newPrice = { product_variant_id: data.variants[0]?.id || '', price_cents: 0, currency: data.product.default_currency || 'USD' };
  let newMedia = { product_id: data.product.id, media_type: 'image' as 'image' | 'video', url: '', alt_text: '', is_primary: false };
  let categoryCsv = (data.product.categories || [data.product.category].filter(Boolean)).join(', ');
  let selectedSubCategoryIds = [...(data.product.sub_category_ids || [])];
  let labelId = '';
  let newLabel = { name: '', slug: '', description: '', color: '#64748b' };
  let newSubCategory = { category: '', name: '', slug: '' };
  let presentation: Record<string, any> = structuredClone(data.product.metadata || {});

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
      upgrade_options: {
        ...upgradeOptions,
        ...updates,
      },
    };
  };

  const setOption = (key: string, value: unknown) => setOptions({ [key]: value });

  const buildPreview = (interval: number) => {
    const safeInterval = Number.isFinite(interval) && interval > 0 ? Math.floor(interval) : 1;
    const chunks: string[] = [];
    for (let start = 1; start <= 12; start += safeInterval) {
      const end = Math.min(12, start + safeInterval - 1);
      chunks.push(start === end ? `Month ${start}` : `Months ${start}-${end}`);
    }
    return `For a 12-month term: initial delivery covers ${chunks[0]}, then renewal tasks are created for ${chunks.slice(1).join(', ')}.`;
  };

  const saveProduct = async () => {
    actionError = ''; actionMessage = '';
    try {
      await adminService.updateProduct(product.id, product);
      actionMessage = 'Product saved.';
      await invalidateAll();
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to save product.';
    }
  };

  const createVariant = async () => {
    actionError = ''; actionMessage = '';
    try {
      const variant = await adminService.createVariant(newVariant);
      newVariant = { name: '', variant_code: '', service_plan: '', is_active: true, product_id: data.product.id };
      newTerm = { ...newTerm, product_variant_id: variant.id };
      newPrice = { ...newPrice, product_variant_id: variant.id };
      actionMessage = 'Variant created.';
      await invalidateAll();
    }
    catch (error) { actionError = error instanceof Error ? error.message : 'Failed to create variant.'; }
  };

  const createTerm = async () => {
    actionError = ''; actionMessage = '';
    if (!newTerm.product_variant_id) {
      actionError = 'Select a variant before adding a term.';
      return;
    }
    try { await adminService.createVariantTerm(newTerm); actionMessage = 'Term created.'; await invalidateAll(); }
    catch (error) { actionError = error instanceof Error ? error.message : 'Failed to create term.'; }
  };

  const setPrice = async () => {
    actionError = ''; actionMessage = '';
    if (!newPrice.product_variant_id) {
      actionError = 'Select a variant before saving a price.';
      return;
    }
    try { await adminService.setCurrentPrice({ ...newPrice, end_previous: true }); actionMessage = 'Current price saved.'; await invalidateAll(); }
    catch (error) { actionError = error instanceof Error ? error.message : 'Failed to set price.'; }
  };

  const submitAction = (action: () => Promise<void>) => (event: SubmitEvent) => {
    event.preventDefault();
    void action();
  };

  const addMedia = async () => {
    actionError = '';
    try { await adminService.createMedia(newMedia); newMedia = { product_id: data.product.id, media_type: 'image', url: '', alt_text: '', is_primary: false }; await invalidateAll(); }
    catch (error) { actionError = error instanceof Error ? error.message : 'Failed to add media.'; }
  };

  const saveCatalog = async () => {
    actionError = ''; actionMessage = '';
    try {
      product.categories = categoryCsv.split(',').map(value => value.trim()).filter(Boolean);
      product.sub_category_ids = selectedSubCategoryIds;
      product.metadata = presentation;
      await adminService.updateProduct(product.id, product);
      actionMessage = 'Catalog settings saved.';
      await invalidateAll();
    } catch (error) { actionError = error instanceof Error ? error.message : 'Failed to save catalog settings.'; }
  };

  const createLabel = async () => {
    actionError = '';
    try { await adminService.createLabel(newLabel); newLabel = { name: '', slug: '', description: '', color: '#64748b' }; actionMessage = 'Label created.'; await invalidateAll(); }
    catch (error) { actionError = error instanceof Error ? error.message : 'Failed to create label.'; }
  };
  const assignLabel = async () => {
    if (!labelId) return;
    try { await adminService.attachProductLabel(product.id, labelId); actionMessage = 'Label assigned.'; await invalidateAll(); }
    catch (error) { actionError = error instanceof Error ? error.message : 'Failed to assign label.'; }
  };
  const removeLabel = async (id: string) => {
    try { await adminService.detachProductLabel(product.id, id); actionMessage = 'Label removed.'; await invalidateAll(); }
    catch (error) { actionError = error instanceof Error ? error.message : 'Failed to remove label.'; }
  };
  const createSubCategory = async () => {
    try { await adminService.createProductSubCategory(newSubCategory); newSubCategory = { category: '', name: '', slug: '' }; actionMessage = 'Sub-category created.'; await invalidateAll(); }
    catch (error) { actionError = error instanceof Error ? error.message : 'Failed to create sub-category.'; }
  };
  const toggleVariant = async (variant: any) => {
    try { await adminService.updateVariant(variant.id, { is_active: !variant.is_active }); await invalidateAll(); }
    catch (error) { actionError = error instanceof Error ? error.message : 'Failed to update variant.'; }
  };
  const deleteVariant = async (variant: any) => {
    if (!confirm(`Delete ${variant.name}?`)) return;
    try { await adminService.deleteVariant(variant.id); await invalidateAll(); }
    catch (error) { actionError = error instanceof Error ? error.message : 'Failed to delete variant.'; }
  };
  const toggleTerm = async (term: any, field: 'is_active' | 'is_recommended') => {
    try { await adminService.updateVariantTerm(term.id, { [field]: !term[field] }); await invalidateAll(); }
    catch (error) { actionError = error instanceof Error ? error.message : 'Failed to update term.'; }
  };
  const deleteTerm = async (term: any) => {
    if (!confirm(`Delete the ${term.months}-month term?`)) return;
    try { await adminService.deleteVariantTerm(term.id); await invalidateAll(); }
    catch (error) { actionError = error instanceof Error ? error.message : 'Failed to delete term.'; }
  };
</script>

<svelte:head><title>{data.product.name} - Admin Next</title></svelte:head>

<div class="page">
  <a class="back" href="/admin-next/products">← Products</a>
  <header><div><h1>{data.product.name}</h1><p>{data.product.slug}</p></div><StatusChip status={data.product.status === 'active' ? 'active' : 'draft'} /></header>
  <ErrorBanner message={actionError} />
  {#if actionMessage}<div class="success">{actionMessage}</div>{/if}

  <div class="tabs">{#each tabs as tab}<button class:active={activeTab === tab} type="button" on:click={() => (activeTab = tab)}>{tab}</button>{/each}</div>

  {#if activeTab === 'Basics'}
    <AdminCard><div class="form">
      <label><span>Name</span><input bind:value={product.name} /></label>
      <label><span>Slug</span><input bind:value={product.slug} /></label>
      <label><span>Status</span><select bind:value={product.status}><option value="inactive">Draft</option><option value="active">Active</option></select></label>
      <label><span>Service type</span><input bind:value={product.service_type} /></label>
      <label><span>Category</span><input bind:value={product.category} /></label>
      <label><span>Sub-category</span><input bind:value={product.sub_category} /></label>
      <label><span>Logo key</span><input bind:value={product.logo_key} placeholder="e.g. netflix" /></label>
      <label><span>Platform</span><input bind:value={presentation.platform} placeholder="e.g. Netflix" /></label>
      <label><span>Region</span><input bind:value={presentation.region} placeholder="Global" /></label>
      <label><span>Max subscriptions (informational)</span><input type="number" min="0" bind:value={product.max_subscriptions} /></label>
      <label><span>Default currency</span><input bind:value={product.default_currency} /></label>
      <label class="wide"><span>Description</span><textarea bind:value={product.description}></textarea></label>
      <button type="button" on:click={saveProduct}>Save basics</button>
    </div></AdminCard>
  {:else if activeTab === 'Catalog'}
    <AdminCard><h2>Taxonomy</h2><div class="form"><label class="wide"><span>Categories (comma-separated)</span><input bind:value={categoryCsv} /></label><label class="wide"><span>Mapped sub-categories</span><select multiple bind:value={selectedSubCategoryIds}>{#each data.subCategories as sub}<option value={sub.id}>{sub.category} · {sub.name}</option>{/each}</select></label><button type="button" on:click={saveCatalog}>Save taxonomy</button></div></AdminCard>
    <AdminCard><h2>Create sub-category</h2><div class="form compact"><input placeholder="Category" bind:value={newSubCategory.category} /><input placeholder="Name" bind:value={newSubCategory.name} /><input placeholder="Slug (optional)" bind:value={newSubCategory.slug} /><button type="button" on:click={createSubCategory}>Create sub-category</button></div></AdminCard>
    <AdminCard><h2>Labels</h2><div class="list">{#each data.labels as label}<p><span>{label.name}</span><button type="button" on:click={() => removeLabel(label.id)}>Remove</button></p>{:else}<p>No labels assigned.</p>{/each}</div><div class="form compact"><select bind:value={labelId}><option value="">Select label</option>{#each data.allLabels as label}<option value={label.id}>{label.name}</option>{/each}</select><button type="button" on:click={assignLabel}>Assign label</button></div><div class="form compact"><input placeholder="New label name" bind:value={newLabel.name} /><input placeholder="Slug" bind:value={newLabel.slug} /><input placeholder="Color" bind:value={newLabel.color} /><button type="button" on:click={createLabel}>Create label</button></div></AdminCard>
    <AdminCard><h2>Public presentation</h2><div class="form"><label><span>Comparison price cents</span><input type="number" min="0" bind:value={presentation.comparison_price_cents} /></label><label><span>Info box</span><textarea bind:value={presentation.info_box_text}></textarea></label><label><span>Activation guide</span><textarea bind:value={presentation.activation_guide}></textarea></label><label><span>Features (one per line)</span><textarea bind:value={presentation.features}></textarea></label><label><span>Extra features (one per line)</span><textarea bind:value={presentation.extra_features}></textarea></label><button type="button" on:click={saveCatalog}>Save presentation</button></div></AdminCard>
  {:else if activeTab === 'Variants & Terms'}
    <AdminCard><h2>Variants</h2><div class="list">{#each data.variants as variant}<p><b>{variant.name}</b> · {variant.service_plan || 'plan'} · {variant.is_active ? 'Active' : 'Inactive'} <button type="button" on:click={() => toggleVariant(variant)}>{variant.is_active ? 'Deactivate' : 'Activate'}</button><button type="button" on:click={() => deleteVariant(variant)}>Delete</button></p>{/each}</div><form class="form compact" on:submit={submitAction(createVariant)}><input required placeholder="Name" bind:value={newVariant.name} /><input required placeholder="Code" bind:value={newVariant.variant_code} /><input placeholder="Service plan" bind:value={newVariant.service_plan} /><button type="submit">Add variant</button></form></AdminCard>
    <AdminCard><h2>Terms</h2><div class="list">{#each data.variantTerms as term}<p>{term.months} months · {term.discount_percent || 0}% · {term.is_active ? 'Active' : 'Inactive'} · {term.is_recommended ? 'Recommended' : ''} <button type="button" on:click={() => toggleTerm(term, 'is_active')}>{term.is_active ? 'Deactivate' : 'Activate'}</button><button type="button" on:click={() => toggleTerm(term, 'is_recommended')}>{term.is_recommended ? 'Unrecommend' : 'Recommend'}</button><button type="button" on:click={() => deleteTerm(term)}>Delete</button></p>{/each}</div><form class="form compact" on:submit={submitAction(createTerm)}><select required aria-label="Variant for term" bind:value={newTerm.product_variant_id}>{#each data.variants as variant}<option value={variant.id}>{variant.name}</option>{/each}</select><input aria-label="Term months" required type="number" min="1" bind:value={newTerm.months} /><input aria-label="Term discount percent" type="number" min="0" max="100" bind:value={newTerm.discount_percent} /><button type="submit">Add term</button></form></AdminCard>
  {:else if activeTab === 'Pricing'}
    <AdminCard><h2>Fixed product pricing</h2><div class="form compact"><label><span>Duration months</span><input type="number" bind:value={product.duration_months} /></label><label><span>Fixed price cents</span><input type="number" bind:value={product.fixed_price_cents} /></label><label><span>Fixed currency</span><input bind:value={product.fixed_price_currency} /></label><button type="button" on:click={saveProduct}>Save fixed price</button></div></AdminCard>
    <AdminCard><h2>Variant price history</h2><div class="list">{#each data.priceHistory as price}<p>{formatMoney(price.price_cents, price.currency || 'USD')} · {price.product_variant_id}</p>{/each}</div><form class="form compact" on:submit={submitAction(setPrice)}><select required aria-label="Variant for price" bind:value={newPrice.product_variant_id}>{#each data.variants as variant}<option value={variant.id}>{variant.name}</option>{/each}</select><input aria-label="Price cents" required type="number" min="1" bind:value={newPrice.price_cents} /><input aria-label="Price currency" required bind:value={newPrice.currency} /><button type="submit">Set current price</button></form></AdminCard>
  {:else if activeTab === 'Media'}
    <AdminCard><h2>Media</h2><div class="list">{#each data.media as media}<p>{media.media_type} · {media.url}</p>{/each}</div><div class="form compact"><select bind:value={newMedia.media_type}><option value="image">Image</option><option value="video">Video</option></select><input placeholder="URL" bind:value={newMedia.url} /><input placeholder="Alt text" bind:value={newMedia.alt_text} /><button type="button" on:click={addMedia}>Add media</button></div></AdminCard>
  {:else}
    <AdminCard><div class="fulfillment">
      <label class="check"><input type="checkbox" checked={upgradeOptions.allow_new_account === true} on:change={(event) => setOption('allow_new_account', event.currentTarget.checked)} /><span><b>New account</b> Admin creates a fresh provider account and delivers its credentials.</span></label>
      <label class="check"><input type="checkbox" checked={upgradeOptions.allow_own_account === true} on:change={(event) => setOption('allow_own_account', event.currentTarget.checked)} /><span><b>Own account</b> Customer submits credentials.</span></label>
      {#if upgradeOptions.allow_own_account}<label><span>Own-account credential requirement</span><select value={upgradeOptions.own_account_credential_requirement || ''} on:change={(event) => setOption('own_account_credential_requirement', event.currentTarget.value || null)}><option value="">Email and password (default)</option><option value="email_and_password">Email and password</option><option value="email_only">Email only</option></select></label>{/if}
      <label class="check"><input type="checkbox" checked={upgradeOptions.manual_monthly_upgrade === true} on:change={(event) => setOption('manual_monthly_upgrade', event.currentTarget.checked)} /><span><b>Manual monthly upgrade (MMU)</b></span></label>
      {#if upgradeOptions.manual_monthly_upgrade}<label><span>Interval (months)</span><input type="number" min="1" max="12" value={upgradeOptions.manual_monthly_upgrade_interval_months || 1} on:input={(event) => setOption('manual_monthly_upgrade_interval_months', Number(event.currentTarget.value))} /><small>Term length must be divisible by the interval.</small><p>{termsPreview}</p></label>{/if}
      <label class="check"><input type="checkbox" checked={upgradeOptions.activation_link_handshake === true} on:change={(event) => setOption('activation_link_handshake', event.currentTarget.checked)} /><span><b>Activation-link handshake</b></span></label>
      {#if upgradeOptions.activation_link_handshake}<label><span>Default instruction template</span><textarea maxlength="4000" value={upgradeOptions.activation_instructions_template || ''} on:input={(event) => setOption('activation_instructions_template', event.currentTarget.value)}></textarea></label>{/if}
      <label class="check"><input type="checkbox" checked={upgradeOptions.strict_rules === true} on:change={(event) => setOption('strict_rules', event.currentTarget.checked)} /><span><b>Strict rules</b></span></label>
      {#if upgradeOptions.strict_rules}<label><span>Rules text</span><textarea maxlength="8000" value={upgradeOptions.strict_rules_text || ''} on:input={(event) => setOptions({ strict_rules_text: event.currentTarget.value, strict_rules_version: Number(upgradeOptions.strict_rules_version || 1) + 1 })}></textarea><small>Customers must accept these rules before credentials are revealed. Acceptance is logged as evidence. Rules are versioned — current: v{upgradeOptions.strict_rules_version || 1}.</small></label>{/if}
      <button type="button" on:click={saveProduct}>Save fulfillment settings</button>
    </div></AdminCard>
  {/if}
</div>

<style>
  .page { display: grid; gap: 18px; }
  .back { color: #5f5f66; text-decoration: none; font-weight: 700; }
  header { display: flex; justify-content: space-between; gap: 16px; }
  h1, h2, p { margin: 0; } h1 { font-size: 23px; } h2 { margin-bottom: 12px; font-size: 15px; }
  .success { border: 1px solid #bde7ce; border-radius: 10px; background: #e7f6ee; padding: 12px; color: #1a7f45; font-weight: 700; }
  .tabs { display: flex; flex-wrap: wrap; gap: 8px; }
  button { min-height: 38px; border: 0; border-radius: 10px; background: #1a1a1c; color: white; padding: 0 14px; font-weight: 750; cursor: pointer; }
  .tabs button { background: #fff; color: #5f5f66; border: 1px solid #ececee; }
  .tabs button.active { color: #fff; background: #1a1a1c; border-color: #1a1a1c; }
  .form { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; align-items: end; }
  .compact { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-top: 12px; }
  label { display: grid; gap: 6px; color: #71717a; font-size: 12px; font-weight: 650; }
  .wide { grid-column: 1 / -1; }
  input, select, textarea { min-height: 38px; border: 1px solid #dedee4; border-radius: 10px; padding: 8px 10px; font: inherit; }
  textarea { min-height: 100px; resize: vertical; }
  .list { display: grid; gap: 8px; color: #1a1a1c; }
  .fulfillment { display: grid; gap: 14px; }
  .check { grid-template-columns: 18px 1fr; align-items: start; border: 1px solid #ececee; border-radius: 10px; padding: 12px; color: #1a1a1c; }
  small { color: #71717a; font-size: 12px; }
  @media (max-width: 900px) { .form, .compact { grid-template-columns: 1fr; } }
</style>
