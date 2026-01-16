<script lang="ts">
  import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
  import AdminEmptyState from '$lib/components/admin/AdminEmptyState.svelte';
  import { adminService } from '$lib/api/admin.js';
  import { formatCents, formatOptionalDate, pickValue, statusToneFromMap } from '$lib/utils/admin.js';
  import type { AdminSubscription } from '$lib/types/admin.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let subscriptions: AdminSubscription[] = data.subscriptions;
  let loading = false;
  let errorMessage = '';
  let actionMessage = '';
  let actionStatus: 'success' | 'error' | '' = '';

  let filters = {
    status: '',
    autoRenew: '',
    query: ''
  };

  let editSubscriptionId: string | null = null;
  let editSubscriptionStartDate = '';
  let editSubscriptionOriginalNextBillingAt = '';
  let editSubscription = {
    endDate: '',
    renewalDate: '',
    nextBillingAt: '',
    autoRenew: false,
    renewalMethod: ''
  };
  let renewalDateTouched = false;
  let statusUpdate = {
    status: '',
    reason: ''
  };
  let credentialsUpdate = {
    value: '',
    reason: ''
  };
  let storedCredentialsById: Record<string, string | null> = {};
  let storedCredentialsVisibleById: Record<string, boolean> = {};
  let storedCredentialsLoadingById: Record<string, boolean> = {};
  let storedCredentialsErrorById: Record<string, string> = {};

  const subscriptionStatusMap = {
    active: 'success',
    pending: 'warning',
    expired: 'neutral',
    cancelled: 'danger'
  } as const;

  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error) return error.message;
    if (error && typeof error === 'object' && 'message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message;
    }
    return fallback;
  };

  const formatDateInput = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  };

  const formatDateTimeInput = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (segment: number) => segment.toString().padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const normalizeDateTimePayload = (value: string) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  };

  const hasStoredCredentials = (subscription: AdminSubscription) => {
    const storedFlag = pickValue(subscription.hasCredentials, subscription.has_credentials);
    if (storedFlag !== null) {
      return Boolean(storedFlag);
    }
    const storedValue = pickValue(subscription.credentialsEncrypted, subscription.credentials_encrypted);
    return typeof storedValue === 'string' && storedValue.trim().length > 0;
  };

  const computeRenewalDate = (endDate: string, startDate?: string) => {
    if (!endDate) return '';
    const date = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    date.setDate(date.getDate() - 7);
    const renewalDate = date.toISOString().slice(0, 10);
    if (startDate && renewalDate < startDate) {
      return startDate;
    }
    return renewalDate;
  };

  const fetchSubscriptions = async () => {
    loading = true;
    errorMessage = '';
    try {
      const params: Record<string, string> = {};
      if (filters.status) params.status = filters.status;
      if (filters.autoRenew) params.auto_renew = filters.autoRenew;
      if (filters.query) params.search = filters.query;
      subscriptions = await adminService.listSubscriptions(params);
    } catch (error) {
      errorMessage = getErrorMessage(error, 'Failed to load subscriptions.');
    } finally {
      loading = false;
    }
  };

  const startEdit = (subscription: AdminSubscription) => {
    actionMessage = '';
    actionStatus = '';
    editSubscriptionId = subscription.id;
    const startDate = formatDateInput(pickValue(subscription.startDate, subscription.start_date) as string);
    const endDate = formatDateInput(pickValue(subscription.endDate, subscription.end_date) as string);
    const initialRenewalDate = formatDateInput(
      pickValue(subscription.renewalDate, subscription.renewal_date) as string
    );
    const initialNextBillingAt = formatDateTimeInput(
      pickValue(subscription.nextBillingAt, subscription.next_billing_at) as string
    );
    editSubscriptionStartDate = startDate;
    editSubscriptionOriginalNextBillingAt = initialNextBillingAt;
    editSubscription = {
      endDate,
      renewalDate: initialRenewalDate || computeRenewalDate(endDate, startDate),
      nextBillingAt: initialNextBillingAt,
      autoRenew: !!pickValue(subscription.autoRenew, subscription.auto_renew),
      renewalMethod: (pickValue(subscription.renewalMethod, subscription.renewal_method) as string) || ''
    };
    renewalDateTouched = false;
    statusUpdate = {
      status: (subscription.status || 'active') as string,
      reason: ''
    };
    credentialsUpdate = {
      value: '',
      reason: ''
    };
    storedCredentialsVisibleById = {
      ...storedCredentialsVisibleById,
      [subscription.id]: false
    };
    storedCredentialsErrorById = {
      ...storedCredentialsErrorById,
      [subscription.id]: ''
    };
  };

  const handleEndDateInput = () => {
    const endDate = editSubscription.endDate;
    if (!endDate) return;
    const shouldUpdate =
      !renewalDateTouched ||
      !editSubscription.renewalDate ||
      editSubscription.renewalDate > endDate;
    if (!shouldUpdate) return;
    editSubscription = {
      ...editSubscription,
      renewalDate: computeRenewalDate(endDate, editSubscriptionStartDate)
    };
  };

  const handleRenewalDateInput = () => {
    renewalDateTouched = true;
  };

  const saveSubscription = async () => {
    if (!editSubscriptionId) return;
    actionMessage = '';
    actionStatus = '';
    try {
      const endDate = editSubscription.endDate || '';
      let renewalDate = editSubscription.renewalDate || '';
      const nextBillingAtInput = editSubscription.nextBillingAt || '';
      if (endDate && !renewalDate) {
        renewalDate = computeRenewalDate(endDate, editSubscriptionStartDate);
      }
      if (renewalDate && endDate && renewalDate > endDate) {
        actionMessage = 'Renewal date must be on or before the end date.';
        actionStatus = 'error';
        return;
      }
      if (renewalDate && editSubscriptionStartDate && renewalDate < editSubscriptionStartDate) {
        actionMessage = 'Renewal date must be on or after the start date.';
        actionStatus = 'error';
        return;
      }
      let nextBillingAtPayload: string | null | undefined;
      if (nextBillingAtInput !== editSubscriptionOriginalNextBillingAt) {
        const nextBillingAt = normalizeDateTimePayload(nextBillingAtInput);
        if (nextBillingAtInput && !nextBillingAt) {
          actionMessage = 'Next billing date is invalid.';
          actionStatus = 'error';
          return;
        }
        nextBillingAtPayload = nextBillingAtInput ? nextBillingAt : null;
      }
      const updated = await adminService.updateSubscription(editSubscriptionId, {
        end_date: endDate || undefined,
        renewal_date: renewalDate || undefined,
        ...(nextBillingAtPayload !== undefined
          ? { next_billing_at: nextBillingAtPayload }
          : {}),
        auto_renew: editSubscription.autoRenew,
        renewal_method: editSubscription.renewalMethod || undefined
      });
      subscriptions = subscriptions.map(item => (item.id === editSubscriptionId ? { ...item, ...updated } : item));
      actionMessage = 'Subscription updated.';
      actionStatus = 'success';
      editSubscriptionId = null;
    } catch (error) {
      actionMessage = getErrorMessage(error, 'Failed to update subscription.');
      actionStatus = 'error';
    }
  };

  const toggleAutoRenew = async (subscription: AdminSubscription) => {
    actionMessage = '';
    actionStatus = '';
    try {
      const nextValue = !pickValue(subscription.autoRenew, subscription.auto_renew);
      const updated = await adminService.updateSubscription(subscription.id, { auto_renew: nextValue });
      subscriptions = subscriptions.map(item => (item.id === subscription.id ? { ...item, ...updated } : item));
      actionMessage = 'Auto-renew updated.';
      actionStatus = 'success';
    } catch (error) {
      actionMessage = getErrorMessage(error, 'Failed to update auto-renew.');
      actionStatus = 'error';
    }
  };

  const updateStatus = async () => {
    if (!editSubscriptionId) return;
    actionMessage = '';
    actionStatus = '';
    const status = statusUpdate.status?.trim();
    const reason = statusUpdate.reason?.trim();
    if (!status || !reason) {
      actionMessage = 'Status and reason are required.';
      actionStatus = 'error';
      return;
    }
    try {
      const updated = await adminService.updateSubscriptionStatus(editSubscriptionId, { status, reason });
      subscriptions = subscriptions.map(item => (item.id === editSubscriptionId ? { ...item, ...updated } : item));
      statusUpdate = { status, reason: '' };
      actionMessage = 'Subscription status updated.';
      actionStatus = 'success';
    } catch (error) {
      actionMessage = getErrorMessage(error, 'Failed to update subscription status.');
      actionStatus = 'error';
    }
  };

  const updateCredentials = async () => {
    if (!editSubscriptionId) return;
    actionMessage = '';
    actionStatus = '';
    const value = credentialsUpdate.value.trim();
    if (!value) {
      actionMessage = 'Credentials cannot be empty.';
      actionStatus = 'error';
      return;
    }
    try {
      await adminService.updateSubscriptionCredentials(editSubscriptionId, {
        credentials: value,
        reason: credentialsUpdate.reason?.trim() || undefined
      });
      subscriptions = subscriptions.map(item =>
        item.id === editSubscriptionId ? { ...item, has_credentials: true, hasCredentials: true } : item
      );
      if (storedCredentialsVisibleById[editSubscriptionId]) {
        storedCredentialsById = { ...storedCredentialsById, [editSubscriptionId]: value };
      }
      credentialsUpdate = { value: '', reason: '' };
      actionMessage = 'Subscription credentials updated.';
      actionStatus = 'success';
    } catch (error) {
      actionMessage = getErrorMessage(error, 'Failed to update credentials.');
      actionStatus = 'error';
    }
  };

  const clearCredentials = async () => {
    if (!editSubscriptionId) return;
    actionMessage = '';
    actionStatus = '';
    try {
      await adminService.updateSubscriptionCredentials(editSubscriptionId, {
        credentials: null,
        reason: credentialsUpdate.reason?.trim() || undefined
      });
      subscriptions = subscriptions.map(item =>
        item.id === editSubscriptionId ? { ...item, has_credentials: false, hasCredentials: false } : item
      );
      if (storedCredentialsVisibleById[editSubscriptionId]) {
        storedCredentialsById = { ...storedCredentialsById, [editSubscriptionId]: null };
      }
      credentialsUpdate = { value: '', reason: '' };
      actionMessage = 'Subscription credentials cleared.';
      actionStatus = 'success';
    } catch (error) {
      actionMessage = getErrorMessage(error, 'Failed to clear credentials.');
      actionStatus = 'error';
    }
  };

  const revealStoredCredentials = async (subscriptionId: string) => {
    storedCredentialsLoadingById = { ...storedCredentialsLoadingById, [subscriptionId]: true };
    storedCredentialsErrorById = { ...storedCredentialsErrorById, [subscriptionId]: '' };
    try {
      const result = await adminService.getSubscriptionCredentials(subscriptionId);
      storedCredentialsById = {
        ...storedCredentialsById,
        [subscriptionId]: result.credentials ?? null
      };
      storedCredentialsVisibleById = {
        ...storedCredentialsVisibleById,
        [subscriptionId]: true
      };
    } catch (error) {
      storedCredentialsErrorById = {
        ...storedCredentialsErrorById,
        [subscriptionId]: getErrorMessage(error, 'Failed to load credentials.')
      };
    } finally {
      storedCredentialsLoadingById = { ...storedCredentialsLoadingById, [subscriptionId]: false };
    }
  };

  const hideStoredCredentials = (subscriptionId: string) => {
    storedCredentialsVisibleById = { ...storedCredentialsVisibleById, [subscriptionId]: false };
  };
