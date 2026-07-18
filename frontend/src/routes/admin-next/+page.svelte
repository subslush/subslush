<script lang="ts">
  import { ArrowRight, CheckCircle2, CreditCard, PackageCheck, TriangleAlert } from 'lucide-svelte';
  import AdminCard from '$lib/components/admin-next/AdminCard.svelte';
  import EmptyState from '$lib/components/admin-next/EmptyState.svelte';
  import ErrorBanner from '$lib/components/admin-next/ErrorBanner.svelte';
  import PageHeader from '$lib/components/admin-next/PageHeader.svelte';
  import StatusChip from '$lib/components/admin-next/StatusChip.svelte';
  import {
    formatDateTime,
    formatMoney,
    productLine,
    relativeTime,
    shortId,
    statusLabel,
    toNumber,
  } from '$lib/utils/adminNext.js';
  import type { AdminNextFulfillmentOrder, AdminNextPayment } from '$lib/types/adminNext.js';
  import type { PageData } from './$types';

  export let data: PageData;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const adminName = data.user?.displayName || data.user?.email || 'Admin';

  $: mmuTotal = toNumber(data.kpis.open_mmu_overdue) + toNumber(data.kpis.open_mmu_due_soon);
  $: awaitingTotal = toNumber(data.kpis.awaiting_customer) + toNumber(data.kpis.customer_ready);
  $: revenueByCurrency = (data.kpis.revenue_by_currency || [])
    .map(row => ({
      currency: String(row.currency || 'USD').toUpperCase(),
      amountCents: toNumber(row.amount_cents),
    }))
    .filter(row => row.amountCents > 0);

  const firstItem = (order: AdminNextFulfillmentOrder) => order.items?.[0] || null;

  const activityRows = () => {
    const rows: Array<{ tone: string; text: string; at?: string | null; href: string }> = [];
    for (const order of data.queues.newOrders) {
      rows.push({
        tone: 'amber',
        text: `New paid order ${shortId(order.id)} from ${order.customer_email || 'customer'}`,
        at: order.paid_at,
        href: `/admin-next/fulfillment/orders/${order.id}`,
      });
    }
    for (const order of data.queues.mmu) {
      const item = firstItem(order);
      if (!item) continue;
      rows.push({
        tone: item.overdue ? 'red' : 'amber',
        text: `${item.mmu_label || 'MMU renewal'} due for ${productLine(item)}`,
        at: item.due_date,
        href: item.task_id ? `/admin-next/fulfillment/mmu/${item.task_id}` : '/admin-next/fulfillment?tab=mmu',
      });
    }
    for (const order of data.queues.awaitingCustomer) {
      const item = firstItem(order);
      if (!item) continue;
      rows.push({
        tone: item.status === 'customer_ready' ? 'teal' : 'purple',
        text:
          item.status === 'customer_ready'
            ? `Customer ready for ${productLine(item)}`
            : `Waiting on customer for ${productLine(item)}`,
        at: order.paid_at,
        href: `/admin-next/fulfillment/orders/${order.id}#${item.subscription_id}`,
      });
    }
    for (const order of data.queues.completed) {
      rows.push({
        tone: 'green',
        text: `Delivered ${order.items?.length || 0} item order ${shortId(order.id)}`,
        at: order.paid_at,
        href: `/admin-next/fulfillment/orders/${order.id}`,
      });
    }
    for (const order of data.queues.issues) {
      const item = firstItem(order);
      rows.push({
        tone: 'red',
        text: `Issue flagged${item ? ` for ${productLine(item)}` : ''}`,
        at: item?.due_date || order.paid_at,
        href: `/admin-next/fulfillment/orders/${order.id}`,
      });
    }
    return rows.slice(0, 10);
  };

  const paymentAmount = (payment: AdminNextPayment) =>
    payment.amount_cents ?? payment.amount ?? 0;

  $: paymentRows = (data.payments as AdminNextPayment[])
    .filter(payment => ['succeeded', 'failed', 'canceled', 'expired'].includes(String(payment.status || '')))
    .slice(0, 8);
</script>

<svelte:head>
  <title>Admin Next Overview - SubSlush</title>
</svelte:head>

