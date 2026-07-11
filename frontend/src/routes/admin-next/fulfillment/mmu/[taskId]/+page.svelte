<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { Check, Copy, Eye, EyeOff, Flag, Lock } from 'lucide-svelte';
  import AdminCard from '$lib/components/admin-next/AdminCard.svelte';
  import EmptyState from '$lib/components/admin-next/EmptyState.svelte';
  import ErrorBanner from '$lib/components/admin-next/ErrorBanner.svelte';
  import StatusChip from '$lib/components/admin-next/StatusChip.svelte';
  import { adminNextService } from '$lib/api/adminNext.js';
  import { formatDate, formatDateTime, shortId, toNumber } from '$lib/utils/adminNext.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let detail = data.detail;
  let actionError = data.error || '';
  let actionMessage = '';
  let credentials = '';
  let credentialsShown = false;
  let passwordVisible = false;
  let editOpen = false;
  let loginDraft = '';
  let passwordDraft = '';
  let completionNote = '';
  let issueNote = '';
  let issueOpen = false;

  $: detail = data.detail;
  $: task = detail?.task;
  $: order = detail?.order;
  $: history = detail?.cycle_history || [];
  $: cycleTotal = toNumber(
    task?.mmu_cycle_total,
    toNumber(task?.mmu_term_months || task?.term_months, 1)
  );
  $: overdue = task?.due_date ? new Date(task.due_date).getTime() < Date.now() && !task.completed_at : false;
  $: headline = task?.month_label || task?.mmu_label || 'MMU renewal';
  $: product = [task?.service_type, task?.service_plan].filter(Boolean).join(' · ') || 'Subscription';
  $: termStart = task?.term_start || task?.term_start_at || history[0]?.term_start || null;

  const setBusy = () => {
    actionError = '';
    actionMessage = '';
  };

  const showCredentials = async () => {
    if (!task) return;
    setBusy();
    try {
      const result = await adminNextService.viewTaskCredentials(task.id);
      credentials = result.credentials || 'No credentials on file.';
      credentialsShown = true;
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to show credentials.';
    }
  };

  const saveCredentials = async () => {
    if (!task) return;
    const payload = [`Login: ${loginDraft.trim()}`, `Password: ${passwordDraft.trim()}`]
      .filter(line => !line.endsWith(': '))
      .join('\n');
    if (!payload) {
      actionError = 'Enter updated credentials before saving.';
      return;
    }
    if (payload.length > 4000) {
      actionError = 'Credentials must be 4,000 characters or fewer.';
      return;
    }
    setBusy();
    try {
      await adminNextService.saveCredentials(task.subscription_id, {
        credentials: payload,
        reason: 'mmu_credentials_updated_from_admin_next',
      });
      editOpen = false;
      loginDraft = '';
      passwordDraft = '';
      actionMessage = 'Credentials updated.';
      await invalidateAll();
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to update credentials.';
    }
  };

  const markCompleted = async () => {
    if (!task) return;
    setBusy();
    try {
      await adminNextService.confirmRenewal(task.id, completionNote || 'MMU renewal completed from admin-next');
      const next = task.next_month_label || task.next_mmu_label || null;
      actionMessage = `${headline} marked renewed.${next ? ` Next: ${next}.` : ''}`;
      await invalidateAll();
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to complete MMU renewal.';
    }
  };

  const flagIssue = async () => {
    if (!task) return;
    setBusy();
    try {
      await adminNextService.flagTaskIssue(task.id, issueNote || 'Issue flagged from admin-next');
      actionMessage = 'Issue flagged.';
      issueOpen = false;
      await invalidateAll();
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to flag issue.';
    }
  };

  const copyText = async (value: string) => {
    await navigator.clipboard.writeText(value);
    actionMessage = 'Copied.';
  };

  const monthLabel = (item: { month_label?: string | null; mmu_label?: string | null }) =>
    item.month_label || item.mmu_label || 'Renewal';

  const shortMonthLabel = (item: { month_label?: string | null; mmu_label?: string | null }) =>
    monthLabel(item).replace(/\s+of\s+\d+$/i, '');
