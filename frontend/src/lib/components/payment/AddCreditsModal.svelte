<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { X, CreditCard, Copy, Check, AlertCircle, ArrowLeft, ArrowRight, Loader2, Clock, ChevronDown } from 'lucide-svelte';
  import { paymentService } from '$lib/api/payments.js';
  import type { CreatePaymentResponse, PaymentStatus, Currency } from '$lib/types/payment.js';
  import QRCode from 'qrcode';

  export let isOpen: boolean = false;
  export let userBalance: number = 0;
  export let onSuccess: (newBalance: number) => void;

  const dispatch = createEventDispatcher();

  let currentStep = 1;
  let selectedAmount = 100;
  let customAmount = '';
  let selectedCurrency: Currency | null = null;
  let currencies: Currency[] = [];
  let estimate: number | null = null;
  let currencyDropdownOpen = false;
  let paymentData: CreatePaymentResponse | null = null;
  let paymentStatus: PaymentStatus = 'waiting';
  let qrCodeDataUrl = '';
  let pollInterval: any = null;
  let addressCopied = false;
  let loading = false;
  let error = '';
  let expirationTime: Date | null = null;
  let timeRemaining = '';

  const predefinedAmounts = [25, 50, 100, 250, 500, 1000];

  $: actualAmount = customAmount ? parseFloat(customAmount) : selectedAmount;
  $: isValidAmount = actualAmount > 0 && actualAmount <= 10000;

  onMount(async () => {
    if (isOpen) {
      try {
        const debug = await paymentService.debugCurrenciesResponse();
        console.log('[DEBUG] Full response structure:', debug);
      } catch (error) {
        console.log('[DEBUG] Error in debug call:', error);
      }
      await loadCurrencies();
    }
  });

  onDestroy(() => {
    stopPolling();
  });

  $: if (isOpen && currentStep === 1) {
    loadCurrencies();
  }

  async function loadCurrencies() {
    try {
      loading = true;
      error = '';

      console.log('[MODAL] Loading currencies...');
      currencies = await paymentService.getSupportedCurrencies();
      console.log('[MODAL] Loaded currencies:', currencies.length, 'total');
      console.log('[MODAL] First 10 currencies:', currencies.slice(0, 10));

      if (currencies.length > 0 && (!selectedCurrency || !currencies.find(c => c.code === selectedCurrency?.code))) {
        selectedCurrency = currencies[0];
        console.log('[MODAL] Default currency set to:', selectedCurrency);
      }

      if (currencies.length === 0) {
        throw new Error('Empty currency list received');
      }
    } catch (err: any) {
      console.error('[MODAL] Error loading currencies:', err);
      error = `Failed to load available currencies: ${err.message}`;
    } finally {
      loading = false;
    }
  }

  async function getEstimate() {
    if (!isValidAmount || !selectedCurrency) return;

    try {
      loading = true;
      error = '';
      console.log('[MODAL] Getting estimate for:', actualAmount, 'USD in', selectedCurrency.code);
      const estimateData = await paymentService.getEstimate(actualAmount, selectedCurrency.code);
      estimate = estimateData.estimatedAmount;
      console.log('[MODAL] Estimate received:', estimate, selectedCurrency.code);
    } catch (err) {
      error = 'Failed to get price estimate. Please try again.';
      console.error('[MODAL] Error getting estimate:', err);
    } finally {
      loading = false;
    }
  }

  async function handleCreatePayment() {
    if (!isValidAmount) return;

    try {
      loading = true;
      error = '';

      const response = await paymentService.createPayment({
        creditAmount: actualAmount,
        currency: selectedCurrency?.code || 'btc',
        orderDescription: `Add ${actualAmount} credits`
      });

      paymentData = response;
      paymentStatus = response.status;
      expirationTime = new Date(response.expiresAt);

      await generateQRCode(response.payAddress);

      currentStep = 4;
      startStatusPolling(response.paymentId);
      startExpirationTimer();

    } catch (err) {
      error = 'Failed to create payment. Please try again.';
      console.error('Error creating payment:', err);
    } finally {
      loading = false;
    }
  }

  async function pollPaymentStatus() {
    try {
      const status = await paymentService.getPaymentStatus(paymentData!.paymentId);

      if (!status) {
        console.warn('[PAYMENT] Status not found, payment may not be in database yet');
        return;
      }

      console.log('[PAYMENT] Current status:', status.status);
      paymentStatus = status.status;

      // Handle successful payment
      if (status.status === 'finished' || status.status === 'confirmed') {
        console.log('[PAYMENT] 🎉 Payment completed!');
        stopPolling();

        // Wait a moment for backend to process credit allocation
        setTimeout(async () => {
          // Refresh user balance
          const newBalance = userBalance + status.creditAmount;
          onSuccess(newBalance);

          // Show success message
          alert(`Payment successful! ${status.creditAmount} credits have been added to your account.`);

          // Close modal
          isOpen = false;
        }, 2000);
      }

      // Handle failed payment
      if (['failed', 'expired', 'refunded'].includes(status.status)) {
        console.error('[PAYMENT] Payment failed:', status.status);
        stopPolling();
        error = `Payment ${status.status}. Please try again or contact support.`;
      }
    } catch (err: any) {
      console.error('[PAYMENT] Error polling payment status:', err);
    }
  }

  function startStatusPolling(paymentId: string) {
    pollInterval = setInterval(pollPaymentStatus, 10000);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  function startExpirationTimer() {
    const timer = setInterval(() => {
      if (!expirationTime) return;

      const now = new Date();
      const diff = expirationTime.getTime() - now.getTime();

      if (diff <= 0) {
        timeRemaining = 'Expired';
        clearInterval(timer);
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      timeRemaining = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
  }

  async function generateQRCode(address: string) {
    try {
      qrCodeDataUrl = await QRCode.toDataURL(address, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    } catch (err) {
      console.error('Error generating QR code:', err);
    }
  }

  function copyAddress() {
    if (!paymentData) return;

    navigator.clipboard.writeText(paymentData.payAddress).then(() => {
      addressCopied = true;
      setTimeout(() => addressCopied = false, 2000);
    }).catch(err => {
      console.error('Failed to copy address:', err);
    });
  }

  function nextStep() {
    if (currentStep === 2 && isValidAmount) {
      getEstimate();
    }
    if (currentStep < 4) {
      currentStep++;
    }
  }

  function prevStep() {
    if (currentStep > 1) {
      currentStep--;
    }
  }

  function closeModal() {
    isOpen = false;
    currentStep = 1;
    selectedAmount = 100;
    customAmount = '';
    selectedCurrency = null;
    estimate = null;
    paymentData = null;
    paymentStatus = 'waiting';
    qrCodeDataUrl = '';
    addressCopied = false;
    loading = false;
    error = '';
    expirationTime = null;
    timeRemaining = '';
    currencyDropdownOpen = false;
    stopPolling();
  }

  function selectCurrency(currency: Currency) {
    selectedCurrency = currency;
    currencyDropdownOpen = false;
    console.log('[MODAL] Currency selected:', currency);
  }

  function getCurrencyDisplayName(currency: Currency): string {
    if (currency.network) {
      return `${currency.name} (${currency.network})`;
    }
    return currency.fullName || currency.name;
  }

  function getStatusText(status: PaymentStatus): string {
    switch (status) {
      case 'waiting': return 'Waiting for payment';
      case 'confirming': return 'Confirming transaction';
      case 'confirmed': return 'Payment confirmed';
      case 'sending': return 'Processing payment';
      case 'partially_paid': return 'Partially paid';
      case 'finished': return 'Payment completed';
      case 'failed': return 'Payment failed';
      case 'refunded': return 'Payment refunded';
      case 'expired': return 'Payment expired';
      default: return 'Unknown status';
    }
  }

  function getStatusColor(status: PaymentStatus): string {
    switch (status) {
      case 'waiting': return 'text-yellow-600';
      case 'confirming': return 'text-blue-600';
      case 'confirmed':
      case 'finished': return 'text-green-600';
      case 'failed':
      case 'expired': return 'text-red-600';
      case 'partially_paid': return 'text-orange-600';
      default: return 'text-gray-600';
    }
  }
</script>

<style>
  @keyframes blob {
    0%, 100% {
      transform: translate(0, 0) scale(1);
    }
    33% {
      transform: translate(30px, -50px) scale(1.1);
    }
    66% {
      transform: translate(-20px, 20px) scale(0.9);
    }
  }

  .animate-blob {
    animation: blob 20s infinite ease-in-out;
  }

  .animation-delay-2000 {
    animation-delay: 2s;
  }

  /* Custom scrollbar for dropdown */
  .scrollbar-thin {
    scrollbar-width: thin;
  }

  .scrollbar-thumb-surface-300 {
    scrollbar-color: rgba(203, 213, 225, 0.5) transparent;
  }

  .dark .scrollbar-thumb-surface-600 {
    scrollbar-color: rgba(75, 85, 99, 0.5) transparent;
  }

  /* Webkit scrollbar styling */
  .scrollbar-thin::-webkit-scrollbar {
    width: 6px;
  }

  .scrollbar-thin::-webkit-scrollbar-track {
    background: transparent;
  }

  .scrollbar-thin::-webkit-scrollbar-thumb {
    background-color: rgba(203, 213, 225, 0.5);
    border-radius: 3px;
  }

  .dark .scrollbar-thin::-webkit-scrollbar-thumb {
    background-color: rgba(75, 85, 99, 0.5);
  }

  .scrollbar-thin::-webkit-scrollbar-thumb:hover {
    background-color: rgba(156, 163, 175, 0.7);
  }

  .dark .scrollbar-thin::-webkit-scrollbar-thumb:hover {
    background-color: rgba(107, 114, 128, 0.7);
  }
</style>

{#if isOpen}
  <!-- Modal backdrop with gradient overlay -->
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <!-- Animated background blobs -->
    <div class="absolute inset-0 bg-gradient-to-br from-black/80 via-subslush-blue/5 to-subslush-pink/5 backdrop-blur-sm">
      <div class="absolute top-1/4 right-1/4 w-64 h-64 bg-gradient-to-br from-subslush-blue/10 to-transparent rounded-full blur-3xl animate-blob"></div>
      <div class="absolute bottom-1/3 left-1/3 w-64 h-64 bg-gradient-to-tr from-subslush-pink/10 to-transparent rounded-full blur-3xl animate-blob animation-delay-2000"></div>
    </div>

    <!-- Glass modal container -->
    <div class="relative bg-surface-50/95 dark:bg-surface-900/95 backdrop-blur-xl border border-surface-200/50 dark:border-surface-700/50 rounded-2xl shadow-2xl shadow-subslush-blue/10 w-full max-w-md max-h-[90vh] overflow-hidden">
      <!-- Gradient border effect -->
      <div class="absolute inset-0 bg-gradient-to-br from-subslush-blue/20 via-transparent to-subslush-pink/20 rounded-2xl opacity-50"></div>

      <!-- Content container with proper overflow -->
      <div class="relative bg-surface-50/90 dark:bg-surface-900/90 backdrop-blur-sm rounded-2xl overflow-y-auto max-h-[90vh]">
        <!-- Header with glass effect -->
        <div class="flex items-center justify-between p-6 border-b border-surface-200/50 dark:border-surface-700/50 bg-gradient-to-r from-surface-50/50 to-surface-100/30 dark:from-surface-900/50 dark:to-surface-800/30">
          <h2 class="text-xl font-bold text-surface-900 dark:text-surface-50 flex items-center">
            <div class="p-2 mr-3 bg-gradient-to-br from-subslush-blue to-subslush-pink rounded-lg shadow-glow-blue">
              <CreditCard class="text-white" size={20} />
            </div>
            Add Credits
          </h2>
          <button
            on:click={closeModal}
            class="p-2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 hover:bg-surface-200/50 dark:hover:bg-surface-700/50 rounded-lg transition-all duration-200"
          >
            <X size={20} />
          </button>
        </div>

        <!-- Progress Steps with modern design -->
        <div class="px-6 py-4 border-b border-surface-200/30 dark:border-surface-700/30 bg-gradient-to-r from-surface-50/30 to-surface-100/20 dark:from-surface-900/30 dark:to-surface-800/20">
          <div class="flex items-center justify-between">
            {#each [1, 2, 3, 4] as step}
              <div class="flex items-center">
                <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-lg transition-all duration-300
                  {currentStep >= step
                    ? 'bg-gradient-to-br from-subslush-blue to-subslush-pink text-white shadow-glow-blue transform scale-110'
                    : 'bg-surface-200/70 dark:bg-surface-600/70 text-surface-600 dark:text-surface-300 backdrop-blur-sm'}">
                  {step}
                </div>
                {#if step < 4}
                  <div class="w-8 h-0.5 mx-2 rounded-full transition-all duration-300 {currentStep > step
                    ? 'bg-gradient-to-r from-subslush-blue to-subslush-pink shadow-glow-blue'
                    : 'bg-surface-200/50 dark:bg-surface-600/50'}"></div>
                {/if}
              </div>
            {/each}
          </div>
          <div class="flex justify-between mt-3 text-xs font-medium text-surface-600 dark:text-surface-400">
            <span>Amount</span>
            <span>Currency</span>
            <span>Review</span>
            <span>Payment</span>
          </div>
        </div>

        <!-- Error Message with glass effect -->
        {#if error}
          <div class="mx-6 mt-4 p-4 bg-red-50/80 dark:bg-red-900/30 backdrop-blur-sm border border-red-200/50 dark:border-red-700/50 rounded-xl shadow-lg">
            <div class="flex items-start">
              <div class="p-1 bg-red-100 dark:bg-red-800 rounded-lg mr-3">
                <AlertCircle class="h-4 w-4 text-red-500 dark:text-red-300" />
              </div>
              <div class="flex-1">
                <p class="text-sm font-medium text-red-800 dark:text-red-200">{error}</p>
              </div>
            </div>
          </div>
        {/if}

        <!-- Step Content -->
        <div class="p-6 bg-gradient-to-br from-surface-50/50 via-surface-50/30 to-surface-100/20 dark:from-surface-900/50 dark:via-surface-900/30 dark:to-surface-800/20">
        <!-- Step 1: Select Amount -->
        {#if currentStep === 1}
          <div class="space-y-4">
            <div class="text-center">
              <h3 class="text-lg font-bold text-surface-900 dark:text-surface-50 mb-2">Select Credit Amount</h3>
              <p class="text-sm text-surface-600 dark:text-surface-400">Choose how many credits you'd like to add to your account.</p>
            </div>

            <!-- Predefined Amounts with glass effect -->
            <div class="grid grid-cols-3 gap-3">
              {#each predefinedAmounts as amount}
                <button
                  on:click={() => { selectedAmount = amount; customAmount = ''; }}
                  class="group p-4 text-center border rounded-xl transition-all duration-300 backdrop-blur-sm hover:scale-105
                    {selectedAmount === amount && !customAmount
                      ? 'border-subslush-blue/50 bg-gradient-to-br from-subslush-blue/10 to-subslush-pink/10 text-subslush-blue dark:text-subslush-blue-light shadow-glow-blue'
                      : 'border-surface-300/50 dark:border-surface-600/50 bg-surface-100/50 dark:bg-surface-800/50 hover:border-subslush-blue/30 hover:bg-gradient-to-br hover:from-subslush-blue/5 hover:to-subslush-pink/5'}"
                >
                  <div class="font-bold text-lg">${amount}</div>
                  <div class="text-xs font-medium opacity-70">{amount} credits</div>
                </button>
              {/each}
            </div>

            <!-- Custom Amount with modern styling -->
            <div>
              <label for="custom-amount" class="block text-sm font-bold text-surface-700 dark:text-surface-300 mb-2">
                Custom Amount (USD)
              </label>
              <input
                id="custom-amount"
                type="number"
                bind:value={customAmount}
                min="5"
                max="10000"
                placeholder="Enter custom amount"
                class="w-full px-4 py-3 border border-surface-300/50 dark:border-surface-600/50 rounded-xl
                       bg-surface-50/50 dark:bg-surface-800/50 text-surface-900 dark:text-surface-50
                       backdrop-blur-sm transition-all duration-200
                       focus:ring-2 focus:ring-subslush-blue/50 focus:border-subslush-blue
                       hover:border-subslush-blue/30 placeholder:text-surface-400"
              />
              <p class="text-xs text-surface-500 dark:text-surface-400 mt-1 font-medium">
                1 USD = 1 Credit • Min deposit: $5
              </p>
            </div>

            <div class="bg-gradient-to-r from-surface-100/70 to-surface-200/50 dark:from-surface-700/50 dark:to-surface-800/30 p-4 rounded-xl border border-surface-200/30 dark:border-surface-600/30 backdrop-blur-sm">
              <div class="flex justify-between items-center">
                <span class="text-sm font-medium text-surface-600 dark:text-surface-400">Amount to add:</span>
                <span class="font-bold text-lg bg-gradient-to-r from-subslush-blue to-subslush-pink bg-clip-text text-transparent">{actualAmount} credits</span>
              </div>
            </div>
          </div>
        {/if}

        <!-- Step 2: Select Currency -->
        {#if currentStep === 2}
          <div class="space-y-4">
            <div class="text-center">
              <h3 class="text-lg font-bold text-surface-900 dark:text-surface-50 mb-2">Choose Cryptocurrency</h3>
              <p class="text-sm text-surface-600 dark:text-surface-400">Select your preferred cryptocurrency for payment.</p>
            </div>

            {#if loading}
              <div class="flex items-center justify-center py-8">
                <div class="p-3 bg-gradient-to-br from-subslush-blue/20 to-subslush-pink/20 rounded-xl">
                  <Loader2 class="animate-spin text-subslush-blue" size={20} />
                </div>
                <span class="ml-3 text-surface-600 dark:text-surface-400 font-medium">Loading currencies...</span>
              </div>
            {:else if currencies.length > 0}
              <!-- Modern Currency Dropdown -->
              <div class="relative">
                <button
                  on:click={() => currencyDropdownOpen = !currencyDropdownOpen}
                  class="w-full p-4 text-left border border-surface-300/50 dark:border-surface-600/50 rounded-xl
                         bg-surface-50/50 dark:bg-surface-800/50 backdrop-blur-sm
                         hover:border-subslush-blue/50 hover:bg-gradient-to-r hover:from-subslush-blue/5 hover:to-subslush-pink/5
                         transition-all duration-200 flex items-center justify-between group"
                >
                  <div class="flex flex-col">
                    <span class="font-bold text-surface-900 dark:text-surface-50">
                      {selectedCurrency ? getCurrencyDisplayName(selectedCurrency) : 'Select a cryptocurrency'}
                    </span>
                    {#if selectedCurrency}
                      <span class="text-xs text-surface-500 dark:text-surface-400 uppercase font-medium mt-1">{selectedCurrency.code}</span>
                    {/if}
                  </div>
                  <ChevronDown size={16} class="text-surface-400 group-hover:text-subslush-blue {currencyDropdownOpen ? 'rotate-180' : ''} transition-all duration-200" />
                </button>

                {#if currencyDropdownOpen}
                  <!-- Improved dropdown with better UX -->
                  <div class="absolute z-20 w-full mt-2 bg-surface-50/95 dark:bg-surface-800/95 backdrop-blur-xl border border-surface-200/50 dark:border-surface-600/50 rounded-xl shadow-2xl shadow-subslush-blue/10 overflow-hidden">
                    <!-- Search/Filter header -->
                    <div class="p-3 border-b border-surface-200/30 dark:border-surface-600/30 bg-gradient-to-r from-surface-100/50 to-surface-200/30 dark:from-surface-700/50 dark:to-surface-800/30">
                      <p class="text-xs font-bold text-surface-600 dark:text-surface-400 uppercase tracking-wide">Choose Currency</p>
                    </div>
                    <!-- Scrollable currency list with better height -->
                    <div class="max-h-72 overflow-y-auto scrollbar-thin scrollbar-thumb-surface-300 dark:scrollbar-thumb-surface-600">
                      {#each currencies as currency}
                        <button
                          on:click={() => selectCurrency(currency)}
                          class="w-full p-4 text-left hover:bg-gradient-to-r hover:from-subslush-blue/10 hover:to-subslush-pink/5
                                 transition-all duration-150 flex items-center justify-between group
                                 {selectedCurrency?.code === currency.code ? 'bg-gradient-to-r from-subslush-blue/15 to-subslush-pink/10' : ''}"
                        >
                          <div class="flex flex-col">
                            <span class="font-bold text-surface-900 dark:text-surface-50 group-hover:text-subslush-blue transition-colors">
                              {getCurrencyDisplayName(currency)}
                            </span>
                            <span class="text-xs text-surface-500 dark:text-surface-400 uppercase font-medium mt-1">{currency.code}</span>
                          </div>
                          {#if selectedCurrency?.code === currency.code}
                            <div class="p-1 bg-gradient-to-br from-subslush-blue to-subslush-pink rounded-lg">
                              <Check size={14} class="text-white" />
                            </div>
                          {/if}
                        </button>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {:else}
              <div class="text-center p-6 bg-surface-100/50 dark:bg-surface-800/50 rounded-xl border border-surface-200/50 dark:border-surface-700/50">
                <p class="text-red-500 dark:text-red-400 font-medium">No currencies available. Please try again later.</p>
              </div>
            {/if}
          </div>
        {/if}

        <!-- Step 3: Review -->
        {#if currentStep === 3}
          <div class="space-y-4">
            <div class="text-center">
              <h3 class="text-lg font-bold text-surface-900 dark:text-surface-50 mb-2">Review Payment</h3>
              <p class="text-sm text-surface-600 dark:text-surface-400">Please review your payment details before proceeding.</p>
            </div>

            <div class="bg-gradient-to-br from-surface-100/70 to-surface-200/50 dark:from-surface-700/50 dark:to-surface-800/30 p-5 rounded-xl border border-surface-200/30 dark:border-surface-600/30 backdrop-blur-sm space-y-4">
              <div class="flex justify-between items-center">
                <span class="text-sm font-medium text-surface-600 dark:text-surface-400">Credits to add:</span>
                <span class="font-bold text-lg bg-gradient-to-r from-subslush-blue to-subslush-pink bg-clip-text text-transparent">{actualAmount} credits</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm font-medium text-surface-600 dark:text-surface-400">USD Amount:</span>
                <span class="font-bold text-surface-900 dark:text-surface-50">${actualAmount}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm font-medium text-surface-600 dark:text-surface-400">Payment Currency:</span>
                <span class="font-bold text-surface-900 dark:text-surface-50">
                  {selectedCurrency ? getCurrencyDisplayName(selectedCurrency) : 'None selected'}
                </span>
              </div>

              {#if loading}
                <div class="flex items-center justify-center py-3">
                  <div class="p-2 bg-gradient-to-br from-subslush-blue/20 to-subslush-pink/20 rounded-lg mr-3">
                    <Loader2 class="animate-spin text-subslush-blue" size={16} />
                  </div>
                  <span class="text-sm text-surface-600 dark:text-surface-400 font-medium">Getting estimate...</span>
                </div>
              {:else if estimate}
                <div class="border-t pt-4 border-surface-200/50 dark:border-surface-600/50">
                  <div class="flex justify-between items-center">
                    <span class="text-sm font-medium text-surface-600 dark:text-surface-400">Estimated {selectedCurrency?.code?.toUpperCase() || 'CRYPTO'} Amount:</span>
                    <span class="font-bold text-surface-900 dark:text-surface-50">{estimate}</span>
                  </div>
                  <p class="text-xs text-surface-500 dark:text-surface-400 mt-2 font-medium">
                    Exchange rate is approximate and may change slightly
                  </p>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Step 4: Payment -->
        {#if currentStep === 4 && paymentData}
          <div class="space-y-4">
            <div class="text-center">
              <h3 class="text-lg font-bold text-surface-900 dark:text-surface-50 mb-2">Payment Details</h3>
              <div class="inline-block bg-gradient-to-r from-subslush-blue/10 to-subslush-pink/10 px-4 py-2 rounded-xl border border-subslush-blue/20">
                <p class="text-sm font-bold text-surface-700 dark:text-surface-300">Send exactly <span class="text-subslush-blue">{paymentData.payAmount} {paymentData.payCurrency.toUpperCase()}</span></p>
              </div>
            </div>

            <!-- Status with modern design -->
            <div class="text-center">
              <div class="inline-flex items-center px-4 py-2 rounded-xl text-sm font-bold backdrop-blur-sm border
                {paymentStatus === 'waiting' ? 'bg-yellow-50/80 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200/50 dark:border-yellow-700/50' :
                 paymentStatus === 'confirming' ? 'bg-blue-50/80 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200/50 dark:border-blue-700/50' :
                 ['confirmed', 'finished'].includes(paymentStatus) ? 'bg-green-50/80 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200/50 dark:border-green-700/50' :
                 'bg-red-50/80 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200/50 dark:border-red-700/50'}">
                {getStatusText(paymentStatus)}
              </div>

              {#if timeRemaining && paymentStatus === 'waiting'}
                <div class="flex items-center justify-center mt-3 text-sm font-medium text-surface-600 dark:text-surface-400 bg-surface-100/50 dark:bg-surface-800/50 px-3 py-2 rounded-lg">
                  <Clock size={16} class="mr-2 text-subslush-blue" />
                  Expires in: <span class="text-subslush-blue font-bold ml-1">{timeRemaining}</span>
                </div>
              {/if}
            </div>

            <!-- QR Code with modern frame -->
            {#if qrCodeDataUrl}
              <div class="text-center">
                <div class="inline-block p-4 bg-white rounded-2xl shadow-2xl shadow-subslush-blue/20 border-2 border-surface-200 dark:border-surface-600">
                  <img src={qrCodeDataUrl} alt="Payment QR Code" class="mx-auto rounded-lg" />
                </div>
                <p class="text-xs text-surface-500 dark:text-surface-400 mt-3 font-medium">Scan with your crypto wallet</p>
              </div>
            {/if}

            <!-- Payment Address with modern styling -->
            <div>
              <label for="payment-address" class="block text-sm font-bold text-surface-700 dark:text-surface-300 mb-3">
                Payment Address
              </label>
              <div class="flex overflow-hidden rounded-xl border border-surface-300/50 dark:border-surface-600/50 backdrop-blur-sm">
                <input
                  id="payment-address"
                  type="text"
                  value={paymentData.payAddress}
                  readonly
                  class="flex-1 px-4 py-3 bg-surface-50/50 dark:bg-surface-800/50 text-surface-900 dark:text-surface-50 text-sm font-mono
                         focus:outline-none focus:ring-2 focus:ring-subslush-blue/50 border-0"
                />
                <button
                  on:click={copyAddress}
                  class="px-4 py-3 bg-gradient-to-r from-subslush-blue to-subslush-pink hover:from-subslush-blue-dark hover:to-subslush-pink-dark
                         transition-all duration-200 transform hover:scale-105 active:scale-95"
                >
                  {#if addressCopied}
                    <Check size={16} class="text-white" />
                  {:else}
                    <Copy size={16} class="text-white" />
                  {/if}
                </button>
              </div>
              {#if addressCopied}
                <p class="text-xs text-green-500 dark:text-green-400 mt-2 font-medium flex items-center">
                  <Check size={14} class="mr-1" />
                  Address copied to clipboard!
                </p>
              {/if}
            </div>

            <!-- Payment Amount with emphasis -->
            <div class="bg-gradient-to-r from-surface-100/70 to-surface-200/50 dark:from-surface-700/50 dark:to-surface-800/30 p-4 rounded-xl border border-surface-200/30 dark:border-surface-600/30 backdrop-blur-sm">
              <div class="flex justify-between items-center">
                <span class="text-sm font-medium text-surface-600 dark:text-surface-400">Amount to send:</span>
                <span class="font-mono font-bold text-lg bg-gradient-to-r from-subslush-blue to-subslush-pink bg-clip-text text-transparent">
                  {paymentData.payAmount} {paymentData.payCurrency.toUpperCase()}
                </span>
              </div>
            </div>

            <div class="text-center text-sm text-surface-600 dark:text-surface-400 bg-surface-100/30 dark:bg-surface-800/30 p-4 rounded-xl">
              <p class="font-medium mb-1">Your payment will be automatically detected.</p>
              <p class="font-medium">Credits will be added once confirmed on the blockchain.</p>
            </div>
          </div>
        {/if}
        </div>

        <!-- Footer with glass effect -->
        <div class="flex justify-between items-center p-6 border-t border-surface-200/30 dark:border-surface-700/30 bg-gradient-to-r from-surface-50/50 to-surface-100/30 dark:from-surface-900/50 dark:to-surface-800/30 backdrop-blur-sm">
          {#if currentStep > 1 && currentStep < 4}
            <button
              on:click={prevStep}
              class="inline-flex items-center px-4 py-2 border border-surface-300/50 dark:border-surface-600/50 rounded-xl
                     text-surface-700 dark:text-surface-300 bg-surface-50/50 dark:bg-surface-800/50 backdrop-blur-sm
                     hover:bg-surface-100 dark:hover:bg-surface-700 hover:border-surface-400 dark:hover:border-surface-500
                     transition-all duration-200 font-medium"
            >
              <ArrowLeft size={16} class="mr-2" />
              Back
            </button>
          {:else}
            <div></div>
          {/if}

          {#if currentStep < 3}
            <button
              on:click={nextStep}
              disabled={!isValidAmount || (currentStep === 2 && !selectedCurrency)}
              class="inline-flex items-center px-6 py-3 bg-gradient-to-r from-subslush-blue to-subslush-pink text-white rounded-xl
                     hover:from-subslush-blue-dark hover:to-subslush-pink-dark
                     disabled:opacity-50 disabled:cursor-not-allowed disabled:from-surface-400 disabled:to-surface-500
                     transition-all duration-200 font-bold shadow-glow-blue transform hover:scale-105 active:scale-95
                     disabled:transform-none disabled:shadow-none"
            >
              Next
              <ArrowRight size={16} class="ml-2" />
            </button>
          {:else if currentStep === 3}
            <button
              on:click={handleCreatePayment}
              disabled={loading || !isValidAmount}
              class="inline-flex items-center px-6 py-3 bg-gradient-to-r from-subslush-blue to-subslush-pink text-white rounded-xl
                     hover:from-subslush-blue-dark hover:to-subslush-pink-dark
                     disabled:opacity-50 disabled:cursor-not-allowed disabled:from-surface-400 disabled:to-surface-500
                     transition-all duration-200 font-bold shadow-glow-blue transform hover:scale-105 active:scale-95
                     disabled:transform-none disabled:shadow-none"
            >
              {#if loading}
                <Loader2 class="animate-spin mr-2" size={16} />
                Creating Payment...
              {:else}
                Create Payment
              {/if}
            </button>
          {:else}
            <button
              on:click={closeModal}
              class="px-6 py-3 bg-surface-600 dark:bg-surface-500 text-white rounded-xl
                     hover:bg-surface-700 dark:hover:bg-surface-600 transition-all duration-200 font-bold
                     transform hover:scale-105 active:scale-95"
            >
              Close
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}