<script lang="ts">
  import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
  import AdminEmptyState from '$lib/components/admin/AdminEmptyState.svelte';
  import { adminService } from '$lib/api/admin.js';
  import { formatCents, formatOptionalDate, pickValue, statusToneFromMap } from '$lib/utils/admin.js';
  import type { AdminRenewalFulfillment, AdminSubscription, AdminTask } from '$lib/types/admin.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let fulfillment: AdminRenewalFulfillment | null = data.fulfillment;
  let taskId: string | null = data.taskId || null;

  let subscription: AdminSubscription | null = fulfillment?.subscription ?? null;

  let actionMessage = '';
  let actionError = '';
  let paidNote = '';
  let deliveryNote = '';

  let credentialsValue = '';
  let credentialsVisible = false;
  let credentialsLoading = false;
  let credentialsError = '';

  let userCredentialsValue = '';
  let userCredentialsVisible = false;
  let userCredentialsLoading = false;
  let userCredentialsError = '';

  let selectionType: string | undefined;
  let accountIdentifier: string | undefined;
  let manualMonthlyAck: string | undefined;
  let selectionSubmittedAt: string | undefined;
  let selectionLockedAt: string | undefined;
  let hasUserCredentials = false;

  let mmuTasks: AdminTask[] = [];

  const subscriptionStatusMap = {
    active: 'success',
    pending: 'warning',
    expired: 'neutral',
    cancelled: 'danger'
  } as const;

  const taskStatusMap = {
    pending: 'warning',
    in_progress: 'info',
    issue: 'danger',
    completed: 'success'
  } as const;

  const resolveSubscription = () => fulfillment?.subscription;
  const resolveOrder = () => fulfillment?.order || null;
  const resolveUser = () => fulfillment?.user;
  const resolveTasks = () => fulfillment?.tasks || [];
  const resolveStripePayment = () =>
    pickValue(fulfillment?.stripePayment, fulfillment?.stripe_payment) || null;
  const resolveRenewalPayment = () =>
    pickValue(fulfillment?.renewalPayment, fulfillment?.renewal_payment) || null;

  const resolveTask = (): AdminTask | null => {
    const tasks = resolveTasks();
    if (taskId) {
      const match = tasks.find(task => task.id === taskId);
      if (match) return match;
    }
    return tasks.length > 0 ? tasks[0] : null;
  };

  const getSubscriptionCredentialsFlag = (subscription: AdminSubscription) => {
    const storedFlag = pickValue(subscription.hasCredentials, subscription.has_credentials);
    if (storedFlag !== null) return Boolean(storedFlag);
    const storedValue = pickValue(subscription.credentialsEncrypted, subscription.credentials_encrypted);
    return typeof storedValue === 'string' && storedValue.trim().length > 0;
  };

  const formatLabel = (value: string) =>
    value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

  const resolveSelectionType = (item: AdminSubscription) =>
    pickValue(item.selectionType, item.selection_type) as string | undefined;

  const resolveAccountIdentifier = (item: AdminSubscription) =>
    pickValue(item.accountIdentifier, item.account_identifier) as string | undefined;

  const resolveManualMonthlyAck = (item: AdminSubscription) =>
    pickValue(item.manualMonthlyAcknowledgedAt, item.manual_monthly_acknowledged_at) as
      | string
      | undefined;

  const resolveSelectionSubmittedAt = (item: AdminSubscription) =>
    pickValue(item.submittedAt, item.submitted_at) as string | undefined;

  const resolveSelectionLockedAt = (item: AdminSubscription) =>
    pickValue(item.lockedAt, item.locked_at) as string | undefined;

  const resolveHasUserCredentials = (item: AdminSubscription) => {
    const flag = pickValue(item.hasUserCredentials, item.has_user_credentials);
    if (flag !== null && flag !== undefined) return Boolean(flag);
    return false;
  };

  const normalizeTime = (value?: string | null) => {
    if (!value) return 0;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
  };

  const revealUserCredentials = async () => {
    if (!subscription) return;
    userCredentialsLoading = true;
    userCredentialsError = '';
    try {
      const response = await adminService.getSelectionCredentials(subscription.id);
      userCredentialsValue = response.credentials || '';
      userCredentialsVisible = true;
    } catch (error) {
      userCredentialsError =
        error instanceof Error ? error.message : 'Failed to load user credentials.';
    } finally {
      userCredentialsLoading = false;
    }
  };

  const hideUserCredentials = () => {
    userCredentialsVisible = false;
    userCredentialsValue = '';
    userCredentialsError = '';
  };

  const isPaymentConfirmed = () => {
    const task = resolveTask();
    if (!task) return false;
    return Boolean(pickValue(task.paymentConfirmedAt, task.payment_confirmed_at));
  };

  const isTaskCompleted = () => {
    const task = resolveTask();
    if (!task) return false;
    const completedAt = pickValue(task.completedAt, task.completed_at);
    return task.status === 'completed' || Boolean(completedAt);
  };

  const revealCredentials = async () => {
    const subscription = resolveSubscription();
    if (!subscription) return;
    credentialsLoading = true;
    credentialsError = '';
    try {
      const response = await adminService.getSubscriptionCredentials(subscription.id);
      credentialsValue = response.credentials || '';
      credentialsVisible = true;
    } catch (error) {
      credentialsError = error instanceof Error ? error.message : 'Failed to load credentials.';
    } finally {
      credentialsLoading = false;
    }
  };

  const hideCredentials = () => {
    credentialsVisible = false;
    credentialsValue = '';
    credentialsError = '';
  };

  $: subscription = fulfillment?.subscription ?? null;
  $: selectionType = subscription ? resolveSelectionType(subscription) : undefined;
  $: accountIdentifier = subscription ? resolveAccountIdentifier(subscription) : undefined;
  $: manualMonthlyAck = subscription ? resolveManualMonthlyAck(subscription) : undefined;
  $: selectionSubmittedAt = subscription ? resolveSelectionSubmittedAt(subscription) : undefined;
  $: selectionLockedAt = subscription ? resolveSelectionLockedAt(subscription) : undefined;
  $: hasUserCredentials = subscription ? resolveHasUserCredentials(subscription) : false;
  $: mmuTasks = resolveTasks()
    .filter(task => {
      const category = pickValue(task.taskCategory, task.task_category);
      const type = pickValue(task.taskType, task.task_type);
      return category === 'manual_monthly_upgrade' || type === 'manual_monthly_upgrade';
    })
    .sort((a, b) => normalizeTime(pickValue(a.createdAt, a.created_at)) - normalizeTime(pickValue(b.createdAt, b.created_at)));

  const markPaid = async () => {
    const task = resolveTask();
    if (!task || isPaymentConfirmed()) return;
    actionMessage = '';
    actionError = '';
    try {
      const updated = await adminService.markRenewalTaskPaid(task.id, {
        note: paidNote || 'Renewal payment confirmed'
      });
      if (fulfillment) {
        fulfillment = {
          ...fulfillment,
          tasks: fulfillment.tasks.map(item => (item.id === task.id ? { ...item, ...updated } : item))
        };
      }
      actionMessage = 'Renewal marked as paid.';
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to mark renewal as paid.';
    }
  };

  const confirmDelivery = async () => {
    const task = resolveTask();
    if (!task || isTaskCompleted()) return;
    actionMessage = '';
    actionError = '';
    try {
      const updated = await adminService.confirmRenewalTask(task.id, {
        note: deliveryNote || 'Renewal fulfilled'
      });
      if (fulfillment) {
        fulfillment = {
          ...fulfillment,
          tasks: fulfillment.tasks.map(item => (item.id === task.id ? { ...item, ...updated } : item))
        };
      }
      actionMessage = 'Renewal confirmed. User notified.';
    } catch (error) {
      actionError = error instanceof Error ? error.message : 'Failed to confirm renewal.';
    }
  };
