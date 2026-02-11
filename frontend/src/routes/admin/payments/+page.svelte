<script lang="ts">
  import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
  import AdminEmptyState from '$lib/components/admin/AdminEmptyState.svelte';
  import { adminService } from '$lib/api/admin.js';
  import { formatCents, formatOptionalDate, pickValue, statusToneFromMap } from '$lib/utils/admin.js';
  import type { AdminPayment, AdminRefund, AdminRefundStats } from '$lib/types/admin.js';
  import type { PageData } from './$types';

  export let data: PageData;

  type MonitoringSummary = {
    monitoring?: { active?: boolean };
    failures?: { totalFailures?: number };
    allocation?: { totalAllocated?: number };
  };

  type PendingSummary = {
    pendingAllocations?: AdminPayment[];
    failedPayments?: AdminPayment[];
  };

  let payments: AdminPayment[] = data.payments;
  let monitoring: MonitoringSummary = data.monitoring || {};
  let pending: PendingSummary = data.pending || {};
  let refunds: AdminRefund[] = data.refunds || [];
  let pendingRefunds: AdminRefund[] = data.pendingRefunds || [];
  let refundStats: AdminRefundStats = data.refundStats || {};

  let filters = {
    status: '',
    provider: '',
    query: ''
  };

  let loading = false;
  let errorMessage = '';
  let actionMessage = '';
  let refundMessage = '';
  let refundError = '';
  let refundLoading = false;

  let allocationForm = {
    userId: '',
    paymentId: '',
    creditAmount: 0,
    reason: ''
  };

  let refundFilters = {
    status: ''
  };

  let refundNotes: Record<string, string> = {};
  let refundRejectReasons: Record<string, string> = {};

  let manualRefundForm = {
    userId: '',
    amount: 0,
    reason: '',
    paymentId: ''
  };

  const paymentStatusMap = {
    succeeded: 'success',
    finished: 'success',
    confirmed: 'success',
    pending: 'warning',
    processing: 'info',
    failed: 'danger',
    expired: 'danger',
    canceled: 'danger'
  } as const;

  const refundStatusMap = {
    pending: 'warning',
    approved: 'info',
    processing: 'info',
    completed: 'success',
    failed: 'danger',
    rejected: 'danger'
  } as const;

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const refundAmountCents = (refund: AdminRefund) => {
    const rawAmount = pickValue(refund.amount, refund.amount);
    const parsed = rawAmount === null || rawAmount === undefined ? 0 : Number(rawAmount);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  };

  const loadPayments = async () => {
    loading = true;
    errorMessage = '';
    try {
      const params: Record<string, string> = {};
      if (filters.status) params.status = filters.status;
      if (filters.provider) params.provider = filters.provider;
      if (filters.query) params.search = filters.query;
      payments = await adminService.listPayments(params);
    } catch (error) {
      errorMessage = getErrorMessage(error, 'Failed to load payments.');
    } finally {
      loading = false;
    }
  };

  const loadRefunds = async () => {
    refundLoading = true;
    refundError = '';
    try {
      const params: Record<string, string> = {};
      if (refundFilters.status) params.status = refundFilters.status;
      refunds = await adminService.listRefunds(params);
    } catch (error) {
      refundError = getErrorMessage(error, 'Failed to load refunds.');
    } finally {
      refundLoading = false;
    }
  };

  const loadPendingRefunds = async () => {
    try {
      pendingRefunds = await adminService.listPendingRefunds();
    } catch (error) {
      refundError = getErrorMessage(error, 'Failed to load pending refunds.');
    }
  };

  const refreshRefundStats = async () => {
    try {
      refundStats = await adminService.getRefundStatistics({ days: 30 });
    } catch (error) {
      refundError = getErrorMessage(error, 'Failed to load refund statistics.');
    }
  };

  const approveRefund = async (refundId: string) => {
    refundMessage = '';
    refundError = '';
    try {
      await adminService.approveRefund(refundId, refundNotes[refundId] || undefined);
      refundMessage = 'Refund approved.';
      await Promise.all([loadRefunds(), loadPendingRefunds(), refreshRefundStats()]);
    } catch (error) {
      refundError = getErrorMessage(error, 'Failed to approve refund.');
    }
  };

  const rejectRefund = async (refundId: string) => {
    refundMessage = '';
    refundError = '';
    const reason = refundRejectReasons[refundId];
    if (!reason) {
      refundError = 'Provide a rejection reason before rejecting.';
      return;
    }
    try {
      await adminService.rejectRefund(refundId, reason);
      refundMessage = 'Refund rejected.';
      await Promise.all([loadRefunds(), loadPendingRefunds(), refreshRefundStats()]);
    } catch (error) {
      refundError = getErrorMessage(error, 'Failed to reject refund.');
    }
  };

  const submitManualRefund = async () => {
    refundMessage = '';
    refundError = '';
    try {
      await adminService.manualRefund({
        userId: manualRefundForm.userId,
        amount: Number(manualRefundForm.amount),
        reason: manualRefundForm.reason,
        paymentId: manualRefundForm.paymentId || undefined
      });
      refundMessage = 'Manual refund submitted.';
      manualRefundForm = { userId: '', amount: 0, reason: '', paymentId: '' };
      await Promise.all([loadRefunds(), loadPendingRefunds(), refreshRefundStats()]);
    } catch (error) {
      refundError = getErrorMessage(error, 'Failed to submit manual refund.');
    }
  };

  const refreshMonitoring = async () => {
    try {
      monitoring = await adminService.getPaymentMonitoring();
    } catch (error) {
      actionMessage = getErrorMessage(error, 'Failed to refresh monitoring data.');
    }
  };

  const startMonitoring = async () => {
    actionMessage = '';
    try {
      await adminService.startPaymentMonitoring();
      await refreshMonitoring();
      actionMessage = 'Payment monitoring started.';
    } catch (error) {
      actionMessage = getErrorMessage(error, 'Failed to start monitoring.');
    }
  };

  const stopMonitoring = async () => {
    actionMessage = '';
    try {
      await adminService.stopPaymentMonitoring();
      await refreshMonitoring();
      actionMessage = 'Payment monitoring stopped.';
    } catch (error) {
      actionMessage = getErrorMessage(error, 'Failed to stop monitoring.');
    }
  };

  const retryPayment = async (paymentId: string) => {
    actionMessage = '';
    try {
      await adminService.retryPayment(paymentId);
      actionMessage = `Retry initiated for payment ${paymentId}.`;
    } catch (error) {
      actionMessage = getErrorMessage(error, 'Failed to retry payment.');
    }
  };

  const submitManualAllocation = async () => {
    actionMessage = '';
    try {
      await adminService.manualAllocateCredits({
        userId: allocationForm.userId,
        paymentId: allocationForm.paymentId,
        creditAmount: Number(allocationForm.creditAmount),
        reason: allocationForm.reason
      });
      actionMessage = 'Manual allocation completed.';
      allocationForm = { userId: '', paymentId: '', creditAmount: 0, reason: '' };
    } catch (error) {
      actionMessage = getErrorMessage(error, 'Failed to allocate credits.');
    }
  };

  const monitoringActive = monitoring?.monitoring?.active ?? false;
  const pendingAllocations = pending?.pendingAllocations || [];
  const failedPayments = pending?.failedPayments || [];
