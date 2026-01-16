<script lang="ts">
  import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
  import AdminEmptyState from '$lib/components/admin/AdminEmptyState.svelte';
  import { adminService } from '$lib/api/admin.js';
  import { formatOptionalDate, statusToneFromMap } from '$lib/utils/admin.js';
  import type { AdminUserLookup } from '$lib/types/admin.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let users: AdminUserLookup[] = data.users || [];
  let query = '';
  let loading = false;
  let errorMessage = '';
  let hasSearched = false;

  const userStatusMap = {
    active: 'success',
    inactive: 'warning',
    suspended: 'danger',
    deleted: 'neutral'
  } as const;

  const formatNumber = (value?: number | null) => {
    if (value === null || value === undefined) return '--';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  };

  const resolveString = (value?: string | null) => value && value.trim().length > 0 ? value : '--';

  const runSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) {
      users = [];
      hasSearched = true;
      return;
    }

    loading = true;
    errorMessage = '';

    try {
      const result = await adminService.searchUsers({ search: trimmed, limit: 20 });
      users = result.users;
      hasSearched = true;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to search users.';
      hasSearched = true;
    } finally {
      loading = false;
    }
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      runSearch();
    }
  };
</script>

<svelte:head>
  <title>Users - Admin</title>
  <meta name="description" content="Search users, review account status, rewards, vouchers, and deposit history." />
</svelte:head>

