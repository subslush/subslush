<script lang="ts">
  import {
    acceptAll,
    rejectNonEssential,
    updateConsent,
    consentStore,
    consentReady,
    consentUi,
    closeConsentPreferences,
    type ConsentPreferences
  } from '$lib/stores/consent.js';

  const blankPreferences: ConsentPreferences = {
    analytics: false,
    marketing: false
  };

  let preferences: ConsentPreferences = { ...blankPreferences };
  let showPreferences = false;

  $: isVisible = $consentReady && (!$consentStore || $consentUi.isOpen);
  $: if ($consentUi.showPreferences) {
    showPreferences = true;
  }
  $: if (!$consentUi.isOpen && $consentStore) {
    showPreferences = false;
  }

  $: if ($consentStore && !showPreferences) {
    preferences = { ...blankPreferences, ...$consentStore.preferences };
  }

  const openPreferences = () => {
    showPreferences = true;
  };

  const handleClose = () => {
    if ($consentStore) {
      closeConsentPreferences();
    }
  };

  const handleSave = () => {
    updateConsent({ ...preferences });
    showPreferences = false;
  };
</script>

{#if isVisible}
  <div class="fixed inset-x-0 bottom-0 z-[60] border-t border-gray-200 bg-white shadow-[0_-8px_24px_rgba(15,23,42,0.12)]">
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div class="max-w-3xl">
        <p class="text-sm font-semibold text-gray-900">Cookies &amp; Privacy</p>
        <p class="mt-1 text-xs text-gray-600">
          We use essential cookies for security and performance. With your consent, we also use
          analytics and marketing cookies to improve our site and measure advertising results.
        </p>
        {#if showPreferences}
          <div class="mt-3 grid gap-3 text-xs text-gray-700 sm:grid-cols-3">
            <label class="flex items-start gap-2">
              <input type="checkbox" checked disabled class="mt-0.5" />
              <span>
                <span class="block font-semibold text-gray-900">Essential</span>
                Required for sign-in, security, and core features.
              </span>
            </label>
            <label class="flex items-start gap-2">
              <input
                type="checkbox"
                bind:checked={preferences.analytics}
                class="mt-0.5"
              />
              <span>
                <span class="block font-semibold text-gray-900">Analytics</span>
                Helps us understand usage and improve performance.
              </span>
            </label>
            <label class="flex items-start gap-2">
              <input
                type="checkbox"
                bind:checked={preferences.marketing}
                class="mt-0.5"
              />
              <span>
                <span class="block font-semibold text-gray-900">Marketing</span>
                Measures ad performance and optimizes campaigns.
              </span>
            </label>
          </div>
        {/if}
      </div>

      <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
        {#if showPreferences}
          <button
            class="rounded-lg border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            type="button"
            on:click={handleSave}
          >
            Save preferences
          </button>
          <button
            class="rounded-lg border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            type="button"
            on:click={rejectNonEssential}
          >
            Reject non-essential
          </button>
          <button
            class="rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black"
            type="button"
            on:click={acceptAll}
          >
            Accept all
          </button>
        {:else}
          <button
            class="rounded-lg border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            type="button"
            on:click={rejectNonEssential}
          >
            Reject non-essential
          </button>
          <button
            class="rounded-lg border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            type="button"
            on:click={openPreferences}
          >
            Manage preferences
          </button>
          <button
            class="rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black"
            type="button"
            on:click={acceptAll}
          >
            Accept all
          </button>
        {/if}
        {#if $consentStore && $consentUi.isOpen}
          <button
            class="rounded-lg border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            type="button"
            on:click={handleClose}
          >
            Close
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
