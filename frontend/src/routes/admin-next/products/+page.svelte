<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import AdminCard from '$lib/components/admin-next/AdminCard.svelte';
  import DeliveryBadges from '$lib/components/admin-next/DeliveryBadges.svelte';
  import EmptyState from '$lib/components/admin-next/EmptyState.svelte';
  import ErrorBanner from '$lib/components/admin-next/ErrorBanner.svelte';
  import PageHeader from '$lib/components/admin-next/PageHeader.svelte';
  import StatusChip from '$lib/components/admin-next/StatusChip.svelte';
  import { adminService } from '$lib/api/admin.js';
  import { formatMoney } from '$lib/utils/adminNext.js';
  import type { AdminNextUpgradeOptionsSnapshot } from '$lib/types/adminNext.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let showCreate = false;
  let actionError = '';
  let actionMessage = '';
  let isCreating = false;
  let draft = {
    name: '',
    slug: '',
    description: '',
    service_type: '',
    category: '',
    default_currency: 'USD',
    duration_months: 1,
    fixed_price_cents: '',
    fixed_price_currency: 'USD',
    comparison_price_cents: '',
    status: 'inactive',
  };

  type ProductWithMetadata = {
    metadata?: {
      upgrade_options?: AdminNextUpgradeOptionsSnapshot;
      upgradeOptions?: AdminNextUpgradeOptionsSnapshot;
    } | null;
  };

  const options = (product: ProductWithMetadata): AdminNextUpgradeOptionsSnapshot =>
    product.metadata?.upgrade_options || product.metadata?.upgradeOptions || {};

  const createProduct = async () => {
    if (isCreating) return;

    actionError = '';
    actionMessage = '';
    const durationMonths = Number(draft.duration_months);
    const fixedPriceCents = Number(draft.fixed_price_cents);
    const comparisonPriceCents =
      draft.comparison_price_cents === '' ? null : Number(draft.comparison_price_cents);
    if (!Number.isInteger(durationMonths) || durationMonths < 1) {
      actionError = 'Duration must be a positive whole number of months.';
      return;
    }
    if (!Number.isInteger(fixedPriceCents) || fixedPriceCents < 1) {
      actionError = 'Fixed price must be a positive whole number of cents.';
      return;
    }
    if (
      comparisonPriceCents !== null &&
      (!Number.isInteger(comparisonPriceCents) || comparisonPriceCents <= fixedPriceCents)
    ) {
      actionError = 'Comparison price must be greater than the fixed price.';
      return;
    }
    isCreating = true;
    try {
      await adminService.createProduct({
        ...draft,
        duration_months: durationMonths,
        fixed_price_cents: fixedPriceCents,
        status: 'inactive',
        metadata: {
          upgrade_options: { allow_new_account: true, allow_own_account: false },
          ...(comparisonPriceCents !== null
            ? {
                comparison_price_cents: comparisonPriceCents,
                comparison_price_currency: draft.fixed_price_currency,
              }
            : {}),
        },
      });
      draft = { name: '', slug: '', description: '', service_type: '', category: '', default_currency: 'USD', duration_months: 1, fixed_price_cents: '', fixed_price_currency: 'USD', comparison_price_cents: '', status: 'inactive' };
      showCreate = false;
      actionMessage = 'Inactive fixed product created. Review it, then publish when ready.';
      await invalidateAll();
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to create product.';
    } finally {
      isCreating = false;
    }
  };

  const submitCreateProduct = (event: SubmitEvent) => {
    event.preventDefault();
    void createProduct();
  };
</script>

<svelte:head><title>Products - Admin Next</title></svelte:head>

