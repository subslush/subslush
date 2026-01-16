<script lang="ts">
  import AdminEmptyState from '$lib/components/admin/AdminEmptyState.svelte';
  import { adminService } from '$lib/api/admin.js';
  import { formatOptionalDate, pickValue } from '$lib/utils/admin.js';
  import type { AdminCreditBalance, AdminCreditTransaction } from '$lib/types/admin.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let balances: AdminCreditBalance[] = data.balances;
  let transactions: AdminCreditTransaction[] = data.transactions || [];
  let actionMessage = '';
  let actionError = '';
  let transactionMessage = '';
  let transactionError = '';
  let transactionsLoading = false;

  let addForm = {
    userId: '',
    amount: 0,
    description: '',
    type: 'bonus'
  };

  let withdrawForm = {
    userId: '',
    amount: 0,
    description: ''
  };

  let transactionFilters = {
    userId: '',
    type: ''
  };

  const resetFeedback = () => {
    actionMessage = '';
    actionError = '';
  };

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const submitAddCredits = async () => {
    resetFeedback();
    try {
      await adminService.addCredits({
        userId: addForm.userId,
        amount: Number(addForm.amount),
        type: addForm.type,
        description: addForm.description
      });
      actionMessage = 'Credits added successfully.';
      addForm = { userId: '', amount: 0, description: '', type: 'bonus' };
    } catch (error) {
      actionError = getErrorMessage(error, 'Failed to add credits.');
    }
  };

  const submitWithdrawCredits = async () => {
    resetFeedback();
    try {
      await adminService.withdrawCredits({
        userId: withdrawForm.userId,
        amount: Number(withdrawForm.amount),
        description: withdrawForm.description
      });
      actionMessage = 'Credits withdrawn successfully.';
      withdrawForm = { userId: '', amount: 0, description: '' };
    } catch (error) {
      actionError = getErrorMessage(error, 'Failed to withdraw credits.');
    }
  };

  const loadTransactions = async () => {
    transactionMessage = '';
    transactionError = '';
    transactionsLoading = true;
    try {
      const params: Record<string, string> = {};
      if (transactionFilters.userId) params.user_id = transactionFilters.userId;
      if (transactionFilters.type) params.type = transactionFilters.type;
      transactions = await adminService.listCreditTransactions(params);
      transactionMessage = 'Transactions refreshed.';
    } catch (error) {
      transactionError = getErrorMessage(error, 'Failed to load transactions.');
    } finally {
      transactionsLoading = false;
    }
  };
</script>

<svelte:head>
  <title>Credits - Admin</title>
  <meta name="description" content="Adjust credit balances and review account credit status." />
</svelte:head>

