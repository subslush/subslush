<script lang="ts">
  import { onMount } from 'svelte';
  import { CreditCard, Plus, TrendingUp, ArrowUp, ArrowDown, Calendar, AlertCircle, DollarSign, Wallet, Loader2, CheckCircle, Clock, XCircle } from 'lucide-svelte';
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
      transactions = await paymentService.getPaymentHistory(20, 0);
      console.log('[CREDITS] Loaded transactions:', transactions.length);
      console.log('[CREDITS] First transaction data:', transactions[0]);
      console.log('[CREDITS] All transactions:', transactions);
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

  function getTransactionIcon(type: string) {
    switch (type) {
      case 'purchase':
        return ArrowUp;
      case 'subscription':
        return ArrowDown;
      default:
        return CreditCard;
    }
  }

  function getTransactionColor(type: string) {
    switch (type) {
      case 'purchase':
        return 'text-success-600 dark:text-success-400';
      case 'subscription':
        return 'text-error-600 dark:text-error-400';
      default:
        return 'text-surface-600 dark:text-surface-400';
    }
  }

  // Calculate derived balances (for demonstration)
  $: totalBalance = balance;
  $: availableBalance = balance; // In real app, this would be total minus pending
  $: pendingBalance = 0; // Placeholder for pending transactions
</script>

<svelte:head>
  <title>Manage Credits - Subscription Platform</title>
  <meta name="description" content="View your credit balance and transaction history. Add more credits to purchase premium subscriptions." />
</svelte:head>

