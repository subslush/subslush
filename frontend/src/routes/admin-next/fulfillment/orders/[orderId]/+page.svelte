<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Check, ChevronDown, ChevronUp, Copy, Eye, EyeOff, Flag, Lock } from 'lucide-svelte';
  import AdminCard from '$lib/components/admin-next/AdminCard.svelte';
  import DeliveryBadges from '$lib/components/admin-next/DeliveryBadges.svelte';
  import EmptyState from '$lib/components/admin-next/EmptyState.svelte';
  import ErrorBanner from '$lib/components/admin-next/ErrorBanner.svelte';
  import StatusChip from '$lib/components/admin-next/StatusChip.svelte';
  import { adminNextService } from '$lib/api/adminNext.js';
  import {
    formatDateTime,
    formatMoney,
    isDeliveredItem,
    productLine,
    termLabel,
  } from '$lib/utils/adminNext.js';
  import type { AdminNextFulfillmentDetailItem } from '$lib/types/adminNext.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let aggregate = data.aggregate;
  let actionMessage = '';
  let actionError = data.error || '';
  let credentialDrafts: Record<string, string> = {};
  let instructionDrafts: Record<string, string> = {};
  let activationLinks: Record<string, string> = {};
  let shownCredentials: Record<string, string> = {};
  let shownOwnCredentials: Record<string, string> = {};
  let expanded: Record<string, boolean> = {};
  let passwordVisible: Record<string, boolean> = {};
  let rulesModal: AdminNextFulfillmentDetailItem | null = null;
  let issueNotes: Record<string, string> = {};
  let issueOpen: Record<string, boolean> = {};

  $: aggregate = data.aggregate;
  $: order = aggregate?.order;
  $: customer = aggregate?.customer;
  $: items = aggregate?.items || [];
  $: deliveredCount = items.filter(isDeliveredItem).length;
  $: paymentSucceeded = ['paid', 'in_process', 'delivered', 'succeeded'].includes(String(order?.payment_status || ''));
  $: remainingEligible = items.filter(item => !isDeliveredItem(item) && item.credentials_on_file && paymentSucceeded && !item.product_options?.activation_link_handshake);

  const setBusy = () => {
    actionMessage = '';
    actionError = '';
  };

  const refresh = async () => {
    if (order?.id) {
      aggregate = await adminNextService.getOrder(order.id);
    }
    await invalidateAll();
  };

  const saveCredentials = async (item: AdminNextFulfillmentDetailItem) => {
    const value = credentialDrafts[item.subscription_id]?.trim();
    if (!value) {
      actionError = 'Enter credentials before saving.';
      return;
    }
    setBusy();
    try {
      await adminNextService.saveCredentials(item.subscription_id, {
        credentials: value,
        reason: 'credential_provisioned_from_admin_next',
      });
      credentialDrafts = { ...credentialDrafts, [item.subscription_id]: '' };
      actionMessage = 'Credentials saved ✓';
      await refresh();
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to save credentials.';
    }
  };

  const deliverItem = async (item: AdminNextFulfillmentDetailItem) => {
    if (!order) return;
    setBusy();
    try {
      await adminNextService.deliverItem(order.id, item.subscription_id);
      actionMessage = 'Item delivered.';
      await refresh();
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to deliver item.';
    }
  };

  const deliverAllRemaining = async () => {
    if (!order) return;
    setBusy();
    try {
      for (const item of remainingEligible) {
        await adminNextService.deliverItem(order.id, item.subscription_id);
      }
      actionMessage = 'Remaining eligible items delivered.';
      await refresh();
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to deliver remaining items.';
    }
  };

  const deliverInstructions = async (item: AdminNextFulfillmentDetailItem) => {
    if (!order) return;
    const template =
      instructionDrafts[item.subscription_id] ||
      item.product_options?.activation_instructions_template ||
      '';
    if (!template.trim()) {
      actionError = 'Enter activation instructions before sending.';
      return;
    }
    setBusy();
    try {
      await adminNextService.deliverActivationInstructions(order.id, item.subscription_id, template);
      actionMessage = 'Instructions delivered.';
      await refresh();
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to deliver instructions.';
    }
  };

  const deliverLink = async (item: AdminNextFulfillmentDetailItem) => {
    if (!order) return;
    const link = activationLinks[item.subscription_id]?.trim();
    if (!link) {
      actionError = 'Paste the activation link before delivering.';
      return;
    }
    setBusy();
    try {
      await adminNextService.deliverActivationLink(order.id, item.subscription_id, link);
      actionMessage = 'Activation link delivered.';
      await refresh();
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to deliver activation link.';
    }
  };

  const restartActivation = async (item: AdminNextFulfillmentDetailItem) => {
    if (!order) return;
    if (!confirm('Restart activation for this item?')) return;
    setBusy();
    try {
      await adminNextService.restartActivation(order.id, item.subscription_id, 'Restarted from admin-next');
      actionMessage = 'Activation step restarted.';
      await refresh();
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to restart activation.';
    }
  };

  const showDeliveredCredentials = async (item: AdminNextFulfillmentDetailItem) => {
    setBusy();
    try {
      const result = await adminNextService.viewSubscriptionCredentials(item.subscription_id);
      shownCredentials = {
        ...shownCredentials,
        [item.subscription_id]: result.credentials || 'No credentials on file.',
      };
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to show credentials.';
    }
  };

  const showOwnAccountCredentials = async (item: AdminNextFulfillmentDetailItem) => {
    setBusy();
    try {
      const result = await adminNextService.viewOwnAccountCredentials(item.subscription_id);
      shownOwnCredentials = {
        ...shownOwnCredentials,
        [item.subscription_id]: `${item.submitted_account_identifier || result.account_identifier || 'Account'}\n${result.credentials || ''}`,
      };
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to show customer account.';
    }
  };

  const flagItemIssue = async (item: AdminNextFulfillmentDetailItem) => {
    if (!item.task_id) return;
    setBusy();
    try {
      await adminNextService.flagTaskIssue(
        item.task_id,
        issueNotes[item.subscription_id] || 'Issue flagged from admin-next fulfillment detail'
      );
      actionMessage = 'Issue flagged.';
      issueOpen = { ...issueOpen, [item.subscription_id]: false };
      issueNotes = { ...issueNotes, [item.subscription_id]: '' };
      await refresh();
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to flag issue.';
    }
  };

  const copyText = async (value: string) => {
    await navigator.clipboard.writeText(value);
    actionMessage = 'Copied.';
  };

  const itemStatus = (item: AdminNextFulfillmentDetailItem) =>
    item.handshake_state === 'customer_ready'
        ? 'customer_ready'
        : item.handshake_state === 'awaiting_customer'
          ? 'awaiting_customer'
          : isDeliveredItem(item)
            ? 'delivered'
          : 'awaiting_fulfillment';

  const stepIndex = (item: AdminNextFulfillmentDetailItem) => {
    if (item.handshake_state === 'customer_ready') return 3;
    if (item.handshake_state === 'awaiting_customer' || item.handshake_state === 'instructions_delivered') return 2;
    if (isDeliveredItem(item) || item.handshake_state === 'link_delivered') return 4;
    return 1;
  };