<div class="space-y-6">
  <section>
    <h1 class="text-2xl font-bold text-gray-900">Credits</h1>
    <p class="text-sm text-gray-600">Manage credit balances, bonuses, and withdrawals.</p>
  </section>

  <section class="grid gap-6 lg:grid-cols-2">
    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-gray-900">Add Credits</h2>
      <p class="text-sm text-gray-500 mt-1">Apply bonuses or manual adjustments.</p>
      <form class="mt-4 space-y-3" on:submit|preventDefault={submitAddCredits}>
        <input
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="User ID"
          bind:value={addForm.userId}
          required
        />
        <input
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          type="number"
          min="0"
          step="0.01"
          placeholder="Amount"
          bind:value={addForm.amount}
          required
        />
        <select class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" bind:value={addForm.type}>
          <option value="bonus">Bonus</option>
          <option value="deposit">Deposit</option>
        </select>
        <input
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="Description"
          bind:value={addForm.description}
          required
        />
        <button class="w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white" type="submit">
          Add Credits
        </button>
      </form>
    </div>

    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h2 class="text-lg font-semibold text-gray-900">Withdraw Credits</h2>
      <p class="text-sm text-gray-500 mt-1">Remove credits for adjustments or reversals.</p>
      <form class="mt-4 space-y-3" on:submit|preventDefault={submitWithdrawCredits}>
        <input
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="User ID"
          bind:value={withdrawForm.userId}
          required
        />
        <input
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          type="number"
          min="0"
          step="0.01"
          placeholder="Amount"
          bind:value={withdrawForm.amount}
          required
        />
        <input
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="Reason"
          bind:value={withdrawForm.description}
          required
        />
        <button class="w-full rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-900" type="submit">
          Withdraw Credits
        </button>
      </form>
    </div>
  </section>

  {#if actionMessage}
    <p class="text-sm text-green-600">{actionMessage}</p>
  {/if}
  {#if actionError}
    <p class="text-sm text-red-600">{actionError}</p>
  {/if}

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold text-gray-900">Credit Balances</h2>
      <p class="text-sm text-gray-500">{balances.length} accounts</p>
    </div>

    {#if balances.length === 0}
      <AdminEmptyState title="No balances" message="Credit balances will show once users transact." />
    {:else}
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="text-left text-xs uppercase text-gray-500">
            <tr>
              <th class="py-2">User</th>
              <th class="py-2">Total</th>
              <th class="py-2">Available</th>
              <th class="py-2">Pending</th>
              <th class="py-2">Updated</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            {#each balances as balance}
              <tr>
                <td class="py-3 font-semibold text-gray-900">
                  {pickValue(balance.email, balance.userId, balance.user_id) || '--'}
                  <div class="text-xs text-gray-500">{pickValue(balance.userId, balance.user_id) || ''}</div>
                </td>
                <td class="py-3 text-gray-600">{pickValue(balance.totalBalance, balance.total_balance) ?? 0}</td>
                <td class="py-3 text-gray-600">{pickValue(balance.availableBalance, balance.available_balance) ?? 0}</td>
                <td class="py-3 text-gray-600">{pickValue(balance.pendingBalance, balance.pending_balance) ?? 0}</td>
                <td class="py-3 text-gray-600">
                  {formatOptionalDate(pickValue(balance.updatedAt, balance.updated_at, balance.lastUpdated))}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Credit Transactions</h2>
        <p class="text-sm text-gray-500">Inspect credit ledger events and reward links.</p>
      </div>
      <button
        class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
        on:click={loadTransactions}
        disabled={transactionsLoading}
      >
        {transactionsLoading ? 'Loading...' : 'Refresh'}
      </button>
    </div>
    <div class="grid gap-3 md:grid-cols-3">
      <input
        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        placeholder="Filter by user ID"
        bind:value={transactionFilters.userId}
      />
      <input
        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        placeholder="Type (bonus, deposit, spend)"
        bind:value={transactionFilters.type}
      />
      <button
        class="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700"
        on:click={loadTransactions}
        disabled={transactionsLoading}
      >
        Apply Filters
      </button>
    </div>
    {#if transactionError}
      <p class="text-sm text-red-600">{transactionError}</p>
    {/if}
    {#if transactionMessage}
      <p class="text-sm text-green-600">{transactionMessage}</p>
    {/if}
    {#if transactions.length === 0}
      <AdminEmptyState title="No transactions" message="Credit transactions will show once credits are used." />
    {:else}
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="text-left text-xs uppercase text-gray-500">
            <tr>
              <th class="py-2">Transaction</th>
              <th class="py-2">User</th>
              <th class="py-2">Type</th>
              <th class="py-2">Amount</th>
              <th class="py-2">Balance</th>
              <th class="py-2">Order</th>
              <th class="py-2">Created</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            {#each transactions as tx}
              <tr>
                <td class="py-3 font-semibold text-gray-900">{tx.id}</td>
                <td class="py-3 text-gray-600">{pickValue(tx.userId, tx.user_id) || '--'}</td>
                <td class="py-3 text-gray-600">{tx.type || '--'}</td>
                <td class="py-3 text-gray-600">{tx.amount ?? 0}</td>
                <td class="py-3 text-gray-600">
                  {pickValue(tx.balanceAfter, tx.balance_after) ?? '--'}
                </td>
                <td class="py-3 text-gray-600">{pickValue(tx.orderId, tx.order_id) || '--'}</td>
                <td class="py-3 text-gray-600">{formatOptionalDate(pickValue(tx.createdAt, tx.created_at))}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</div>
