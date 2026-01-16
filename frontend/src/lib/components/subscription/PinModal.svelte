<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { X, Lock } from 'lucide-svelte';
  import { pinService } from '$lib/api/pin.js';
  import type { ApiError } from '$lib/types/api.js';

  export let isOpen = false;
  export let title = 'Verify PIN';
  export let description = 'Enter your 4-digit PIN to continue.';

  const dispatch = createEventDispatcher<{
    verified: { token: string };
    pinSet: { pinSetAt: string };
  }>();

  let mode: 'verify' | 'set' = 'verify';
  let pin = '';
  let confirmPin = '';
  let errorMessage = '';
  let helperMessage = '';
  let isSubmitting = false;
  let isModeChecking = false;
  let statusCheckSeq = 0;

  const normalizeHasPin = (value: unknown): boolean => {
    if (value === true) return true;
    if (value === false || value === null || value === undefined) return false;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', 't', '1'].includes(normalized)) return true;
      if (['false', 'f', '0', ''].includes(normalized)) return false;
    }
    return false;
  };

  const getErrorDetails = (error: ApiError): Record<string, unknown> | null => {
    const details = error.details;
    if (details && typeof details === 'object') {
      return details as Record<string, unknown>;
    }
    return null;
  };

  async function syncModeWithPinStatus() {
    const sequence = ++statusCheckSeq;
    isModeChecking = true;
    try {
      const status = await pinService.getStatus();
      if (sequence !== statusCheckSeq) return;
      if (!normalizeHasPin(status.has_pin)) {
        mode = 'set';
        helperMessage = 'Set a PIN to protect your credentials.';
      } else {
        mode = 'verify';
        helperMessage = '';
      }
    } catch {
      if (sequence !== statusCheckSeq) return;
      mode = 'set';
      helperMessage = 'Set a PIN to protect your credentials.';
    } finally {
      if (sequence === statusCheckSeq) {
        isModeChecking = false;
      }
    }
  }

  let wasOpen = false;

  $: if (isOpen && !wasOpen) {
    pin = '';
    confirmPin = '';
    errorMessage = '';
    helperMessage = '';
    mode = 'set';
    isSubmitting = false;
    helperMessage = 'Checking PIN status...';
    void syncModeWithPinStatus();
    wasOpen = true;
  }

  $: if (!isOpen && wasOpen) {
    pin = '';
    confirmPin = '';
    errorMessage = '';
    helperMessage = '';
    mode = 'verify';
    isSubmitting = false;
    isModeChecking = false;
    statusCheckSeq += 1;
    wasOpen = false;
  }

  function normalizePin(value: string): string {
    return value.replace(/\D/g, '').slice(0, 4);
  }

  function handlePinInput(event: Event) {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    pin = normalizePin(target.value);
  }

  function handleConfirmPinInput(event: Event) {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    confirmPin = normalizePin(target.value);
  }

  function close() {
    isOpen = false;
  }

  async function handleVerify() {
    isSubmitting = true;
    errorMessage = '';
    helperMessage = '';

    try {
      const result = await pinService.verifyPin(pin);
      dispatch('verified', { token: result.pin_token });
      close();
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.statusCode === 400 && apiError.message?.includes('not been set')) {
        mode = 'set';
        helperMessage = 'Set a PIN to protect your credentials.';
        return;
      }

      if (apiError.code === 'PIN_LOCKED') {
        const details = getErrorDetails(apiError);
        const lockedUntil =
          typeof details?.locked_until === 'string'
            ? details.locked_until
            : undefined;
        errorMessage = lockedUntil
          ? `PIN locked until ${new Date(lockedUntil).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}.`
          : 'PIN locked due to too many attempts. Try again later.';
        return;
      }

      if (apiError.code === 'PIN_INVALID') {
        const details = getErrorDetails(apiError);
        const attemptsRemaining =
          typeof details?.attempts_remaining === 'number'
            ? details.attempts_remaining
            : undefined;
        errorMessage = attemptsRemaining !== undefined
          ? `Incorrect PIN. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining.`
          : 'Incorrect PIN. Please try again.';
        return;
      }

      errorMessage = apiError.message || 'Unable to verify PIN.';
    } finally {
      isSubmitting = false;
    }
  }

  async function handleSetPin() {
    isSubmitting = true;
    errorMessage = '';
    helperMessage = '';

    if (pin.length !== 4) {
      errorMessage = 'PIN must be 4 digits.';
      isSubmitting = false;
      return;
    }

    if (pin !== confirmPin) {
      errorMessage = 'PIN entries do not match.';
      isSubmitting = false;
      return;
    }

    try {
      const result = await pinService.setPin(pin);
      dispatch('pinSet', { pinSetAt: result.pin_set_at });
      close();
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.statusCode === 403) {
        errorMessage = 'PIN setup requires a completed paid order.';
        return;
      }
      if (apiError.statusCode === 409) {
        mode = 'verify';
        errorMessage = 'A PIN is already set for this account. Please verify it.';
        return;
      }
      errorMessage = apiError.message || 'Unable to set PIN.';
    } finally {
      isSubmitting = false;
    }
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
    <div class="w-full max-w-sm rounded-xl bg-white shadow-xl border border-gray-200">
      <div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <div class="flex items-center gap-2 text-gray-900">
          <Lock size={18} />
          <h2 class="text-sm font-semibold">{mode === 'verify' ? title : 'Set PIN'}</h2>
        </div>
        <button on:click={close} class="text-gray-500 hover:text-gray-700">
          <X size={16} />
        </button>
      </div>

      <div class="px-5 py-4 space-y-4">
        <p class="text-sm text-gray-600">
          {mode === 'verify' ? description : 'Create a 4-digit PIN to protect credential access.'}
        </p>

        {#if helperMessage}
          <div class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
            {helperMessage}
          </div>
        {/if}

        <div class="space-y-3">
          <div>
            <label for="pin-input" class="block text-xs font-medium text-gray-700">PIN</label>
            <input
              id="pin-input"
              type="password"
              inputmode="numeric"
              maxlength="4"
              bind:value={pin}
              on:input={handlePinInput}
              class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
              placeholder="0000"
              disabled={isSubmitting || isModeChecking}
            />
          </div>

          {#if mode === 'set'}
            <div>
              <label for="pin-confirm" class="block text-xs font-medium text-gray-700">Confirm PIN</label>
              <input
                id="pin-confirm"
                type="password"
                inputmode="numeric"
                maxlength="4"
                bind:value={confirmPin}
                on:input={handleConfirmPinInput}
                class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                placeholder="0000"
                disabled={isSubmitting || isModeChecking}
              />
            </div>
          {/if}
        </div>

        {#if errorMessage}
          <div class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {errorMessage}
          </div>
        {/if}

        <div class="flex items-center justify-between text-xs text-gray-500">
          <span>Need help resetting your PIN?</span>
          <a href="/help" class="text-gray-700 hover:text-gray-900">Contact support</a>
        </div>
      </div>

      <div class="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
        <button on:click={close} class="text-sm text-gray-600 hover:text-gray-800" disabled={isSubmitting}>
          Cancel
        </button>
        <button
          on:click={mode === 'verify' ? handleVerify : handleSetPin}
          class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60"
          disabled={isSubmitting || isModeChecking || pin.length < 4 || (mode === 'set' && confirmPin.length < 4)}
        >
          {mode === 'verify' ? 'Verify PIN' : 'Set PIN'}
        </button>
      </div>
    </div>
  </div>
{/if}
