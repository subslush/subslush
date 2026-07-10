<script lang="ts">
  import { goto } from '$app/navigation';
  import { Eye, X } from 'lucide-svelte';
  import AdminCard from '$lib/components/admin-next/AdminCard.svelte';
  import EmptyState from '$lib/components/admin-next/EmptyState.svelte';
  import ErrorBanner from '$lib/components/admin-next/ErrorBanner.svelte';
  import PageHeader from '$lib/components/admin-next/PageHeader.svelte';
  import StatusChip from '$lib/components/admin-next/StatusChip.svelte';
  import { adminNextService } from '$lib/api/adminNext.js';
  import { formatDate, formatDateTime, shortId, termLabel } from '$lib/utils/adminNext.js';
  import type {
    AdminNextSubscriptionDetail,
    AdminNextSubscriptionDetailRecord,
    AdminNextSubscriptionListItem,
    AdminNextSubscriptionTask,
  } from '$lib/types/adminNext.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let search = data.filters.search || '';
  let status = data.filters.status || 'all';
  let selected: AdminNextSubscriptionDetail | null = null;
  let selectedId = data.selectedId;
  let drawerError = '';
  let credentials: string | null = null;
  let ownCredentials: string | null = null;
  $: selectedTasks = selected?.tasks || [];
  $: currentMmuTask = selectedTasks.find(
    (task: AdminNextSubscriptionTask) =>
      task.task_type === 'manual_monthly_upgrade' && !task.completed_at
  );
  $: selectedTermStart = selected?.subscription?.term_start || selected?.subscription?.term_start_at || selected?.subscription?.start_date || null;

  $: if (selectedId && (!selected || selected.subscription?.id !== selectedId)) {
    loadDetail(selectedId);
  }

  const productLine = (sub: AdminNextSubscriptionListItem | AdminNextSubscriptionDetailRecord) =>
    [sub.product_name || sub.service_type, sub.variant_name || sub.service_plan].filter(Boolean).join(' · ') || 'Subscription';

  const applyFilters = async () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (status !== 'all') params.set('status', status);
    await goto(`/admin-next/subscriptions?${params.toString()}`);
  };

  async function loadDetail(id: string) {
    drawerError = '';
    credentials = null;
    ownCredentials = null;
    try {
      selected = await adminNextService.getNextSubscription(id);
      selectedId = id;
    } catch (error) {
      drawerError = error instanceof Error ? error.message : 'Unable to load subscription.';
    }
  }

  const showCredentials = async () => {
    if (!selected?.subscription?.id) return;
    const result = await adminNextService.viewSubscriptionCredentials(selected.subscription.id);
    credentials = result.credentials || 'No credentials on file.';
  };

  const showOwnCredentials = async () => {
    if (!selected?.subscription?.id) return;
    const result = await adminNextService.viewOwnAccountCredentials(selected.subscription.id);
    ownCredentials = result.credentials || 'No submitted credentials.';
  };

  const closeDrawer = async () => {
    selected = null;
    selectedId = '';
    credentials = null;
    ownCredentials = null;
    await goto('/admin-next/subscriptions', { replaceState: true, noScroll: true });
  };
</script>

<svelte:head><title>Subscriptions - Admin Next</title></svelte:head>