</script>

<svelte:head>
  <title>Renewal Fulfillment - Admin</title>
  <meta name="description" content="Review renewal details, confirm payment, and complete renewal delivery." />
</svelte:head>

{#if !fulfillment}
  <AdminEmptyState title="Renewal not found" message="Unable to load renewal fulfillment details." />
{:else}
  <div class="space-y-6">
    <section class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Renewal Fulfillment</h1>
        <p class="text-sm text-gray-600">Subscription {resolveSubscription()?.id || '--'}</p>
      </div>
      <StatusBadge
        label={(resolveSubscription()?.status || 'unknown').toString()}
        tone={statusToneFromMap(resolveSubscription()?.status || 'neutral', subscriptionStatusMap)}
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

      <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-2">
        <h2 class="text-lg font-semibold text-gray-900">Subscription</h2>
        <p class="text-sm text-gray-600">
          {(resolveSubscription()?.service_type || '').replace(/_/g, ' ')} · {(resolveSubscription()?.service_plan || '').replace(/_/g, ' ')}
        </p>
        <p class="text-xs text-gray-500">Start: {formatOptionalDate(resolveSubscription()?.start_date || null)}</p>
        <p class="text-xs text-gray-500">End: {formatOptionalDate(resolveSubscription()?.end_date || null)}</p>
        <p class="text-xs text-gray-500">Renewal: {formatOptionalDate(resolveSubscription()?.renewal_date || null)}</p>
        <p class="text-xs text-gray-500">Next billing: {formatOptionalDate(resolveSubscription()?.next_billing_at || null)}</p>
        <p class="text-xs text-gray-500">Auto-renew: {resolveSubscription()?.auto_renew ? 'Enabled' : 'Manual'}</p>
        <p class="text-xs text-gray-500">Renewal method: {resolveSubscription()?.renewal_method || '--'}</p>
        <p class="text-xs text-gray-500">
          Price: {formatCents(resolveSubscription()?.price_cents, resolveSubscription()?.currency || 'USD')}
        </p>
      </div>

      <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-2">
        <h2 class="text-lg font-semibold text-gray-900">Latest Renewal Payment</h2>
        {#if resolveStripePayment()}
          <p class="text-sm text-gray-600">
            PaymentIntent: {pickValue(resolveStripePayment()?.paymentId, resolveStripePayment()?.payment_id, resolveStripePayment()?.id) || '--'}
          </p>
          <p class="text-xs text-gray-500">
            Amount: {formatCents(pickValue(resolveStripePayment()?.amountCents, resolveStripePayment()?.amount_cents), resolveStripePayment()?.currency || 'USD')}
          </p>
          <p class="text-xs text-gray-500">
            Status: {resolveStripePayment()?.status || resolveStripePayment()?.status_reason || '--'}
          </p>
          <p class="text-xs text-gray-500">
            Provider: {resolveStripePayment()?.provider || resolveStripePayment()?.payment_provider || 'stripe'}
          </p>
          <p class="text-xs text-gray-500">
            Created: {formatOptionalDate(resolveStripePayment()?.created_at || resolveStripePayment()?.createdAt || null)}
          </p>
        {:else if resolveRenewalPayment()}
          <p class="text-sm text-gray-600">
            Amount: {resolveRenewalPayment()?.amount ? Math.abs(resolveRenewalPayment()?.amount || 0) : '--'} credits
          </p>
          <p class="text-xs text-gray-500">Status: {resolveRenewalPayment()?.status_reason || '--'}</p>
          <p class="text-xs text-gray-500">Method: {resolveRenewalPayment()?.renewal_method || '--'}</p>
          <p class="text-xs text-gray-500">Created: {formatOptionalDate(resolveRenewalPayment()?.created_at || null)}</p>
        {:else}
          <p class="text-sm text-gray-500">No renewal payment found.</p>
        {/if}
      </div>
    </section>

    <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
      <h2 class="text-lg font-semibold text-gray-900">History</h2>
      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-2">
          <p class="text-xs font-semibold uppercase text-gray-500">Initial order</p>
          {#if resolveOrder()}
            <p class="text-sm font-semibold text-gray-900">{resolveOrder()?.id}</p>
            <p class="text-xs text-gray-500">
              Placed: {formatOptionalDate(pickValue(resolveOrder()?.createdAt, resolveOrder()?.created_at) || null)}
            </p>
            <p class="text-xs text-gray-500">
              Status: {resolveOrder()?.status || '--'}
            </p>
            <p class="text-xs text-gray-500">
              Total: {formatCents(pickValue(resolveOrder()?.totalCents, resolveOrder()?.total_cents), resolveOrder()?.currency || 'USD')}
            </p>
            <p class="text-xs text-gray-500">
              Paid with credits: {resolveOrder()?.paid_with_credits ? 'Yes' : 'No'}
            </p>
            {#if resolveOrder()?.items?.length}
              <div class="space-y-1 pt-2 text-xs text-gray-600">
                {#each resolveOrder()?.items || [] as item}
                  <div class="flex items-center justify-between">
                    <span class="font-semibold text-gray-900">
                      {item.product_name || item.description || 'Item'}
                    </span>
                    <span>
                      {formatCents(item.total_price_cents, item.currency || resolveOrder()?.currency || 'USD')}
                    </span>
                  </div>
                {/each}
              </div>
            {/if}
          {:else}
            <p class="text-sm text-gray-500">No initial order linked.</p>
          {/if}
        </div>

        <div class="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-2">
          <p class="text-xs font-semibold uppercase text-gray-500">MMU history</p>
          {#if mmuTasks.length === 0}
            <p class="text-sm text-gray-500">No MMU tasks yet.</p>
          {:else}
            <div class="space-y-2 text-xs text-gray-700">
              {#each mmuTasks as task}
                <div class="rounded-lg border border-gray-200 bg-white p-3 space-y-1">
                  <div class="flex items-center justify-between">
                    <span class="font-semibold text-gray-900">
                      {#if pickValue(task.mmuCycleIndex, task.mmu_cycle_index) && pickValue(task.mmuCycleTotal, task.mmu_cycle_total)}
                        MMU {pickValue(task.mmuCycleIndex, task.mmu_cycle_index)}/{pickValue(task.mmuCycleTotal, task.mmu_cycle_total)}
                      {:else}
                        MMU task
                      {/if}
                    </span>
                    <StatusBadge
                      label={(task.status || 'pending').toString()}
                      tone={statusToneFromMap(task.status || 'pending', taskStatusMap)}
                    />
                  </div>
                  <p class="text-[11px] text-gray-500">
                    Created: {formatOptionalDate(pickValue(task.createdAt, task.created_at) || null)}
                  </p>
                  {#if pickValue(task.completedAt, task.completed_at)}
                    <p class="text-[11px] text-gray-500">
                      Completed: {formatOptionalDate(pickValue(task.completedAt, task.completed_at) || null)}
                    </p>
                  {/if}
                  {#if task.notes}
                    <p class="text-[11px] text-gray-500">{task.notes}</p>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </section>

    <section class="grid gap-6 lg:grid-cols-2">
      <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-900">Task</h2>
          {#if resolveTask()}
            <StatusBadge
              label={(resolveTask()?.status || 'pending').toString()}
              tone={statusToneFromMap(resolveTask()?.status || 'pending', taskStatusMap)}
            />
          {/if}
        </div>
        {#if resolveTask()}
          <p class="text-xs text-gray-500">Task ID: {resolveTask()?.id}</p>
          <p class="text-xs text-gray-500">
            Payment confirmed: {isPaymentConfirmed() ? 'Yes' : 'No'}
          </p>
          <p class="text-xs text-gray-500">
            Completed: {isTaskCompleted() ? 'Yes' : 'No'}
          </p>
        {:else}
          <p class="text-sm text-gray-500">No tasks linked to this renewal.</p>
        {/if}
      </div>

      <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-900">Credentials</h2>
          {#if resolveSubscription() && getSubscriptionCredentialsFlag(resolveSubscription() as AdminSubscription)}
            {#if credentialsVisible}
              <button
                class="text-xs font-semibold text-gray-600"
                on:click={hideCredentials}
              >
                Hide
              </button>
            {:else}
              <button
                class="text-xs font-semibold text-cyan-600"
                on:click={revealCredentials}
                disabled={credentialsLoading}
              >
                {credentialsLoading ? 'Loading' : 'Provision credentials'}
              </button>
            {/if}
          {:else}
            <span class="text-xs text-gray-500">No credentials on file</span>
          {/if}
        </div>
        {#if credentialsError}
          <p class="text-xs text-red-600">{credentialsError}</p>
        {/if}
        <div class="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-2">
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
              <p class="text-xs text-amber-700">User provided account credentials.</p>
              {#if hasUserCredentials}
                {#if userCredentialsVisible}
                  <div class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <div class="flex items-center justify-between gap-2">
                      <span class="font-semibold">User credentials</span>
                      <button
                        class="text-amber-900 underline underline-offset-2"
                        on:click={hideUserCredentials}
                      >
                        Hide
                      </button>
                    </div>
                    <pre class="mt-2 whitespace-pre-wrap break-all">{userCredentialsValue}</pre>
                  </div>
                {:else}
                  <button
                    class="inline-flex items-center rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-50"
                    on:click={revealUserCredentials}
                    disabled={userCredentialsLoading}
                  >
                    {userCredentialsLoading ? 'Revealing...' : 'Reveal user credentials'}
                  </button>
                {/if}
                {#if userCredentialsError}
                  <p class="text-xs text-red-600">{userCredentialsError}</p>
                {/if}
              {:else}
                <p class="text-xs text-gray-500">No user credentials on file.</p>
              {/if}
            {/if}
          {:else if selectionSubmittedAt || selectionLockedAt}
            <p class="text-xs text-gray-500">No upgrade selection required.</p>
          {:else}
            <p class="text-xs text-amber-700">Selection pending.</p>
          {/if}
        </div>
        {#if credentialsVisible}
          <pre class="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800 whitespace-pre-wrap">{credentialsValue || 'No credentials stored.'}</pre>
        {:else}
          <p class="text-xs text-gray-500">Use credentials to complete the renewal manually.</p>
        {/if}
      </div>
    </section>

    <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
      <h2 class="text-lg font-semibold text-gray-900">Actions</h2>
      <div class="grid gap-4 md:grid-cols-2">
        <div class="space-y-2">
          <label class="text-xs font-semibold text-gray-600" for="renewal-paid-note">Mark paid (optional note)</label>
          <textarea
            id="renewal-paid-note"
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            rows="3"
            bind:value={paidNote}
            placeholder="Payment verified in credits ledger"
          ></textarea>
          <button
            class="inline-flex items-center justify-center rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60"
            on:click={markPaid}
            disabled={isPaymentConfirmed() || !resolveTask()}
          >
            {isPaymentConfirmed() ? 'Paid confirmed' : 'Mark paid'}
          </button>
        </div>
        <div class="space-y-2">
          <label class="text-xs font-semibold text-gray-600" for="renewal-delivery-note">Confirm delivery (optional note)</label>
          <textarea
            id="renewal-delivery-note"
            class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            rows="3"
            bind:value={deliveryNote}
            placeholder="Renewal completed in provider dashboard"
          ></textarea>
          <button
            class="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            on:click={confirmDelivery}
            disabled={!isPaymentConfirmed() || isTaskCompleted() || !resolveTask()}
          >
            {isTaskCompleted() ? 'Delivered' : 'Confirm delivery'}
          </button>
        </div>
      </div>
    </section>
  </div>
{/if}
