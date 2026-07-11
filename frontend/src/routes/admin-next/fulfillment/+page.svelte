<script lang="ts">
  import { goto } from '$app/navigation';
  import AdminCard from '$lib/components/admin-next/AdminCard.svelte';
  import DeliveryBadges from '$lib/components/admin-next/DeliveryBadges.svelte';
  import EmptyState from '$lib/components/admin-next/EmptyState.svelte';
  import ErrorBanner from '$lib/components/admin-next/ErrorBanner.svelte';
  import PageHeader from '$lib/components/admin-next/PageHeader.svelte';
  import StatusChip from '$lib/components/admin-next/StatusChip.svelte';
  import {
    formatDate,
    formatDateTime,
    formatMoney,
    isDeliveredItem,
    isGuestEmail,
    orderItemCount,
    productLine,
    relativeTime,
    shortId,
    statusLabel,
    termLabel,
  } from '$lib/utils/adminNext.js';
  import type {
    AdminNextFulfillmentOrder,
    AdminNextFulfillmentQueueItem,
    AdminNextQueueTab,
  } from '$lib/types/adminNext.js';
  import type { PageData } from './$types';

  export let data: PageData;

  const tabs: Array<{ key: AdminNextQueueTab; label: string }> = [
    { key: 'new_orders', label: 'New orders' },
    { key: 'mmu', label: 'MMU renewals' },
    { key: 'awaiting_customer', label: 'Awaiting customer' },
    { key: 'issues', label: 'Issues' },
    { key: 'completed', label: 'Completed' },
  ];

  let activeTab = (data.activeTab as AdminNextQueueTab) || 'new_orders';
  let methodFilter = 'all';
  let productFilter = 'all';
  let assigneeFilter = 'all';
  let overdueOnly = false;

  $: queues = data.queues;
  $: products = Array.from(
    new Set(
      Object.values(queues)
        .flat()
        .flatMap(order => order.items || [])
        .map(item => item.product_name)
        .filter(Boolean) as string[]
    )
  ).sort();
  $: visibleOrders = filterOrders(queues[activeTab] || []);

  const tabCount = (key: AdminNextQueueTab) =>
    (queues[key] || []).reduce((count, order) => count + (order.items?.length || 0), 0);

  const setTab = async (tab: AdminNextQueueTab) => {
    activeTab = tab;
    await goto(`/admin-next/fulfillment?tab=${tab}`, { replaceState: true, noScroll: true });
  };

  const itemMatchesMethod = (item: AdminNextFulfillmentQueueItem) => {
    if (methodFilter === 'all') return true;
    if (methodFilter === 'mmu') return Boolean(item.delivery_method?.manual_monthly_upgrade);
    if (methodFilter === 'activation_link') return Boolean(item.delivery_method?.activation_link_handshake);
    if (methodFilter === 'strict_rules') return Boolean(item.delivery_method?.strict_rules);
    return true;
  };

  function filterOrders(orders: AdminNextFulfillmentOrder[]) {
    return orders
      .map(order => ({
        ...order,
        items: (order.items || []).filter(item => {
          const matchesMethod = itemMatchesMethod(item);
          const matchesProduct = productFilter === 'all' || item.product_name === productFilter;
          const matchesOverdue = !overdueOnly || item.overdue === true;
          return matchesMethod && matchesProduct && matchesOverdue;
        }),
      }))
      .filter(order => (order.items || []).length > 0);
  }
</script>

<svelte:head>
  <title>Fulfillment Queue - Admin Next</title>
</svelte:head>

