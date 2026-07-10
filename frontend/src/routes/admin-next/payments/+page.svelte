<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { RefreshCw, X } from 'lucide-svelte';
  import AdminCard from '$lib/components/admin-next/AdminCard.svelte';
  import EmptyState from '$lib/components/admin-next/EmptyState.svelte';
  import ErrorBanner from '$lib/components/admin-next/ErrorBanner.svelte';
  import PageHeader from '$lib/components/admin-next/PageHeader.svelte';
  import StatusChip from '$lib/components/admin-next/StatusChip.svelte';
  import { adminNextService } from '$lib/api/adminNext.js';
  import { formatDateTime, formatMoney, shortId } from '$lib/utils/adminNext.js';
  import type { AdminNextPaymentDetail, AdminNextPaymentLedgerItem } from '$lib/types/adminNext.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let search = data.filters.search || '';
  let provider = data.filters.provider || 'all';
  let status = data.filters.status || 'all';
  let selected: AdminNextPaymentDetail | null = null;
  let selectedId = data.selectedPayment;
  let actionError = '';
  let actionMessage = '';

  $: if (selectedId && (!selected || selected.payment?.id !== selectedId)) {
    openPayment(selectedId);
  }

  const applyFilters = async () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (provider !== 'all') params.set('provider', provider);
    if (status !== 'all') params.set('status', status);
    await goto(`/admin-next/payments?${params.toString()}`);
  };

  const openPayment = async (id: string) => {
    actionError = '';
    try {
      selected = await adminNextService.getNextPayment(id);
      selectedId = id;
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Unable to load payment.';
    }
  };

  const close = async () => {
    selected = null;
    selectedId = '';
    await goto('/admin-next/payments', { replaceState: true, noScroll: true });
  };

  const retry = async (payment: AdminNextPaymentLedgerItem) => {
    if (!payment.id || !payment.retryable) return;
    actionError = '';
    actionMessage = '';
    try {
      await adminNextService.retryPayment(payment.id);
      actionMessage = 'Payment re-check requested.';
      await invalidateAll();
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to re-check payment.';
    }
  };
</script>

<svelte:head><title>Payments - Admin Next</title></svelte:head>

