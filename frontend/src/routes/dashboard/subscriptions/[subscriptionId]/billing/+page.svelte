<script lang="ts">
  import { goto } from '$app/navigation';
</script>

<svelte:head>
  <title>Billing - SubSlush</title>
</svelte:head>

<section class="max-w-2xl space-y-6">
  <div>
    <h1 class="text-2xl font-semibold text-gray-900">Billing</h1>
    <p class="text-sm text-gray-600 mt-1">
      Auto-renew card setup is unavailable. Renew manually from your subscriptions page.
    </p>
  </div>

  <div class="rounded-lg border border-gray-200 bg-white p-5">
    <button
      on:click={() => goto('/dashboard/subscriptions')}
      class="inline-flex items-center justify-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
      type="button"
    >
      Back to subscriptions
    </button>
  </div>
</section>
