<script lang="ts">
  import { goto } from '$app/navigation';
  import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
  import AdminEmptyState from '$lib/components/admin/AdminEmptyState.svelte';
  import { adminService } from '$lib/api/admin.js';
  import { formatOptionalDate, pickValue, statusToneFromMap } from '$lib/utils/admin.js';
  import type { AdminTask, AdminPrelaunchRewardTask } from '$lib/types/admin.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let tasks: AdminTask[] = data.tasks;
  let prelaunchTasks: AdminPrelaunchRewardTask[] = data.prelaunchTasks || [];
  let loading = false;
  let errorMessage = '';
  let actionMessage = '';
  let actionError = '';

  let activeTab: 'queue' | 'selection' | 'issues' | 'delivered' | 'prelaunch' = 'queue';
  let prelaunchTab: 'pending' | 'issue' | 'delivered' = 'pending';

  let filters = {
    category: ''
  };

  const tabs = [
    {
      id: 'queue',
      label: 'Task Queue',
      emptyTitle: 'No tasks',
      emptyMessage: 'Task queue is currently empty.'
    },
    {
      id: 'selection',
      label: 'Selection Pending',
      emptyTitle: 'No selections',
      emptyMessage: 'No subscriptions are waiting on customer selection.'
    },
    {
      id: 'issues',
      label: 'Issues',
      emptyTitle: 'No issues',
      emptyMessage: 'No tasks are marked as issues.'
    },
    {
      id: 'delivered',
      label: 'Delivered',
      emptyTitle: 'No delivered tasks',
      emptyMessage: 'Delivered tasks will appear here.'
    },
    {
      id: 'prelaunch',
      label: 'Pre-launch Rewards',
      emptyTitle: 'No reward tasks',
      emptyMessage: 'Pre-launch reward tasks will appear here.'
    }
  ] as const;

  const prelaunchTabs = [
    {
      id: 'pending',
      label: 'Open',
      emptyTitle: 'No reward tasks',
      emptyMessage: 'No pre-launch reward tasks are waiting for review.'
    },
    {
      id: 'issue',
      label: 'Issues',
      emptyTitle: 'No issues',
      emptyMessage: 'No pre-launch reward tasks are marked as issues.'
    },
    {
      id: 'delivered',
      label: 'Delivered',
      emptyTitle: 'No delivered rewards',
      emptyMessage: 'Delivered reward tasks will appear here.'
    }
  ] as const;

  const taskStatusMap = {
    pending: 'warning',
    in_progress: 'info',
    issue: 'danger',
    completed: 'success'
  } as const;

  const prelaunchStatusMap = {
    pending: 'warning',
    issue: 'danger',
    delivered: 'success'
  } as const;

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const resolveDueDate = (task: AdminTask) =>
    pickValue(task.slaDueAt, task.sla_due_at, task.dueDate, task.due_date) as string | undefined;

  const isOverdue = (task: AdminTask) => {
    const due = resolveDueDate(task);
    if (!due) return false;
    return new Date(due).getTime() < Date.now();
  };

  const resolveOrderId = (task: AdminTask) =>
    (pickValue(task.orderId, task.order_id) as string | undefined) || '';

  const resolveSubscriptionId = (task: AdminTask) =>
    (pickValue(task.subscriptionId, task.subscription_id) as string | undefined) || '';

  const isRenewalTask = (task: AdminTask) => {
    const taskType = pickValue(task.taskType, task.task_type) as string | undefined;
    return taskType === 'renewal';
  };

  const resolveRenewalUrl = (task: AdminTask) => {
    const subscriptionId = resolveSubscriptionId(task);
    return subscriptionId ? `/admin/subscriptions/${subscriptionId}/renewal?taskId=${task.id}` : '';
  };

  const resolveUserLabel = (task: AdminTask) => {
    const email = pickValue(task.userEmail, task.user_email) as string | undefined;
    const userId = pickValue(task.userId, task.user_id) as string | undefined;
    if (email) return email;
    return userId || '--';
  };

  const resolveServiceLabel = (task: AdminTask) => {
    const serviceType = pickValue(task.subscriptionServiceType, task.subscription_service_type) as string | undefined;
    const servicePlan = pickValue(task.subscriptionServicePlan, task.subscription_service_plan) as string | undefined;
    const parts = [serviceType, servicePlan].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : '--';
  };

  const resolvePrelaunchStatus = (task: AdminPrelaunchRewardTask) =>
    (pickValue(task.status) as string | undefined) || 'pending';

  const resolvePrelaunchUserId = (task: AdminPrelaunchRewardTask) =>
    (pickValue(task.userId, task.user_id) as string | undefined) || '';

  const resolvePrelaunchUserEmail = (task: AdminPrelaunchRewardTask) =>
    (pickValue(task.userEmail, task.user_email) as string | undefined) || '';

  const resolvePrelaunchUserLabel = (task: AdminPrelaunchRewardTask) => {
    const email = resolvePrelaunchUserEmail(task);
    if (email) return email;
    const userId = resolvePrelaunchUserId(task);
    return userId || '--';
  };

  const resolvePrelaunchRewardTier = (task: AdminPrelaunchRewardTask) =>
    (pickValue(task.rewardTier, task.reward_tier) as string | undefined) || '';

  const resolvePrelaunchFreeMonths = (task: AdminPrelaunchRewardTask) =>
    pickValue(task.freeMonths, task.free_months) as number | undefined;

  const formatPrelaunchFreeMonths = (task: AdminPrelaunchRewardTask) => {
    const months = resolvePrelaunchFreeMonths(task);
    if (!months) return null;
    return months === 1 ? '1 month' : `${months} months`;
  };

  const resolvePrelaunchSubscriptionId = (task: AdminPrelaunchRewardTask) =>
    (pickValue(task.subscriptionId, task.subscription_id) as string | undefined) || '--';

  const resolvePrelaunchProductLabel = (task: AdminPrelaunchRewardTask) => {
    const product = pickValue(task.productName, task.product_name) as string | undefined;
    const variant = pickValue(task.variantName, task.variant_name) as string | undefined;
    const parts = [product, variant].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : '--';
  };

  const resolveMmuLabel = (task: AdminTask) => {
    const taskType = pickValue(task.taskType, task.task_type) as string | undefined;
    if (taskType !== 'manual_monthly_upgrade') return '';
    const cycleIndex = pickValue(task.mmuCycleIndex, task.mmu_cycle_index) as number | undefined;
    const cycleTotal = pickValue(task.mmuCycleTotal, task.mmu_cycle_total) as number | undefined;
    if (!cycleIndex || !cycleTotal) return '';
    return `MMU ${cycleIndex}/${cycleTotal}`;
  };

  const isSelectionPendingTask = (task: AdminTask) => {
    const category = pickValue(task.taskCategory, task.task_category) as string | undefined;
    return category === 'selection_pending';
  };

  const fetchTasks = async () => {
    loading = true;
    errorMessage = '';
    try {
      const params: Record<string, string> =
        activeTab === 'selection'
          ? { bucket: 'queue', task_category: 'selection_pending' }
          : { bucket: activeTab };
      if (filters.category && activeTab !== 'selection') {
        params.task_category = filters.category;
      }
      const fetched = await adminService.listTasks(params);
      tasks = activeTab === 'queue' ? fetched.filter(task => !isSelectionPendingTask(task)) : fetched;
    } catch (error) {
      errorMessage = getErrorMessage(error, 'Failed to load tasks.');
    } finally {
      loading = false;
    }
  };

  const fetchPrelaunchTasks = async () => {
    loading = true;
    errorMessage = '';
    try {
      const fetched = await adminService.listPrelaunchRewardTasks({
        status: prelaunchTab,
        limit: 50
      });
      prelaunchTasks = fetched;
    } catch (error) {
      errorMessage = getErrorMessage(error, 'Failed to load pre-launch reward tasks.');
    } finally {
      loading = false;
    }
  };

  const switchTab = async (tabId: 'queue' | 'selection' | 'issues' | 'delivered' | 'prelaunch') => {
    if (activeTab === tabId) return;
    activeTab = tabId;
    if (activeTab === 'prelaunch') {
      await fetchPrelaunchTasks();
      return;
    }
    await fetchTasks();
  };

  const switchPrelaunchTab = async (tabId: 'pending' | 'issue' | 'delivered') => {
    if (prelaunchTab === tabId) return;
    prelaunchTab = tabId;
    await fetchPrelaunchTasks();
  };

  const startTask = async (task: AdminTask) => {
    actionMessage = '';
    actionError = '';
    try {
      await adminService.startTask(task.id);
      if (isRenewalTask(task)) {
        const renewalUrl = resolveRenewalUrl(task);
        if (renewalUrl) {
          await goto(renewalUrl);
          return;
        }
      }
      const orderId = resolveOrderId(task);
      if (orderId) {
        await goto(`/admin/orders/${orderId}/fulfillment?taskId=${task.id}`);
        return;
      }
      actionMessage = 'Task assigned.';
      await fetchTasks();
    } catch (error) {
      actionError = getErrorMessage(error, 'Failed to start task.');
    }
  };

  const completeTask = async (taskId: string) => {
    actionMessage = '';
    actionError = '';
    try {
      await adminService.completeTask(taskId, { note: 'Completed from admin UI' });
      actionMessage = 'Task completed.';
      await fetchTasks();
    } catch (error) {
      actionError = getErrorMessage(error, 'Failed to complete task.');
    }
  };

  const moveToIssues = async (taskId: string) => {
    actionMessage = '';
    actionError = '';
    try {
      await adminService.moveTaskToIssues(taskId, { note: 'Moved to issues from task queue' });
      actionMessage = 'Task moved to issues.';
      await fetchTasks();
    } catch (error) {
      actionError = getErrorMessage(error, 'Failed to move task to issues.');
    }
  };

  const moveToQueue = async (taskId: string) => {
    actionMessage = '';
    actionError = '';
    try {
      await adminService.moveTaskToQueue(taskId, { note: 'Returned to task queue from issues' });
      actionMessage = 'Task moved back to queue.';
      await fetchTasks();
    } catch (error) {
      actionError = getErrorMessage(error, 'Failed to move task to queue.');
    }
  };

  const markPrelaunchIssue = async (taskId: string) => {
    actionMessage = '';
    actionError = '';
    try {
      await adminService.markPrelaunchRewardTaskIssue(taskId);
      actionMessage = 'Pre-launch reward task moved to issues.';
      await fetchPrelaunchTasks();
    } catch (error) {
      actionError = getErrorMessage(error, 'Failed to update pre-launch reward task.');
    }
  };

  const markPrelaunchDelivered = async (taskId: string) => {
    actionMessage = '';
    actionError = '';
    try {
      await adminService.markPrelaunchRewardTaskDelivered(taskId);
      actionMessage = 'Pre-launch reward task marked as delivered.';
      await fetchPrelaunchTasks();
    } catch (error) {
      actionError = getErrorMessage(error, 'Failed to update pre-launch reward task.');
    }
  };
