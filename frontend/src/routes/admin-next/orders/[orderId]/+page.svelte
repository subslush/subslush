<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import AdminCard from '$lib/components/admin-next/AdminCard.svelte';
  import EmptyState from '$lib/components/admin-next/EmptyState.svelte';
  import ErrorBanner from '$lib/components/admin-next/ErrorBanner.svelte';
  import MethodBadge from '$lib/components/admin-next/MethodBadge.svelte';
  import StatusChip from '$lib/components/admin-next/StatusChip.svelte';
  import { adminNextService } from '$lib/api/adminNext.js';
  import { formatDateTime, formatMoney, shortId, termLabel } from '$lib/utils/adminNext.js';
  import type { AdminNextOrderFileItem } from '$lib/types/adminNext.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let note = '';
  let actionError = '';
  let actionMessage = '';
  let isMarkingPaid = false;
  $: file = data.file;
  $: order = file?.order;
  $: pending = order?.status === 'pending_payment';
  $: cancelled = ['cancelled', 'expired'].includes(String(order?.status || ''));
  $: provider = order?.payment_provider || 'provider';

  const methodFlags = (item: AdminNextOrderFileItem) => {
    const metadata = item.product_metadata?.upgrade_options || item.product_metadata?.upgradeOptions || {};
    return {
      manual_monthly_upgrade: metadata.manual_monthly_upgrade === true,
      activation_link_handshake: metadata.activation_link_handshake === true,
      strict_rules: metadata.strict_rules === true,
    };
  };

  const markPaid = async () => {
    if (!order || !note.trim() || isMarkingPaid) return;
    if (!confirm('Mark this order as paid manually? Only continue after verifying the provider dashboard.')) return;
    actionError = '';
    actionMessage = '';
    isMarkingPaid = true;
    try {
      await adminNextService.markOrderPaidManually(order.id, note.trim());
      actionMessage = 'Order marked paid. Fulfillment work is now available in the queue.';
      note = '';
      await invalidateAll();
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to mark order paid.';
    } finally {
      isMarkingPaid = false;
    }
  };

  const submitMarkPaid = (event: SubmitEvent) => {
    event.preventDefault();
    void markPaid();
  };
</script>

<svelte:head><title>Order File - Admin Next</title></svelte:head>