</script>

<svelte:head>
  <title>Fulfill Order - Admin Next</title>
</svelte:head>

{#if !aggregate || !order}
  <EmptyState title="Order not found" message={actionError || 'Unable to load fulfillment detail.'} />
{:else}
  <div class="detail-page">
    <a class="back-link" href="/admin-next/fulfillment">← Back to fulfillment queue</a>
    <header class="detail-header">
      <div>
        <h1>Fulfill order <span class="mono">#{order.id}</span></h1>
        <p>Deliver each item below in order. The customer is notified per item as it's delivered.</p>
      </div>
      <StatusChip status={deliveredCount === items.length ? 'completed' : 'in progress'} label={`${deliveredCount} of ${items.length} delivered`} />
    </header>

    <ErrorBanner message={actionError} />
    {#if actionMessage}
      <div class="success-banner">{actionMessage}</div>
    {/if}

    <AdminCard>
      <div class="strip">
        <div>
          <h2>Customer</h2>
          <dl>
            <dt>Account email</dt><dd>{customer?.account_email || '--'}</dd>
            <dt>Delivery email</dt><dd>{customer?.delivery_email || '--'}</dd>
            <dt>Account status</dt><dd><StatusChip status={customer?.status || 'active'} /></dd>
            <dt>Last login</dt><dd>{formatDateTime(customer?.last_login)}</dd>
            <dt>Guest claim</dt><dd>{customer?.guest ? customer.guest_claimed_at ? 'Registered account' : 'Guest - not yet claimed' : 'Registered account'}</dd>
          </dl>
        </div>
        <div>
          <h2>Order & payment</h2>
          <dl>
            {#each items as item}
              <dt class="item-price-name">{productLine(item)}</dt>
              <dd>{formatMoney(item.total_price_cents, item.currency || order.currency || 'USD')}</dd>
            {/each}
            <dt>Total</dt><dd>{formatMoney(order.total_cents, order.currency || 'USD')}</dd>
            <dt>Coupon</dt><dd>{order.coupon_code ? `${order.coupon_code}` : 'Not used'}</dd>
            <dt>Provider</dt><dd>{order.provider || '--'}</dd>
            <dt>Payment ref</dt><dd class="mono">{order.payment_ref || '--'}</dd>
            <dt>Paid timestamp</dt><dd>{formatDateTime(order.paid_at)}</dd>
          </dl>
        </div>
      </div>
    </AdminCard>

    {#if paymentSucceeded}
      <div class="payment-banner ok">✓ Payment verified automatically via {order.provider || 'provider'} webhook · {formatMoney(order.total_cents, order.currency || 'USD')} · {formatDateTime(order.paid_at)}</div>
    {:else}
      <div class="payment-banner bad">Payment state inconsistent - check the Payments page before delivering</div>
    {/if}

    <section class="items-section">
      <h2>Items · {items.length}</h2>
      {#each items as item}
        <AdminCard>
          <article id={item.subscription_id} class="item-card">
            {#if item.product_options?.activation_link_handshake}
              <div class="item-head">
                <div>
                  <h3>{productLine(item)} · {termLabel(item.term_months)}</h3>
                  <DeliveryBadges method={item.product_options} />
                </div>
                <StatusChip status={itemStatus(item)} />
              </div>
              <div class="stepper">
                {#each ['Send instructions', 'Awaiting customer', 'Customer ready', 'Delivered'] as label, index}
                  <span class:done={stepIndex(item) > index + 1} class:current={stepIndex(item) === index + 1}>{index + 1} {label}</span>
                {/each}
              </div>
              {#if stepIndex(item) === 1}
                <textarea rows="5" maxlength="4000" bind:value={instructionDrafts[item.subscription_id]} placeholder={item.product_options?.activation_instructions_template || 'Activation instructions'}></textarea>
                <button class="primary-button" type="button" disabled={!paymentSucceeded} on:click={() => deliverInstructions(item)}>Deliver instructions</button>
              {:else if stepIndex(item) === 2}
                <div class="info purple">Awaiting customer. Instructions sent. Waiting for the customer to press "I'm ready to activate".</div>
              {:else if stepIndex(item) === 3}
                <div class="info teal">Customer is ready now. Obtain the link from the supplier and paste it below - it expires 2 hours after generation.</div>
                <input class="mono" maxlength="4000" bind:value={activationLinks[item.subscription_id]} placeholder="Activation link" />
                <button class="teal-button" type="button" disabled={!paymentSucceeded} on:click={() => deliverLink(item)}>Deliver link</button>
              {:else}
                <div class="info green">Link delivered {formatDateTime(item.delivered_at)}. Customer notified their activation link is ready.</div>
                <button class="quiet-link" type="button" on:click={() => restartActivation(item)}>Link expired unused? Restart activation step</button>
                <p class="caption">Returns the item to Awaiting customer and notifies them to confirm readiness again. Every restart is logged.</p>
              {/if}
            {:else if isDeliveredItem(item)}
              <div class="delivered-row">
                <Check size={20} />
                <div>
                  <h3>{productLine(item)} · {termLabel(item.term_months)}</h3>
                  <DeliveryBadges method={item.product_options} />
                  <p>
                    Delivered {formatDateTime(item.delivered_at)} · delivery email sent ✓ · credentials on file ✓
                    {#if item.product_options?.strict_rules && item.rulesAcknowledged}
                      · Rules accepted ✓ {formatDateTime(item.rulesAcknowledged.at)} · IP {item.rulesAcknowledged.ip || '--'} · rules v{item.rulesAcknowledged.version || '--'}
                    {/if}
                  </p>
                </div>
                <button class="icon-button" type="button" on:click={() => (expanded[item.subscription_id] = !expanded[item.subscription_id])} aria-label="Expand delivered item">
                  {#if expanded[item.subscription_id]}<ChevronUp size={18} />{:else}<ChevronDown size={18} />{/if}
                </button>
              </div>
              {#if expanded[item.subscription_id]}
                <div class="delivered-detail">
                  <div>
                    <h4>Delivered credentials</h4>
                    {#if shownCredentials[item.subscription_id]}
                      <pre class="mono">{passwordVisible[item.subscription_id] ? shownCredentials[item.subscription_id] : '••••••••••••'}</pre>
                      <button type="button" class="secondary-button" on:click={() => (passwordVisible[item.subscription_id] = !passwordVisible[item.subscription_id])}>{passwordVisible[item.subscription_id] ? 'Hide' : 'Show'}</button>
                      <button type="button" class="secondary-button" on:click={() => copyText(shownCredentials[item.subscription_id])}><Copy size={14} /> Copy</button>
                    {:else}
                      <button type="button" class="secondary-button" on:click={() => showDeliveredCredentials(item)}><Eye size={14} /> Show</button>
                    {/if}
                    <p>Viewing is audit-logged</p>
                  </div>
                  <div>
                    <h4>Delivery</h4>
                    <p>Delivered {formatDateTime(item.delivered_at)} by {item.delivered_by || 'admin'} · Delivery email sent {formatDateTime(item.delivery_email_sent_at)} ✓</p>
                  </div>
                  <div>
                    <h4>Customer reveal status</h4>
                    <p>{item.customer_revealed ? '● Revealed by customer' : '○ Not yet revealed by customer'}</p>
                  </div>
                </div>
              {/if}
            {:else}
              <div class="item-head">
                <div>
                  <h3>{productLine(item)} · {termLabel(item.term_months)}</h3>
                  <DeliveryBadges method={item.product_options} />
                </div>
                <StatusChip status={itemStatus(item)} />
              </div>
              <div class="steps-two">
                <div class="step-circle">1</div>
                <div>
                  <h4>Provision</h4>
                  <p>Provision the access, then save exactly what the customer should see on Reveal.</p>
                  {#if item.product_options?.strict_rules}
                    <div class="info red"><strong>Strict rules product</strong> - the customer must accept the usage rules (v{item.product_options.strict_rules_version || 1}) before credentials are revealed. Do not paste the rules into the credentials field; only enter the credentials. <button type="button" on:click={() => (rulesModal = item)}>View rules</button></div>
                  {/if}
                  {#if item.selection_type === 'own_account'}
                    <div class="own-account">
                      <Lock size={14} />
                      <span>Customer's submitted account</span>
                      <code class="mono">{item.submitted_account_identifier || 'No login submitted'}</code>
                      {#if shownOwnCredentials[item.subscription_id]}
                        <pre class="mono">{shownOwnCredentials[item.subscription_id]}</pre>
                        <button type="button" class="secondary-button" on:click={() => (shownOwnCredentials = { ...shownOwnCredentials, [item.subscription_id]: '' })}><EyeOff size={14} /> Hide</button>
                      {:else}
                        <button
                          type="button"
                          class="secondary-button"
                          disabled={!item.own_account_credentials_on_file}
                          title={item.own_account_credentials_on_file ? 'Show submitted password' : 'No submitted password on file'}
                          on:click={() => showOwnAccountCredentials(item)}
                        ><Eye size={14} /> Show</button>
                      {/if}
                      <small>Show is audit-logged</small>
                    </div>
                  {/if}
                  <textarea rows="5" maxlength="4000" bind:value={credentialDrafts[item.subscription_id]} placeholder="Credentials / notes to save on the subscription"></textarea>
                  <button class="dark-button" type="button" on:click={() => saveCredentials(item)}>{item.credentials_on_file ? 'Credentials saved ✓' : 'Save'}</button>
                </div>
              </div>
              <div class="steps-two">
                <div class="step-circle">2</div>
                <div>
                  <h4>Deliver</h4>
                  <button class="primary-button" type="button" disabled={!paymentSucceeded || !item.credentials_on_file} on:click={() => deliverItem(item)}>Confirm delivery</button>
                  {#if !item.credentials_on_file}
                    <p class="caption">Save credentials first</p>
                  {/if}
                </div>
              </div>
            {/if}
            <footer>
              <button
                type="button"
                class="quiet-link"
                disabled={!item.task_id}
                title={item.task_id ? 'Flag issue with this item' : 'No open task for this item'}
                on:click={() => (issueOpen[item.subscription_id] = !issueOpen[item.subscription_id])}
              ><Flag size={14} /> Flag issue with this item</button>
              {#if issueOpen[item.subscription_id]}
                <div class="issue-box">
                  <textarea rows="2" maxlength="500" bind:value={issueNotes[item.subscription_id]} placeholder="Issue note"></textarea>
                  <button type="button" class="danger-button" on:click={() => flagItemIssue(item)}>Submit issue</button>
                </div>
              {/if}
            </footer>
          </article>
        </AdminCard>
      {/each}
    </section>

    <div class="page-footer">
      <button class="secondary-button" type="button" disabled={remainingEligible.length === 0} on:click={deliverAllRemaining}>Deliver all remaining items</button>
    </div>
  </div>
{/if}

{#if rulesModal}
  <div class="modal-backdrop">
    <div class="rules-modal" role="dialog" aria-modal="true" tabindex="-1">
      <h2>Usage rules</h2>
      <div class="rules-text">{rulesModal.product_options?.strict_rules_text || 'No rules text is configured.'}</div>
      <button type="button" class="primary-button" on:click={() => (rulesModal = null)}>Close</button>
    </div>
  </div>
{/if}

<style>
  .detail-page {
    display: grid;
    gap: 18px;
  }

  .back-link,
  .quiet-link {
    color: #5b46e0;
    background: transparent;
    border: 0;
    padding: 0;
    text-decoration: none;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

  .detail-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
  }

  h1,
  h2,
  h3,
  h4,
  p {
    margin: 0;
  }

  h1 {
    font-size: 23px;
    font-weight: 800;
  }

  h2 {
    font-size: 16px;
    font-weight: 750;
  }

  h3 {
    font-size: 15px;
    font-weight: 750;
  }

  h4 {
    font-size: 13px;
    font-weight: 750;
  }

  p,
  dt,
  dd,
  .caption,
  small {
    color: #71717a;
    font-size: 13px;
  }

  .mono {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
  }

  .success-banner,
  .payment-banner {
    border-radius: 13px;
    padding: 13px 15px;
    font-weight: 700;
  }

  .success-banner,
  .payment-banner.ok {
    background: #e7f6ee;
    color: #1a7f45;
  }

  .payment-banner.bad {
    background: #fdeaea;
    color: #c0392b;
  }

  .strip {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 28px;
  }

  dl {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    gap: 9px 12px;
    margin: 14px 0 0;
  }

  dd {
    margin: 0;
    color: #1a1a1c;
  }

  .item-price-name {
    color: #34343a;
    font-weight: 650;
  }

  .items-section {
    display: grid;
    gap: 14px;
  }

  .item-card {
    display: grid;
    gap: 16px;
  }

  .item-head,
  .delivered-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .delivered-row {
    align-items: center;
  }

  .delivered-row :global(svg) {
    color: #1a7f45;
  }

  .icon-button {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 1px solid #ececee;
    border-radius: 9px;
    background: #ffffff;
  }

  .delivered-detail {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    border-top: 1px solid #ececee;
    padding-top: 14px;
  }

  pre {
    white-space: pre-wrap;
    word-break: break-word;
    border-radius: 9px;
    background: #f6f6f7;
    padding: 10px;
    color: #1a1a1c;
  }

  textarea,
  input {
    width: 100%;
    border: 1px solid #d9d9df;
    border-radius: 10px;
    padding: 10px 11px;
    color: #1a1a1c;
    font: inherit;
  }

  textarea:focus,
  input:focus,
  button:focus {
    outline: none;
    box-shadow: 0 0 0 3px #ece8fb;
  }

  .stepper {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .stepper span {
    border-radius: 999px;
    background: #eef0f2;
    color: #5f5f66;
    padding: 8px 10px;
    text-align: center;
    font-size: 12px;
    font-weight: 750;
  }

  .stepper .done {
    background: #e7f6ee;
    color: #1a7f45;
  }

  .stepper .current {
    background: #ece8fb;
    color: #5b46e0;
  }

  .info {
    border-radius: 11px;
    padding: 12px;
    font-size: 13px;
  }

  .info.purple {
    background: #f1e9fc;
    color: #7b3fd6;
  }

  .info.teal {
    background: #d9f3ef;
    color: #0d857a;
  }

  .info.green {
    background: #e7f6ee;
    color: #1a7f45;
  }

  .info.red {
    background: #fdeaea;
    color: #c0392b;
  }

  .steps-two {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr);
    gap: 12px;
  }

  .step-circle {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    background: #ece8fb;
    color: #5b46e0;
    font-weight: 800;
  }

  .own-account {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    border: 1px solid #ececee;
    border-radius: 11px;
    background: #fbfbfc;
    padding: 10px;
    margin: 10px 0;
  }

  .own-account pre {
    flex-basis: 100%;
  }

  .primary-button,
  .secondary-button,
  .teal-button,
  .dark-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 36px;
    border-radius: 9px;
    padding: 0 13px;
    border: 0;
    font: inherit;
    font-size: 13px;
    font-weight: 750;
    text-decoration: none;
    cursor: pointer;
  }

  .primary-button {
    background: #5b46e0;
    color: #ffffff;
  }

  .teal-button {
    background: #0d857a;
    color: #ffffff;
  }

  .dark-button {
    background: #1a1a1c;
    color: #ffffff;
  }

  .secondary-button {
    border: 1px solid #ececee;
    background: #ffffff;
    color: #1a1a1c;
  }

  .danger-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 36px;
    border: 0;
    border-radius: 9px;
    background: #c0392b;
    color: #ffffff;
    padding: 0 13px;
    font: inherit;
    font-size: 13px;
    font-weight: 750;
    cursor: pointer;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  footer {
    border-top: 1px solid #ececee;
    padding-top: 12px;
  }

  .issue-box {
    display: grid;
    gap: 8px;
    margin-top: 10px;
  }

  .page-footer {
    display: flex;
    justify-content: flex-end;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    background: rgba(26, 26, 28, 0.45);
    padding: 24px;
  }

  .rules-modal {
    width: min(720px, 100%);
    max-height: 80vh;
    overflow: auto;
    border-radius: 14px;
    background: #ffffff;
    padding: 20px;
  }

  .rules-text {
    white-space: pre-line;
  }

  .rules-modal div {
    margin: 14px 0;
  }
</style>