</script>

<svelte:head>
  <title>Tasks - Admin</title>
  <meta name="description" content="Track and complete operational tasks across orders and subscriptions." />
</svelte:head>

<div class="space-y-6">
  <section>
    <h1 class="text-2xl font-bold text-gray-900">Tasks</h1>
    <p class="text-sm text-gray-600">Operate the task queue, triage issues, and confirm deliveries.</p>
  </section>

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
    <div class="flex flex-wrap gap-2">
      {#each tabs as tab}
        <button
          class={`rounded-full px-4 py-2 text-sm font-semibold border ${
            activeTab === tab.id
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-gray-50 text-gray-600 border-gray-200'
          }`}
          on:click={() => switchTab(tab.id)}
        >
          {tab.label}
        </button>
      {/each}
    </div>

    {#if activeTab === 'prelaunch'}
      <div class="flex flex-wrap items-center gap-2">
        {#each prelaunchTabs as tab}
          <button
            class={`rounded-full px-4 py-2 text-sm font-semibold border ${
              prelaunchTab === tab.id
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-gray-50 text-gray-600 border-gray-200'
            }`}
            on:click={() => switchPrelaunchTab(tab.id)}
          >
            {tab.label}
          </button>
        {/each}
        <button
          class="ml-auto rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
          on:click={fetchPrelaunchTasks}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
    {:else}
      <div class="grid gap-3 md:grid-cols-3">
        <input
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="Filter by category"
          bind:value={filters.category}
          disabled={activeTab === 'selection'}
        />
        <button
          class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
          on:click={fetchTasks}
          disabled={loading}
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
    {/if}
    {#if errorMessage}
      <p class="text-sm text-red-600">{errorMessage}</p>
    {/if}
    {#if actionMessage}
      <p class="text-sm text-green-600">{actionMessage}</p>
    {/if}
    {#if actionError}
      <p class="text-sm text-red-600">{actionError}</p>
    {/if}
  </section>

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold text-gray-900">
        {tabs.find(tab => tab.id === activeTab)?.label}
      </h2>
      <p class="text-sm text-gray-500">
        {activeTab === 'prelaunch' ? prelaunchTasks.length : tasks.length} tasks
      </p>
    </div>

    {#if activeTab === 'prelaunch'}
      {#if prelaunchTasks.length === 0}
        <AdminEmptyState
          title={prelaunchTabs.find(tab => tab.id === prelaunchTab)?.emptyTitle || 'No reward tasks'}
          message={prelaunchTabs.find(tab => tab.id === prelaunchTab)?.emptyMessage || 'No pre-launch reward tasks.'}
        />
      {:else}
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="text-left text-xs uppercase text-gray-500">
              <tr>
                <th class="py-2">Reward</th>
                <th class="py-2">User</th>
                <th class="py-2">Subscription</th>
                <th class="py-2">Product</th>
                <th class="py-2">Status</th>
                <th class="py-2">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              {#each prelaunchTasks as task}
                <tr>
                  <td class="py-3 text-gray-600">
                    {#if formatPrelaunchFreeMonths(task)}
                      <div class="font-semibold text-gray-900">+{formatPrelaunchFreeMonths(task)}</div>
                    {:else}
                      <div class="font-semibold text-gray-900">--</div>
                    {/if}
                    {#if resolvePrelaunchRewardTier(task)}
                      <div class="text-xs text-gray-500">{resolvePrelaunchRewardTier(task)}</div>
                    {/if}
                  </td>
                  <td class="py-3 text-gray-600">
                    <div class="font-semibold text-gray-900">{resolvePrelaunchUserLabel(task)}</div>
                    <div class="text-xs text-gray-500">{resolvePrelaunchUserId(task) || '--'}</div>
                  </td>
                  <td class="py-3 text-gray-600">
                    <div class="font-semibold text-gray-900">{resolvePrelaunchSubscriptionId(task)}</div>
                  </td>
                  <td class="py-3 text-gray-600">
                    <div class="font-semibold text-gray-900">{resolvePrelaunchProductLabel(task)}</div>
                  </td>
                  <td class="py-3">
                    <StatusBadge
                      label={resolvePrelaunchStatus(task)}
                      tone={statusToneFromMap(resolvePrelaunchStatus(task), prelaunchStatusMap)}
                    />
                  </td>
                  <td class="py-3">
                    {#if resolvePrelaunchStatus(task) !== 'issue'}
                      <button
                        class="text-amber-600 text-xs font-semibold"
                        on:click={() => markPrelaunchIssue(task.id)}
                        disabled={resolvePrelaunchStatus(task) === 'delivered'}
                      >
                        Issues
                      </button>
                    {:else}
                      <button class="text-amber-600 text-xs font-semibold" disabled>Issues</button>
                    {/if}
                    <button
                      class="ml-3 text-gray-600 text-xs font-semibold"
                      on:click={() => markPrelaunchDelivered(task.id)}
                      disabled={resolvePrelaunchStatus(task) === 'delivered'}
                    >
                      Delivered
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {:else}
      {#if tasks.length === 0}
        <AdminEmptyState
          title={tabs.find(tab => tab.id === activeTab)?.emptyTitle || 'No tasks'}
          message={tabs.find(tab => tab.id === activeTab)?.emptyMessage || 'Task queue is currently empty.'}
        />
      {:else}
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="text-left text-xs uppercase text-gray-500">
              <tr>
                <th class="py-2">Task</th>
                <th class="py-2">Order</th>
                <th class="py-2">Subscription</th>
                <th class="py-2">User</th>
                <th class="py-2">SLA</th>
                <th class="py-2">Status</th>
                <th class="py-2">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              {#each tasks as task}
                <tr>
                  <td class="py-3">
                    <div class="font-semibold text-gray-900">
                      {pickValue(task.taskType, task.task_type) || 'Task'}
                    </div>
                    {#if resolveMmuLabel(task)}
                      <div class="text-xs text-amber-600">{resolveMmuLabel(task)}</div>
                    {/if}
                    <div class="text-xs text-gray-500">{pickValue(task.taskCategory, task.task_category) || '--'}</div>
                    <div class="text-xs text-gray-400">{task.id}</div>
                    {#if task.notes}
                      <div class="text-xs text-gray-500 mt-1">{task.notes}</div>
                    {/if}
                  </td>
                  <td class="py-3 text-gray-600">
                    <div class="font-semibold text-gray-900">
                      {resolveOrderId(task) || '--'}
                    </div>
                    <div class="text-xs text-gray-500">
                      {pickValue(task.orderStatus, task.order_status) || '--'}
                    </div>
                  </td>
                  <td class="py-3 text-gray-600">
                    <div class="font-semibold text-gray-900">{resolveSubscriptionId(task) || '--'}</div>
                    <div class="text-xs text-gray-500">{resolveServiceLabel(task)}</div>
                  </td>
                  <td class="py-3 text-gray-600">
                    <div class="font-semibold text-gray-900">{resolveUserLabel(task)}</div>
                    <div class="text-xs text-gray-500">{pickValue(task.userId, task.user_id) || '--'}</div>
                  </td>
                  <td class="py-3 text-gray-600">
                    <div>{formatOptionalDate(resolveDueDate(task))}</div>
                    {#if isOverdue(task)}
                      <div class="text-xs text-red-600">Overdue</div>
                    {/if}
                  </td>
                  <td class="py-3">
                    <StatusBadge
                      label={(task.status || 'pending').toString()}
                      tone={statusToneFromMap(task.status, taskStatusMap)}
                    />
                    {#if pickValue(task.assignedAdmin, task.assigned_admin)}
                      <div class="text-xs text-gray-500 mt-1">
                        Assigned: {pickValue(task.assignedAdmin, task.assigned_admin)}
                      </div>
                    {/if}
                  </td>
                  <td class="py-3">
                    {#if activeTab === 'queue'}
                      {#if resolveOrderId(task) || (isRenewalTask(task) && resolveSubscriptionId(task))}
                        <button class="text-cyan-600 text-xs font-semibold" on:click={() => startTask(task)}>
                          Start
                        </button>
                      {/if}
                      <button class="ml-3 text-amber-600 text-xs font-semibold" on:click={() => moveToIssues(task.id)}>
                        Move to Issues
                      </button>
                      <button class="ml-3 text-gray-600 text-xs font-semibold" on:click={() => completeTask(task.id)}>
                        Complete
                      </button>
                    {:else if activeTab === 'issues'}
                      <button class="text-gray-600 text-xs font-semibold" on:click={() => moveToQueue(task.id)}>
                        Move to Queue
                      </button>
                      <button class="ml-3 text-gray-600 text-xs font-semibold" on:click={() => completeTask(task.id)}>
                        Complete
                      </button>
                    {:else}
                      {#if isRenewalTask(task) && resolveSubscriptionId(task)}
                        <a class="text-cyan-600 text-xs font-semibold" href={resolveRenewalUrl(task)}>
                          View
                        </a>
                      {:else if resolveOrderId(task)}
                        <a class="text-cyan-600 text-xs font-semibold" href={`/admin/orders/${resolveOrderId(task)}/fulfillment`}>
                          View
                        </a>
                      {:else}
                        <span class="text-xs text-gray-400">--</span>
                      {/if}
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    {/if}
  </section>
</div>
