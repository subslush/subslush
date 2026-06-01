<script lang="ts">
  import { onMount } from 'svelte';
  import { creditsService } from '$lib/api/credits.js';
  import { credits } from '$lib/stores/credits.js';
  import type { CreditBalance, CreditTransaction } from '$lib/types/credits.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let balance: CreditBalance = data.balance;
  let transactions: CreditTransaction[] = data.transactions || [];
  let loadingHistory = false;
  let availableBalance = 0;
  let pendingBalance = 0;

  $: if (balance) {
    credits.setFromBalance(balance, balance.userId);
  }

  $: availableBalance = $credits.availableBalance ?? balance.availableBalance ?? balance.balance ?? 0;
  $: pendingBalance = $credits.pendingBalance ?? balance.pendingBalance ?? 0;

  const paymentEntryTypes: Record<string, { label: string; isPositive: boolean }> = {
    deposit: { label: 'Deposit', isPositive: true },
    bonus: { label: 'Bonus', isPositive: true },
    refund: { label: 'Refund', isPositive: true },
    purchase: { label: 'Purchase', isPositive: false },
    refund_reversal: { label: 'Refund reversal', isPositive: false },
    withdrawal: { label: 'Withdrawal', isPositive: false }
  };

  function formatDate(value?: string): string {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatAmount(amount: number, isPositive: boolean): string {
    const signed = isPositive ? amount : -amount;
    const sign = signed >= 0 ? '+' : '-';
    return `${sign}$${Math.abs(signed).toFixed(2)}`;
  }

  async function refreshBalanceAndHistory() {
    if (!balance.userId) return;
    try {
      loadingHistory = true;
      const [latestBalance, history] = await Promise.all([
        creditsService.getBalance(balance.userId),
        creditsService.getHistory(balance.userId, { limit: 10, offset: 0 })
      ]);
      balance = latestBalance;
      transactions = history.transactions || [];
      credits.setFromBalance(latestBalance, latestBalance.userId);
    } catch (error) {
      console.warn('Failed to refresh payment data:', error);
    } finally {
      loadingHistory = false;
    }
  }

  onMount(() => {
    void refreshBalanceAndHistory();
  });
</script>

<svelte:head>
  <title>Payments - SubSlush</title>
  <meta name="description" content="View your payment balance and history." />
</svelte:head>

<section class="space-y-6">
  <div class="flex items-center justify-between flex-wrap gap-3">
    <div>
      <h1 class="text-2xl font-semibold text-gray-900">Payments</h1>
    </div>
  </div>

  <div class="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
    <p class="font-semibold text-cyan-900">Crypto checkout flow</p>
    <p class="mt-1 text-cyan-800">
      Select crypto during checkout and we create a dedicated invoice for that specific order.
      Fulfillment starts after the required blockchain confirmation.
    </p>
  </div>

  <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="text-sm text-gray-600">Account balance</p>
        <p class="text-3xl font-semibold text-gray-900 mt-2">${availableBalance.toFixed(2)}</p>
      </div>
    </div>
    {#if pendingBalance > 0}
      <p class="text-xs text-gray-500 mt-2">Pending confirmation: ${pendingBalance.toFixed(2)}</p>
    {/if}
    <p class="mt-3 text-xs text-gray-500">
      This section is informational only. New crypto payments are initiated directly during checkout.
    </p>
  </div>

  <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Recent payment entries</h2>
        <p class="text-sm text-gray-600">Latest 10 entries</p>
      </div>
    </div>

    {#if loadingHistory}
      <p class="text-sm text-gray-600">Loading history...</p>
    {:else if transactions.length === 0}
      <div class="rounded-lg border border-dashed border-gray-200 p-6 text-center">
        <p class="text-sm font-medium text-gray-900">No payment entries yet.</p>
      </div>
    {:else}
      <div class="divide-y divide-gray-100">
        {#each transactions as transaction}
          {@const typeInfo = paymentEntryTypes[transaction.type] || { label: transaction.type, isPositive: true }}
          <div class="flex items-center justify-between py-3">
            <div>
              <p class="text-sm font-medium text-gray-900">{transaction.description || typeInfo.label}</p>
              <p class="text-xs text-gray-500 mt-1">{formatDate(transaction.createdAt)}</p>
            </div>
            <div class="text-right">
              <p class={`text-sm font-semibold ${typeInfo.isPositive ? 'text-green-600' : 'text-gray-900'}`}>
                {formatAmount(transaction.amount, typeInfo.isPositive)}
              </p>
              <p class="text-xs text-gray-500">Balance after: ${transaction.balanceAfter.toFixed(2)}</p>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>
