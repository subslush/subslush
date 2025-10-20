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

  function startStatusPolling(paymentId: string) {
    pollInterval = setInterval(async () => {
      try {
        const status = await paymentService.getPaymentStatus(paymentId);
        paymentStatus = status.status;

        if (status.status === 'finished' || status.status === 'confirmed') {
          stopPolling();
          onSuccess(userBalance + status.creditAmount);
          closeModal();
        } else if (status.status === 'failed' || status.status === 'expired') {
          stopPolling();
          error = status.status === 'expired' ? 'Payment expired. Please try again.' : 'Payment failed. Please try again.';
        }
      } catch (err) {
        console.error('Error polling payment status:', err);
      }
    }, 10000);
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

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white flex items-center">
          <CreditCard class="mr-2" size={20} />
          Add Credits
        </h2>
        <button
          on:click={closeModal}
          class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      <!-- Progress Steps -->
      <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between">
          {#each [1, 2, 3, 4] as step}
            <div class="flex items-center">
              <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                {currentStep >= step ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'}">
                {step}
              </div>
              {#if step < 4}
                <div class="w-8 h-0.5 mx-2 {currentStep > step ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-600'}"></div>
              {/if}
            </div>
          {/each}
        </div>
        <div class="flex justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
          <span>Amount</span>
          <span>Currency</span>
          <span>Review</span>
          <span>Payment</span>
        </div>
      </div>

      <!-- Error Message -->
      {#if error}
        <div class="mx-6 mt-4 p-3 bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded-md">
          <div class="flex">
            <AlertCircle class="h-5 w-5 text-red-400 dark:text-red-300" />
            <div class="ml-3">
              <p class="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          </div>
        </div>
      {/if}

      <!-- Step Content -->
      <div class="p-6">
        <!-- Step 1: Select Amount -->
        {#if currentStep === 1}
          <div class="space-y-4">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">Select Credit Amount</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">Choose how many credits you'd like to add to your account.</p>

            <!-- Predefined Amounts -->
            <div class="grid grid-cols-3 gap-3">
              {#each predefinedAmounts as amount}
                <button
                  on:click={() => { selectedAmount = amount; customAmount = ''; }}
                  class="p-3 text-center border rounded-lg transition-colors
                    {selectedAmount === amount && !customAmount
                      ? 'border-primary-600 bg-primary-50 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                      : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'}"
                >
                  <div class="font-medium">${amount}</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400">{amount} credits</div>
                </button>
              {/each}
            </div>

            <!-- Custom Amount -->
            <div>
              <label for="custom-amount" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Custom Amount (USD)
              </label>
              <input
                id="custom-amount"
                type="number"
                bind:value={customAmount}
                min="1"
                max="10000"
                placeholder="Enter custom amount"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                       bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                       focus:ring-primary-500 focus:border-primary-500"
              />
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                1 USD = 1 Credit • Min: $1 • Max: $10,000
              </p>
            </div>

            <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <div class="flex justify-between items-center">
                <span class="text-sm text-gray-600 dark:text-gray-400">Amount to add:</span>
                <span class="font-medium text-gray-900 dark:text-white">${actualAmount} ({actualAmount} credits)</span>
              </div>
            </div>
          </div>
        {/if}

        <!-- Step 2: Select Currency -->
        {#if currentStep === 2}
          <div class="space-y-4">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">Choose Cryptocurrency</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">Select your preferred cryptocurrency for payment.</p>

            {#if loading}
              <div class="flex items-center justify-center py-8">
                <Loader2 class="animate-spin mr-2" size={20} />
                <span class="text-gray-600 dark:text-gray-400">Loading currencies...</span>
              </div>
            {:else if currencies.length > 0}
              <!-- Currency Dropdown -->
              <div class="relative">
                <button
                  on:click={() => currencyDropdownOpen = !currencyDropdownOpen}
                  class="w-full p-3 text-left border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700
                         hover:border-gray-400 dark:hover:border-gray-500 transition-colors flex items-center justify-between"
                >
                  <div class="flex flex-col">
                    <span class="font-medium text-gray-900 dark:text-white">
                      {selectedCurrency ? getCurrencyDisplayName(selectedCurrency) : 'Select a cryptocurrency'}
                    </span>
                    {#if selectedCurrency}
                      <span class="text-xs text-gray-500 dark:text-gray-400 uppercase">{selectedCurrency.code}</span>
                    {/if}
                  </div>
                  <ChevronDown size={16} class="text-gray-400 {currencyDropdownOpen ? 'rotate-180' : ''} transition-transform" />
                </button>

                {#if currencyDropdownOpen}
                  <div class="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {#each currencies as currency}
                      <button
                        on:click={() => selectCurrency(currency)}
                        class="w-full p-3 text-left hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex items-center justify-between"
                      >
                        <div class="flex flex-col">
                          <span class="font-medium text-gray-900 dark:text-white">
                            {getCurrencyDisplayName(currency)}
                          </span>
                          <span class="text-xs text-gray-500 dark:text-gray-400 uppercase">{currency.code}</span>
                        </div>
                        {#if selectedCurrency?.code === currency.code}
                          <Check size={16} class="text-primary-600" />
                        {/if}
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            {:else}
              <p class="text-red-600 dark:text-red-400">No currencies available. Please try again later.</p>
            {/if}
          </div>
        {/if}

        <!-- Step 3: Review -->
        {#if currentStep === 3}
          <div class="space-y-4">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">Review Payment</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">Please review your payment details before proceeding.</p>

            <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg space-y-3">
              <div class="flex justify-between">
                <span class="text-gray-600 dark:text-gray-400">Credits to add:</span>
                <span class="font-medium text-gray-900 dark:text-white">{actualAmount} credits</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600 dark:text-gray-400">USD Amount:</span>
                <span class="font-medium text-gray-900 dark:text-white">${actualAmount}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-600 dark:text-gray-400">Payment Currency:</span>
                <span class="font-medium text-gray-900 dark:text-white">
                  {selectedCurrency ? getCurrencyDisplayName(selectedCurrency) : 'None selected'}
                </span>
              </div>

              {#if loading}
                <div class="flex items-center justify-center py-2">
                  <Loader2 class="animate-spin mr-2" size={16} />
                  <span class="text-sm text-gray-600 dark:text-gray-400">Getting estimate...</span>
                </div>
              {:else if estimate}
                <div class="border-t pt-3 border-gray-200 dark:border-gray-600">
                  <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Estimated {selectedCurrency?.code?.toUpperCase() || 'CRYPTO'} Amount:</span>
                    <span class="font-medium text-gray-900 dark:text-white">{estimate}</span>
                  </div>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
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
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">Payment Details</h3>
              <p class="text-sm text-gray-600 dark:text-gray-400">Send exactly {paymentData.payAmount} {paymentData.payCurrency.toUpperCase()}</p>
            </div>

            <!-- Status -->
            <div class="text-center">
              <div class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium
                {paymentStatus === 'waiting' ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200' :
                 paymentStatus === 'confirming' ? 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200' :
                 ['confirmed', 'finished'].includes(paymentStatus) ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' :
                 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'}">
                {getStatusText(paymentStatus)}
              </div>

              {#if timeRemaining && paymentStatus === 'waiting'}
                <div class="flex items-center justify-center mt-2 text-sm text-gray-600 dark:text-gray-400">
                  <Clock size={16} class="mr-1" />
                  Expires in: {timeRemaining}
                </div>
              {/if}
            </div>

            <!-- QR Code -->
            {#if qrCodeDataUrl}
              <div class="text-center">
                <img src={qrCodeDataUrl} alt="Payment QR Code" class="mx-auto border rounded-lg" />
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">Scan with your crypto wallet</p>
              </div>
            {/if}

            <!-- Payment Address -->
            <div>
              <label for="payment-address" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Payment Address
              </label>
              <div class="flex">
                <input
                  id="payment-address"
                  type="text"
                  value={paymentData.payAddress}
                  readonly
                  class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-l-md
                         bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
                <button
                  on:click={copyAddress}
                  class="px-3 py-2 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r-md
                         bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
                >
                  {#if addressCopied}
                    <Check size={16} class="text-green-600" />
                  {:else}
                    <Copy size={16} class="text-gray-600 dark:text-gray-300" />
                  {/if}
                </button>
              </div>
              {#if addressCopied}
                <p class="text-xs text-green-600 dark:text-green-400 mt-1">Address copied to clipboard!</p>
              {/if}
            </div>

            <!-- Payment Amount -->
            <div class="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <div class="flex justify-between items-center">
                <span class="text-sm text-gray-600 dark:text-gray-400">Amount to send:</span>
                <span class="font-mono font-medium text-gray-900 dark:text-white">
                  {paymentData.payAmount} {paymentData.payCurrency.toUpperCase()}
                </span>
              </div>
            </div>

            <div class="text-center text-sm text-gray-600 dark:text-gray-400">
              <p>Your payment will be automatically detected.</p>
              <p>Credits will be added once confirmed on the blockchain.</p>
            </div>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="flex justify-between items-center p-6 border-t border-gray-200 dark:border-gray-700">
        {#if currentStep > 1 && currentStep < 4}
          <button
            on:click={prevStep}
            class="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md
                   text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
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
            class="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-md
                   hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
            <ArrowRight size={16} class="ml-2" />
          </button>
        {:else if currentStep === 3}
          <button
            on:click={handleCreatePayment}
            disabled={loading || !isValidAmount}
            class="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-md
                   hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
            class="px-4 py-2 bg-gray-600 dark:bg-gray-500 text-white rounded-md hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}