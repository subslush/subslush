<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let acknowledged = false;
  export let disabled = false;
  export let showSubmit = false;
  export let submitting = false;
  export let submitLabel = 'Confirm acknowledgement';
  export let errorMessage = '';
  export let collapsible = true;
  export let defaultExpanded = false;

  const dispatch = createEventDispatcher<{
    submit: void;
  }>();

  let expanded = defaultExpanded;

  $: if (!collapsible) {
    expanded = true;
  }

  $: canSubmit = showSubmit && !disabled && !submitting;

  const toggleExpanded = () => {
    if (!collapsible) return;
    expanded = !expanded;
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    acknowledged = true;
    dispatch('submit');
  };
</script>

<div class="space-y-3 text-sm text-slate-700">
  <button
    type="button"
    class="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left transition-colors hover:bg-slate-50"
    on:click={toggleExpanded}
    aria-expanded={expanded}
    aria-controls="manual-monthly-process-details"
  >
    <span class="text-base font-semibold text-slate-900">Monthly renewal process</span>
    <span class="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-sm font-semibold text-slate-600">
      {expanded ? '-' : '+'}
    </span>
  </button>

  {#if expanded}
    <div id="manual-monthly-process-details" class="space-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
      <p>
        This subscription is fulfilled on monthly billing cycles only, so renewal is completed
        once per month for the full subscription term.
      </p>
      <p>
        Our team accesses the account in the background only when renewal is due. This does not
        interrupt normal account usage.
      </p>
      <p>
        Please do not change the password we provision for this subscription. Changing it can
        prevent us from completing the next monthly renewal.
      </p>
      <p>
        Credentials shared through SubSlush are protected with 256-bit encryption and used only to
        complete this order. No additional action is required from you during the subscription.
      </p>
    </div>
  {/if}
</div>

{#if errorMessage}
  <p class="text-sm text-red-600">{errorMessage}</p>
{/if}

{#if showSubmit}
  <button
    class="mt-3 inline-flex items-center justify-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
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