</script>

<svelte:head>
  <title>Subscriptions - Admin</title>
  <meta name="description" content="Monitor subscriptions, renewals, and auto-renew settings." />
</svelte:head>

<div class="space-y-6">
  <section>
    <h1 class="text-2xl font-bold text-gray-900">Subscriptions</h1>
    <p class="text-sm text-gray-600">Manage subscription lifecycle, renewals, and reward linkages.</p>
  </section>

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
    <div class="grid gap-3 md:grid-cols-4">
      <input
        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        placeholder="Search subscription ID"
        bind:value={filters.query}
      />
      <select class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" bind:value={filters.status}>
        <option value="">All statuses</option>
        <option value="active">Active</option>
        <option value="pending">Pending</option>
        <option value="expired">Expired</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <select class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" bind:value={filters.autoRenew}>
        <option value="">Auto renew: any</option>
        <option value="true">Auto renew enabled</option>
        <option value="false">Auto renew disabled</option>
      </select>
      <button
        class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
        on:click={fetchSubscriptions}
        disabled={loading}
      >
        {loading ? 'Loading...' : 'Apply Filters'}
      </button>
    </div>
    {#if errorMessage}
      <p class="text-sm text-red-600">{errorMessage}</p>
    {/if}
    {#if actionMessage}
      <p class={`text-sm ${actionStatus === 'error' ? 'text-red-600' : 'text-green-600'}`}>{actionMessage}</p>
    {/if}
  </section>

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold text-gray-900">Subscription List</h2>
      <p class="text-sm text-gray-500">{subscriptions.length} subscriptions</p>
    </div>

    {#if subscriptions.length === 0}
      <AdminEmptyState title="No subscriptions" message="Subscriptions will appear here after purchase." />
    {:else}
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="text-left text-xs uppercase text-gray-500">
            <tr>
              <th class="py-2">Subscription</th>
              <th class="py-2">User</th>
              <th class="py-2">Plan</th>
              <th class="py-2">Auto renew</th>
              <th class="py-2">Price</th>
              <th class="py-2">Status</th>
              <th class="py-2">Last status reason</th>
              <th class="py-2">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            {#each subscriptions as subscription}
              <tr>
                <td class="py-3 font-semibold text-gray-900">{subscription.id}</td>
                <td class="py-3 text-gray-600">
                  {pickValue(subscription.userEmail, subscription.user_email) || pickValue(subscription.userId, subscription.user_id) || '--'}
                </td>
                <td class="py-3 text-gray-600">
                  {pickValue(subscription.serviceType, subscription.service_type) || '--'} / {pickValue(subscription.servicePlan, subscription.service_plan) || '--'}
                </td>
                <td class="py-3">
                  <StatusBadge
                    label={pickValue(subscription.autoRenew, subscription.auto_renew) ? 'enabled' : 'disabled'}
                    tone={pickValue(subscription.autoRenew, subscription.auto_renew) ? 'success' : 'warning'}
                  />
                </td>
                <td class="py-3 text-gray-600">
                  {formatCents(pickValue(subscription.priceCents, subscription.price_cents), pickValue(subscription.currency, subscription.currency) || 'USD')}
                </td>
                <td class="py-3">
                  <StatusBadge
                    label={(subscription.status || 'unknown').toString()}
                    tone={statusToneFromMap(subscription.status, subscriptionStatusMap)}
                  />
                </td>
                <td class="py-3 text-gray-600">
                  {pickValue(subscription.statusReason, subscription.status_reason) || '--'}
                </td>
                <td class="py-3">
                  <div class="flex gap-2 text-xs">
                    <button class="text-cyan-600 font-semibold" on:click={() => startEdit(subscription)}>Edit</button>
                    <button class="text-gray-600 font-semibold" on:click={() => toggleAutoRenew(subscription)}>
                      Toggle auto-renew
                    </button>
                  </div>
                </td>
              </tr>
              {#if editSubscriptionId === subscription.id}
                <tr class="bg-gray-50">
                  <td colspan="8" class="py-3">
                    <div class="grid gap-3 md:grid-cols-4">
                      <label class="space-y-1 text-xs font-semibold text-gray-600">
                        End date
                        <input
                          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                          type="date"
                          bind:value={editSubscription.endDate}
                          on:input={handleEndDateInput}
                        />
                      </label>
                      <label class="space-y-1 text-xs font-semibold text-gray-600">
                        Renewal date
                        <input
                          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                          type="date"
                          bind:value={editSubscription.renewalDate}
                          on:input={handleRenewalDateInput}
                        />
                      </label>
                      <label class="space-y-1 text-xs font-semibold text-gray-600">
                        Next billing at
                        <input
                          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                          type="datetime-local"
                          bind:value={editSubscription.nextBillingAt}
                          step="60"
                        />
                      </label>
                      <label class="space-y-1 text-xs font-semibold text-gray-600">
                        Renewal method
                        <input
                          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                          placeholder="Renewal method"
                          bind:value={editSubscription.renewalMethod}
                        />
                      </label>
                      <label class="flex items-center gap-2 text-sm text-gray-600">
                        <input type="checkbox" bind:checked={editSubscription.autoRenew} />
                        Auto renew
                      </label>
                      <div class="flex gap-2 md:col-span-4">
                        <button
                          class="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white"
                          on:click={saveSubscription}
                        >
                          Save
                        </button>
                        <button
                          class="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700"
                          on:click={() => (editSubscriptionId = null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                    <p class="mt-2 text-xs text-gray-500">
                      Renewal date defaults to 7 days before the end date and updates automatically unless you override it.
                      Next billing at overrides renewal date in renewal sweeps when set.
                    </p>
                    <div class="mt-6 grid gap-3 md:grid-cols-3">
                      <label class="space-y-1 text-xs font-semibold text-gray-600">
                        Status
                        <select class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" bind:value={statusUpdate.status}>
                          <option value="active">Active</option>
                          <option value="pending">Pending</option>
                          <option value="expired">Expired</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </label>
                      <label class="space-y-1 text-xs font-semibold text-gray-600">
                        Status change reason (required)
                        <input
                          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                          placeholder="Required reason"
                          bind:value={statusUpdate.reason}
                        />
                      </label>
                      <div class="flex items-end">
                        <button
                          class="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
                          on:click={updateStatus}
                          title={!statusUpdate.reason?.trim() ? 'Enter a reason to enable status updates.' : undefined}
                        >
                          Update status
                        </button>
                      </div>
                      {#if !statusUpdate.reason?.trim()}
                        <p class="text-xs text-gray-500 md:col-span-3">Status updates require a reason.</p>
                      {/if}
                    </div>
                    <div class="mt-4 grid gap-3 md:grid-cols-3">
                      <input
                        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm md:col-span-2"
                        placeholder="New credentials"
                        bind:value={credentialsUpdate.value}
                      />
                      <input
                        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                        placeholder="Credentials reason (optional)"
                        bind:value={credentialsUpdate.reason}
                      />
                      {#if hasStoredCredentials(subscription)}
                        <p class="text-xs text-gray-500 md:col-span-3">Credentials are already on file. Updating will overwrite them.</p>
                      {:else}
                        <p class="text-xs text-gray-500 md:col-span-3">No credentials stored yet.</p>
                      {/if}
                      <div class="flex gap-2 md:col-span-3">
                        <button
                          class="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white"
                          on:click={updateCredentials}
                        >
                          Update credentials
                        </button>
                        <button
                          class="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700"
                          on:click={clearCredentials}
                        >
                          Clear credentials
                        </button>
                      </div>
                      <div class="flex flex-wrap items-center gap-2 md:col-span-3">
                        <button
                          class="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700"
                          on:click={() => revealStoredCredentials(subscription.id)}
                          disabled={storedCredentialsLoadingById[subscription.id]}
                        >
                          {storedCredentialsLoadingById[subscription.id] ? 'Loading credentials...' : 'Show stored credentials'}
                        </button>
                        {#if storedCredentialsVisibleById[subscription.id]}
                          <button
                            class="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700"
                            on:click={() => hideStoredCredentials(subscription.id)}
                          >
                            Hide
                          </button>
                        {/if}
                      </div>
                      {#if storedCredentialsErrorById[subscription.id]}
                        <p class="text-xs text-red-600 md:col-span-3">{storedCredentialsErrorById[subscription.id]}</p>
                      {/if}
                      {#if storedCredentialsVisibleById[subscription.id]}
                        {#if storedCredentialsById[subscription.id]}
                          <textarea
                            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-mono text-gray-800 md:col-span-3"
                            rows="3"
                            readonly
                          >{storedCredentialsById[subscription.id]}</textarea>
                        {:else}
                          <p class="text-xs text-gray-500 md:col-span-3">No credentials stored for this subscription.</p>
                        {/if}
                      {/if}
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <h2 class="text-lg font-semibold text-gray-900">Renewal Timeline</h2>
    <p class="text-sm text-gray-600 mt-2">
      Next billing dates are tracked via the subscription record and used to schedule renewal tasks.
    </p>
  </section>
</div>
