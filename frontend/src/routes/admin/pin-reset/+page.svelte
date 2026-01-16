<script lang="ts">
  import { adminService } from '$lib/api/admin.js';

  let userId = '';
  let verificationCode = '';
  let requestMessage = '';
  let requestError = '';
  let confirmMessage = '';
  let confirmError = '';
  let isRequesting = false;
  let isConfirming = false;
  let emailMasked = '';
  let expiresAt = '';

  const resetRequestFeedback = () => {
    requestMessage = '';
    requestError = '';
  };

  const resetConfirmFeedback = () => {
    confirmMessage = '';
    confirmError = '';
  };

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const sanitizeCode = (value: string) => value.replace(/\D/g, '').slice(0, 9);

  const handleCodeInput = (event: Event) => {
    const target = event.target as HTMLInputElement;
    verificationCode = sanitizeCode(target.value);
  };

  const formatExpiry = (value: string) => {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return parsed.toLocaleString();
  };

  const sendResetCode = async () => {
    const trimmedUserId = userId.trim();
    if (!trimmedUserId) {
      requestError = 'Please enter a user ID.';
      return;
    }

    resetRequestFeedback();
    resetConfirmFeedback();
    emailMasked = '';
    expiresAt = '';
    verificationCode = '';

    isRequesting = true;
    try {
      const result = await adminService.requestPinReset({ userId: trimmedUserId });
      emailMasked = result.email_masked || result.emailMasked || '';
      expiresAt = result.expires_at || result.expiresAt || '';
      requestMessage = 'Verification code sent to the user.';
    } catch (error) {
      requestError = getErrorMessage(error, 'Failed to send verification code.');
    } finally {
      isRequesting = false;
    }
  };

  const confirmReset = async () => {
    const trimmedUserId = userId.trim();
    if (!trimmedUserId) {
      confirmError = 'Please enter a user ID.';
      return;
    }

    if (verificationCode.length !== 9) {
      confirmError = 'Verification code must be 9 digits.';
      return;
    }

    if (!confirm('Confirm PIN reset for this user?')) {
      return;
    }

    resetConfirmFeedback();
    isConfirming = true;
    try {
      await adminService.confirmPinReset({
        userId: trimmedUserId,
        code: verificationCode
      });
      confirmMessage = 'PIN has been reset. The user can set a new PIN on next reveal.';
      verificationCode = '';
    } catch (error) {
      confirmError = getErrorMessage(error, 'Failed to confirm PIN reset.');
    } finally {
      isConfirming = false;
    }
  };
</script>

<svelte:head>
  <title>PIN Reset - Admin</title>
  <meta name="description" content="Send a PIN reset verification code and confirm PIN reset for a user." />
</svelte:head>

<div class="space-y-6">
  <section>
    <h1 class="text-2xl font-bold text-gray-900">PIN Reset</h1>
    <p class="text-sm text-gray-600">
      Send a verification code to the user and confirm the reset after they share it via support.
    </p>
  </section>

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
    <div class="flex flex-col gap-3 md:flex-row md:items-end">
      <div class="flex-1 space-y-1">
        <label for="pin-reset-user" class="text-sm font-semibold text-gray-900">
          User ID (UID)
        </label>
        <input
          id="pin-reset-user"
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="UUID of the user"
          bind:value={userId}
        />
      </div>
      <button
        type="button"
        class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        on:click={sendResetCode}
        disabled={isRequesting || !userId.trim()}
      >
        {isRequesting ? 'Sending...' : 'Reset'}
      </button>
    </div>

    {#if emailMasked}
      <p class="text-xs text-gray-500">
        Sent to {emailMasked}{expiresAt ? ` · Expires ${formatExpiry(expiresAt)}` : ''}.
      </p>
    {/if}
    {#if requestMessage}
      <p class="text-sm text-emerald-600">{requestMessage}</p>
    {/if}
    {#if requestError}
      <p class="text-sm text-red-600">{requestError}</p>
    {/if}
  </section>

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
    <div>
      <h2 class="text-sm font-semibold text-gray-900">Confirm reset</h2>
      <p class="text-xs text-gray-500 mt-1">
        Enter the 9-digit verification code provided by the user to clear their PIN.
      </p>
    </div>

    <div class="flex flex-col gap-3 md:flex-row md:items-end">
      <div class="flex-1 space-y-1">
        <label for="pin-reset-code" class="text-sm font-semibold text-gray-900">
          Verification code
        </label>
        <input
          id="pin-reset-code"
          class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="9-digit code"
          inputmode="numeric"
          autocomplete="one-time-code"
          bind:value={verificationCode}
          on:input={handleCodeInput}
        />
      </div>
      <button
        type="button"
        class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        on:click={confirmReset}
        disabled={isConfirming || !userId.trim() || verificationCode.length !== 9}
      >
        {isConfirming ? 'Confirming...' : 'Confirm to reset'}
      </button>
    </div>

    {#if confirmMessage}
      <p class="text-sm text-emerald-600">{confirmMessage}</p>
    {/if}
    {#if confirmError}
      <p class="text-sm text-red-600">{confirmError}</p>
    {/if}
  </section>
</div>