<div class="overview">
  <PageHeader
    title={`${greeting}, ${adminName} - here's what needs your attention today`}
    subtitle="Start with fulfillment work that is paid and ready for action."
  />

  <ErrorBanner message={data.error} />

  <section class="kpi-grid kpi-grid-four" aria-label="Primary KPIs">
    <a href="/admin-next/fulfillment?tab=new_orders">
      <AdminCard interactive>
        <PackageCheck size={20} />
        <p>Needs fulfillment</p>
        <strong>{toNumber(data.kpis.orders_needing_fulfillment)}</strong>
        <span>orders with undelivered items</span>
      </AdminCard>
    </a>
    <a href="/admin-next/fulfillment?tab=mmu">
      <AdminCard interactive>
        <CheckCircle2 size={20} />
        <p>MMU renewals due</p>
        <strong>{mmuTotal}</strong>
        <span><b class="red">{toNumber(data.kpis.open_mmu_overdue)} overdue</b> + {toNumber(data.kpis.open_mmu_due_soon)} due this week</span>
      </AdminCard>
    </a>
    <a href="/admin-next/fulfillment?tab=awaiting_customer">
      <AdminCard interactive accent={toNumber(data.kpis.customer_ready) > 0 ? 'teal' : 'none'}>
        <ArrowRight size={20} />
        <p>Awaiting customer</p>
        <strong>{awaitingTotal}</strong>
        <span>{toNumber(data.kpis.customer_ready) > 0 ? `${toNumber(data.kpis.customer_ready)} ready - action needed` : 'waiting on customer replies'}</span>
      </AdminCard>
    </a>
    <a href="/admin-next/fulfillment?tab=issues">
      <AdminCard interactive accent={toNumber(data.kpis.issue_tasks) > 0 ? 'red' : 'none'}>
        <TriangleAlert size={20} />
        <p>Issues</p>
        <strong>{toNumber(data.kpis.issue_tasks)}</strong>
        <span>open flagged items</span>
      </AdminCard>
    </a>
  </section>

  <section class="kpi-grid kpi-grid-three" aria-label="Recent KPIs">
    <a href="/admin-next/fulfillment?tab=completed">
      <AdminCard interactive>
        <p>Delivered</p>
        <strong>{toNumber(data.kpis.delivered_items_last_7d)}</strong>
        <span>last 7 days</span>
      </AdminCard>
    </a>
    <a href="/admin-next/payments" class="disabled-link">
      <AdminCard interactive>
        <CreditCard size={20} />
        <p>Revenue by currency</p>
        <div class="revenue-values" aria-label="Revenue by payment currency">
          {#if revenueByCurrency.length > 0}
            {#each revenueByCurrency as revenue}
              <strong>{formatMoney(revenue.amountCents, revenue.currency)}</strong>
            {/each}
          {:else}
            <strong>—</strong>
          {/if}
        </div>
        <span>successful payments · last 7 days</span>
      </AdminCard>
    </a>
    <a href="/admin-next/payments" class="disabled-link">
      <AdminCard interactive accent={toNumber(data.kpis.failed_payments_last_24h) > 0 ? 'red' : 'none'}>
        <p>Failed payments</p>
        <strong>{toNumber(data.kpis.failed_payments_last_24h)}</strong>
        <span>created in the last 24 hours</span>
      </AdminCard>
    </a>
  </section>

  <section class="feeds">
    <AdminCard>
      <div class="feed-head">
        <h2>Fulfillment activity</h2>
        <a href="/admin-next/fulfillment">Open queue</a>
      </div>
      {#if activityRows().length === 0}
        <EmptyState title="Nothing here - all caught up ✓" message="No fulfillment activity needs attention." />
      {:else}
        <div class="feed-list">
          {#each activityRows() as row}
            <a class="feed-row" href={row.href}>
              <span class="dot {row.tone}"></span>
              <span>{row.text}</span>
              <time>{relativeTime(row.at)}</time>
            </a>
          {/each}
        </div>
      {/if}
    </AdminCard>

    <AdminCard>
      <div class="feed-head">
        <h2>Payment activity</h2>
        <span>Recent succeeded and failed payments</span>
      </div>
      {#if paymentRows.length === 0}
        <EmptyState title="Nothing here - all caught up ✓" message="No recent succeeded or failed payment activity." />
      {:else}
        <div class="feed-list">
          {#each paymentRows as payment}
            <a class="payment-row" href={payment.order_id ? `/admin-next/fulfillment/orders/${payment.order_id}` : '/admin-next'}>
              <StatusChip status={payment.status} />
              <span>{payment.provider || payment.payment_provider || 'provider'} · {formatMoney(paymentAmount(payment), payment.currency || 'USD')}</span>
              <code>{payment.payment_ref || payment.payment_id || payment.id || '--'}</code>
              <time>{formatDateTime(payment.updated_at || payment.created_at)}</time>
            </a>
          {/each}
        </div>
      {/if}
    </AdminCard>
  </section>
</div>

<style>
  .overview {
    display: grid;
    gap: 22px;
  }

  .kpi-grid {
    display: grid;
    gap: 14px;
  }

  .kpi-grid-four {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .kpi-grid-three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  .disabled-link {
    cursor: default;
  }

  .kpi-grid :global(.admin-card) {
    display: grid;
    min-height: 138px;
    gap: 7px;
  }

  p,
  span {
    margin: 0;
  }

  p {
    color: #71717a;
    font-weight: 650;
  }

  strong {
    color: #1a1a1c;
    font-size: 30px;
    font-weight: 800;
    line-height: 1.05;
  }

  .revenue-values {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
  }

  .revenue-values strong {
    font-size: 22px;
  }

  span {
    color: #71717a;
    font-size: 13px;
  }

  .red {
    color: #c0392b;
  }

  .feeds {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .feed-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  h2 {
    margin: 0;
    color: #1a1a1c;
    font-size: 16px;
    font-weight: 750;
  }

  .feed-head a {
    color: #5b46e0;
    font-size: 13px;
    font-weight: 700;
  }

  .feed-list {
    display: grid;
    gap: 8px;
  }

  .feed-row,
  .payment-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border-radius: 10px;
    padding: 10px;
    color: #1a1a1c;
  }

  .payment-row {
    grid-template-columns: auto minmax(0, 1fr) minmax(120px, auto) auto;
  }

  .feed-row:hover,
  .payment-row:hover {
    background: #f6f6f7;
  }

  time {
    color: #9a9aa0;
    font-size: 12px;
    white-space: nowrap;
  }

  code {
    color: #1a1a1c;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 12px;
  }

  .dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
  }

  .dot.green {
    background: #1a7f45;
  }

  .dot.amber {
    background: #8a5a0f;
  }

  .dot.red {
    background: #c0392b;
  }

  .dot.teal {
    background: #0d857a;
  }

  .dot.purple {
    background: #7b3fd6;
  }
</style>
