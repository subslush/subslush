<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import AdminCard from '$lib/components/admin-next/AdminCard.svelte';
  import ErrorBanner from '$lib/components/admin-next/ErrorBanner.svelte';
  import PageHeader from '$lib/components/admin-next/PageHeader.svelte';
  import StatusChip from '$lib/components/admin-next/StatusChip.svelte';
  import { adminService } from '$lib/api/admin.js';
  import { formatDate } from '$lib/utils/adminNext.js';
  import type { AdminCoupon } from '$lib/types/admin.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let tab: 'manual' | 'newsletter' = 'manual';
  let includeExpired = false;
  let actionError = '';
  let actionMessage = '';
  let draft: Partial<AdminCoupon> = {
    code: '',
    percent_off: 20,
    scope: 'global',
    apply_scope: 'highest_eligible_item',
    status: 'active',
    max_redemptions: null,
    first_order_only: false,
  };

  const isExpired = (coupon: AdminCoupon) => coupon.ends_at ? new Date(coupon.ends_at) < new Date() : false;
  const visibleCoupons = (coupons: AdminCoupon[]) =>
    coupons.filter(coupon => includeExpired || !(isExpired(coupon) && Number(coupon.redemptions_used || 0) === 0));

  $: summary = `${draft.code || 'CODE'} gives ${draft.percent_off || 0}% off ${draft.apply_scope === 'order_total' ? 'the order total' : 'the highest eligible item'}, ${draft.scope === 'global' ? 'all products' : draft.scope === 'category' ? draft.category || 'selected category' : draft.product_id || 'selected product'}, ${draft.bound_user_id ? `user ${draft.bound_user_id}` : 'any customer'}, ${draft.max_redemptions ? `max ${draft.max_redemptions} uses` : 'unlimited uses'}, ${draft.starts_at ? formatDate(draft.starts_at) : 'now'} – ${draft.ends_at ? formatDate(draft.ends_at) : 'no end'}.`;

  const saveCoupon = async () => {
    actionError = ''; actionMessage = '';
    const payload: Partial<AdminCoupon> = { ...draft };
    if (payload.scope === 'global') { payload.category = null; payload.product_id = null; }
    if (payload.scope === 'category') payload.product_id = null;
    if (payload.scope === 'product') payload.category = null;
    try {
      await adminService.createCoupon(payload);
      actionMessage = 'Coupon created.';
      draft = { code: '', percent_off: 20, scope: 'global', apply_scope: 'highest_eligible_item', status: 'active', max_redemptions: null, first_order_only: false };
      await invalidateAll();
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to create coupon.';
    }
  };

  const deleteCoupon = async (coupon: AdminCoupon) => {
    if (!confirm(`Delete coupon ${coupon.code}?`)) return;
    try { await adminService.deleteCoupon(coupon.id); await invalidateAll(); }
    catch (error) { actionError = error instanceof Error ? error.message : 'Failed to delete coupon.'; }
  };
</script>

<svelte:head><title>Coupons - Admin Next</title></svelte:head>

