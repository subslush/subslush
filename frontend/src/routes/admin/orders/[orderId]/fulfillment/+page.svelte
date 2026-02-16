<script lang="ts">
  import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
  import AdminEmptyState from '$lib/components/admin/AdminEmptyState.svelte';
  import { adminService } from '$lib/api/admin.js';
  import { formatCents, formatOptionalDate, pickValue, statusToneFromMap } from '$lib/utils/admin.js';
  import type { AdminOrderFulfillment, AdminOrderItem, AdminSubscription, AdminTask } from '$lib/types/admin.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let fulfillment: AdminOrderFulfillment | null = data.fulfillment;
  let taskId: string | null = data.taskId || null;

  let actionMessage = '';
  let actionError = '';
  let paidNote = '';
  let deliveryNote = '';
  let credentialUpdates: Record<string, string> = {};
  let userCredentialsById: Record<string, string> = {};
  let userCredentialsErrorById: Record<string, string> = {};
  let userCredentialsLoadingById: Record<string, boolean> = {};

  const orderStatusMap = {
    paid: 'success',
    delivered: 'success',
    pending_payment: 'warning',
    in_process: 'info',
    cancelled: 'danger',
    cart: 'neutral'
  } as const;

  const subscriptionStatusMap = {
    active: 'success',
    pending: 'warning',
    expired: 'neutral',
    cancelled: 'danger'
  } as const;

  const formatNumber = (value?: number | null) => {
    if (value === null || value === undefined) return '--';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  };

  const resolveTermMonths = (item: AdminOrderItem): number | null => {
    const metadata = item.metadata as Record<string, unknown> | null;
    const rawValue =
      item.termMonths ??
      item.term_months ??
      (metadata?.term_months as number | string | null | undefined) ??
      (metadata?.termMonths as number | string | null | undefined) ??
      (metadata?.duration_months as number | string | null | undefined) ??
      (metadata?.durationMonths as number | string | null | undefined);

    if (rawValue === null || rawValue === undefined) return null;
    const parsed = typeof rawValue === 'number' ? rawValue : Number.parseInt(String(rawValue), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return parsed;
  };

  const formatTermLabel = (item: AdminOrderItem): string => {
    const months = resolveTermMonths(item);
    if (!months) return '--';
    return `${months} month${months === 1 ? '' : 's'}`;
  };

  const resolveOrder = () => fulfillment?.order;
  const resolveUser = () => fulfillment?.user;
  const resolveSubscriptions = () => fulfillment?.subscriptions || [];
  const resolveTasks = () => fulfillment?.tasks || [];
  const resolveCreditSummary = () => fulfillment?.credit?.summary || null;
  const resolveOrderCurrency = (): string =>
    (pickValue(resolveOrder()?.currency) as string | null) || 'USD';
  const resolveOrderCouponCode = (): string =>
    (pickValue(resolveOrder()?.couponCode, resolveOrder()?.coupon_code) as string | null) || '';
  const resolveOrderCouponDiscountCents = (): number => {
    const raw = pickValue(resolveOrder()?.couponDiscountCents, resolveOrder()?.coupon_discount_cents);
    if (raw === null || raw === undefined) return 0;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
  };
  const hasOrderCouponUsage = (): boolean =>
    resolveOrderCouponCode().length > 0 || resolveOrderCouponDiscountCents() > 0;
  const hasMissingCredentials = () =>
    resolveSubscriptions().some(subscription => !getSubscriptionCredentialsFlag(subscription));
  const isPaymentVerified = () => {
    const status = resolveOrder()?.status;
    return status === 'paid' || status === 'delivered';
  };
  const isDelivered = () => resolveOrder()?.status === 'delivered';

  const getSubscriptionCredentialsFlag = (subscription: AdminSubscription) => {
    const storedFlag = pickValue(subscription.hasCredentials, subscription.has_credentials);
    if (storedFlag !== null) return Boolean(storedFlag);
    const storedValue = pickValue(subscription.credentialsEncrypted, subscription.credentials_encrypted);
    return typeof storedValue === 'string' && storedValue.trim().length > 0;
  };

  const formatLabel = (value: string) =>
    value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

  const resolveSelectionType = (subscription: AdminSubscription) =>
    pickValue(subscription.selectionType, subscription.selection_type) as string | undefined;

  const resolveAccountIdentifier = (subscription: AdminSubscription) =>
    pickValue(subscription.accountIdentifier, subscription.account_identifier) as string | undefined;

  const resolveManualMonthlyAck = (subscription: AdminSubscription) =>
    pickValue(
      subscription.manualMonthlyAcknowledgedAt,
      subscription.manual_monthly_acknowledged_at
    ) as string | undefined;

  const resolveSelectionSubmittedAt = (subscription: AdminSubscription) =>
    pickValue(subscription.submittedAt, subscription.submitted_at) as string | undefined;

  const resolveSelectionLockedAt = (subscription: AdminSubscription) =>
    pickValue(subscription.lockedAt, subscription.locked_at) as string | undefined;

  const resolveHasUserCredentials = (subscription: AdminSubscription) => {
    const flag = pickValue(subscription.hasUserCredentials, subscription.has_user_credentials);
    if (flag !== null && flag !== undefined) return Boolean(flag);
    return false;
  };

  const revealUserCredentials = async (subscriptionId: string) => {
    userCredentialsLoadingById = { ...userCredentialsLoadingById, [subscriptionId]: true };
    userCredentialsErrorById = { ...userCredentialsErrorById, [subscriptionId]: '' };
    try {
      const result = await adminService.getSelectionCredentials(subscriptionId);
      if (result.credentials) {
        userCredentialsById = { ...userCredentialsById, [subscriptionId]: result.credentials };
      } else {
        userCredentialsErrorById = {
          ...userCredentialsErrorById,
          [subscriptionId]: 'No user credentials available.'
        };
      }
    } catch (error) {
      userCredentialsErrorById = {
        ...userCredentialsErrorById,
        [subscriptionId]: error instanceof Error ? error.message : 'Failed to reveal credentials.'
      };
    } finally {
      userCredentialsLoadingById = { ...userCredentialsLoadingById, [subscriptionId]: false };
    }
  };

  const hideUserCredentials = (subscriptionId: string) => {
    const { [subscriptionId]: _removed, ...rest } = userCredentialsById;
    userCredentialsById = rest;
  };

  const markPaid = async () => {
    const order = resolveOrder();
    if (!order || isPaymentVerified()) return;
    actionMessage = '';
    actionError = '';
    try {
      const updated = await adminService.updateOrderStatus(order.id, {
        status: 'paid',
        reason: paidNote || 'payment_verified'
      });
      fulfillment = fulfillment
        ? { ...fulfillment, order: { ...fulfillment.order, ...updated } }
        : fulfillment;
      actionMessage = 'Order marked as paid.';
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to update order status.';
    }
  };

  const saveCredentials = async (subscriptionId: string) => {
    actionMessage = '';
    actionError = '';
    const value = credentialUpdates[subscriptionId];
    if (!value) {
      actionError = 'Enter credentials before saving.';
      return;
    }
    try {
      const updated = await adminService.updateSubscriptionCredentials(subscriptionId, {
        credentials: value,
        reason: 'credential_provisioned'
      });
      if (updated && fulfillment) {
        fulfillment = {
          ...fulfillment,
          subscriptions: fulfillment.subscriptions.map(subscription =>
            subscription.id === subscriptionId ? { ...subscription, ...updated } : subscription
          )
        };
      }
      credentialUpdates = { ...credentialUpdates, [subscriptionId]: '' };
      actionMessage = 'Credentials saved.';
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to save credentials.';
    }
  };

  const confirmDelivery = async () => {
    const order = resolveOrder();
    if (!order || isDelivered()) return;
    actionMessage = '';
    actionError = '';
    try {
      const updated = await adminService.updateOrderStatus(order.id, {
        status: 'delivered',
        reason: deliveryNote || 'fulfilled'
      });
      fulfillment = fulfillment
        ? { ...fulfillment, order: { ...fulfillment.order, ...updated } }
        : fulfillment;
      actionMessage = 'Order delivered. Subscriptions activated.';
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to confirm delivery.';
    }
  };

  const completeTask = async (task: AdminTask) => {
    actionMessage = '';
    actionError = '';
    try {
      await adminService.completeTask(task.id, { note: 'Completed from fulfillment view' });
      if (fulfillment) {
        fulfillment = {
          ...fulfillment,
          tasks: fulfillment.tasks.map(item =>
            item.id === task.id ? { ...item, status: 'completed' } : item
          )
        };
      }
      actionMessage = 'Task completed.';
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to complete task.';
    }
  };
</script>

<svelte:head>
  <title>Order Fulfillment - Admin</title>
  <meta name="description" content="Verify payment, deliver credentials, and activate subscriptions." />
</svelte:head>

{#if !fulfillment}
  <AdminEmptyState title="Order not found" message="Unable to load fulfillment details." />
{:else}
  <div class="space-y-6">
    <section class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Fulfillment</h1>
        <p class="text-sm text-gray-600">Order {resolveOrder()?.id}</p>
      </div>
      <StatusBadge
        label={(resolveOrder()?.status || 'unknown').toString()}
        tone={statusToneFromMap(resolveOrder()?.status || 'neutral', orderStatusMap)}
      />
    </section>

    {#if actionMessage}
      <p class="text-sm text-green-600">{actionMessage}</p>
    {/if}
    {#if actionError}
      <p class="text-sm text-red-600">{actionError}</p>
    {/if}

    <section class="grid gap-6 lg:grid-cols-3">
      <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-3">
        <h2 class="text-lg font-semibold text-gray-900">Customer</h2>
        <p class="text-sm text-gray-600">{resolveUser()?.email || '--'}</p>
        <p class="text-xs text-gray-500">User ID: {resolveUser()?.id || '--'}</p>
        <p class="text-xs text-gray-500">Status: {resolveUser()?.status || '--'}</p>
        <p class="text-xs text-gray-500">Last login: {formatOptionalDate(resolveUser()?.last_login || null)}</p>
      </div>

      <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-3">
        <h2 class="text-lg font-semibold text-gray-900">Order</h2>
        <p class="text-sm text-gray-600">Total: {formatCents(resolveOrder()?.total_cents, resolveOrder()?.currency || 'USD')}</p>
        {#if hasOrderCouponUsage()}
          <p class="text-xs text-gray-500">
            Coupon: {resolveOrderCouponCode() || 'Applied'}
          </p>
          <p class="text-xs font-semibold text-emerald-700">
            Discount applied: {formatCents(resolveOrderCouponDiscountCents(), resolveOrderCurrency())} off total
          </p>
        {:else}
          <p class="text-xs text-gray-500">Coupon: Not used</p>
        {/if}
        <p class="text-xs text-gray-500">Payment provider: {resolveOrder()?.payment_provider || '--'}</p>
        <p class="text-xs text-gray-500">Payment ref: {resolveOrder()?.payment_reference || '--'}</p>
        <p class="text-xs text-gray-500">Paid with credits: {resolveOrder()?.paid_with_credits ? 'Yes' : 'No'}</p>
      </div>

      <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-3">
        <h2 class="text-lg font-semibold text-gray-900">Task</h2>
        {#if hasOrderCouponUsage()}
          <p class="text-xs text-emerald-700">
            Coupon context: {resolveOrderCouponCode() || 'Applied'} · {formatCents(resolveOrderCouponDiscountCents(), resolveOrderCurrency())} off
          </p>
        {/if}
        {#if resolveTasks().length === 0}
          <p class="text-sm text-gray-500">No linked tasks.</p>
        {:else}
          {#each resolveTasks() as task}
            <div class={`rounded-lg border px-3 py-2 text-xs ${task.id === taskId ? 'border-cyan-300 bg-cyan-50' : 'border-gray-100'}`}>
              <div class="flex items-center justify-between">
                <span class="font-semibold text-gray-900">{task.id}</span>
                <StatusBadge
                  label={(task.status || 'pending').toString()}
                  tone={statusToneFromMap(task.status || 'pending', {
                    pending: 'warning',
                    in_progress: 'info',
                    issue: 'danger',
                    completed: 'success'
                  })}
                />
              </div>
              <div class="mt-2 flex items-center justify-between">
                <span>{pickValue(task.taskCategory, task.task_category) || '--'}</span>
                {#if task.status !== 'completed'}
                  <button class="text-cyan-600 font-semibold" on:click={() => completeTask(task)}>
                    Complete
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </section>

    <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900">Step 1 · Verify Payment</h2>
        <button
          class={`rounded-lg px-4 py-2 text-sm font-semibold ${
            isPaymentVerified() ? 'bg-gray-200 text-gray-500' : 'bg-gray-900 text-white'
          }`}
          on:click={markPaid}
          disabled={isPaymentVerified()}
        >
          Mark Paid
        </button>
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        <div class="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-2">
          <p class="text-xs font-semibold uppercase text-gray-500">Payment status</p>
          <p class="text-sm text-gray-700">Order status: {resolveOrder()?.status || '--'}</p>
          <p class="text-sm text-gray-700">Provider: {resolveOrder()?.payment_provider || '--'}</p>
          <p class="text-sm text-gray-700">Reference: {resolveOrder()?.payment_reference || '--'}</p>
          <input
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="Optional note (e.g. verified in Stripe/NOWPayments)"
            bind:value={paidNote}
          />
        </div>

        <div class="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-2">
          <p class="text-xs font-semibold uppercase text-gray-500">Payments</p>
          {#if fulfillment.payments.length === 0}
            <p class="text-sm text-gray-500">No payment records linked to this order.</p>
          {:else}
            <div class="space-y-2 text-sm text-gray-700">
              {#each fulfillment.payments as payment}
                <div class="flex items-center justify-between">
                  <span class="font-semibold text-gray-900">
                    {pickValue(payment.paymentId, payment.payment_id, payment.id)}
                  </span>
                  <span>{payment.status || '--'}</span>
                </div>
                <div class="text-xs text-gray-500">
                  {payment.provider || payment.payment_provider || '--'} · {formatCents(pickValue(payment.amountCents, payment.amount_cents), payment.currency || 'USD')}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        <div class="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-2">
          <p class="text-xs font-semibold uppercase text-gray-500">Credit ledger</p>
          {#if !resolveCreditSummary()}
            <p class="text-sm text-gray-500">No credit history available.</p>
          {:else}
            <p class="text-sm">Balance: {formatNumber(resolveCreditSummary()?.balance)} credits</p>
            <p class="text-sm">Confirmed deposits: {formatNumber(resolveCreditSummary()?.depositsConfirmed)} credits</p>
            <p class="text-sm">Bonuses: {formatNumber(resolveCreditSummary()?.bonuses)} credits</p>
            <p class="text-sm">Pending deposits: {resolveCreditSummary()?.pendingDeposits ?? 0}</p>
            <p class="text-sm">Total spent: {formatNumber(resolveCreditSummary()?.creditsOut)} credits</p>
            <p class="text-sm">Order spend: {formatNumber(fulfillment.credit.orderCreditsSpent)} credits</p>
            {#if resolveCreditSummary()?.flags.spendExceedsCreditsIn}
              <p class="text-xs text-red-600">Flag: Spending exceeds confirmed credits.</p>
            {/if}
            {#if resolveCreditSummary()?.flags.hasPendingDeposits}
              <p class="text-xs text-amber-600">Pending deposits detected.</p>
            {/if}
          {/if}
        </div>

        <div class="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-2">
          <p class="text-xs font-semibold uppercase text-gray-500">Recent deposits</p>
          {#if fulfillment.credit.recentDeposits.length === 0}
            <p class="text-sm text-gray-500">No deposits recorded.</p>
          {:else}
            <div class="space-y-2 text-xs text-gray-600">
              {#each fulfillment.credit.recentDeposits as deposit}
                <div class="flex items-center justify-between">
                  <span class="font-semibold text-gray-900">{formatNumber(deposit.amount)} credits</span>
                  <span>{deposit.payment_status || '--'}</span>
                </div>
                <div class="text-[11px] text-gray-500">
                  {deposit.payment_id || '--'} · {formatOptionalDate(deposit.created_at)}
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <div class="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-2">
          <p class="text-xs font-semibold uppercase text-gray-500">Recent purchases</p>
          {#if fulfillment.credit.recentPurchases.length === 0}
            <p class="text-sm text-gray-500">No purchases recorded.</p>
          {:else}
            <div class="space-y-2 text-xs text-gray-600">
              {#each fulfillment.credit.recentPurchases as purchase}
                <div class="flex items-center justify-between">
                  <span class="font-semibold text-gray-900">{formatNumber(Math.abs(purchase.amount || 0))} credits</span>
                  <span>{purchase.order_id || '--'}</span>
                </div>
                <div class="text-[11px] text-gray-500">{formatOptionalDate(purchase.created_at)}</div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </section>

    <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
      <h2 class="text-lg font-semibold text-gray-900">Order Items</h2>
      {#if !resolveOrder()?.items || resolveOrder()?.items?.length === 0}
        <AdminEmptyState title="No items" message="No order items were found." />
      {:else}
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead class="text-left text-xs uppercase text-gray-500">
              <tr>
                <th class="py-2">Product</th>
                <th class="py-2">Variant</th>
                <th class="py-2">Duration</th>
                <th class="py-2">Qty</th>
                <th class="py-2">Unit Price</th>
                <th class="py-2">Total</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              {#each resolveOrder()?.items || [] as item}
                <tr>
                  <td class="py-3 font-semibold text-gray-900">{item.product_name || item.description || 'Item'}</td>
                  <td class="py-3 font-semibold text-orange-600">{item.variant_name || item.product_variant_id || '--'}</td>
                  <td class="py-3 text-gray-600">{formatTermLabel(item)}</td>
                  <td class="py-3 text-gray-600">{item.quantity ?? 0}</td>
                  <td class="py-3 text-gray-600">{formatCents(item.unit_price_cents, item.currency || 'USD')}</td>
                  <td class="py-3 text-gray-600">{formatCents(item.total_price_cents, item.currency || 'USD')}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>

    <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
      <h2 class="text-lg font-semibold text-gray-900">Step 2 · Provision Credentials</h2>
      {#if resolveSubscriptions().length === 0}
        <AdminEmptyState title="No subscriptions" message="No subscriptions are linked to this order." />
      {:else}
        <div class="space-y-4">
          {#each resolveSubscriptions() as subscription}
            {@const selectionType = resolveSelectionType(subscription)}
            {@const accountIdentifier = resolveAccountIdentifier(subscription)}
            {@const manualMonthlyAck = resolveManualMonthlyAck(subscription)}
            {@const selectionSubmittedAt = resolveSelectionSubmittedAt(subscription)}
            {@const selectionLockedAt = resolveSelectionLockedAt(subscription)}
            {@const hasUserCredentials = resolveHasUserCredentials(subscription)}
            <div class="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-3">
              <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p class="text-sm font-semibold text-gray-900">
                    {pickValue(subscription.serviceType, subscription.service_type)} · {pickValue(subscription.servicePlan, subscription.service_plan)}
                  </p>
                  <p class="text-xs text-gray-500">Subscription ID: {subscription.id}</p>
                </div>
                <StatusBadge
                  label={(subscription.status || 'pending').toString()}
                  tone={statusToneFromMap(subscription.status || 'pending', subscriptionStatusMap)}
                />
              </div>
              <div class="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
                <p class="text-[11px] uppercase tracking-wide text-gray-500">Upgrade selection</p>
                {#if selectionType}
                  <p class="text-sm font-semibold text-gray-900">{formatLabel(selectionType)}</p>
                  {#if accountIdentifier}
                    <p class="text-xs text-gray-600">Account: {accountIdentifier}</p>
                  {/if}
                  {#if manualMonthlyAck}
                    <p class="text-xs text-gray-600">
                      MMU acknowledged: {formatOptionalDate(manualMonthlyAck)}
                    </p>
                  {/if}
                  {#if selectionSubmittedAt}
                    <p class="text-xs text-gray-500">
                      Submitted: {formatOptionalDate(selectionSubmittedAt)}
                    </p>
                  {/if}
                  {#if selectionLockedAt}
                    <p class="text-xs text-gray-500">
                      Locked: {formatOptionalDate(selectionLockedAt)}
                    </p>
                  {/if}
                  {#if selectionType === 'upgrade_own_account'}
                    <p class="text-xs text-amber-700">
                      User provided account. Enter "User provided credentials" before delivery.
                    </p>
                    {#if hasUserCredentials}
                      {#if userCredentialsById[subscription.id]}
                        <div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                          <div class="flex items-center justify-between gap-2">
                            <span class="font-semibold">User credentials</span>
                            <button
                              class="text-amber-900 underline underline-offset-2"
                              on:click={() => hideUserCredentials(subscription.id)}
                            >
                              Hide
                            </button>
                          </div>
                          <pre class="mt-2 whitespace-pre-wrap break-all">{userCredentialsById[subscription.id]}</pre>
                        </div>
                      {:else}
                        <button
                          class="inline-flex items-center rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-50"
                          on:click={() => revealUserCredentials(subscription.id)}
                          disabled={userCredentialsLoadingById[subscription.id]}
                        >
                          {userCredentialsLoadingById[subscription.id] ? 'Revealing...' : 'Reveal user credentials'}
                        </button>
                      {/if}
                      {#if userCredentialsErrorById[subscription.id]}
                        <p class="text-xs text-red-600">{userCredentialsErrorById[subscription.id]}</p>
                      {/if}
                    {:else}
                      <p class="text-xs text-gray-500">No user credentials on file.</p>
                    {/if}
                  {/if}
                {:else}
                  <p class="text-xs text-amber-700">Selection pending.</p>
                {/if}
              </div>
              <p class="text-xs text-gray-500">
                Credentials on file: {getSubscriptionCredentialsFlag(subscription) ? 'Yes' : 'No'}
              </p>
              <textarea
                class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                rows={3}
                placeholder="Enter credentials to deliver"
                bind:value={credentialUpdates[subscription.id]}
              ></textarea>
              <div class="flex items-center justify-end">
                <button
                  class="rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white"
                  on:click={() => saveCredentials(subscription.id)}
                >
                  Save credentials
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 class="text-lg font-semibold text-gray-900">Step 3 · Confirm Delivery</h2>
          <p class="text-sm text-gray-600">Confirm once credentials are set and payment is verified.</p>
        </div>
        <button
          class={`rounded-lg px-4 py-2 text-sm font-semibold ${
            hasMissingCredentials() || isDelivered()
              ? 'bg-gray-200 text-gray-500'
              : 'bg-cyan-600 text-white'
          }`}
          on:click={confirmDelivery}
          disabled={hasMissingCredentials() || isDelivered()}
        >
          Confirm delivery
        </button>
      </div>
      {#if hasMissingCredentials()}
        <p class="text-xs text-amber-600">Add credentials for all subscriptions before confirming delivery.</p>
      {/if}
      <input
        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        placeholder="Optional delivery note"
        bind:value={deliveryNote}
      />
    </section>
  </div>
{/if}