<div class="space-y-6">
  <section>
    <h1 class="text-2xl font-bold text-gray-900">User Lookup</h1>
    <p class="text-sm text-gray-600">Search by email, UUID, or username to view account status, rewards, vouchers, and deposits.</p>
  </section>

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
    <div class="flex flex-col gap-3 md:flex-row md:items-center">
      <input
        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        placeholder="Search by email, UUID, or username"
        bind:value={query}
        on:keydown={handleKeydown}
      />
      <button
        class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
        on:click={runSearch}
        disabled={loading}
      >
        {loading ? 'Searching...' : 'Search'}
      </button>
    </div>
    {#if errorMessage}
      <p class="text-sm text-red-600">{errorMessage}</p>
    {/if}
  </section>

  <section class="space-y-4">
    {#if !hasSearched}
      <AdminEmptyState title="Search for a user" message="Enter a query to load user details." />
    {:else if users.length === 0}
      <AdminEmptyState title="No users found" message="Try a different email, UUID, or username." />
    {:else}
      {#each users as user}
        <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-5">
          <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div class="space-y-1">
              <h2 class="text-lg font-semibold text-gray-900">{resolveString(user.email)}</h2>
              <p class="text-xs text-gray-500">ID: {user.id}</p>
              <div class="flex flex-wrap gap-2 text-xs text-gray-600">
                <span>Username: {resolveString(user.username)}</span>
                <span>Display: {resolveString(user.display_name)}</span>
                <span>Referral code: {resolveString(user.referral_code)}</span>
              </div>
            </div>
            <StatusBadge
              label={resolveString(user.status)}
              tone={statusToneFromMap(user.status || 'neutral', userStatusMap)}
            />
          </div>

          <div class="grid gap-4 md:grid-cols-4">
            <div class="rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-1 text-sm">
              <p class="text-xs font-semibold uppercase text-gray-500">Account</p>
              <p>Registered: {formatOptionalDate(user.created_at)}</p>
              <p>Last login: {formatOptionalDate(user.last_login)}</p>
              <p>Prelaunch email: {resolveString(user.pre_registration_email)}</p>
            </div>
            <div class="rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-1 text-sm">
              <p class="text-xs font-semibold uppercase text-gray-500">Rewards & Vouchers</p>
              <p>Vouchers: {formatNumber(user.voucher_count)}</p>
              <p>Rewards: {formatNumber(user.reward_count)}</p>
            </div>
            <div class="rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-1 text-sm">
              <p class="text-xs font-semibold uppercase text-gray-500">Deposits</p>
              <p>Top-ups: {formatNumber(user.deposit_count)}</p>
              <p>Confirmed: {formatNumber(user.deposit_confirmed_total ?? user.deposit_total)} credits</p>
              <p>Pending: {formatNumber(user.deposit_pending_count)}</p>
              <p>Last top-up: {formatOptionalDate(user.last_deposit_at)}</p>
            </div>
            <div class="rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-1 text-sm">
              <p class="text-xs font-semibold uppercase text-gray-500">Credits</p>
              <p>Balance: {formatNumber(user.credit_balance)} credits</p>
              <p>Credits in: {formatNumber(user.credits_in)}</p>
              <p>Credits out: {formatNumber(user.credits_out)}</p>
              <p>Last purchase: {formatOptionalDate(user.last_purchase_at)}</p>
            </div>
          </div>

          <div class="grid gap-4 lg:grid-cols-4">
            <div class="rounded-lg border border-gray-200 p-4">
              <h3 class="text-xs font-semibold uppercase text-gray-500 mb-2">Recent vouchers</h3>
              {#if !user.vouchers || user.vouchers.length === 0}
                <p class="text-xs text-gray-500">No vouchers on record.</p>
              {:else}
                <div class="space-y-2 text-xs text-gray-600">
                  {#each user.vouchers as voucher}
                    <div class="flex items-center justify-between">
                      <span class="font-semibold text-gray-900">
                        {resolveString(voucher.voucher_type)}
                        {#if voucher.amount !== null && voucher.amount !== undefined}
                          ({formatNumber(voucher.amount)})
                        {/if}
                      </span>
                      <span>{resolveString(voucher.status)}</span>
                    </div>
                    <div class="text-[11px] text-gray-500">Issued: {formatOptionalDate(voucher.issued_at)}</div>
                  {/each}
                </div>
              {/if}
            </div>

            <div class="rounded-lg border border-gray-200 p-4">
              <h3 class="text-xs font-semibold uppercase text-gray-500 mb-2">Recent rewards</h3>
              {#if !user.rewards || user.rewards.length === 0}
                <p class="text-xs text-gray-500">No rewards on record.</p>
              {:else}
                <div class="space-y-2 text-xs text-gray-600">
                  {#each user.rewards as reward}
                    <div class="flex items-center justify-between">
                      <span class="font-semibold text-gray-900">{resolveString(reward.reward_type)}</span>
                      <span>{resolveString(reward.tier)}</span>
                    </div>
                    <div class="text-[11px] text-gray-500">Awarded: {formatOptionalDate(reward.awarded_at)}</div>
                  {/each}
                </div>
              {/if}
            </div>

            <div class="rounded-lg border border-gray-200 p-4">
              <h3 class="text-xs font-semibold uppercase text-gray-500 mb-2">Recent deposits</h3>
              {#if !user.deposits || user.deposits.length === 0}
                <p class="text-xs text-gray-500">No deposits on record.</p>
              {:else}
                <div class="space-y-2 text-xs text-gray-600">
                  {#each user.deposits as deposit}
                    <div class="flex items-center justify-between">
                      <span class="font-semibold text-gray-900">
                        {formatNumber(deposit.amount)} {resolveString(deposit.currency)}
                      </span>
                      <span>{resolveString(deposit.payment_provider)}</span>
                    </div>
                    <div class="text-[11px] text-gray-500">
                      {resolveString(deposit.payment_id)} · {resolveString(deposit.payment_status)}
                    </div>
                    <div class="text-[11px] text-gray-500">{formatOptionalDate(deposit.created_at)}</div>
                  {/each}
                </div>
              {/if}
            </div>

            <div class="rounded-lg border border-gray-200 p-4">
              <h3 class="text-xs font-semibold uppercase text-gray-500 mb-2">Recent purchases</h3>
              {#if !user.purchases || user.purchases.length === 0}
                <p class="text-xs text-gray-500">No purchases on record.</p>
              {:else}
                <div class="space-y-2 text-xs text-gray-600">
                  {#each user.purchases as purchase}
                    <div class="flex items-center justify-between">
                      <span class="font-semibold text-gray-900">
                        {formatNumber(Math.abs(purchase.amount ?? 0))} credits
                      </span>
                      <span>{resolveString(purchase.order_id)}</span>
                    </div>
                    <div class="text-[11px] text-gray-500">{resolveString(purchase.description)}</div>
                    <div class="text-[11px] text-gray-500">{formatOptionalDate(purchase.created_at)}</div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </section>
</div>