{#if !file || !order}
  <EmptyState title="Order not found" message={data.error || 'Unable to load order file.'} />
{:else}
  <div class="page">
    <a class="back" href="/admin-next/orders">← Orders</a>
    <header>
      <div>
        <h1>Order <span class="mono">{shortId(order.id)}</span></h1>
        <p>{file.customer?.delivery_email || file.customer?.account_email || 'No customer email'}</p>
      </div>
      <StatusChip status={order.status} />
    </header>

    <ErrorBanner message={data.error || actionError} />
    {#if actionMessage}<div class="success">{actionMessage}</div>{/if}

    {#if pending}
      <form class="pending-banner" onsubmit={submitMarkPaid}>
        <strong>Payment pending</strong>
        <p>{provider} checkout created {formatDateTime(order.created_at)}. No fulfillment task is created until payment is confirmed.</p>
        <label>
          <span>Verification note</span>
          <textarea maxlength="1000" bind:value={note} placeholder={`Confirmed manually in ${provider} dashboard, ref ...`}></textarea>
        </label>
        <button type="submit" disabled={isMarkingPaid || !note.trim()}>{isMarkingPaid ? 'Marking as paid…' : 'Mark as paid manually'}</button>
        <small>Only use this if the provider dashboard confirms payment but the webhook failed. Marking as paid creates the fulfillment task and moves this order into the queue.</small>
      </form>
    {/if}

    <div class="grid">
      <main>
        <AdminCard>
          <h2>Items</h2>
          <div class="stack">
            {#each file.items as item}
              <div class="item">
                <div>
                  <strong>{item.product_name || 'Product'} · {item.variant_name || 'Default'}</strong>
                  <p>{termLabel(item.term_months)}</p>
                  <div class="badges">
                    {#if methodFlags(item).manual_monthly_upgrade}<MethodBadge label="MMU" />{/if}
                    {#if methodFlags(item).activation_link_handshake}<MethodBadge label="Activation link" />{/if}
                    {#if methodFlags(item).strict_rules}<MethodBadge label="Strict rules" />{/if}
                  </div>
                </div>
                <div>
                  <StatusChip status={pending ? 'pending' : item.status || 'pending'} label={pending ? 'Awaiting payment' : null} />
                  {#if item.delivered_at}<time>{formatDateTime(item.delivered_at)}</time>{/if}
                </div>
              </div>
            {/each}
          </div>
        </AdminCard>

        <AdminCard>
          <h2>Payments</h2>
          {#if file.payments.length === 0 && file.payment_events.length === 0}
            <EmptyState title="No payment events" message="No payment records are attached yet." />
          {:else}
            <div class="timeline">
              {#each file.payments as payment}
                <div><span></span><p><b>{payment.status}</b> {payment.provider} <code>{payment.payment_ref}</code></p><time>{formatDateTime(payment.created_at)}</time></div>
              {/each}
              {#each file.payment_events as event}
                <div><span></span><p><b>{event.event_type}</b> <code>{event.event_id}</code></p><time>{formatDateTime(event.created_at)}</time></div>
              {/each}
            </div>
          {/if}
        </AdminCard>

        <AdminCard>
          <h2>Evidence log · chargeback protection</h2>
          {#if file.evidence.length === 0}
            <EmptyState title="No evidence yet" message={pending ? 'Evidence starts after payment is confirmed.' : 'No reveal or compliance evidence has been recorded.'} />
          {:else}
            <div class="timeline">
              {#each file.evidence as event}
                <div><span></span><p><b>{event.event_type}</b> <code>{event.ip_address || '--'}</code> <code>{event.user_agent || '--'}</code></p><time>{formatDateTime(event.created_at)}</time></div>
              {/each}
            </div>
          {/if}
        </AdminCard>
      </main>

      <aside>
        <AdminCard>
          <h2>Summary</h2>
          <dl>
            <dt>Subtotal</dt><dd>{formatMoney(order.subtotal_cents, order.currency || 'USD')}</dd>
            <dt>Coupon</dt><dd>{order.coupon_code ? `${order.coupon_code} · ${formatMoney(order.coupon_discount_cents || order.discount_cents, order.currency || 'USD')}` : 'Not used'}</dd>
            <dt>Total</dt><dd>{formatMoney(order.total_cents, order.currency || 'USD')}</dd>
          </dl>
          {#if file.open_fulfillment.length > 0}
            <a class="button" href={`/admin-next/fulfillment/orders/${order.id}`}>Open in Fulfillment queue →</a>
          {/if}
        </AdminCard>

        <AdminCard>
          <h2>Emails sent</h2>
          {#if file.emails?.item_delivery_sent?.length}
            {#each file.emails.item_delivery_sent as email}
              <p>{email.product_name || 'Item'} · {formatDateTime(email.sent_at)}</p>
            {/each}
          {:else}
            <p class="muted">No delivery emails sent.</p>
          {/if}
        </AdminCard>

        <AdminCard>
          <h2>Guest claim</h2>
          {#if file.guest_claim?.needed}
            <p>{file.guest_claim.claimed_at ? `Claimed ${formatDateTime(file.guest_claim.claimed_at)}` : 'Guest order · not claimed yet'}</p>
          {:else}
            <p>Placed while signed in — no claim needed.</p>
          {/if}
        </AdminCard>
      </aside>
    </div>
  </div>
{/if}

<style>
  .page { display: grid; gap: 18px; }
  .back { color: #5f5f66; text-decoration: none; font-weight: 700; }
  header, .item { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  h1, h2, p { margin: 0; }
  h1 { font-size: 23px; }
  h2 { margin-bottom: 14px; font-size: 15px; }
  .mono, code { font-family: 'JetBrains Mono', monospace; }
  .success { border: 1px solid #bde7ce; border-radius: 10px; background: #e7f6ee; padding: 12px; color: #1a7f45; font-weight: 700; }
  .pending-banner { display: grid; gap: 10px; border: 1px solid #e2c77a; border-radius: 13px; background: #fff6df; padding: 16px; color: #5d4306; }
  textarea { min-height: 76px; resize: vertical; border: 1px solid #d9c075; border-radius: 10px; padding: 10px; font: inherit; }
  button, .button { width: fit-content; border: 0; border-radius: 10px; background: #1a1a1c; color: white; padding: 10px 14px; font-weight: 750; text-decoration: none; cursor: pointer; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  .grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; align-items: start; }
  main, aside, .stack { display: grid; gap: 14px; }
  .item { border-bottom: 1px solid #f0f0f2; padding-bottom: 12px; }
  .item:last-child { border-bottom: 0; padding-bottom: 0; }
  .badges { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  time, .muted, small { display: block; margin-top: 5px; color: #71717a; font-size: 12px; }
  .timeline { display: grid; gap: 12px; }
  .timeline > div { display: grid; grid-template-columns: 10px 1fr auto; gap: 10px; align-items: start; }
  .timeline span { width: 9px; height: 9px; margin-top: 5px; border-radius: 999px; background: #5b46e0; }
  dl { display: grid; grid-template-columns: 1fr auto; gap: 10px; }
  dt { color: #71717a; }
  dd { margin: 0; font-weight: 750; text-align: right; }
  @media (max-width: 980px) { .grid { grid-template-columns: 1fr; } }
</style>