<div class="container mx-auto p-6 max-w-7xl">
  <!-- Header Section -->
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-surface-900 dark:text-surface-100 mb-2">
      Credit Management
    </h1>
    <p class="text-surface-600 dark:text-surface-300 text-lg">
      View your balance and manage your credits for subscription purchases
    </p>
  </div>

  {#if isLoading}
    <!-- Loading State -->
    <div class="space-y-8">
      <!-- Balance Cards Skeleton -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        {#each Array(3) as _}
          <div class="bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-lg p-6">
            <div class="h-4 bg-surface-200 dark:bg-surface-700 rounded animate-pulse w-24 mb-4"></div>
            <div class="h-8 bg-surface-200 dark:bg-surface-700 rounded animate-pulse w-20 mb-2"></div>
            <div class="h-3 bg-surface-200 dark:bg-surface-700 rounded animate-pulse w-16"></div>
          </div>
        {/each}
      </div>

      <!-- Transaction History Skeleton -->
      <div class="bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-lg p-6">
        <div class="h-6 bg-surface-200 dark:bg-surface-700 rounded animate-pulse w-48 mb-6"></div>
        <div class="space-y-4">
          {#each Array(4) as _}
            <div class="flex items-center space-x-4">
              <div class="w-10 h-10 bg-surface-200 dark:bg-surface-700 rounded-full animate-pulse"></div>
              <div class="flex-1">
                <div class="h-4 bg-surface-200 dark:bg-surface-700 rounded animate-pulse w-48 mb-2"></div>
                <div class="h-3 bg-surface-200 dark:bg-surface-700 rounded animate-pulse w-32"></div>
              </div>
              <div class="h-4 bg-surface-200 dark:bg-surface-700 rounded animate-pulse w-16"></div>
            </div>
          {/each}
        </div>
      </div>
    </div>
  {:else}
    <!-- Balance Overview -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <!-- Total Balance -->
      <div class="bg-primary-50 dark:bg-primary-900 border border-primary-200 dark:border-primary-700 rounded-lg p-6">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center space-x-2">
            <Wallet size={20} class="text-primary-600 dark:text-primary-400" />
            <span class="text-sm font-medium text-primary-700 dark:text-primary-300">Total Balance</span>
          </div>
        </div>
        <div class="mb-2">
          <span class="text-2xl font-bold text-primary-900 dark:text-primary-100">{totalBalance}</span>
          <span class="text-primary-600 dark:text-primary-400 ml-1">credits</span>
        </div>
        <p class="text-xs text-primary-600 dark:text-primary-400">
          Your total credit balance
        </p>
      </div>

      <!-- Available Balance -->
      <div class="bg-success-50 dark:bg-success-900 border border-success-200 dark:border-success-700 rounded-lg p-6">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center space-x-2">
            <CreditCard size={20} class="text-success-600 dark:text-success-400" />
            <span class="text-sm font-medium text-success-700 dark:text-success-300">Available</span>
          </div>
        </div>
        <div class="mb-2">
          <span class="text-2xl font-bold text-success-900 dark:text-success-100">{availableBalance}</span>
          <span class="text-success-600 dark:text-success-400 ml-1">credits</span>
        </div>
        <p class="text-xs text-success-600 dark:text-success-400">
          Ready to spend
        </p>
      </div>

      <!-- Pending Balance -->
      <div class="bg-warning-50 dark:bg-warning-900 border border-warning-200 dark:border-warning-700 rounded-lg p-6">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center space-x-2">
            <TrendingUp size={20} class="text-warning-600 dark:text-warning-400" />
            <span class="text-sm font-medium text-warning-700 dark:text-warning-300">Pending</span>
          </div>
        </div>
        <div class="mb-2">
          <span class="text-2xl font-bold text-warning-900 dark:text-warning-100">{pendingBalance}</span>
          <span class="text-warning-600 dark:text-warning-400 ml-1">credits</span>
        </div>
        <p class="text-xs text-warning-600 dark:text-warning-400">
          Processing transactions
        </p>
      </div>
    </div>

    <!-- Add Credits Section -->
    <div class="bg-gradient-to-r from-primary-50 to-success-50 dark:from-primary-900 dark:to-success-900 border border-primary-200 dark:border-primary-700 rounded-lg p-6 mb-8">
      <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div>
          <h2 class="text-xl font-semibold text-surface-900 dark:text-surface-100 mb-2">
            Need More Credits?
          </h2>
          <p class="text-surface-600 dark:text-surface-300">
            Add credits to your account to purchase premium subscriptions at discounted prices.
          </p>
        </div>
        <div class="flex flex-wrap gap-4">
          <button
            on:click={handleAddCredits}
            class="inline-flex items-center bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-lg transition-colors font-medium"
          >
            <Plus size={20} class="mr-2" />
            Add Credits
          </button>
        </div>
      </div>
    </div>

    <!-- Transaction History -->
    <div class="bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-lg">
      <div class="p-6 border-b border-surface-200 dark:border-surface-600">
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold text-surface-900 dark:text-surface-100">
            Transaction History
          </h2>
          <button class="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors">
            View All
          </button>
        </div>
      </div>

      <div class="p-6">
        {#if loadingTransactions}
          <div class="text-center py-8">
            <Loader2 class="animate-spin mx-auto" size={32} />
            <p class="text-sm text-gray-500 mt-2">Loading transactions...</p>
          </div>
        {:else if transactions.length > 0}
          <div class="space-y-4">
            {#each transactions as transaction}
              <div class="flex items-center justify-between py-4 border-b">
                <div class="flex items-center space-x-4">
                  <div class="p-2 bg-gray-100 dark:bg-gray-700 rounded-full">
                    {#if transaction.status === 'finished'}
                      <CheckCircle size={20} class="text-success-600" />
                    {:else if transaction.status === 'waiting'}
                      <Clock size={20} class="text-warning-600" />
                    {:else}
                      <XCircle size={20} class="text-error-600" />
                    {/if}
                  </div>
                  <div>
                    <p class="font-medium">{transaction.description || 'Credit Purchase'}</p>
                    <div class="flex items-center space-x-2 text-sm text-gray-500">
                      <Calendar size={14} />
                      <span>{formatDate(transaction.createdAt)}</span>
                      <span class="px-2 py-1 rounded-full text-xs
                        {transaction.status === 'finished' ? 'bg-success-100 text-success-700' : ''}
                        {transaction.status === 'waiting' ? 'bg-warning-100 text-warning-700' : ''}
                        {transaction.status === 'failed' ? 'bg-error-100 text-error-700' : ''}">
                        {getTransactionStatus(transaction.status).text}
                      </span>
                    </div>
                  </div>
                </div>
                <div class="text-right">
                  <span class="font-semibold {transaction.creditAmount > 0 ? 'text-success-600' : 'text-error-600'}">
                    {transaction.creditAmount > 0 ? '+' : ''}{transaction.creditAmount} credits
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
            <CreditCard size={48} class="mx-auto text-gray-400 mb-4" />
            <h3 class="text-lg font-medium mb-2">No transaction history</h3>
            <p class="text-gray-500 mb-6">
              Your credit transactions will appear here once you make a purchase.
            </p>
            <button
              on:click={handleAddCredits}
              class="inline-flex items-center bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              <Plus size={16} class="mr-2" />
              Add Your First Credits
            </button>
          </div>
        {/if}
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="mt-8 bg-surface-100 dark:bg-surface-800 rounded-lg p-6">
      <h3 class="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-4">
        Quick Actions
      </h3>
      <div class="flex flex-wrap gap-4">
        <a
          href="/dashboard/subscriptions"
          class="inline-flex items-center bg-surface-50 dark:bg-surface-700 hover:bg-surface-200 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-300 px-4 py-2 rounded-lg transition-colors"
        >
          <CreditCard size={16} class="mr-2" />
          Browse Subscriptions
        </a>
        <a
          href="/dashboard/subscriptions/active"
          class="inline-flex items-center bg-surface-50 dark:bg-surface-700 hover:bg-surface-200 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-300 px-4 py-2 rounded-lg transition-colors"
        >
          <TrendingUp size={16} class="mr-2" />
          My Active Subscriptions
        </a>
      </div>
    </div>

    <!-- Information Notice -->
    <div class="mt-6 p-4 bg-info-50 dark:bg-info-900 border border-info-200 dark:border-info-700 rounded-lg">
      <div class="flex items-start space-x-3">
        <AlertCircle size={20} class="text-info-600 dark:text-info-400 flex-shrink-0 mt-0.5" />
        <div class="text-sm text-info-800 dark:text-info-200">
          <p class="font-medium mb-1">Credit Information</p>
          <p>Credits are used to purchase premium subscriptions at discounted rates. Credits do not expire and can be used for any available service plan.</p>
        </div>
      </div>
    </div>
  {/if}
</div>

<!-- Payment Modal -->
<AddCreditsModal
  bind:isOpen={showPaymentModal}
  userBalance={balance}
  onSuccess={handlePaymentSuccess}
/>