<div class="queue-page">
  <PageHeader
    title="Fulfillment queue"
    subtitle="Only paid orders appear here. Pending checkouts stay under Orders until payment is confirmed. Work top to bottom - oldest first. Each item is delivered independently."
  />

  <ErrorBanner message={data.error} />

  <div class="tabs" role="tablist" aria-label="Fulfillment tabs">
    {#each tabs as tab}
      <button class:active={activeTab === tab.key} type="button" on:click={() => setTab(tab.key)}>
        <span>{tab.label}</span>
        <b>{tabCount(tab.key)}</b>
      </button>
    {/each}
  </div>

  <AdminCard>
    <div class="filters">
      <label>
        <span>Delivery method</span>
        <select bind:value={methodFilter}>
          <option value="all">All methods</option>
          <option value="activation_link">Activation link</option>
          <option value="strict_rules">Strict rules</option>
          <option value="mmu">MMU</option>
        </select>
      </label>
      <label>
        <span>Product</span>
        <select bind:value={productFilter}>
          <option value="all">All products</option>
          {#each products as product}
            <option value={product}>{product}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>Assignee</span>
        <select bind:value={assigneeFilter} disabled>
          <option value="all">Anyone</option>
        </select>
      </label>
      <label class="checkbox">
        <input type="checkbox" bind:checked={overdueOnly} />
        <span>Overdue only</span>
      </label>
      <p>Sorted: oldest first</p>
    </div>
  </AdminCard>

  {#if visibleOrders.length === 0}
    <EmptyState title="Nothing here - all caught up ✓" message="No paid fulfillment work in this tab." />
  {:else if activeTab === 'new_orders'}
    <div class="cards">
      {#each visibleOrders as order}
        <AdminCard>
          <div class="order-head">
            <div>
              <a class="mono title-link" href={`/admin-next/fulfillment/orders/${order.id}`}>{shortId(order.id)}</a>
              <span class="email">{order.customer_email || 'No email'}</span>
              {#if order.guest || isGuestEmail(order.customer_email)}
                <span class="guest">Guest</span>
              {/if}
            </div>
            <StatusChip status="verified" label={`✓ Paid · ${order.payment?.provider || 'provider'} · ${formatMoney(order.payment?.total_cents, order.payment?.currency || 'USD')}`} />
            <time>{formatDateTime(order.paid_at)}</time>
            <strong>{order.delivered_count || 0} of {orderItemCount(order)} items delivered</strong>
          </div>
          <div class="item-list">
            {#each order.items || [] as item}
              <div class="item-row">
                <div>
                  <p>{productLine(item)} <span>· {termLabel(item.term_months)}</span></p>
                  <DeliveryBadges
                    method={item.delivery_method}
                    itemType={item.selection_type === 'own_account' ? 'own_account' : 'new_account'}
                  />
                </div>
                <StatusChip status={item.status || 'awaiting_fulfillment'} />
                {#if isDeliveredItem(item)}
                  <span class="delivered-text">Delivered</span>
                {:else}
                  <a class="primary-button" href={`/admin-next/fulfillment/orders/${order.id}#${item.subscription_id}`}>Fulfill</a>
                {/if}
              </div>
            {/each}
          </div>
        </AdminCard>
      {/each}
    </div>
  {:else if activeTab === 'mmu'}
    <div class="cards">
      {#each visibleOrders as order}
        {#each order.items || [] as item}
          <AdminCard accent={item.overdue ? 'red' : 'amber'}>
            <div class="task-card">
              <div>
                <h2>{productLine(item)} - MMU renewal</h2>
                <p>{item.mmu_label || 'MMU renewal'} · {order.customer_email || 'customer'}</p>
                <StatusChip status={item.overdue ? 'overdue' : 'due soon'} label={item.overdue ? `Due ${formatDate(item.due_date)} · overdue` : `Due ${formatDate(item.due_date)}`} />
              </div>
              <a class="primary-button" href={item.task_id ? `/admin-next/fulfillment/mmu/${item.task_id}` : '/admin-next/fulfillment?tab=mmu'}>Open renewal</a>
            </div>
          </AdminCard>
        {/each}
      {/each}
    </div>
  {:else if activeTab === 'awaiting_customer'}
    <div class="cards">
      {#each visibleOrders as order}
        {#each order.items || [] as item}
          <AdminCard accent={item.status === 'customer_ready' ? 'teal' : 'purple'}>
            <div class="task-card">
              <div>
                <h2>{productLine(item)}</h2>
                <p>{order.customer_email || 'customer'} · Order <span class="mono">{shortId(order.id)}</span></p>
                {#if item.status === 'customer_ready'}
                  <p class="attention">Customer confirmed ready {relativeTime(order.paid_at)} - obtain & deliver the activation link now</p>
                  <StatusChip status="customer_ready" />
                {:else}
                  <p>Waiting for the customer to confirm they are ready to activate.</p>
                  <StatusChip status="awaiting_customer" />
                {/if}
              </div>
              <a class={item.status === 'customer_ready' ? 'teal-button' : 'secondary-button'} href={`/admin-next/fulfillment/orders/${order.id}#${item.subscription_id}`}>
                {item.status === 'customer_ready' ? 'Deliver link' : 'Review'}
              </a>
            </div>
          </AdminCard>
        {/each}
      {/each}
    </div>
  {:else if activeTab === 'issues'}
    <div class="cards">
      {#each visibleOrders as order}
        {#each order.items || [] as item}
          <AdminCard accent="red">
            <div class="task-card">
              <div>
                <h2><span class="mono">{shortId(order.id)}</span> · {productLine(item)}</h2>
                <p>{order.customer_email || 'customer'}</p>
                <StatusChip status="issue" label="Issue" />
              </div>
              <a class="secondary-button danger" href={`/admin-next/fulfillment/orders/${order.id}#${item.subscription_id}`}>Review</a>
            </div>
          </AdminCard>
        {/each}
      {/each}
    </div>
  {:else}
    <AdminCard>
      <div class="completed-list">
        {#each visibleOrders as order}
          <a href={`/admin-next/fulfillment/orders/${order.id}`}>
            <span class="mono">{shortId(order.id)}</span>
            <span>{order.items?.map(productLine).join(', ') || 'Items'}</span>
            <span>{order.customer_email || 'customer'}</span>
            <time>{formatDateTime(order.paid_at)}</time>
            <StatusChip status="delivered" />
          </a>
        {/each}
      </div>
    </AdminCard>
  {/if}
</div>

<style>
  .queue-page {
    display: grid;
    gap: 18px;
  }

  .tabs {
    display: flex;
    gap: 8px;
    border-bottom: 1px solid #ececee;
  }

  .tabs button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: #71717a;
    padding: 0 2px 12px;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .tabs button.active {
    border-color: #5b46e0;
    color: #1a1a1c;
  }

  .tabs b {
    border-radius: 999px;
    background: #ece8fb;
    color: #5b46e0;
    padding: 2px 7px;
    font-size: 11px;
  }

  .filters {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
    align-items: end;
    gap: 12px;
  }

  label {
    display: grid;
    gap: 6px;
  }

  label span,
  .filters p {
    margin: 0;
    color: #71717a;
    font-size: 12px;
    font-weight: 650;
  }

  select {
    width: 100%;
    height: 38px;
    border: 1px solid #ececee;
    border-radius: 9px;
    background: #ffffff;
    color: #1a1a1c;
    padding: 0 10px;
  }

  .checkbox {
    display: flex;
    align-items: center;
    height: 38px;
  }

  .cards {
    display: grid;
    gap: 14px;
  }

  .order-head {
    display: grid;
    grid-template-columns: minmax(280px, 1fr) auto auto auto;
    align-items: center;
    gap: 14px;
    padding-bottom: 14px;
    border-bottom: 1px solid #ececee;
  }

  .mono {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
  }

  .title-link {
    color: #5b46e0;
    font-weight: 750;
    text-decoration: none;
  }

  .email {
    margin-left: 10px;
    color: #1a1a1c;
  }

  .guest {
    margin-left: 8px;
    border-radius: 6px;
    background: #eef0f2;
    color: #5f5f66;
    padding: 2px 6px;
    font-size: 11px;
    font-weight: 700;
  }

  time {
    color: #71717a;
    font-size: 12px;
  }

  .order-head strong {
    color: #1a1a1c;
    font-size: 13px;
  }

  .item-list {
    display: grid;
    gap: 10px;
    margin-top: 14px;
  }

  .item-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 14px;
    border-radius: 10px;
    background: #fbfbfc;
    padding: 12px;
  }

  .item-row p,
  .task-card p {
    margin: 0 0 7px;
    color: #1a1a1c;
    font-weight: 650;
  }

  .item-row p span,
  .task-card p {
    color: #71717a;
    font-weight: 500;
  }

  .primary-button,
  .secondary-button,
  .teal-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 34px;
    border-radius: 9px;
    padding: 0 13px;
    text-decoration: none;
    font-size: 13px;
    font-weight: 750;
  }

  .primary-button {
    background: #5b46e0;
    color: #ffffff;
  }

  .teal-button {
    background: #0d857a;
    color: #ffffff;
  }

  .secondary-button {
    border: 1px solid #ececee;
    color: #1a1a1c;
  }

  .secondary-button.danger {
    border-color: #f5c7c2;
    color: #c0392b;
  }

  .delivered-text {
    color: #1a7f45;
    font-size: 13px;
    font-weight: 700;
  }

  .task-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  h2 {
    margin: 0 0 6px;
    color: #1a1a1c;
    font-size: 16px;
    font-weight: 750;
  }

  .attention {
    color: #0d857a !important;
    font-weight: 700 !important;
  }

  .completed-list {
    display: grid;
    gap: 8px;
  }

  .completed-list a {
    display: grid;
    grid-template-columns: 110px minmax(0, 1fr) minmax(180px, auto) auto auto;
    align-items: center;
    gap: 12px;
    border-radius: 10px;
    color: #1a1a1c;
    padding: 11px;
    text-decoration: none;
  }

  .completed-list a:hover {
    background: #f6f6f7;
  }
</style>
