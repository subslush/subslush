<script lang="ts">
  import { goto } from '$app/navigation';
  import AdminCard from '$lib/components/admin-next/AdminCard.svelte';
  import EmptyState from '$lib/components/admin-next/EmptyState.svelte';
  import ErrorBanner from '$lib/components/admin-next/ErrorBanner.svelte';
  import PageHeader from '$lib/components/admin-next/PageHeader.svelte';
  import StatusChip from '$lib/components/admin-next/StatusChip.svelte';
  import { formatDateTime, formatMoney, isGuestEmail, shortId } from '$lib/utils/adminNext.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let search = data.filters.search || '';
  let status = data.filters.status || 'all';
  let provider = data.filters.provider || 'all';
  let dateFrom = data.filters.date_from || '';
  let dateTo = data.filters.date_to || '';

  const applyFilters = async () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (status !== 'all') params.set('status', status);
    if (provider !== 'all') params.set('provider', provider);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    await goto(`/admin-next/orders?${params.toString()}`);
  };
</script>

<svelte:head><title>Orders - Admin Next</title></svelte:head>

<div class="page">
  <PageHeader title="Orders" subtitle="Search paid, pending, delivered, cancelled, and expired order files without opening fulfillment-only workflows." />
  <ErrorBanner message={data.error} />

  <AdminCard>
    <div class="filters">
      <label><span>Search</span><input bind:value={search} placeholder="Order id, email, payment ref" /></label>
      <label><span>Status</span><select bind:value={status}><option value="all">All</option><option value="pending_payment">Pending payment</option><option value="paid">Paid</option><option value="in_process">In process</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select></label>
      <label><span>Provider</span><select bind:value={provider}><option value="all">All</option><option value="stripe">Stripe</option><option value="paypal">PayPal</option><option value="nowpayments">NOWPayments</option><option value="pay4bit">Pay4Bit</option><option value="payop">PayOp</option><option value="antom">Antom</option></select></label>
      <label><span>From</span><input type="date" bind:value={dateFrom} /></label>
      <label><span>To</span><input type="date" bind:value={dateTo} /></label>
      <button type="button" on:click={applyFilters}>Apply</button>
    </div>
  </AdminCard>

  {#if data.orders.length === 0}
    <EmptyState title="No orders found" message="Adjust the search or filter criteria." />
  {:else}
    <AdminCard>
      <div class="table">
        <div class="thead">
          <span>Order</span><span>Customer</span><span>Items</span><span>Payment</span><span>Total</span><span>Date</span>
        </div>
        {#each data.orders as order}
          <a class="row" href={`/admin-next/orders/${order.id}`}>
            <span class="mono">{shortId(order.id)}</span>
            <span>
              {order.contact_email || order.account_email || 'No email'}
              {#if order.is_guest || isGuestEmail(order.contact_email)}<b>Guest</b>{/if}
            </span>
            <span>{order.item_count || 0} items · {order.delivered_count || 0} delivered</span>
            <span><StatusChip status={order.status || 'unknown'} /> <small>{order.payment_provider || '--'}</small></span>
            <span>{formatMoney(order.total_cents, order.currency || 'USD')}</span>
            <time>{formatDateTime(order.created_at)}</time>
          </a>
        {/each}
      </div>
    </AdminCard>
  {/if}
</div>

<style>
  .page { display: grid; gap: 18px; }
  .filters { display: grid; grid-template-columns: minmax(220px, 1fr) repeat(4, minmax(130px, 160px)) auto; gap: 12px; align-items: end; }
  label { display: grid; gap: 6px; color: #71717a; font-size: 12px; font-weight: 650; }
  input, select { min-height: 38px; border: 1px solid #dedee4; border-radius: 10px; padding: 0 10px; color: #1a1a1c; font: inherit; }
  button { min-height: 38px; border: 0; border-radius: 10px; background: #1a1a1c; color: white; padding: 0 14px; font-weight: 750; cursor: pointer; }
  .table { display: grid; overflow-x: auto; }
  .thead, .row { display: grid; grid-template-columns: 110px minmax(230px, 1.5fr) 150px 180px 120px 170px; gap: 14px; align-items: center; min-width: 960px; }
  .thead { border-bottom: 1px solid #ececee; padding: 0 0 10px; color: #71717a; font-size: 12px; font-weight: 750; }
  .row { border-bottom: 1px solid #f0f0f2; padding: 13px 0; color: #1a1a1c; text-decoration: none; }
  .row:hover { background: #fafafa; }
  .mono { font-family: 'JetBrains Mono', monospace; font-size: 12px; }
  b { margin-left: 6px; border-radius: 999px; background: #eef0f2; padding: 2px 7px; font-size: 11px; }
  small { margin-left: 8px; color: #71717a; }
  @media (max-width: 900px) { .filters { grid-template-columns: 1fr 1fr; } }
</style>
