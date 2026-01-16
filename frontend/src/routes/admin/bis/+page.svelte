<script lang="ts">
  import AdminEmptyState from '$lib/components/admin/AdminEmptyState.svelte';
  import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
  import { adminService } from '$lib/api/admin.js';
  import { formatOptionalDate, statusToneFromMap } from '$lib/utils/admin.js';
  import type { AdminBisInquiry, AdminBisInquiryStatus } from '$lib/types/admin.js';
  import type { PageData } from './$types';

  export let data: PageData;

  const tabs = [
    { key: 'active', label: 'Active' },
    { key: 'issue', label: 'Issue' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'solved', label: 'Solved' },
  ] as const;

  type TabKey = (typeof tabs)[number]['key'];

  const statusToneMap = {
    active: 'info',
    issue: 'danger',
    cancelled: 'neutral',
    solved: 'success',
  } as const;

  const buildPreview = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length <= 140) return trimmed;
    return `${trimmed.slice(0, 140)}...`;
  };

  let selectedTab: TabKey = (data.initialTab as TabKey) || 'active';
  let isLoading = false;
  let loadError = '';
  let currentStatus: AdminBisInquiryStatus = (data.initialStatus as AdminBisInquiryStatus) || 'active';
  let inquiries: AdminBisInquiry[] = [];

  let inquiriesByStatus: Record<AdminBisInquiryStatus, AdminBisInquiry[]> = {
    active: [],
    issue: [],
    cancelled: [],
    solved: [],
  };

  const initialStatus = (data.initialStatus as AdminBisInquiryStatus) || 'active';
  inquiriesByStatus = {
    ...inquiriesByStatus,
    [initialStatus]: data.inquiries || [],
  };
  let loadedStatuses = new Set<AdminBisInquiryStatus>([initialStatus]);

  const loadStatus = async (status: AdminBisInquiryStatus) => {
    isLoading = true;
    loadError = '';
    try {
      const { inquiries } = await adminService.listBisInquiries({ status, limit: 100 });
      inquiriesByStatus = { ...inquiriesByStatus, [status]: inquiries };
      loadedStatuses = new Set([...loadedStatuses, status]);
    } catch (error) {
      loadError = error instanceof Error ? error.message : 'Failed to load inquiries.';
    } finally {
      isLoading = false;
    }
  };

  const switchTab = async (tab: TabKey) => {
    selectedTab = tab;
    const status = tab as AdminBisInquiryStatus;
    if (!loadedStatuses.has(status)) {
      await loadStatus(status);
    }
  };

  $: currentStatus = selectedTab as AdminBisInquiryStatus;
  $: inquiries = inquiriesByStatus[currentStatus] || [];
</script>

<svelte:head>
  <title>BIS - Admin</title>
  <meta name="description" content="Manage beta issue and suggestion submissions." />
</svelte:head>

<div class="space-y-6">
  <section class="space-y-2">
    <h1 class="text-2xl font-bold text-gray-900">BIS</h1>
    <p class="text-sm text-gray-600">
      Review beta bug reports, issues, and suggestions submitted by users.
    </p>
  </section>

  <section class="flex flex-wrap gap-2">
    {#each tabs as tab}
      <button
        type="button"
        class={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
          selectedTab === tab.key
            ? 'border-gray-900 bg-gray-900 text-white'
            : 'border-gray-200 text-gray-700 hover:border-gray-300'
        }`}
        on:click={() => switchTab(tab.key)}
      >
        {tab.label}
      </button>
    {/each}
  </section>

  {#if isLoading}
    <p class="text-sm text-gray-500">Loading inquiries...</p>
  {/if}
  {#if loadError}
    <p class="text-sm text-red-600">{loadError}</p>
  {/if}

  {#if inquiries.length === 0 && !isLoading}
    <AdminEmptyState
      title="No inquiries"
      message="There are no submissions in this tab yet."
    />
  {:else}
    <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-lg font-semibold text-gray-900">{tabs.find(tab => tab.key === selectedTab)?.label} submissions</h2>
          <p class="text-xs text-gray-500">{inquiries.length} total</p>
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="text-left text-xs uppercase text-gray-500">
            <tr>
              <th class="py-2">Email</th>
              <th class="py-2">Topic</th>
              <th class="py-2">Message</th>
              <th class="py-2">Received</th>
              <th class="py-2">Status</th>
              <th class="py-2">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            {#each inquiries as inquiry}
              <tr>
                <td class="py-3 text-gray-900 font-semibold">{inquiry.email}</td>
                <td class="py-3 text-gray-600 capitalize">{inquiry.topic}</td>
                <td class="py-3 text-gray-600 max-w-xs">
                  {buildPreview(inquiry.message)}
                </td>
                <td class="py-3 text-gray-600">
                  {formatOptionalDate(inquiry.createdAt || inquiry.created_at)}
                </td>
                <td class="py-3">
                  <StatusBadge
                    label={(inquiry.status || 'active').toString()}
                    tone={statusToneFromMap(inquiry.status || 'active', statusToneMap)}
                  />
                </td>
                <td class="py-3">
                  <a
                    class="inline-flex items-center rounded-lg border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-900 hover:border-gray-300"
                    href={`/admin/bis/${inquiry.id}`}
                  >
                    Open
                  </a>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</div>