</script>

<svelte:head>
  <title>Payments - Admin</title>
  <meta name="description" content="Monitor payment pipeline, retries, and manual allocations." />
</svelte:head>

<div class="space-y-6">
  <section>
    <h1 class="text-2xl font-bold text-gray-900">Payments</h1>
    <p class="text-sm text-gray-600">Monitor payment health, retry failures, and allocate credits manually.</p>
  </section>

  <section class="grid gap-6 lg:grid-cols-3">
    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-gray-900">Monitoring</h2>
      <p class="text-sm text-gray-500 mt-1">Service activity and metrics snapshot.</p>
      <div class="mt-4 space-y-2 text-sm">
        <div class="flex items-center justify-between">
          <span class="text-gray-600">Status</span>
          <StatusBadge label={monitoringActive ? 'active' : 'inactive'} tone={monitoringActive ? 'success' : 'warning'} />
        </div>
        <div class="flex items-center justify-between">
          <span class="text-gray-600">Failures</span>
          <span class="font-semibold text-gray-900">{monitoring?.failures?.totalFailures ?? 0}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-gray-600">Allocations</span>
          <span class="font-semibold text-gray-900">{monitoring?.allocation?.totalAllocated ?? 0}</span>
        </div>
      </div>
      <div class="mt-4 flex gap-2">
        <button
          class="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white"
          on:click={startMonitoring}
        >
          Start
        </button>
        <button
          class="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700"
          on:click={stopMonitoring}
        >
          Stop
        </button>
      </div>
      {#if actionMessage}
        <p class="text-xs text-gray-500 mt-3">{actionMessage}</p>
      {/if}
    </div>

    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-gray-900">Pending Allocations</h2>
      <p class="text-sm text-gray-500 mt-1">Payments needing manual credit allocation.</p>
      {#if pendingAllocations.length === 0}
        <AdminEmptyState title="No pending allocations" message="All allocations are processed." />
      {:else}
        <div class="mt-3 space-y-3">
          {#each pendingAllocations as allocation}
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
              <p class="font-semibold text-gray-900">{allocation.paymentId || allocation.payment_id}</p>
              <p class="text-gray-500">User {allocation.userId || allocation.user_id}</p>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-gray-900">Manual Allocation</h2>
      <p class="text-sm text-gray-500 mt-1">Apply credits after verification.</p>
      <form class="mt-4 space-y-3" on:submit|preventDefault={submitManualAllocation}>
        <input
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="User ID"
          bind:value={allocationForm.userId}
          required
        />
        <input
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="Payment ID"
          bind:value={allocationForm.paymentId}
          required
        />
        <input
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          type="number"
          min="0"
          step="0.01"
          placeholder="Credit amount"
          bind:value={allocationForm.creditAmount}
          required
        />
        <input
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="Reason"
          bind:value={allocationForm.reason}
          required
        />
        <button class="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white" type="submit">
          Allocate Credits
        </button>
      </form>
    </div>
  </section>

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
    <div class="grid gap-3 md:grid-cols-4">
      <input
        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        placeholder="Search payment"
        bind:value={filters.query}
      />
      <select class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" bind:value={filters.status}>
        <option value="">All statuses</option>
        <option value="succeeded">Succeeded</option>
        <option value="pending">Pending</option>
        <option value="processing">Processing</option>
        <option value="failed">Failed</option>
      </select>
      <input
        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        placeholder="Provider"
        bind:value={filters.provider}
      />
      <button
        class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
        on:click={loadPayments}
        disabled={loading}
      >
        {loading ? 'Loading...' : 'Apply Filters'}
      </button>
    </div>
    {#if errorMessage}
      <p class="text-sm text-red-600">{errorMessage}</p>
    {/if}
  </section>

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold text-gray-900">Payment Ledger</h2>
      <p class="text-sm text-gray-500">{payments.length} payments</p>
    </div>

    {#if payments.length === 0}
      <AdminEmptyState title="No payments" message="Payments will appear here once initiated." />
    {:else}
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="text-left text-xs uppercase text-gray-500">
            <tr>
              <th class="py-2">Payment</th>
              <th class="py-2">User</th>
              <th class="py-2">Provider</th>
              <th class="py-2">Amount</th>
              <th class="py-2">Status</th>
              <th class="py-2">Created</th>
              <th class="py-2">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            {#each payments as payment}
              <tr>
                <td class="py-3 font-semibold text-gray-900">{pickValue(payment.paymentId, payment.payment_id, payment.id)}</td>
                <td class="py-3 text-gray-600">{pickValue(payment.userId, payment.user_id) || '--'}</td>
                <td class="py-3 text-gray-600">{pickValue(payment.provider, payment.payment_provider) || '--'}</td>
                <td class="py-3 text-gray-600">
                  {formatCents(pickValue(payment.amountCents, payment.amount_cents), pickValue(payment.currency, payment.currency) || 'USD')}
                </td>
                <td class="py-3">
                  <StatusBadge
                    label={(payment.status || 'unknown').toString()}
                    tone={statusToneFromMap(payment.status, paymentStatusMap)}
                  />
                </td>
                <td class="py-3 text-gray-600">{formatOptionalDate(pickValue(payment.createdAt, payment.created_at))}</td>
                <td class="py-3">
                  <button
                    class="text-cyan-600 font-semibold text-xs"
                    on:click={() => retryPayment(pickValue(payment.paymentId, payment.payment_id, payment.id) || '')}
                  >
                    Retry
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <section class="grid gap-6 lg:grid-cols-3">
    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-gray-900">Refund Overview</h2>
      <p class="text-sm text-gray-500 mt-1">30-day refund stats.</p>
      <div class="mt-4 space-y-2 text-sm">
        <div class="flex items-center justify-between">
          <span class="text-gray-600">Requests</span>
          <span class="font-semibold text-gray-900">{refundStats.totalRequests ?? 0}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-gray-600">Approved</span>
          <span class="font-semibold text-gray-900">{refundStats.approvedRefunds ?? 0}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-gray-600">Rejected</span>
          <span class="font-semibold text-gray-900">{refundStats.rejectedRefunds ?? 0}</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-gray-600">Pending</span>
          <span class="font-semibold text-gray-900">{refundStats.pendingApprovals ?? 0}</span>
        </div>
      </div>
      <button
        class="mt-4 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700"
        on:click={refreshRefundStats}
      >
        Refresh stats
      </button>
    </div>

    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm lg:col-span-2">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-gray-900">Pending Refunds</h2>
        <button
          class="text-sm font-semibold text-cyan-600"
          on:click={loadPendingRefunds}
        >
          Refresh
        </button>
      </div>
      {#if pendingRefunds.length === 0}
        <AdminEmptyState title="No pending refunds" message="All refund requests are resolved." />
      {:else}
        <div class="space-y-3">
          {#each pendingRefunds as refund}
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm space-y-2">
              <div class="flex items-center justify-between">
                <div>
                  <p class="font-semibold text-gray-900">Refund {refund.id}</p>
                  <p class="text-gray-500">Payment {pickValue(refund.paymentId, refund.payment_id) || '--'}</p>
                </div>
                <StatusBadge
                  label={(refund.status || 'pending').toString()}
                  tone={statusToneFromMap(refund.status, refundStatusMap)}
                />
              </div>
              <div class="text-gray-600">
                Amount {formatCents(refundAmountCents(refund), 'USD')} · Reason {refund.reason || '--'}
              </div>
              <div class="grid gap-2 md:grid-cols-3">
                <input
                  class="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs"
                  placeholder="Approval note (optional)"
                  bind:value={refundNotes[refund.id]}
                />
                <input
                  class="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs"
                  placeholder="Rejection reason"
                  bind:value={refundRejectReasons[refund.id]}
                />
                <div class="flex gap-2">
                  <button
                    class="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white"
                    on:click={() => approveRefund(refund.id)}
                  >
                    Approve
                  </button>
                  <button
                    class="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700"
                    on:click={() => rejectRefund(refund.id)}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </section>

  <section class="grid gap-6 lg:grid-cols-3">
    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-gray-900">Manual Refund</h2>
      <p class="text-sm text-gray-500 mt-1">Create a refund request for a user.</p>
      <form class="mt-4 space-y-3" on:submit|preventDefault={submitManualRefund}>
        <input
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="User ID"
          bind:value={manualRefundForm.userId}
          required
        />
        <input
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="Payment ID (optional)"
          bind:value={manualRefundForm.paymentId}
        />
        <input
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="Amount"
          bind:value={manualRefundForm.amount}
          required
        />
        <input
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="Reason (e.g., user_request)"
          bind:value={manualRefundForm.reason}
          required
        />
        <button class="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white" type="submit">
          Submit Refund
        </button>
      </form>
    </div>

    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm lg:col-span-2 space-y-4">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-gray-900">Refund Ledger</h2>
          <p class="text-sm text-gray-500">Review refund lifecycle updates.</p>
        </div>
        <button
          class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
          on:click={loadRefunds}
          disabled={refundLoading}
        >
          {refundLoading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      <div class="grid gap-3 md:grid-cols-3">
        <select class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" bind:value={refundFilters.status}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="rejected">Rejected</option>
        </select>
        <button
          class="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700"
          on:click={loadRefunds}
          disabled={refundLoading}
        >
          Apply Filter
        </button>
      </div>
      {#if refundError}
        <p class="text-sm text-red-600">{refundError}</p>
      {/if}
      {#if refundMessage}
        <p class="text-sm text-green-600">{refundMessage}</p>
      {/if}
      {#if refunds.length === 0}
        <AdminEmptyState title="No refunds" message="Refund activity will appear here." />
      {:else}
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="text-left text-xs uppercase text-gray-500">
              <tr>
                <th class="py-2">Refund</th>
                <th class="py-2">User</th>
                <th class="py-2">Amount</th>
                <th class="py-2">Reason</th>
                <th class="py-2">Status</th>
                <th class="py-2">Created</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              {#each refunds as refund}
                <tr>
                  <td class="py-3 font-semibold text-gray-900">{refund.id}</td>
                  <td class="py-3 text-gray-600">{pickValue(refund.userId, refund.user_id) || '--'}</td>
                  <td class="py-3 text-gray-600">{formatCents(refundAmountCents(refund), 'USD')}</td>
                  <td class="py-3 text-gray-600">{refund.reason || '--'}</td>
                  <td class="py-3">
                    <StatusBadge
                      label={(refund.status || 'unknown').toString()}
                      tone={statusToneFromMap(refund.status, refundStatusMap)}
                    />
                  </td>
                  <td class="py-3 text-gray-600">{formatOptionalDate(pickValue(refund.createdAt, refund.created_at))}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  </section>

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold text-gray-900">Failed Payments</h2>
      <p class="text-sm text-gray-500">{failedPayments.length} failures</p>
    </div>
    {#if failedPayments.length === 0}
      <AdminEmptyState title="No failed payments" message="All payments are flowing normally." />
    {:else}
      <div class="space-y-3">
        {#each failedPayments as failure}
          <div class="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 text-sm">
            <p class="font-semibold text-gray-900">{failure.paymentId || failure.payment_id}</p>
            <p class="text-gray-500">{failure.reason || 'Unknown error'}</p>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>