<div class="page">
  <PageHeader title="Products" subtitle="Each row is one independently sellable product with one fixed duration and price.">
    <button type="button" onclick={() => (showCreate = !showCreate)}>+ New product</button>
  </PageHeader>
  <ErrorBanner message={data.error || actionError} />
  {#if actionMessage}<div class="success" role="status">{actionMessage}</div>{/if}

  {#if showCreate}
    <AdminCard>
      <form class="form" onsubmit={submitCreateProduct}>
        <label><span>Name</span><input required bind:value={draft.name} /></label>
        <label><span>Slug</span><input required bind:value={draft.slug} /></label>
        <label><span>Service type</span><input required bind:value={draft.service_type} /></label>
        <label><span>Category</span><input bind:value={draft.category} /></label>
        <label class="wide"><span>Description</span><textarea bind:value={draft.description}></textarea></label>
        <fieldset class="wide fixed-fields">
          <legend>Fixed Catalog Fields</legend>
          <p>These values define the only sellable configuration. Duration is the full entitlement term; price is the full-term amount in minor currency units (for example, 999 = $9.99 USD). No variant or term is created.</p>
          <div class="field-grid">
            <label><span>Duration (months)</span><input aria-describedby="create-duration-help" required type="number" min="1" step="1" bind:value={draft.duration_months} /><small id="create-duration-help">Use 1 for a one-month product or 12 for a twelve-month product.</small></label>
            <label><span>Fixed price (cents)</span><input aria-describedby="create-price-help" required type="number" min="1" step="1" bind:value={draft.fixed_price_cents} /><small id="create-price-help">The total charged for the complete fixed duration.</small></label>
            <label><span>Fixed price currency</span><select aria-describedby="create-currency-help" bind:value={draft.fixed_price_currency}><option value="USD">USD</option></select><small id="create-currency-help">USD is the canonical settlement price; regional display prices are derived by the FX publisher.</small></label>
            <label><span>Comparison price (cents, optional)</span><input aria-describedby="create-comparison-help" type="number" min="1" step="1" bind:value={draft.comparison_price_cents} /><small id="create-comparison-help">Shown as the previous price only when greater than the fixed price.</small></label>
          </div>
        </fieldset>
        <button type="submit" disabled={isCreating || !draft.name || !draft.slug || !draft.service_type || !draft.fixed_price_cents}>{isCreating ? 'Creating…' : 'Create inactive fixed product'}</button>
      </form>
    </AdminCard>
  {/if}

  {#if data.products.length === 0 && !data.error}
    <EmptyState title="No products" message="Create a product to start configuring catalog fields." />
  {:else}
    <AdminCard>
      <div class="table">
        <div class="thead"><span>Product</span><span>Category</span><span>Fixed catalog</span><span>Fulfillment</span><span>Status</span></div>
        {#each data.products as product}
          {@const opt = options(product)}
          <a class="row" href={`/admin-next/products/${product.id}`}>
            <span><strong>{product.name}</strong><small>{product.slug}</small></span>
            <span>{product.category || '—'}</span>
            <span>{product.duration_months || '—'} month{product.duration_months === 1 ? '' : 's'}<small>{product.fixed_price_cents && product.fixed_price_currency ? formatMoney(product.fixed_price_cents, product.fixed_price_currency) : 'Price incomplete'}</small></span>
            <span><DeliveryBadges method={{ manual_monthly_upgrade: opt.manual_monthly_upgrade, activation_link_handshake: opt.activation_link_handshake, strict_rules: opt.strict_rules }} />{#if opt.manual_monthly_upgrade_interval_months}<small>every {opt.manual_monthly_upgrade_interval_months} months</small>{/if}</span>
            <span><StatusChip status={product.status === 'active' ? 'active' : 'draft'} /></span>
          </a>
        {/each}
      </div>
    </AdminCard>
  {/if}
</div>

<style>
  .page { display: grid; gap: 18px; }
  button { width: fit-content; min-height: 38px; border: 0; border-radius: 10px; background: #1a1a1c; color: white; padding: 0 14px; font-weight: 750; cursor: pointer; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  .form { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; align-items: end; }
  label { display: grid; gap: 6px; color: #71717a; font-size: 12px; font-weight: 650; }
  .wide { grid-column: 1 / -1; }
  input, textarea { min-height: 38px; border: 1px solid #dedee4; border-radius: 10px; padding: 8px 10px; font: inherit; }
  select { min-height: 38px; border: 1px solid #dedee4; border-radius: 10px; padding: 8px 10px; font: inherit; background: white; }
  .fixed-fields { border: 1px solid #d9d9e0; border-radius: 12px; padding: 14px; }
  .fixed-fields legend { padding: 0 6px; font-weight: 800; }
  .fixed-fields p { margin: 0 0 12px; color: #5f5f66; font-size: 13px; }
  .field-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
  .success { border: 1px solid #bde7ce; border-radius: 10px; background: #e7f6ee; padding: 12px; color: #1a7f45; font-weight: 700; }
  textarea { min-height: 80px; resize: vertical; }
  .table { display: grid; overflow-x: auto; }
  .thead, .row { display: grid; grid-template-columns: minmax(260px, 1.5fr) 180px 110px 260px 100px; gap: 14px; align-items: center; min-width: 930px; }
  .thead { border-bottom: 1px solid #ececee; padding-bottom: 10px; color: #71717a; font-size: 12px; font-weight: 750; }
  .row { border-bottom: 1px solid #f0f0f2; color: #1a1a1c; padding: 13px 0; text-decoration: none; }
  small { display: block; margin-top: 3px; color: #71717a; font-size: 12px; }
  @media (max-width: 900px) { .form, .field-grid { grid-template-columns: 1fr; } }
</style>
