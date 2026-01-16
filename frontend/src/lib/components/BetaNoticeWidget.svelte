<script lang="ts">
  import { ChevronUp } from 'lucide-svelte';

  let isOpen = true;

  const handleMinimize = () => {
    isOpen = false;
  };

  const handleOpen = () => {
    isOpen = true;
  };
</script>

<div class="fixed bottom-4 left-4 z-50">
  {#if isOpen}
    <div class="w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white shadow-lg">
      <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div class="text-sm font-semibold text-gray-900">Beta notice</div>
        <button
          type="button"
          class="rounded-md border border-gray-200 px-2 py-0.5 text-sm font-semibold text-gray-700 hover:bg-gray-100"
          aria-label="Minimize beta notice"
          on:click={handleMinimize}
        >
          -
        </button>
      </div>
      <div class="space-y-3 px-4 py-3 text-sm text-gray-700">
        <p>
          SubSlush Marketplace just launched and this is a beta. We have run extensive tests to
          remove obvious issues, but there may still be hidden bugs.
        </p>
        <p>
          Please be patient if you encounter problems, and report them to us. We reward reports fairly
          based on severity - critical issues earn higher rewards, smaller ones earn lower rewards.
        </p>
        <p>
          We also welcome suggestions and recommendations for improvements as we continue developing
          the marketplace.
        </p>
        <a
          href="/feedback"
          class="inline-flex items-center justify-center rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white"
        >
          Report a bug or suggestion
        </a>
      </div>
    </div>
  {:else}
    <button
      type="button"
      class="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-md hover:bg-gray-50"
      on:click={handleOpen}
      aria-label="Open beta feedback notice"
    >
      <ChevronUp size={16} />
      Beta feedback
    </button>
  {/if}
</div>
