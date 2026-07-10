<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import AdminCard from '$lib/components/admin-next/AdminCard.svelte';
  import DeliveryBadges from '$lib/components/admin-next/DeliveryBadges.svelte';
  import EmptyState from '$lib/components/admin-next/EmptyState.svelte';
  import ErrorBanner from '$lib/components/admin-next/ErrorBanner.svelte';
  import PageHeader from '$lib/components/admin-next/PageHeader.svelte';
  import StatusChip from '$lib/components/admin-next/StatusChip.svelte';
  import { adminService } from '$lib/api/admin.js';
  import type { AdminNextUpgradeOptionsSnapshot } from '$lib/types/adminNext.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let showCreate = false;
  let actionError = '';
  let isCreating = false;
  let draft = {
    name: '',
    slug: '',
    description: '',
    service_type: '',
    category: '',
    default_currency: 'USD',
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
    isCreating = true;
    try {
      await adminService.createProduct({
        ...draft,
        status: 'inactive',
        metadata: { upgrade_options: { allow_new_account: true, allow_own_account: false } },
      });
      draft = { name: '', slug: '', description: '', service_type: '', category: '', default_currency: 'USD', status: 'inactive' };
      showCreate = false;
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
  <PageHeader title="Products" subtitle="Catalog operations use the existing frozen product endpoints. Fulfillment flags come from normalized upgrade options.">
    <button type="button" onclick={() => (showCreate = !showCreate)}>+ New product</button>
  </PageHeader>
  <ErrorBanner message={data.error || actionError} />

  {#if showCreate}
    <AdminCard>
      <form class="form" onsubmit={submitCreateProduct}>
        <label><span>Name</span><input bind:value={draft.name} /></label>
        <label><span>Slug</span><input bind:value={draft.slug} /></label>
        <label><span>Service type</span><input bind:value={draft.service_type} /></label>
        <label><span>Category</span><input bind:value={draft.category} /></label>
        <label class="wide"><span>Description</span><textarea bind:value={draft.description}></textarea></label>
        <button type="submit" disabled={isCreating || !draft.name || !draft.slug}>{isCreating ? 'Creating…' : 'Create inactive product'}</button>
      </form>
    </AdminCard>
  {/if}

  {#if data.products.length === 0 && !data.error}
    <EmptyState title="No products" message="Create a product to start configuring catalog fields." />
  {:else}
    <AdminCard>
      <div class="table">
        <div class="thead"><span>Product</span><span>Category</span><span>Variants</span><span>Fulfillment</span><span>Status</span></div>
        {#each data.products as product}
          {@const opt = options(product)}
          <a class="row" href={`/admin-next/products/${product.id}`}>
            <span><strong>{product.name}</strong><small>{product.slug}</small></span>
            <span>{product.category || '—'}</span>
            <span>{data.variantCounts[product.id] || 0}</span>
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
  textarea { min-height: 80px; resize: vertical; }
  .table { display: grid; overflow-x: auto; }
  .thead, .row { display: grid; grid-template-columns: minmax(260px, 1.5fr) 180px 110px 260px 100px; gap: 14px; align-items: center; min-width: 930px; }
  .thead { border-bottom: 1px solid #ececee; padding-bottom: 10px; color: #71717a; font-size: 12px; font-weight: 750; }
  .row { border-bottom: 1px solid #f0f0f2; color: #1a1a1c; padding: 13px 0; text-decoration: none; }
  small { display: block; margin-top: 3px; color: #71717a; font-size: 12px; }
</style>