</script>

<svelte:head>
  <title>MMU Renewal - Admin Next</title>
</svelte:head>

{#if !detail || !task}
  <EmptyState title="MMU renewal not found" message={actionError || 'Unable to load MMU detail.'} />
{:else}
  <div class="mmu-page">
    <a class="back-link" href="/admin-next/fulfillment?tab=mmu">← Back to MMU renewals</a>

    <header class="hero">
      <span>Manual monthly upgrade</span>
      <h1>MMU renewal · {headline}</h1>
      <p>{product} · {order?.customer_email || task.contact_email || task.account_email || 'customer'} · due <strong>{formatDate(task.due_date)}</strong>{overdue ? ' · overdue' : ''}</p>
    </header>

    <ErrorBanner message={actionError} />
    {#if actionMessage}
      <div class="success-banner">{actionMessage}</div>
    {/if}

    <AdminCard>
      <div class="card-head">
        <h2>Renewal timeline</h2>
        <StatusChip status={overdue ? 'overdue' : task.completed_at ? 'completed' : 'due soon'} />
      </div>
      <div class="timeline">
        <div class="node initial">
          <span>1</span>
          <strong>Initial delivery · {termStart ? formatDate(termStart) : '--'}</strong>
          <small>Term start</small>
        </div>
        {#each history as item}
          <div class:completed={Boolean(item.completed_at)} class:issue={Boolean(item.is_issue)} class:current={String(item.id) === String(task.id)} class="node">
            <span>{item.covers_months_from || item.mmu_covers_months_from || '•'}</span>
            <strong>{shortMonthLabel(item)}</strong>
            <small>{item.completed_at ? formatDate(item.completed_at) : formatDate(item.due_date)}</small>
          </div>
        {/each}
      </div>
    </AdminCard>

    <AdminCard>
      <section class="credentials-panel">
        <div class="card-head">
          <h2>Subscription credentials</h2>
          <span class="lock"><Lock size={14} /> Viewing is audit-logged</span>
        </div>

        {#if credentialsShown}
          <div class="credential-grid">
            <div>
              <span>Login</span>
              <code>{credentials.split('\n')[0] || credentials}</code>
              <button type="button" class="icon-button" on:click={() => copyText(credentials.split('\n')[0] || credentials)}><Copy size={14} /></button>
            </div>
            <div>
              <span>Password</span>
              <code>{passwordVisible ? credentials : '••••••••••••'}</code>
              <button type="button" class="secondary-button" on:click={() => (passwordVisible = !passwordVisible)}>{passwordVisible ? 'Hide' : 'Show'}</button>
              <button type="button" class="icon-button" on:click={() => copyText(credentials)}><Copy size={14} /></button>
            </div>
          </div>
        {:else}
          <button class="primary-button" type="button" on:click={showCredentials}><Eye size={15} /> Show credentials</button>
        {/if}

        <button class="quiet-link" type="button" on:click={() => (editOpen = !editOpen)}>Credentials changed at the provider? Update them</button>
        {#if editOpen}
          <div class="edit-form">
            <input class="mono" maxlength="4000" bind:value={loginDraft} placeholder="Login" />
            <input class="mono" maxlength="4000" bind:value={passwordDraft} placeholder="Password" />
            <button class="dark-button" type="button" on:click={saveCredentials}>Save updated credentials</button>
          </div>
        {/if}
      </section>
    </AdminCard>

    <AdminCard>
      <div class="context-grid">
        <div><span>Subscription id</span><code>{task.subscription_id}</code></div>
        <div><span>Order</span><a href={task.order_id ? `/admin-next/fulfillment/orders/${task.order_id}` : '/admin-next/fulfillment'}>{shortId(task.order_id)}</a></div>
        <div><span>Term</span><strong>{toNumber(task.term_months, cycleTotal)} months</strong></div>
        <div><span>MMU config</span><strong>{headline}</strong></div>
      </div>
    </AdminCard>

    <AdminCard>
      <div class="actions">
        {#if task.completed_at}
          <div class="complete-state"><Check size={18} /> {headline} marked renewed.</div>
        {:else}
          <textarea rows="2" maxlength="500" bind:value={completionNote} placeholder="Optional note"></textarea>
          <button class="primary-button" type="button" on:click={markCompleted}>Mark renewal completed</button>
        {/if}
        <button class="danger-button" type="button" on:click={() => (issueOpen = !issueOpen)}><Flag size={14} /> Flag issue</button>
      </div>
      {#if issueOpen}
        <div class="issue-form">
          <textarea rows="2" maxlength="500" bind:value={issueNote} placeholder="Issue note"></textarea>
          <button class="danger-button" type="button" on:click={flagIssue}>Submit issue</button>
        </div>
      {/if}
    </AdminCard>
  </div>
{/if}

<style>
  .mmu-page {
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

  .hero {
    border-radius: 14px;
    background: #1a1a1c;
    color: #ffffff;
    padding: 22px;
  }

  .hero span {
    display: inline-flex;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    padding: 4px 9px;
    font-size: 12px;
    font-weight: 700;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    margin-top: 12px;
    font-size: 24px;
    font-weight: 800;
  }

  .hero p {
    margin-top: 6px;
    color: rgba(255, 255, 255, 0.78);
  }

  .success-banner {
    border-radius: 13px;
    background: #e7f6ee;
    color: #1a7f45;
    padding: 13px 15px;
    font-weight: 700;
  }

  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  h2 {
    color: #1a1a1c;
    font-size: 16px;
    font-weight: 750;
  }

  .timeline {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 10px;
  }

  .node {
    display: grid;
    gap: 5px;
    border: 1px solid #ececee;
    border-radius: 12px;
    background: #fbfbfc;
    padding: 12px;
  }

  .node span {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    background: #eef0f2;
    color: #5f5f66;
    font-weight: 800;
  }

  .node.initial {
    border-style: dashed;
  }

  .node.completed span {
    background: #e7f6ee;
    color: #1a7f45;
  }

  .node.issue span {
    background: #fbf0d9;
    color: #8a5a0f;
  }

  .node.current {
    border-color: #5b46e0;
    box-shadow: 0 0 0 3px #ece8fb;
  }

  .node.current span {
    width: 36px;
    height: 36px;
    background: #5b46e0;
    color: #ffffff;
  }

  small,
  .lock,
  .context-grid span {
    color: #71717a;
    font-size: 12px;
  }

  .credentials-panel {
    border: 1px solid #ece8fb;
    border-radius: 13px;
    background: #fbfaff;
    padding: 16px;
    box-shadow: 0 16px 36px rgba(91, 70, 224, 0.08);
  }

  .lock {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .credential-grid {
    display: grid;
    gap: 10px;
  }

  .credential-grid > div,
  .context-grid > div {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 10px;
    border-radius: 10px;
    background: #ffffff;
    padding: 10px;
  }

  code,
  .mono {
    color: #1a1a1c;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    word-break: break-word;
  }

  .edit-form,
  .issue-form {
    display: grid;
    gap: 10px;
    margin-top: 12px;
  }

  input,
  textarea {
    width: 100%;
    border: 1px solid #d9d9df;
    border-radius: 10px;
    padding: 10px 11px;
    font: inherit;
  }

  .context-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .context-grid > div {
    grid-template-columns: 120px minmax(0, 1fr);
  }

  .actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 10px;
  }

  .complete-state {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #1a7f45;
    font-weight: 750;
  }

  .primary-button,
  .secondary-button,
  .dark-button,
  .danger-button,
  .icon-button {
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
    cursor: pointer;
  }

  .primary-button {
    background: #5b46e0;
    color: #ffffff;
  }

  .dark-button {
    background: #1a1a1c;
    color: #ffffff;
  }

  .secondary-button,
  .icon-button {
    border: 1px solid #ececee;
    background: #ffffff;
    color: #1a1a1c;
  }

  .danger-button {
    border: 1px solid #f5c7c2;
    background: #ffffff;
    color: #c0392b;
  }
</style>
