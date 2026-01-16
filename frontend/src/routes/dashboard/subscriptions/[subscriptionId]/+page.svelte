<script lang="ts">
  import { goto } from '$app/navigation';
  import UpgradeSelectionForm from '$lib/components/subscription/UpgradeSelectionForm.svelte';
  import { subscriptionService } from '$lib/api/subscriptions.js';
  import type { Subscription } from '$lib/types/subscription.js';
  import type {
    UpgradeSelection,
    UpgradeSelectionSubmission
  } from '$lib/types/upgradeSelection.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let subscription = data.subscription as Subscription | null;
  let selection = data.selection as UpgradeSelection | null;
  let selectionLocked = data.selectionLocked;
  let error = data.error;
  let submitError = '';
  let successMessage = '';
  let isSubmitting = false;

  const formatLabel = (value: string) =>
    value.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

  const getSelectionLabel = (value?: string | null) => {
    if (!value) return 'Selection submitted';
    return formatLabel(value);
  };

  async function handleSubmit(event: CustomEvent<UpgradeSelectionSubmission>) {
    if (!subscription) return;
    isSubmitting = true;
    submitError = '';
    successMessage = '';
    try {
      const response = await subscriptionService.submitUpgradeSelection(
        subscription.id,
        event.detail
      );
      selection = response.selection;
      selectionLocked = response.locked;
      successMessage = 'Selection submitted successfully.';
    } catch (error) {
      submitError =
        error instanceof Error
          ? error.message
          : 'Unable to submit upgrade selection.';
    } finally {
      isSubmitting = false;
    }
  }
</script>

<svelte:head>
  <title>Upgrade Selection - SubSlush</title>
  <meta name="description" content="Choose how to complete your subscription upgrade." />
</svelte:head>

<section class="space-y-6">
  <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-2">
    <h1 class="text-2xl font-semibold text-gray-900">Upgrade selection</h1>
    <p class="text-sm text-gray-600">
      {subscription
        ? `Subscription ${subscription.id.slice(0, 8)} - ${formatLabel(subscription.service_type)} ${formatLabel(subscription.service_plan)}`
        : 'Choose how to complete your upgrade.'}
    </p>
  </div>

  {#if error}
    <div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {error}
    </div>
  {:else if !subscription}
    <div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      Unable to load subscription details.
    </div>
  {:else if !selection}
    <div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
      No upgrade selection is required for this subscription.
    </div>
    <button
      class="inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
      on:click={() => goto('/dashboard/subscriptions')}
    >
      Back to subscriptions
    </button>
  {:else if selectionLocked}
    <div class="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
      {getSelectionLabel(selection.selection_type)} confirmed.
    </div>
    <button
      class="inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black"
      on:click={() => goto('/dashboard/subscriptions')}
    >
      Back to subscriptions
    </button>
  {:else}
    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
      {#if successMessage}
        <div class="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      {/if}
      <UpgradeSelectionForm
        upgradeOptions={selection.upgrade_options_snapshot}
        durationMonths={subscription?.term_months ?? null}
        locked={selectionLocked}
        submitting={isSubmitting}
        errorMessage={submitError}
        on:submit={handleSubmit}
      />
    </div>
  {/if}
</section>
