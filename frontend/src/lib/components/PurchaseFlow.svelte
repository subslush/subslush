<script lang="ts">
  import { createMutation } from '@tanstack/svelte-query';
  import { goto } from '$app/navigation';
  import {
    Check,
    X,
    CreditCard,
    Calendar,
    RotateCcw,
    Loader2,
    AlertCircle,
    CheckCircle2,
    ArrowLeft,
    ArrowRight
  } from 'lucide-svelte';
  import { subscriptionService } from '$lib/api/subscriptions.js';
  import { user } from '$lib/stores/auth.js';
  import { ERROR_MESSAGES, SUCCESS_MESSAGES, ROUTES } from '$lib/utils/constants.js';
  import type { ServicePlanDetails, Subscription, PurchaseRequest } from '$lib/types/subscription.js';

  export let selectedPlan: ServicePlanDetails;
  export let onClose: () => void;
  export let onSuccess: (subscription: Subscription) => void;

  let currentStep = 1;
  let durationMonths = 1;
  let autoRenew = false;
  let validationResult: any = null;
  let purchaseResult: Subscription | null = null;

  const steps = [
    { step: 1, title: 'Review Selection', isActive: false, isCompleted: false },
    { step: 2, title: 'Validate Purchase', isActive: false, isCompleted: false },
    { step: 3, title: 'Confirm Purchase', isActive: false, isCompleted: false },
    { step: 4, title: 'Success', isActive: false, isCompleted: false }
  ];

  $: {
    steps.forEach((step, index) => {
      step.isActive = step.step === currentStep;
      step.isCompleted = step.step < currentStep;
    });
  }

  $: totalCost = selectedPlan.price * durationMonths;

  const validateMutation = createMutation({
    mutationFn: async () => {
      return subscriptionService.validatePurchase({
        service_type: selectedPlan.service_type,
        service_plan: selectedPlan.plan,
        duration_months: durationMonths
      });
    },
    onSuccess: (result) => {
      validationResult = result;
      if (result.valid) {
        currentStep = 3;
      }
    },
    onError: (error: any) => {
      console.error('Validation failed:', error);
    }
  });

  const purchaseMutation = createMutation({
    mutationFn: async () => {
      const purchaseData: PurchaseRequest = {
        service_type: selectedPlan.service_type,
        service_plan: selectedPlan.plan,
        duration_months: durationMonths,
        auto_renew: autoRenew
      };
      return subscriptionService.purchaseSubscription(purchaseData);
    },
    onSuccess: (result) => {
      purchaseResult = result.subscription;
      currentStep = 4;
    },
    onError: (error: any) => {
      console.error('Purchase failed:', error);
    }
  });

  function handleValidate() {
    currentStep = 2;
    $validateMutation.mutate();
  }

  function handlePurchase() {
    $purchaseMutation.mutate();
  }

  function handleSuccess() {
    if (purchaseResult) {
      onSuccess(purchaseResult);
    }
    goto(ROUTES.SUBSCRIPTIONS.MY_SUBSCRIPTIONS);
  }

  function formatDuration(months: number): string {
    if (months === 1) return '1 month';
    if (months < 12) return `${months} months`;
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    if (remainingMonths === 0) return years === 1 ? '1 year' : `${years} years`;
    return `${years} year${years > 1 ? 's' : ''} and ${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`;
  }
</script>

