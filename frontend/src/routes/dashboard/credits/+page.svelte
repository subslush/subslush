<script lang="ts">
  import { onMount } from 'svelte';
  import { CreditCard, Plus, Calendar, Wallet, Loader2, CheckCircle, Clock, XCircle } from 'lucide-svelte';
  import AddCreditsModal from '$lib/components/payment/AddCreditsModal.svelte';
  import { paymentService } from '$lib/api/payments.js';
  import type { PageData } from './$types';

  export let data: PageData;

  $: balance = data?.balance ?? 0;
  $: isLoading = balance === undefined;

  let showPaymentModal = false;
  let transactions: any[] = [];
  let loadingTransactions = false;

  onMount(async () => {
    await loadTransactions();
  });

  async function loadTransactions() {
    try {
      loadingTransactions = true;
      console.log('[CREDITS] Starting to load transactions...');
      // Limit to 10 most recent transactions
      const allTransactions = await paymentService.getPaymentHistory(10, 0);
      transactions = allTransactions.slice(0, 10);
      console.log('[CREDITS] Loaded transactions:', transactions.length);
    } catch (error) {
      console.error('[CREDITS] Failed to load transactions:', error);
      transactions = [];
    } finally {
      loadingTransactions = false;
    }
  }

  function handleAddCredits() {
    showPaymentModal = true;
  }

  function handlePaymentSuccess(newBalance: number) {
    balance = newBalance;
    showPaymentModal = false;
    // Reload transactions to show the new payment
    loadTransactions();
  }

  function getTransactionStatus(status: string) {
    const statusMap = {
      finished: { color: 'success', text: 'Completed' },
      waiting: { color: 'warning', text: 'Pending' },
      confirming: { color: 'warning', text: 'Confirming' },
      failed: { color: 'error', text: 'Failed' },
      expired: { color: 'error', text: 'Expired' }
    };
    return statusMap[status] || { color: 'surface', text: status };
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
</script>

<svelte:head>
  <title>Manage Credits - SubSlush</title>
  <meta name="description" content="View your credit balance and transaction history. Add more credits to purchase premium subscriptions." />
</svelte:head>

<!-- Header Section -->
<div class="flex items-center justify-between mb-6">
  <div>
    <h1 class="text-2xl font-bold text-gray-900">
      Credit Management
      <span class="inline-block">💳</span>
    </h1>
    <p class="text-gray-600 mt-1 text-base">
      View your balance and manage your credits for subscription purchases
    </p>
  </div>

  <div class="flex gap-3">
    <button
      on:click={handleAddCredits}
      class="px-6 py-2.5 text-white text-sm font-medium rounded-lg transition-all duration-300 focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 flex items-center space-x-2 hover:shadow-lg hover:shadow-pink-500/30 hover:scale-105"
      style="background-color: #F06292;"
      onmouseover="this.style.backgroundColor='#E91E63'"
      onmouseout="this.style.backgroundColor='#F06292'"
    >
      <Plus size={20} />
      <span>Add Credits</span>
    </button>
  </div>
</div>

<div>

{#if isLoading}
  <!-- Loading State -->
  <div class="space-y-8">
    <!-- Balance Cards Skeleton -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      {#each Array(3) as _}
        <div class="bg-white rounded-xl border border-gray-200 p-6">
          <div class="h-4 bg-gray-200 rounded animate-pulse w-24 mb-4"></div>
          <div class="h-8 bg-gray-200 rounded animate-pulse w-20 mb-2"></div>
          <div class="h-3 bg-gray-200 rounded animate-pulse w-16"></div>
        </div>
      {/each}
    </div>

    <!-- Transaction History Skeleton -->
    <div class="bg-white rounded-xl border border-gray-200 p-6">
      <div class="h-6 bg-gray-200 rounded animate-pulse w-48 mb-6"></div>
      <div class="space-y-4">
        {#each Array(4) as _}
          <div class="flex items-center space-x-4">
            <div class="w-10 h-10 bg-gray-200 rounded-full animate-pulse"></div>
            <div class="flex-1">
              <div class="h-4 bg-gray-200 rounded animate-pulse w-48 mb-2"></div>
              <div class="h-3 bg-gray-200 rounded animate-pulse w-32"></div>
            </div>
            <div class="h-4 bg-gray-200 rounded animate-pulse w-16"></div>
          </div>
        {/each}
      </div>
    </div>
  </div>
{:else}
  <!-- Balance Overview -->
  <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
    <!-- Credit Balance -->
    <div class="bg-white rounded-xl border border-gray-200 p-6">
      <div class="flex items-center mb-4">
        <div class="p-3 bg-green-100 rounded-lg">
          <Wallet class="w-6 h-6 text-green-600" />
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600">Credit Balance</p>
          <p class="text-2xl font-bold text-green-600">€{balance}</p>
        </div>
      </div>
      <p class="text-xs text-gray-500">
        Available for purchases
      </p>
    </div>

    <!-- Total Purchases -->
    <div class="bg-white rounded-xl border border-gray-200 p-6">
      <div class="flex items-center mb-4">
        <div class="p-3 bg-blue-100 rounded-lg">
          <CreditCard class="w-6 h-6 text-blue-600" />
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600">Total Purchases</p>
          <p class="text-2xl font-bold text-blue-600">{transactions.length}</p>
        </div>
      </div>
      <p class="text-xs text-gray-500">
        Credit transactions
      </p>
    </div>

    <!-- Account Status -->
    <div class="bg-white rounded-xl border border-gray-200 p-6">
      <div class="flex items-center mb-4">
        <div class="p-3 bg-purple-100 rounded-lg">
          <CheckCircle class="w-6 h-6 text-purple-600" />
        </div>
        <div class="ml-4">
          <p class="text-sm font-medium text-gray-600">Account Status</p>
          <p class="text-2xl font-bold text-purple-600">Active</p>
        </div>
      </div>
      <p class="text-xs text-gray-500">
        Account in good standing
      </p>
    </div>
  </div>

  <!-- Transaction History -->
  <div class="bg-white rounded-xl border border-gray-200 p-6 mb-6">
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-xl font-semibold text-gray-900 flex items-center">
        <span class="mr-2 text-2xl">📊</span>
        Transaction History
      </h2>
      <span class="text-sm text-gray-500">
        Recent 10 transactions
      </span>
    </div>

    {#if loadingTransactions}
      <div class="text-center py-8">
        <Loader2 class="animate-spin mx-auto w-8 h-8 text-blue-500" />
        <p class="text-sm text-gray-500 mt-2">Loading transactions...</p>
      </div>
    {:else if transactions.length > 0}
      <div class="space-y-4">
        {#each transactions as transaction}
          <div class="flex items-center justify-between py-4 border-b border-gray-100 last:border-b-0">
            <div class="flex items-center space-x-4">
              <div class="p-2 rounded-full
                {transaction.status === 'finished' ? 'bg-green-100' : ''}
                {transaction.status === 'waiting' ? 'bg-yellow-100' : ''}
                {transaction.status === 'failed' ? 'bg-red-100' : ''}">
                {#if transaction.status === 'finished'}
                  <CheckCircle size={20} class="text-green-600" />
                {:else if transaction.status === 'waiting'}
                  <Clock size={20} class="text-yellow-600" />
                {:else}
                  <XCircle size={20} class="text-red-600" />
                {/if}
              </div>
              <div>
                <p class="font-medium text-gray-900">{transaction.description || 'Credit Purchase'}</p>
                <div class="flex items-center space-x-2 text-sm text-gray-500">
                  <Calendar size={14} />
                  <span>{formatDate(transaction.createdAt)}</span>
                  <span class="px-2 py-1 rounded-full text-xs
                    {transaction.status === 'finished' ? 'bg-green-100 text-green-700' : ''}
                    {transaction.status === 'waiting' ? 'bg-yellow-100 text-yellow-700' : ''}
                    {transaction.status === 'failed' ? 'bg-red-100 text-red-700' : ''}">
                    {getTransactionStatus(transaction.status).text}
                  </span>
                </div>
              </div>
            </div>
            <div class="text-right">
              <span class="font-semibold {transaction.creditAmount > 0 ? 'text-green-600' : 'text-red-600'}">
                {transaction.creditAmount > 0 ? '+' : ''}€{transaction.creditAmount}
              </span>
              {#if transaction.currency}
                <p class="text-xs text-gray-500">{transaction.currency.toUpperCase()}</p>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="text-center py-12">
        <div class="mb-4 p-4 bg-gray-100 rounded-full inline-block">
          <CreditCard class="w-10 h-10 text-gray-400" />
        </div>
        <h3 class="text-lg font-medium text-gray-900 mb-2">No transaction history</h3>
        <p class="text-gray-500 mb-6">
          Your credit transactions will appear here once you make a purchase.
        </p>
        <button
          on:click={handleAddCredits}
          class="inline-flex items-center px-6 py-2.5 text-white text-sm font-medium rounded-lg transition-colors focus:ring-2 focus:ring-offset-2"
          style="background-color: #4FC3F7; focus:ring-color: #4FC3F7;"
          onmouseover="this.style.backgroundColor='#29B6F6'"
          onmouseout="this.style.backgroundColor='#4FC3F7'"
        >
          <Plus size={16} class="mr-2" />
          Add Your First Credits
        </button>
      </div>
    {/if}
  </div>
{/if}
</div>

<!-- Payment Modal -->
<AddCreditsModal
  bind:isOpen={showPaymentModal}
  userBalance={balance}
  onSuccess={handlePaymentSuccess}
/>