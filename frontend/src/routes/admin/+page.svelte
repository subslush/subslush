<script lang="ts">
  import { ClipboardList, CreditCard, Package, Repeat, ShoppingCart } from 'lucide-svelte';
  import StatCard from '$lib/components/dashboard/StatCard.svelte';
  import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
  import AdminEmptyState from '$lib/components/admin/AdminEmptyState.svelte';
  import { formatCents, formatOptionalDate, pickValue, statusToneFromMap } from '$lib/utils/admin.js';
  import type { PageData } from './$types';

  export let data: PageData;

  const orderStatusMap = {
    paid: 'success',
    delivered: 'success',
    pending_payment: 'warning',
    in_process: 'info',
    cancelled: 'danger',
    cart: 'neutral'
  } as const;

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
</script>

<svelte:head>
  <title>Admin Overview - SubSlush</title>
  <meta name="description" content="Operational overview of orders, payments, subscriptions, and tasks." />
</svelte:head>

<div class="space-y-8">
  <section class="flex flex-col gap-2">
    <h1 class="text-2xl font-bold text-gray-900">Operational Overview</h1>
    <p class="text-sm text-gray-600">Monitor the latest activity across catalog, payments, and customer operations.</p>
  </section>

  <section class="grid gap-6 sm:grid-cols-2 xl:grid-cols-5">
    <StatCard
      title="Products"
      value={data.metrics.products}
      subtitle="Active catalog items"
      icon={Package}
      iconColor="bg-cyan-50"
      iconTextColor="text-cyan-600"
    />
    <StatCard
      title="Orders"
      value={data.metrics.orders}
      subtitle="Recent order activity"
      icon={ShoppingCart}
      iconColor="bg-blue-50"
      iconTextColor="text-blue-600"
    />
    <StatCard
      title="Payments"
      value={data.metrics.payments}
      subtitle="Latest payment updates"
      icon={CreditCard}
      iconColor="bg-pink-50"
      iconTextColor="text-pink-600"
    />
    <StatCard
      title="Subscriptions"
      value={data.metrics.subscriptions}
      subtitle="Active subscription changes"
      icon={Repeat}
      iconColor="bg-purple-50"
      iconTextColor="text-purple-600"
    />
    <StatCard
      title="Tasks"
      value={data.metrics.tasks}
      subtitle="Pending operational tasks"
      icon={ClipboardList}
      iconColor="bg-amber-50"
      iconTextColor="text-amber-600"
    />
  </section>

  <section class="grid gap-6 lg:grid-cols-2">
    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-lg font-semibold text-gray-900">Recent Orders</h2>
          <p class="text-sm text-gray-500">Latest order changes requiring awareness.</p>
        </div>
        <a class="text-sm font-semibold text-cyan-600" href="/admin/orders">View all</a>
      </div>

      {#if data.recentOrders.length === 0}
        <AdminEmptyState title="No recent orders" message="Orders will appear here as they are created." />
      {:else}
        <div class="space-y-3">
          {#each data.recentOrders as order}
            <div class="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <div>
                <p class="text-sm font-semibold text-gray-900">Order {order.id}</p>
                <p class="text-xs text-gray-500">
                  {formatOptionalDate(pickValue(order.createdAt, order.created_at))}
                </p>
              </div>
              <div class="text-right">
                <p class="text-sm font-semibold text-gray-900">
                  {formatCents(pickValue(order.totalCents, order.total_cents), order.currency || 'USD')}
                </p>
                <StatusBadge
                  label={(order.status || 'unknown').toString()}
                  tone={statusToneFromMap(order.status, orderStatusMap)}
                />
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-lg font-semibold text-gray-900">Recent Payments</h2>
          <p class="text-sm text-gray-500">Payment statuses across providers.</p>
        </div>
        <a class="text-sm font-semibold text-cyan-600" href="/admin/payments">View all</a>
      </div>

      {#if data.recentPayments.length === 0}
        <AdminEmptyState title="No recent payments" message="Payment activity will show here as it arrives." />
      {:else}
        <div class="space-y-3">
          {#each data.recentPayments as payment}
            <div class="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <div>
                <p class="text-sm font-semibold text-gray-900">
                  {pickValue(payment.paymentId, payment.payment_id, payment.id) || 'Payment'}
                </p>
                <p class="text-xs text-gray-500">
                  {pickValue(payment.provider, payment.payment_provider) || 'provider'}
                </p>
              </div>
              <div class="text-right">
                <p class="text-sm font-semibold text-gray-900">
                  {formatCents(pickValue(payment.amountCents, payment.amount_cents), payment.currency || 'USD')}
                </p>
                <StatusBadge
                  label={(payment.status || 'unknown').toString()}
                  tone={statusToneFromMap(payment.status, paymentStatusMap)}
                />
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </section>

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Pending Tasks</h2>
        <p class="text-sm text-gray-500">Operational tasks waiting for action.</p>
      </div>
      <a class="text-sm font-semibold text-cyan-600" href="/admin/tasks">Manage tasks</a>
    </div>

    {#if data.pendingTasks.length === 0}
      <AdminEmptyState title="No pending tasks" message="All tasks are up to date." />
    {:else}
      <div class="grid gap-3 md:grid-cols-2">
        {#each data.pendingTasks as task}
          <div class="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
            <p class="text-sm font-semibold text-gray-900">{pickValue(task.taskCategory, task.task_category) || 'Task'}</p>
            <p class="text-xs text-gray-500">Due {formatOptionalDate(pickValue(task.slaDueAt, task.sla_due_at))}</p>
            <p class="text-xs text-gray-500 mt-1">Task ID {task.id}</p>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>
