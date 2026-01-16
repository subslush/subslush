<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let acknowledged = false;
  export let disabled = false;
  export let showSubmit = false;
  export let submitting = false;
  export let submitLabel = 'Confirm acknowledgement';
  export let errorMessage = '';

  const dispatch = createEventDispatcher<{
    submit: void;
  }>();

  $: canSubmit = showSubmit && acknowledged && !disabled && !submitting;

  const handleSubmit = () => {
    if (!canSubmit) return;
    dispatch('submit');
  };
</script>

<div class="space-y-3 text-sm text-slate-700">
  <div class="space-y-2">
    <p class="text-base font-semibold text-slate-900">Monthly renewal process</p>
    <p>
      This subscription needs a monthly renewal because the service only supports monthly billing
      periods. We will access your account once per month, only to renew your subscription.
    </p>
    <p>
      If you chose a new account, we will create one with a strong password and share it after
      delivery. If you chose your existing account, set a strong, unique password and keep it in
      a safe place.
    </p>
    <p>
      The password you submit is locked for this subscription and should not be changed. If you
      need to reset or change it (for example, through account recovery), switch it back to the
      password you provided us if possible. If you cannot revert it or the service does not allow
      reuse, contact support via <strong>live chat</strong> or
      <strong>hello@subslush.com</strong>.
    </p>
    <p>
      Credentials shared on SubSlush are encrypted with 256-bit encryption. No other action is
      required from you during the subscription period.
    </p>
  </div>
  <label class="flex items-center gap-2 text-sm text-slate-900">
    <input
      type="checkbox"
      bind:checked={acknowledged}
      class="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-300"
      disabled={disabled || submitting}
    />
    <span>I understand</span>
  </label>
</div>

{#if errorMessage}
  <p class="text-sm text-red-600">{errorMessage}</p>
{/if}

{#if showSubmit}
  <button
    class="inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
    on:click={handleSubmit}
    disabled={!canSubmit}
  >
    {#if submitting}
      <span>Submitting...</span>
    {:else}
      <span>{submitLabel}</span>
    {/if}
  </button>
{/if}