<div class="page">
  <PageHeader title="Payments" subtitle="Read-only ledger. Payments are auto-verified by provider webhooks; pending checkouts can be re-checked." />
  <ErrorBanner message={data.error || actionError} />
  {#if actionMessage}<div class="success">{actionMessage}</div>{/if}

  <AdminCard>
    <div class="filters">
      <label><span>Search</span><input bind:value={search} placeholder="Payment ref or order id" /></label>
      <label><span>Provider</span><select bind:value={provider}><option value="all">All</option><option value="stripe">Stripe</option><option value="paypal">PayPal</option><option value="nowpayments">NOWPayments</option><option value="pay4bit">Pay4Bit</option><option value="payop">PayOp</option><option value="antom">Antom</option></select></label>
      <label><span>Status</span><select bind:value={status}><option value="all">All</option><option value="succeeded">Succeeded</option><option value="pending">Pending</option><option value="failed">Failed</option><option value="expired">Expired</option></select></label>
      <button type="button" on:click={applyFilters}>Apply</button>
    </div>
  </AdminCard>

  {#if data.payments.length === 0}
    <EmptyState title="No payments found" message="Adjust the ledger filters." />
  {:else}
    <AdminCard>
      <div class="table">
        <div class="thead"><span>Ref</span><span>Order</span><span>Provider</span><span>Amount</span><span>Status</span><span>Created</span><span></span></div>
        {#each data.payments as payment}
          <div class="row">
            <button class="linkish mono" type="button" on:click={() => openPayment(payment.id)}>{shortId(payment.payment_ref || payment.id)}</button>
            <a class="mono" href={payment.order_id ? `/admin-next/orders/${payment.order_id}` : '/admin-next/payments'}>{shortId(payment.order_id)}</a>
            <span>{payment.provider || '--'}</span>
            <span>{formatMoney(payment.amount_cents, payment.currency || 'USD')}</span>
            <span><StatusChip status={payment.status || 'unknown'} /></span>
            <time>{formatDateTime(payment.created_at)}</time>
            <span>{#if payment.retryable}<button class="retry" type="button" on:click={() => retry(payment)}><RefreshCw size={14} /> Re-check status</button>{/if}</span>
          </div>
        {/each}
      </div>
    </AdminCard>
  {/if}
</div>

{#if selected?.payment}
  <button class="drawer-backdrop" type="button" on:click={close} aria-label="Close payment drawer"></button>
  <aside class="drawer">
    <button class="icon" type="button" on:click={close} aria-label="Close"><X size={18} /></button>
    <header>
      <div>
        <h2>{selected.payment.provider || 'Payment'} · <code>{shortId(selected.payment.payment_ref || selected.payment.id)}</code></h2>
        <p>{formatMoney(selected.payment.amount_cents, selected.payment.currency || 'USD')}</p>
      </div>
      <StatusChip status={selected.payment.status} />
    </header>

    <section>
      <h3>Event timeline</h3>
      {#if selected.events?.length}
        <div class="timeline">
          {#each selected.events as event}
            <p><span></span><b>{event.event_type}</b> <code>{event.event_id}</code> <time>{formatDateTime(event.created_at)}</time></p>
          {/each}
        </div>
      {:else}
        <EmptyState title="No events" message="No webhook events are attached to this payment yet." />
      {/if}
    </section>

    <section>
      <h3>Linked order</h3>
      {#if selected.payment.order_id}
        <a class="link-button" href={`/admin-next/orders/${selected.payment.order_id}`}>Open order {shortId(selected.payment.order_id)} →</a>
      {:else}
        <p>No order linked.</p>
      {/if}
    </section>
  </aside>
{/if}

<style>
  .page { display: grid; gap: 18px; }
  .filters { display: grid; grid-template-columns: minmax(260px, 1fr) 160px 160px auto; gap: 12px; align-items: end; }
  label { display: grid; gap: 6px; color: #71717a; font-size: 12px; font-weight: 650; }
  input, select { min-height: 38px; border: 1px solid #dedee4; border-radius: 10px; padding: 0 10px; font: inherit; }
  button, .link-button { display: inline-flex; align-items: center; gap: 7px; min-height: 36px; border: 0; border-radius: 10px; background: #1a1a1c; color: white; padding: 0 12px; font-weight: 750; text-decoration: none; cursor: pointer; }
  .success { border: 1px solid #bde7ce; border-radius: 10px; background: #e7f6ee; padding: 12px; color: #1a7f45; font-weight: 700; }
  .table { display: grid; overflow-x: auto; }
  .thead, .row { display: grid; grid-template-columns: 130px 110px 120px 120px 130px 170px 150px; gap: 14px; align-items: center; min-width: 980px; }
  .thead { border-bottom: 1px solid #ececee; padding-bottom: 10px; color: #71717a; font-size: 12px; font-weight: 750; }
  .row { border-bottom: 1px solid #f0f0f2; padding: 13px 0; }
  .linkish { justify-content: flex-start; min-height: auto; background: transparent; color: #1a1a1c; padding: 0; }
  .retry { min-height: 32px; background: #eef0f2; color: #1a1a1c; }
  .mono, code { font-family: 'JetBrains Mono', monospace; font-size: 12px; }
  .drawer-backdrop { position: fixed; inset: 0; z-index: 60; border: 0; background: rgba(26,26,28,.22); padding: 0; }
  .drawer { position: fixed; inset: 0 0 0 auto; z-index: 70; display: grid; align-content: start; gap: 16px; width: min(500px, 100vw); overflow-y: auto; border-left: 1px solid #ececee; background: #fff; padding: 22px; }
  .icon { position: absolute; top: 14px; right: 14px; min-height: 32px; width: 32px; padding: 0; justify-content: center; background: #f4f4f5; color: #1a1a1c; }
  header { display: flex; justify-content: space-between; gap: 16px; padding-right: 38px; }
  h2, h3, p { margin: 0; }
  section { border: 1px solid #ececee; border-radius: 12px; padding: 14px; }
  h3 { margin-bottom: 10px; font-size: 13px; color: #71717a; text-transform: uppercase; }
  .timeline { display: grid; gap: 10px; }
  .timeline p { display: grid; grid-template-columns: 10px 1fr auto; gap: 9px; align-items: center; }
  .timeline span { width: 8px; height: 8px; border-radius: 999px; background: #5b46e0; }
</style>
