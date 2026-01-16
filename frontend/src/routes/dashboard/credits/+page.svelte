<script lang="ts">
  import { creditsService } from '$lib/api/credits.js';
  import AddCreditsModal from '$lib/components/payment/AddCreditsModal.svelte';
  import { credits } from '$lib/stores/credits.js';
  import type { CreditBalance, CreditTransaction } from '$lib/types/credits.js';
  import type { PaymentStatus, ResumablePayment } from '$lib/types/payment.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let balance: CreditBalance = data.balance;
  let transactions: CreditTransaction[] = data.transactions || [];

  $: balance = data.balance;
  $: transactions = data.transactions || [];
  let loadingHistory = false;
  let showPaymentModal = false;
  let resumePayment: ResumablePayment | null = null;
  let availableBalance = 0;
  let pendingBalance = 0;

  $: if (data.balance) {
    credits.setFromBalance(data.balance, data.balance.userId);
  }

  $: availableBalance =
    $credits.availableBalance ??
    balance.availableBalance ??
    balance.balance ??
    0;
  $: pendingBalance =
    $credits.pendingBalance ??
    balance.pendingBalance ??
    0;

  const creditTypes: Record<string, { label: string; isPositive: boolean }> = {
    deposit: { label: 'Deposit', isPositive: true },
    bonus: { label: 'Bonus', isPositive: true },
    refund: { label: 'Refund', isPositive: true },
    purchase: { label: 'Purchase', isPositive: false },
    refund_reversal: { label: 'Refund reversal', isPositive: false },
    withdrawal: { label: 'Withdrawal', isPositive: false }
  };

  type InvoiceDetails = {
    canResume: boolean;
    isExpired: boolean;
    resumePayment?: ResumablePayment;
  };

  const isPaymentStatus = (
    value: string | null | undefined
  ): value is PaymentStatus =>
    value === 'waiting' ||
    value === 'confirming' ||
    value === 'confirmed' ||
    value === 'sending' ||
    value === 'partially_paid' ||
    value === 'finished' ||
    value === 'failed' ||
    value === 'refunded' ||
    value === 'expired';

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

  async function refreshHistory(): Promise<CreditTransaction[]> {
    if (!balance.userId) return transactions;
    try {
      loadingHistory = true;
      const history = await creditsService.getHistory(balance.userId, { limit: 10, offset: 0 });
      transactions = history.transactions || [];
      return transactions;
    } catch (error) {
      console.error('Failed to refresh credit history:', error);
      return transactions;
    } finally {
      loadingHistory = false;
    }
  }

  function handleTopUp() {
    resumePayment = null;
    showPaymentModal = true;
  }

  function handlePaymentSuccess(newBalance: number) {
    balance = {
      ...balance,
      balance: newBalance,
      availableBalance: newBalance,
      totalBalance: newBalance
    };
    credits.setBalance(newBalance, balance.userId);
    showPaymentModal = false;
    resumePayment = null;
    refreshHistory();
  }

  async function handlePaymentCreated(payment: { paymentId: string }) {
    const paymentId = payment?.paymentId;
    if (!paymentId) {
      await refreshHistory();
      return;
    }

    const maxAttempts = 5;
    const delayMs = 1200;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const latest = await refreshHistory();
      const found = latest?.some(entry => entry.paymentId === paymentId);
      if (found) return;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  function resolveInvoiceDetails(transaction: CreditTransaction): InvoiceDetails {
    const metadata = transaction.metadata || {};
    const payAddress = typeof metadata.payAddress === 'string' ? metadata.payAddress : null;
    const payCurrency = typeof metadata.payCurrency === 'string' ? metadata.payCurrency : null;
    const payAmountRaw = metadata.payAmount;
    const payAmount = typeof payAmountRaw === 'number' ? payAmountRaw : Number(payAmountRaw);
    const expiresAt = typeof metadata.expiresAt === 'string' ? metadata.expiresAt : null;
    const paymentCompleted = Boolean(metadata.paymentCompleted);
    const paymentId = transaction.paymentId || (typeof metadata.paymentId === 'string' ? metadata.paymentId : null);

    const status = transaction.paymentStatus?.toLowerCase() || '';
    const isExpired =
      status === 'expired' || (expiresAt ? Date.parse(expiresAt) <= Date.now() : false);
    const hasInvoiceData =
      Boolean(paymentId && payAddress && payCurrency && Number.isFinite(payAmount));

    if (!hasInvoiceData || paymentCompleted) {
      return { canResume: false, isExpired: false };
    }

    if (isExpired) {
      return { canResume: false, isExpired: true };
    }

    return {
      canResume: true,
      isExpired: false,
      resumePayment: {
        paymentId: paymentId as string,
        payAddress: payAddress as string,
        payAmount,
        payCurrency: payCurrency as string,
        expiresAt,
        status: isPaymentStatus(transaction.paymentStatus)
          ? transaction.paymentStatus
          : null
      }
    };
  }

  function openInvoice(details: InvoiceDetails) {
    if (!details.resumePayment) return;
    resumePayment = details.resumePayment;
    showPaymentModal = true;
  }

  $: if (!showPaymentModal) {
    resumePayment = null;
  }
</script>

<svelte:head>
  <title>Credits - SubSlush</title>
  <meta name="description" content="View your credit balance and history." />
</svelte:head>

<section class="space-y-6">
  <div class="flex items-center justify-between flex-wrap gap-3">
    <div>
      <h1 class="text-2xl font-semibold text-gray-900">Credits</h1>
    </div>
  </div>

  <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
    <div class="font-semibold text-amber-900">Crypto-only credits</div>
    <p class="mt-1 text-amber-800">
      Credit topups and credit payments are intended for crypto. You can still buy any product directly with card at
      checkout without adding credits.
    </p>
  </div>

  <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="text-sm text-gray-600">Available balance</p>
        <p class="text-3xl font-semibold text-gray-900 mt-2">${availableBalance.toFixed(2)}</p>
      </div>
      <button
        on:click={handleTopUp}
        class="inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
      >
        Add credits
      </button>
    </div>
    {#if pendingBalance > 0}
      <p class="text-xs text-gray-500 mt-2">Pending: ${pendingBalance.toFixed(2)}</p>
    {/if}
  </div>

  <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Credit history</h2>
        <p class="text-sm text-gray-600">Latest 10 transactions</p>
      </div>
    </div>

    {#if loadingHistory}
      <p class="text-sm text-gray-600">Loading history...</p>
    {:else if transactions.length === 0}
      <div class="rounded-lg border border-dashed border-gray-200 p-6 text-center">
        <p class="text-sm font-medium text-gray-900">No transactions yet.</p>
        <p class="text-sm text-gray-600 mt-1">Top up credits to get started.</p>
      </div>
    {:else}
      <div class="divide-y divide-gray-100">
        {#each transactions as transaction}
          {@const typeInfo = creditTypes[transaction.type] || { label: transaction.type, isPositive: true }}
          {@const invoiceDetails = resolveInvoiceDetails(transaction)}
          <div class="flex items-center justify-between py-3">
            <div>
              <p class="text-sm font-medium text-gray-900">{transaction.description || typeInfo.label}</p>
              <p class="text-xs text-gray-500 mt-1">{formatDate(transaction.createdAt)}</p>
            </div>
            <div class="text-right">
              <p class={`text-sm font-semibold ${typeInfo.isPositive ? 'text-green-600' : 'text-gray-900'}`}>
                {formatAmount(transaction.amount, typeInfo.isPositive)}
              </p>
              <p class="text-xs text-gray-500">Balance: ${transaction.balanceAfter.toFixed(2)}</p>
              {#if invoiceDetails.canResume}
                <button
                  type="button"
                  class="mt-1 text-xs font-semibold text-cyan-600 hover:text-cyan-700"
                  on:click={() => openInvoice(invoiceDetails)}
                >
                  Open invoice
                </button>
              {:else if invoiceDetails.isExpired}
                <p class="mt-1 text-xs text-gray-400">Invoice expired</p>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>

<AddCreditsModal
  bind:isOpen={showPaymentModal}
  userBalance={availableBalance}
  {resumePayment}
  onPaymentCreated={handlePaymentCreated}
  onSuccess={handlePaymentSuccess}
/>
