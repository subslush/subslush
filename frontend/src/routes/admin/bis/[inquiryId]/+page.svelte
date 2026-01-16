<script lang="ts">
  import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
  import AdminEmptyState from '$lib/components/admin/AdminEmptyState.svelte';
  import { adminService } from '$lib/api/admin.js';
  import { formatOptionalDate, statusToneFromMap } from '$lib/utils/admin.js';
  import type { AdminBisInquiry, AdminBisInquiryStatus } from '$lib/types/admin.js';
  import { goto } from '$app/navigation';
  import type { PageData } from './$types';

  export let data: PageData;

  let inquiry: AdminBisInquiry | null = data.inquiry;
  let actionMessage = '';
  let actionError = '';
  let isUpdating = false;

  const statusToneMap = {
    active: 'info',
    issue: 'danger',
    cancelled: 'neutral',
    solved: 'success',
  } as const;

  const updateStatus = async (status: AdminBisInquiryStatus) => {
    if (!inquiry || isUpdating) return;
    actionMessage = '';
    actionError = '';
    isUpdating = true;
    try {
      const updated = await adminService.updateBisInquiryStatus(inquiry.id, status);
      inquiry = { ...inquiry, ...updated };
      actionMessage = 'Inquiry updated.';
      await goto(`/admin/bis?tab=${status}`, { replaceState: true });
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to update inquiry.';
    } finally {
      isUpdating = false;
    }
  };
</script>

<svelte:head>
  <title>BIS Inquiry - Admin</title>
  <meta name="description" content="Review a BIS submission." />
</svelte:head>

{#if !inquiry}
  <AdminEmptyState title="Inquiry not found" message="Unable to load this submission." />
{:else}
  <div class="space-y-6">
    <section class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">BIS inquiry</h1>
        <p class="text-sm text-gray-600">{inquiry.id}</p>
      </div>
      <StatusBadge
        label={(inquiry.status || 'active').toString()}
        tone={statusToneFromMap(inquiry.status || 'active', statusToneMap)}
      />
    </section>

    {#if actionMessage}
      <p class="text-sm text-green-600">{actionMessage}</p>
    {/if}
    {#if actionError}
      <p class="text-sm text-red-600">{actionError}</p>
    {/if}

    <section class="grid gap-4 md:grid-cols-3">
      <div class="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-2">
        <p class="text-xs uppercase tracking-wide text-gray-500">Email</p>
        <p class="text-sm font-semibold text-gray-900">{inquiry.email}</p>
      </div>
      <div class="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-2">
        <p class="text-xs uppercase tracking-wide text-gray-500">Topic</p>
        <p class="text-sm font-semibold text-gray-900 capitalize">{inquiry.topic}</p>
      </div>
      <div class="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-2">
        <p class="text-xs uppercase tracking-wide text-gray-500">Received</p>
        <p class="text-sm font-semibold text-gray-900">
          {formatOptionalDate(inquiry.createdAt || inquiry.created_at)}
        </p>
      </div>
    </section>

    <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-3">
      <h2 class="text-lg font-semibold text-gray-900">Message</h2>
      <pre class="whitespace-pre-wrap text-sm text-gray-700">{inquiry.message}</pre>
    </section>

    <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Update status</h2>
        <p class="text-sm text-gray-600">Move this inquiry out of Active once reviewed.</p>
      </div>
      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          class="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-60"
          on:click={() => updateStatus('issue')}
          disabled={isUpdating || inquiry.status === 'issue'}
        >
          Issue
        </button>
        <button
          type="button"
          class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-60"
          on:click={() => updateStatus('cancelled')}
          disabled={isUpdating || inquiry.status === 'cancelled'}
        >
          Cancelled
        </button>
        <button
          type="button"
          class="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-60"
          on:click={() => updateStatus('solved')}
          disabled={isUpdating || inquiry.status === 'solved'}
        >
          Solved
        </button>
      </div>
    </section>
  </div>
{/if}