<div class="page">
  <PageHeader title="Subscriptions" subtitle="Slim support view for credentials, MMU schedule, upgrade selection, order linkage, and task history." />
  <ErrorBanner message={data.error || drawerError} />

  <AdminCard>
    <div class="filters">
      <label><span>Search</span><input bind:value={search} placeholder="Product, customer, subscription id" /></label>
      <label><span>Status</span><select bind:value={status}><option value="all">All</option><option value="pending">Pending</option><option value="active">Active</option><option value="expired">Expired</option><option value="cancelled">Cancelled</option></select></label>
      <button type="button" on:click={applyFilters}>Apply</button>
    </div>
  </AdminCard>

  {#if data.subscriptions.length === 0}
    <EmptyState title="No subscriptions found" message="Search by product, customer, or subscription id." />
  {:else}
    <AdminCard>
      <div class="table">
        <div class="thead"><span>Product</span><span>Customer</span><span>Status</span><span>Term</span><span>MMU</span><span>Order</span></div>
        {#each data.subscriptions as sub}
          <button class="row" type="button" on:click={() => loadDetail(sub.id)}>
            <span>{productLine(sub)}</span>
            <span>{sub.customer_email || '--'}</span>
            <span><StatusChip status={sub.status || 'unknown'} /></span>
            <span>{termLabel(sub.term_months)} · {formatDate(sub.start_date)} – {formatDate(sub.end_date)}</span>
            <span>{sub.mmu_label || '—'}</span>
            <span class="mono">{shortId(sub.order_id)}</span>
          </button>
        {/each}
      </div>
    </AdminCard>
  {/if}
</div>

{#if selected?.subscription}
  <button class="drawer-backdrop" type="button" on:click={closeDrawer} aria-label="Close subscription drawer"></button>
  <aside class="drawer">
    <button class="icon" type="button" on:click={closeDrawer} aria-label="Close"><X size={18} /></button>
    <header>
      <div>
        <h2>{productLine(selected.subscription)}</h2>
        <p>{selected.subscription.customer_email || selected.subscription.contact_email || '--'}</p>
      </div>
      <StatusChip status={selected.subscription.status} />
    </header>

    <section>
      <h3>Credentials</h3>
      <p><b>Login</b> <code>{selected.subscription.account_identifier || selected.subscription.customer_email || '--'}</code></p>
      <p><b>Password</b> ••••••••••••</p>
      <div class="actions">
        <button type="button" on:click={showCredentials}><Eye size={15} /> Show delivered</button>
        {#if selected.subscription.own_account_credentials_on_file}
          <button type="button" on:click={showOwnCredentials}><Eye size={15} /> Show submitted</button>
        {/if}
      </div>
      {#if credentials}<pre>{credentials}</pre>{/if}
      {#if ownCredentials}<pre>{ownCredentials}</pre>{/if}
    </section>

    <section>
      <h3>MMU schedule</h3>
      <div class="schedule">
        <p>Initial delivery · {formatDate(selectedTermStart)} {selected.subscription.delivered_at ? '✓' : '●'}</p>
        {#each selectedTasks as task}
          <p>{task.month_label || task.mmu_label || task.task_type} · {task.completed_at ? `✓ renewed ${formatDate(task.completed_at)}` : task.is_issue ? '⚠ issue' : `● current due ${formatDate(task.due_date)}`}</p>
        {/each}
      </div>
      {#if currentMmuTask}
        <a class="link-button" href={`/admin-next/fulfillment/mmu/${currentMmuTask.id}`}>Open current renewal →</a>
      {/if}
    </section>

    <section>
      <h3>Upgrade selection</h3>
      <p>{selected.subscription.selection_type || 'No selection'} {selected.subscription.account_identifier ? `· ${selected.subscription.account_identifier}` : ''}</p>
    </section>

    <section>
      <h3>Task history</h3>
      {#each selectedTasks as task}
        <p><code>{shortId(task.id)}</code> · {task.task_type} · {formatDateTime(task.due_date)} <StatusChip status={task.completed_at ? 'completed' : task.is_issue ? 'issue' : 'pending'} /></p>
      {/each}
      {#if selected.subscription.order_id}<a class="link-button" href={`/admin-next/orders/${selected.subscription.order_id}`}>Open order →</a>{/if}
    </section>
  </aside>
{/if}

<style>
  .page { display: grid; gap: 18px; }
  .filters { display: grid; grid-template-columns: minmax(260px, 1fr) 180px auto; gap: 12px; align-items: end; }
  label { display: grid; gap: 6px; color: #71717a; font-size: 12px; font-weight: 650; }
  input, select { min-height: 38px; border: 1px solid #dedee4; border-radius: 10px; padding: 0 10px; font: inherit; }
  button, .link-button { display: inline-flex; align-items: center; gap: 7px; min-height: 38px; border: 0; border-radius: 10px; background: #1a1a1c; color: white; padding: 0 14px; font-weight: 750; text-decoration: none; cursor: pointer; }
  .table { display: grid; overflow-x: auto; }
  .thead, .row { display: grid; grid-template-columns: minmax(220px, 1.4fr) 230px 110px 220px 240px 90px; gap: 14px; align-items: center; min-width: 1110px; text-align: left; }
  .thead { border-bottom: 1px solid #ececee; padding-bottom: 10px; color: #71717a; font-size: 12px; font-weight: 750; }
  .row { border-bottom: 1px solid #f0f0f2; background: transparent; color: #1a1a1c; padding: 13px 0; font: inherit; }
  .row:hover { background: #fafafa; }
  .mono, code, pre { font-family: 'JetBrains Mono', monospace; font-size: 12px; }
  .drawer-backdrop { position: fixed; inset: 0; z-index: 60; border: 0; background: rgba(26,26,28,.22); padding: 0; }
  .drawer { position: fixed; inset: 0 0 0 auto; z-index: 70; display: grid; align-content: start; gap: 16px; width: min(520px, 100vw); overflow-y: auto; border-left: 1px solid #ececee; background: #fff; padding: 22px; box-shadow: -20px 0 44px rgba(20,20,24,.12); }
  .icon { position: absolute; top: 14px; right: 14px; min-height: 32px; width: 32px; padding: 0; justify-content: center; background: #f4f4f5; color: #1a1a1c; }
  header { display: flex; justify-content: space-between; gap: 16px; padding-right: 38px; }
  h2, h3, p { margin: 0; }
  h3 { margin-bottom: 10px; font-size: 13px; color: #71717a; text-transform: uppercase; }
  section { border: 1px solid #ececee; border-radius: 12px; padding: 14px; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
  pre { white-space: pre-wrap; border-radius: 10px; background: #f6f6f7; padding: 10px; }
  .schedule { display: grid; gap: 8px; margin-bottom: 10px; }
</style>
