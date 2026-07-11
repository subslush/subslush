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

  const tabs = ['Basics', 'Variants & Terms', 'Pricing', 'Media', 'Fulfillment settings'];
  let activeTab = 'Basics';
  let actionError = '';
  let actionMessage = '';
  let product = structuredClone(data.product);
  let newVariant = { name: '', variant_code: '', service_plan: '', is_active: true, product_id: data.product.id };
  let newTerm = { product_variant_id: data.variants[0]?.id || '', months: 1, discount_percent: 0, is_active: true };
  let newPrice = { product_variant_id: data.variants[0]?.id || '', price_cents: 0, currency: data.product.default_currency || 'USD' };
  let newMedia = { product_id: data.product.id, media_type: 'image' as 'image' | 'video', url: '', alt_text: '', is_primary: false };

  type ProductMetadata = {
    upgrade_options?: AdminNextUpgradeOptionsSnapshot;
    upgradeOptions?: AdminNextUpgradeOptionsSnapshot;
  };

  $: metadata = (product.metadata || {}) as ProductMetadata;
  $: upgradeOptions = metadata.upgrade_options || metadata.upgradeOptions || {};
  $: termsPreview = buildPreview(Number(upgradeOptions.manual_monthly_upgrade_interval_months || 1));

  const setOption = (key: string, value: unknown) => {
    product.metadata = {
      ...(product.metadata || {}),
      upgrade_options: {
        ...upgradeOptions,
        [key]: value,
      },
    };
  };

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
      <label><span>Default currency</span><input bind:value={product.default_currency} /></label>
      <label class="wide"><span>Description</span><textarea bind:value={product.description}></textarea></label>
      <button type="button" on:click={saveProduct}>Save basics</button>
    </div></AdminCard>
  {:else if activeTab === 'Variants & Terms'}
    <AdminCard><h2>Variants</h2><div class="list">{#each data.variants as variant}<p><b>{variant.name}</b> · {variant.service_plan || 'plan'} · {variant.is_active ? 'Active' : 'Inactive'}</p>{/each}</div><form class="form compact" on:submit={submitAction(createVariant)}><input required placeholder="Name" bind:value={newVariant.name} /><input required placeholder="Code" bind:value={newVariant.variant_code} /><input placeholder="Service plan" bind:value={newVariant.service_plan} /><button type="submit">Add variant</button></form></AdminCard>
    <AdminCard><h2>Terms</h2><div class="list">{#each data.variantTerms as term}<p>{term.months} months · {term.discount_percent || 0}% · {term.is_active ? 'Active' : 'Inactive'}</p>{/each}</div><form class="form compact" on:submit={submitAction(createTerm)}><select required aria-label="Variant for term" bind:value={newTerm.product_variant_id}>{#each data.variants as variant}<option value={variant.id}>{variant.name}</option>{/each}</select><input aria-label="Term months" required type="number" min="1" bind:value={newTerm.months} /><input aria-label="Term discount percent" type="number" min="0" max="100" bind:value={newTerm.discount_percent} /><button type="submit">Add term</button></form></AdminCard>
  {:else if activeTab === 'Pricing'}
    <AdminCard><h2>Fixed product pricing</h2><div class="form compact"><label><span>Duration months</span><input type="number" bind:value={product.duration_months} /></label><label><span>Fixed price cents</span><input type="number" bind:value={product.fixed_price_cents} /></label><label><span>Fixed currency</span><input bind:value={product.fixed_price_currency} /></label><button type="button" on:click={saveProduct}>Save fixed price</button></div></AdminCard>
    <AdminCard><h2>Variant price history</h2><div class="list">{#each data.priceHistory as price}<p>{formatMoney(price.price_cents, price.currency || 'USD')} · {price.product_variant_id}</p>{/each}</div><form class="form compact" on:submit={submitAction(setPrice)}><select required aria-label="Variant for price" bind:value={newPrice.product_variant_id}>{#each data.variants as variant}<option value={variant.id}>{variant.name}</option>{/each}</select><input aria-label="Price cents" required type="number" min="1" bind:value={newPrice.price_cents} /><input aria-label="Price currency" required bind:value={newPrice.currency} /><button type="submit">Set current price</button></form></AdminCard>
  {:else if activeTab === 'Media'}
    <AdminCard><h2>Media</h2><div class="list">{#each data.media as media}<p>{media.media_type} · {media.url}</p>{/each}</div><div class="form compact"><select bind:value={newMedia.media_type}><option value="image">Image</option><option value="video">Video</option></select><input placeholder="URL" bind:value={newMedia.url} /><input placeholder="Alt text" bind:value={newMedia.alt_text} /><button type="button" on:click={addMedia}>Add media</button></div></AdminCard>
  {:else}
    <AdminCard><div class="fulfillment">
      <label class="check"><input type="checkbox" checked={upgradeOptions.allow_new_account === true} on:change={(event) => setOption('allow_new_account', event.currentTarget.checked)} /><span><b>New account</b> Admin creates a fresh provider account and delivers its credentials.</span></label>
      <label class="check"><input type="checkbox" checked={upgradeOptions.allow_own_account === true} on:change={(event) => setOption('allow_own_account', event.currentTarget.checked)} /><span><b>Own account</b> Customer submits credentials.</span></label>
      <label class="check"><input type="checkbox" checked={upgradeOptions.manual_monthly_upgrade === true} on:change={(event) => setOption('manual_monthly_upgrade', event.currentTarget.checked)} /><span><b>Manual monthly upgrade (MMU)</b></span></label>
      {#if upgradeOptions.manual_monthly_upgrade}<label><span>Interval (months)</span><input type="number" min="1" max="12" value={upgradeOptions.manual_monthly_upgrade_interval_months || 1} on:input={(event) => setOption('manual_monthly_upgrade_interval_months', Number(event.currentTarget.value))} /><small>Term length must be divisible by the interval.</small><p>{termsPreview}</p></label>{/if}
      <label class="check"><input type="checkbox" checked={upgradeOptions.activation_link_handshake === true} on:change={(event) => setOption('activation_link_handshake', event.currentTarget.checked)} /><span><b>Activation-link handshake</b></span></label>
      {#if upgradeOptions.activation_link_handshake}<label><span>Default instruction template</span><textarea maxlength="4000" value={upgradeOptions.activation_instructions_template || ''} on:input={(event) => setOption('activation_instructions_template', event.currentTarget.value)}></textarea></label>{/if}
      <label class="check"><input type="checkbox" checked={upgradeOptions.strict_rules === true} on:change={(event) => setOption('strict_rules', event.currentTarget.checked)} /><span><b>Strict rules</b></span></label>
      {#if upgradeOptions.strict_rules}<label><span>Rules text</span><textarea maxlength="8000" value={upgradeOptions.strict_rules_text || ''} on:input={(event) => { setOption('strict_rules_text', event.currentTarget.value); setOption('strict_rules_version', Number(upgradeOptions.strict_rules_version || 1) + 1); }}></textarea><small>Customers must accept these rules before credentials are revealed. Acceptance is logged as evidence. Rules are versioned — current: v{upgradeOptions.strict_rules_version || 1}.</small></label>{/if}
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