<!-- Modal Backdrop -->
<div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
  <div class="bg-surface-100-800-token border border-surface-300-600-token rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">

    <!-- Header -->
    <div class="flex items-center justify-between p-6 border-b border-surface-300-600-token">
      <h2 class="text-2xl font-bold text-surface-900-50-token">Purchase Subscription</h2>
      <button
        on:click={onClose}
        class="p-2 hover:bg-surface-200-700-token rounded-full transition-colors"
      >
        <X class="w-5 h-5 text-surface-600-300-token" />
      </button>
    </div>

    <!-- Progress Steps -->
    <div class="p-6 border-b border-surface-300-600-token">
      <div class="flex items-center justify-between mb-4">
        {#each steps as step, index}
          <div class="flex items-center {index < steps.length - 1 ? 'flex-1' : ''}">
            <div class="flex items-center">
              <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                {step.isCompleted ? 'bg-success-500 text-white' :
                 step.isActive ? 'bg-primary-500 text-white' :
                 'bg-surface-300-600-token text-surface-600-300-token'}">
                {#if step.isCompleted}
                  <Check class="w-4 h-4" />
                {:else}
                  {step.step}
                {/if}
              </div>
              <span class="ml-2 text-sm font-medium
                {step.isActive || step.isCompleted ? 'text-surface-900-50-token' : 'text-surface-600-300-token'}">
                {step.title}
              </span>
            </div>
            {#if index < steps.length - 1}
              <div class="flex-1 h-px bg-surface-300-600-token mx-4"></div>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Content -->
    <div class="p-6">
      {#if currentStep === 1}
        <!-- Step 1: Review Selection -->
        <div class="space-y-6">
          <div class="bg-surface-50-900-token rounded-lg p-4">
            <h3 class="text-lg font-semibold text-surface-900-50-token mb-3">Selected Plan</h3>
            <div class="flex items-center space-x-3 mb-4">
              <div class="p-3 bg-primary-500 text-white rounded-full">
                <CreditCard class="w-6 h-6" />
              </div>
              <div>
                <p class="font-semibold text-surface-900-50-token">{selectedPlan.display_name}</p>
                <p class="text-sm text-surface-600-300-token">{selectedPlan.description}</p>
                <p class="text-lg font-bold text-primary-600-300-token">{selectedPlan.price} credits/month</p>
              </div>
            </div>

            <div class="space-y-2">
              <h4 class="font-medium text-surface-900-50-token">Features included:</h4>
              {#each selectedPlan.features as feature}
                <div class="flex items-center space-x-2">
                  <Check class="w-4 h-4 text-success-500" />
                  <span class="text-sm text-surface-700-200-token">{feature}</span>
                </div>
              {/each}
            </div>
          </div>

          <!-- Duration Selection -->
          <div class="bg-surface-50-900-token rounded-lg p-4">
            <label for="duration-select" class="block text-sm font-medium text-surface-900-50-token mb-3">
              Subscription Duration
            </label>
            <select
              id="duration-select"
              bind:value={durationMonths}
              class="select w-full"
            >
              {#each Array.from({length: 12}, (_, i) => i + 1) as months}
                <option value={months}>{formatDuration(months)}</option>
              {/each}
            </select>
          </div>

          <!-- Auto-renewal -->
          <div class="bg-surface-50-900-token rounded-lg p-4">
            <label class="flex items-center space-x-3">
              <input
                type="checkbox"
                bind:checked={autoRenew}
                class="checkbox"
              />
              <div>
                <span class="text-sm font-medium text-surface-900-50-token">Auto-renewal</span>
                <p class="text-xs text-surface-600-300-token">
                  Automatically renew this subscription when it expires
                </p>
              </div>
            </label>
          </div>

          <!-- Cost Summary -->
          <div class="bg-surface-50-900-token rounded-lg p-4">
            <h4 class="font-medium text-surface-900-50-token mb-2">Cost Summary</h4>
            <div class="space-y-1 text-sm">
              <div class="flex justify-between">
                <span>Monthly cost:</span>
                <span>{selectedPlan.price} credits</span>
              </div>
              <div class="flex justify-between">
                <span>Duration:</span>
                <span>{formatDuration(durationMonths)}</span>
              </div>
              <div class="border-t border-surface-300-600-token pt-1 mt-2">
                <div class="flex justify-between font-bold">
                  <span>Total cost:</span>
                  <span>{totalCost} credits</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      {:else if currentStep === 2}
        <!-- Step 2: Validation -->
        <div class="space-y-6">
          {#if $validateMutation.isPending}
            <div class="flex items-center justify-center py-12">
              <div class="text-center">
                <Loader2 class="w-8 h-8 animate-spin text-primary-500 mx-auto mb-4" />
                <p class="text-lg text-surface-900-50-token">Validating purchase...</p>
                <p class="text-sm text-surface-600-300-token">Checking credit balance and eligibility</p>
              </div>
            </div>
          {:else if $validateMutation.isError}
            <div class="bg-error-100-800-token border border-error-300-600-token rounded-lg p-6">
              <div class="flex items-center space-x-3 mb-3">
                <AlertCircle class="w-6 h-6 text-error-600-300-token" />
                <h3 class="text-lg font-semibold text-error-600-300-token">Validation Failed</h3>
              </div>
              <p class="text-error-600-300-token mb-4">
                {$validateMutation.error?.message || ERROR_MESSAGES.GENERIC_ERROR}
              </p>
              <button
                on:click={() => $validateMutation.mutate()}
                class="btn variant-filled-error"
              >
                <RotateCcw class="w-4 h-4" />
                Try Again
              </button>
            </div>
          {:else if validationResult && !validationResult.valid}
            <div class="bg-warning-100-800-token border border-warning-300-600-token rounded-lg p-6">
              <div class="flex items-center space-x-3 mb-3">
                <AlertCircle class="w-6 h-6 text-warning-600-300-token" />
                <h3 class="text-lg font-semibold text-warning-600-300-token">Purchase Not Available</h3>
              </div>
              <p class="text-warning-600-300-token mb-4">
                {validationResult.reason || 'This purchase cannot be completed at this time.'}
              </p>
              {#if validationResult.reason?.includes('credit')}
                <div class="bg-surface-50-900-token rounded-lg p-4 mb-4">
                  <div class="flex justify-between items-center">
                    <span>Required credits:</span>
                    <span class="font-bold">{validationResult.required_credits}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span>Your balance:</span>
                    <span class="font-bold {validationResult.user_credits < validationResult.required_credits ? 'text-error-600-300-token' : ''}">
                      {validationResult.user_credits}
                    </span>
                  </div>
                </div>
                <a href="/dashboard/credits/add" class="btn variant-filled-primary">
                  <CreditCard class="w-4 h-4" />
                  Add Credits
                </a>
              {/if}
            </div>
          {/if}
        </div>

      {:else if currentStep === 3}
        <!-- Step 3: Confirm Purchase -->
        <div class="space-y-6">
          {#if validationResult && validationResult.valid}
            <div class="bg-success-100-800-token border border-success-300-600-token rounded-lg p-6">
              <div class="flex items-center space-x-3 mb-3">
                <CheckCircle2 class="w-6 h-6 text-success-600-300-token" />
                <h3 class="text-lg font-semibold text-success-600-300-token">Ready to Purchase</h3>
              </div>
              <p class="text-success-600-300-token">
                Your purchase has been validated and is ready to complete.
              </p>
            </div>

            <div class="bg-surface-50-900-token rounded-lg p-4">
              <h4 class="font-medium text-surface-900-50-token mb-3">Credit Balance</h4>
              <div class="space-y-1 text-sm">
                <div class="flex justify-between">
                  <span>Current balance:</span>
                  <span>{validationResult.user_credits} credits</span>
                </div>
                <div class="flex justify-between">
                  <span>Purchase cost:</span>
                  <span>-{validationResult.required_credits} credits</span>
                </div>
                <div class="border-t border-surface-300-600-token pt-1 mt-2">
                  <div class="flex justify-between font-bold">
                    <span>Remaining balance:</span>
                    <span>{validationResult.user_credits - validationResult.required_credits} credits</span>
                  </div>
                </div>
              </div>
            </div>

            {#if $purchaseMutation.isError}
              <div class="bg-error-100-800-token border border-error-300-600-token rounded-lg p-4">
                <div class="flex items-center space-x-3 mb-2">
                  <AlertCircle class="w-5 h-5 text-error-600-300-token" />
                  <span class="font-medium text-error-600-300-token">Purchase Failed</span>
                </div>
                <p class="text-error-600-300-token text-sm">
                  {$purchaseMutation.error?.message || ERROR_MESSAGES.PURCHASE_FAILED}
                </p>
              </div>
            {/if}
          {/if}
        </div>

      {:else if currentStep === 4}
        <!-- Step 4: Success -->
        <div class="text-center py-8">
          <div class="w-16 h-16 bg-success-500 text-white rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 class="w-8 h-8" />
          </div>
          <h3 class="text-2xl font-bold text-surface-900-50-token mb-2">Purchase Successful!</h3>
          <p class="text-surface-600-300-token mb-6">
            {SUCCESS_MESSAGES.PURCHASE_SUCCESS}
          </p>

          {#if purchaseResult}
            <div class="bg-surface-50-900-token rounded-lg p-4 mb-6 text-left">
              <h4 class="font-medium text-surface-900-50-token mb-3">Subscription Details</h4>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                  <span>Service:</span>
                  <span class="capitalize">{purchaseResult.service_type}</span>
                </div>
                <div class="flex justify-between">
                  <span>Plan:</span>
                  <span class="capitalize">{purchaseResult.service_plan}</span>
                </div>
                <div class="flex justify-between">
                  <span>Start date:</span>
                  <span>{new Date(purchaseResult.start_date).toLocaleDateString()}</span>
                </div>
                <div class="flex justify-between">
                  <span>End date:</span>
                  <span>{new Date(purchaseResult.end_date).toLocaleDateString()}</span>
                </div>
                <div class="flex justify-between">
                  <span>Auto-renewal:</span>
                  <span>{purchaseResult.auto_renew ? 'Enabled' : 'Disabled'}</span>
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Footer Actions -->
    <div class="flex items-center justify-between p-6 border-t border-surface-300-600-token">
      <div class="flex space-x-3">
        {#if currentStep > 1 && currentStep < 4}
          <button
            on:click={() => currentStep--}
            class="btn variant-ghost-surface"
            disabled={$validateMutation.isPending || $purchaseMutation.isPending}
          >
            <ArrowLeft class="w-4 h-4" />
            Back
          </button>
        {/if}
      </div>

      <div class="flex space-x-3">
        <button
          on:click={onClose}
          class="btn variant-ghost-surface"
          disabled={$purchaseMutation.isPending}
        >
          {currentStep === 4 ? 'Close' : 'Cancel'}
        </button>

        {#if currentStep === 1}
          <button
            on:click={handleValidate}
            class="btn variant-filled-primary"
          >
            Validate Purchase
            <ArrowRight class="w-4 h-4" />
          </button>
        {:else if currentStep === 3 && validationResult?.valid}
          <button
            on:click={handlePurchase}
            class="btn variant-filled-primary"
            disabled={$purchaseMutation.isPending}
          >
            {#if $purchaseMutation.isPending}
              <Loader2 class="w-4 h-4 animate-spin" />
              Processing...
            {:else}
              Confirm Purchase
            {/if}
          </button>
        {:else if currentStep === 4}
          <button
            on:click={handleSuccess}
            class="btn variant-filled-primary"
          >
            View My Subscriptions
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>