<div class="page">
  <PageHeader title="Coupons" subtitle="Manual coupons keep the existing field set and endpoints. Newsletter coupons are read-only." />
  <ErrorBanner message={data.error || actionError} />
  {#if actionMessage}<div class="success">{actionMessage}</div>{/if}

  <div class="tabs"><button class:active={tab === 'manual'} type="button" on:click={() => (tab = 'manual')}>Manual coupons</button><button class:active={tab === 'newsletter'} type="button" on:click={() => (tab = 'newsletter')}>Newsletter coupons</button></div>

  {#if tab === 'manual'}
    <AdminCard>
      <h2>Create coupon</h2>
      <div class="form">
        <label><span>Code</span><input class="mono" maxlength="200" bind:value={draft.code} /></label>
        <label><span>Percent off</span><input type="number" min="0" max="100" bind:value={draft.percent_off} /></label>
        <label><span>Scope</span><select bind:value={draft.scope}><option value="global">Global</option><option value="product">Specific products</option><option value="category">Category</option></select></label>
        {#if draft.scope === 'product'}<label><span>Product</span><select bind:value={draft.product_id}>{#each data.products as product}<option value={product.id}>{product.name}</option>{/each}</select></label>{/if}
        {#if draft.scope === 'category'}<label><span>Category</span><input maxlength="200" bind:value={draft.category} /></label>{/if}
        <label><span>Apply to</span><select bind:value={draft.apply_scope}><option value="highest_eligible_item">Highest eligible item</option><option value="order_total">Order total</option></select></label>
        <label><span>Bind to user</span><input maxlength="200" bind:value={draft.bound_user_id} placeholder="Optional user id" /></label>
        <label><span>Max redemptions</span><input type="number" bind:value={draft.max_redemptions} /></label>
        <label><span>Start</span><input type="datetime-local" bind:value={draft.starts_at} /></label>
        <label><span>End</span><input type="datetime-local" bind:value={draft.ends_at} /></label>
        <label class="check"><input type="checkbox" bind:checked={draft.first_order_only} /> First order only</label>
        <p class="summary">{summary}</p>
        <button type="button" disabled={!draft.code || !draft.percent_off} on:click={saveCoupon}>Create coupon</button>
      </div>
    </AdminCard>

    <AdminCard>
      <div class="list-head"><h2>Manual coupons</h2><label class="toggle"><input type="checkbox" bind:checked={includeExpired} /> Include expired</label></div>
      <div class="table">
        <div class="thead"><span>Code</span><span>%</span><span>Scope</span><span>Apply to</span><span>Uses</span><span>Window</span><span>Status</span><span></span></div>
        {#each visibleCoupons(data.coupons) as coupon}
          <div class="row">
            <span class="mono">{coupon.code}</span><span>{coupon.percent_off}%</span><span>{coupon.scope}</span><span>{coupon.apply_scope || 'highest_eligible_item'}</span><span>{coupon.redemptions_used || 0} / {coupon.max_redemptions || '∞'}</span><span>{formatDate(coupon.starts_at)} – {formatDate(coupon.ends_at)}</span><span><StatusChip status={isExpired(coupon) ? 'expired' : coupon.status || 'active'} /></span><button type="button" on:click={() => deleteCoupon(coupon)}>Delete</button>
          </div>
        {/each}
      </div>
      <p class="helper">Expired coupons that were never used are cleaned up automatically. Used coupons are kept permanently for order records.</p>
    </AdminCard>
  {:else}
    <div class="stats">
      <AdminCard><h2>Issued</h2><strong>{data.newsletter.stats.issued}</strong></AdminCard>
      <AdminCard><h2>Redeemed</h2><strong>{data.newsletter.stats.redeemed}</strong></AdminCard>
      <AdminCard><h2>Conversion %</h2><strong>{data.newsletter.stats.conversion_percent}%</strong></AdminCard>
    </div>
    <p class="caption">Auto-generated when a customer subscribes to the newsletter. 12% off, 3-day window.</p>
    <AdminCard><div class="table newsletter"><div class="thead"><span>Code</span><span>%</span><span>Window</span><span>Status</span></div>{#each data.newsletter.coupons as coupon}<div class="row"><span class="mono">{coupon.coupon_code}</span><span>{coupon.percent_off || 12}%</span><span>{formatDate(coupon.starts_at)} – {formatDate(coupon.ends_at)}</span><span><StatusChip status={coupon.redeemed ? 'redeemed' : (coupon.ends_at && new Date(coupon.ends_at) < new Date()) ? 'expired' : 'active'} /></span></div>{/each}</div></AdminCard>
  {/if}
</div>

<style>
  .page { display: grid; gap: 18px; }
  h2, p { margin: 0; } h2 { font-size: 15px; margin-bottom: 12px; }
  button { min-height: 36px; border: 0; border-radius: 10px; background: #1a1a1c; color: white; padding: 0 12px; font-weight: 750; cursor: pointer; }
  button:disabled { opacity: .5; }
  .success { border: 1px solid #bde7ce; border-radius: 10px; background: #e7f6ee; padding: 12px; color: #1a7f45; font-weight: 700; }
  .tabs { display: flex; gap: 8px; }
  .tabs button { background: #fff; color: #5f5f66; border: 1px solid #ececee; }
  .tabs button.active { color: #fff; background: #1a1a1c; }
  .form { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; align-items: end; }
  label { display: grid; gap: 6px; color: #71717a; font-size: 12px; font-weight: 650; }
  input, select { min-height: 38px; border: 1px solid #dedee4; border-radius: 10px; padding: 0 10px; font: inherit; }
  .check, .toggle { display: flex; align-items: center; gap: 8px; color: #1a1a1c; }
  .summary { grid-column: 1 / -1; border-radius: 10px; background: #f6f6f7; padding: 12px; }
  .list-head { display: flex; justify-content: space-between; gap: 12px; }
  .table { display: grid; overflow-x: auto; }
  .thead, .row { display: grid; grid-template-columns: 130px 70px 120px 170px 110px 220px 100px 90px; gap: 12px; align-items: center; min-width: 1010px; }
  .newsletter .thead, .newsletter .row { grid-template-columns: 160px 80px 240px 120px; min-width: 620px; }
  .thead { border-bottom: 1px solid #ececee; padding-bottom: 10px; color: #71717a; font-size: 12px; font-weight: 750; }
  .row { border-bottom: 1px solid #f0f0f2; padding: 12px 0; }
  .mono { font-family: 'JetBrains Mono', monospace; font-size: 12px; }
  .helper, .caption { color: #71717a; font-size: 13px; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .stats strong { font-size: 26px; }
  @media (max-width: 900px) { .form, .stats { grid-template-columns: 1fr; } }
</style>
