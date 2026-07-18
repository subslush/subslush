<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import AdminCard from '$lib/components/admin-next/AdminCard.svelte';
  import ErrorBanner from '$lib/components/admin-next/ErrorBanner.svelte';
  import PageHeader from '$lib/components/admin-next/PageHeader.svelte';
  import StatusChip from '$lib/components/admin-next/StatusChip.svelte';
  import { adminNextService } from '$lib/api/adminNext.js';
  import { formatDateTime } from '$lib/utils/adminNext.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let title = '';
  let message = '';
  let expiresAt = '';
  let actionError = '';
  let actionMessage = '';
  let isSending = false;

  const publish = async () => {
    actionError = '';
    actionMessage = '';
    if (!message.trim()) {
      actionError = 'Message is required.';
      return;
    }
    if (!confirm('Publish to all users? This notifies every active user.')) return;
    isSending = true;
    try {
      const result = await adminNextService.sendAnnouncement({
        title: title.trim() || 'Announcement',
        message: message.trim(),
        expires_at: expiresAt || null,
      });
      actionMessage = `Announcement published${typeof result.created === 'number' ? ` to ${result.created} users` : ''}.`;
      title = '';
      message = '';
      expiresAt = '';
      await invalidateAll();
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to publish announcement.';
    } finally {
      isSending = false;
    }
  };
</script>

<svelte:head><title>Announcements - Admin Next</title></svelte:head>

<div class="page">
  <PageHeader title="Announcements" subtitle="Publish compact announcement notifications to active users." />
  <ErrorBanner message={data.error || actionError} />
  {#if actionMessage}<div class="success">{actionMessage}</div>{/if}

  <AdminCard>
    <h2>Composer</h2>
    <div class="form">
      <label><span>Title</span><input bind:value={title} maxlength="120" /></label>
      <label><span>Expiry date</span><input type="datetime-local" maxlength="64" bind:value={expiresAt} /></label>
      <label class="wide"><span>Message</span><textarea bind:value={message} maxlength="2000"></textarea></label>
      <button type="button" disabled={isSending || !message.trim()} on:click={publish}>Publish to all users</button>
    </div>
  </AdminCard>

  <AdminCard>
    <h2>History</h2>
    <div class="table">
      <div class="thead"><span>Title</span><span>Published</span><span>Recipients</span><span>Status</span></div>
      {#each data.announcements as item}
        <div class="row"><span>{item.title || 'Announcement'}</span><time>{formatDateTime(item.published_at)}</time><span>{item.recipient_count || 0}</span><StatusChip status="active" label="Published" /></div>
      {:else}
        <p>No announcements published yet.</p>
      {/each}
    </div>
  </AdminCard>
</div>

<style>
  .page { display: grid; gap: 18px; }
  h2, p { margin: 0; } h2 { margin-bottom: 12px; font-size: 15px; }
  .success { border: 1px solid #bde7ce; border-radius: 10px; background: #e7f6ee; padding: 12px; color: #1a7f45; font-weight: 700; }
  .form { display: grid; grid-template-columns: minmax(240px, 1fr) 220px; gap: 12px; align-items: end; }
  label { display: grid; gap: 6px; color: #71717a; font-size: 12px; font-weight: 650; }
  .wide { grid-column: 1 / -1; }
  input, textarea { min-height: 38px; border: 1px solid #dedee4; border-radius: 10px; padding: 8px 10px; font: inherit; }
  textarea { min-height: 120px; resize: vertical; }
  button { width: fit-content; min-height: 38px; border: 0; border-radius: 10px; background: #1a1a1c; color: white; padding: 0 14px; font-weight: 750; cursor: pointer; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  .table { display: grid; overflow-x: auto; }
  .thead, .row { display: grid; grid-template-columns: minmax(260px, 1fr) 180px 110px 110px; gap: 14px; align-items: center; min-width: 720px; }
  .thead { border-bottom: 1px solid #ececee; padding-bottom: 10px; color: #71717a; font-size: 12px; font-weight: 750; }
  .row { border-bottom: 1px solid #f0f0f2; padding: 12px 0; }
</style>
