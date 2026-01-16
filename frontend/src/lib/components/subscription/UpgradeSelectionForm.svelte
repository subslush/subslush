<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import ManualMonthlyAcknowledgement from './ManualMonthlyAcknowledgement.svelte';
  import type { UpgradeOptions } from '$lib/types/subscription.js';
  import type {
    UpgradeSelectionSubmission,
    UpgradeSelectionType
  } from '$lib/types/upgradeSelection.js';

  export let upgradeOptions: UpgradeOptions;
  export let locked = false;
  export let submitting = false;
  export let errorMessage = '';
  export let title = 'Choose your upgrade option';
  export let description = 'Select how you want us to complete this upgrade.';
  export let submitLabel = 'Submit selection';

  const dispatch = createEventDispatcher<{
    submit: UpgradeSelectionSubmission;
  }>();

  let selectionType: UpgradeSelectionType | '' = '';
  let accountIdentifier = '';
  let credentials = '';
  let manualMonthlyAcknowledged = false;

  $: allowNew = upgradeOptions?.allow_new_account;
  $: allowOwn = upgradeOptions?.allow_own_account;
  $: requiresManualAck = Boolean(upgradeOptions?.manual_monthly_upgrade);

  $: if (!selectionType) {
    if (allowNew && !allowOwn) {
      selectionType = 'upgrade_new_account';
    } else if (allowOwn && !allowNew) {
      selectionType = 'upgrade_own_account';
    }
  }

  $: needsCredentials = selectionType === 'upgrade_own_account';
  $: trimmedIdentifier = accountIdentifier.trim();
  $: trimmedCredentials = credentials.trim();
  $: canSubmit =
    !locked &&
    Boolean(selectionType) &&
    (!needsCredentials || (trimmedIdentifier && trimmedCredentials)) &&
    (!requiresManualAck || manualMonthlyAcknowledged) &&
    !submitting;

  const handleSubmit = () => {
    if (!canSubmit || !selectionType) return;
    dispatch('submit', {
      selection_type: selectionType,
      account_identifier: trimmedIdentifier || null,
      credentials: trimmedCredentials || null,
      manual_monthly_acknowledged: requiresManualAck ? manualMonthlyAcknowledged : undefined
    });
  };
</script>

<div class="space-y-5">
  <div class="space-y-2">
    <h3 class="text-xl font-semibold text-slate-900">{title}</h3>
    <p class="text-sm text-slate-600">{description}</p>
  </div>

  <div class="space-y-3">
    {#if allowNew}
      <label class="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-3 transition-colors hover:bg-slate-50">
        <input
          type="radio"
          name="upgrade-selection"
          value="upgrade_new_account"
          bind:group={selectionType}
          class="mt-1 h-4 w-4 text-slate-900 focus:ring-slate-300"
          disabled={locked || submitting}
        />
        <div>
          <p class="text-sm font-semibold text-slate-900">Upgrade new account</p>
          <p class="text-xs text-slate-500">We will provision a new account for you.</p>
        </div>
      </label>
    {/if}

    {#if allowOwn}
      <label class="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-3 transition-colors hover:bg-slate-50">
        <input
          type="radio"
          name="upgrade-selection"
          value="upgrade_own_account"
          bind:group={selectionType}
          class="mt-1 h-4 w-4 text-slate-900 focus:ring-slate-300"
          disabled={locked || submitting}
        />
        <div>
          <p class="text-sm font-semibold text-slate-900">Upgrade my existing account</p>
          <p class="text-xs text-slate-500">Provide credentials so we can upgrade your account.</p>
        </div>
      </label>
    {/if}
  </div>

  {#if needsCredentials}
    <div class="space-y-3">
      <div>
        <label class="text-xs font-semibold uppercase tracking-wide text-slate-500" for="upgrade-account-identifier">Account identifier</label>
        <input
          id="upgrade-account-identifier"
          class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="Email, username, or account ID"
          bind:value={accountIdentifier}
          disabled={locked || submitting}
        />
      </div>
      <div>
        <label class="text-xs font-semibold uppercase tracking-wide text-slate-500" for="upgrade-account-credentials">Account credentials</label>
        <textarea
          id="upgrade-account-credentials"
          class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          rows={4}
          placeholder="Enter login details or any access notes"
          bind:value={credentials}
          disabled={locked || submitting}
        ></textarea>
      </div>
    </div>
  {/if}

  {#if requiresManualAck}
    <ManualMonthlyAcknowledgement
      bind:acknowledged={manualMonthlyAcknowledged}
      disabled={locked || submitting}
    />
  {/if}

  {#if errorMessage}
    <p class="text-sm text-red-600">{errorMessage}</p>
  {/if}

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
</div>
