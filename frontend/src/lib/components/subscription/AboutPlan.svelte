<script lang="ts">
  import { ChevronDown, ChevronUp } from 'lucide-svelte';

  export let title: string = 'About This Plan';
  export let description: string;
  export let longDescription: string;

  let showFullDescription = false;

  function toggleDescription() {
    showFullDescription = !showFullDescription;
  }
</script>

<div class="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow duration-300 animate-in slide-in-from-bottom-4 duration-500">
  <h3 class="text-xl font-semibold text-gray-900 mb-4">
    {title}
  </h3>

  <div class="space-y-4">
    <!-- Always visible short description -->
    <div class="max-w-none">
      <p class="text-gray-700 leading-relaxed">
        {description}
      </p>
    </div>

    <!-- Expandable long description -->
    {#if longDescription && longDescription !== description}
      <div class="space-y-4">
        {#if showFullDescription}
          <div
            class="max-w-none animate-in slide-in-from-top-2 duration-300"
            id="plan-description"
            role="region"
            aria-label="Extended plan description"
          >
            <div class="text-gray-700 leading-relaxed space-y-4">
              {#each longDescription.split('\n\n') as paragraph}
                <p>{paragraph}</p>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Toggle button -->
        <button
          on:click={toggleDescription}
          class="flex items-center space-x-2 text-blue-600 hover:text-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none rounded-lg p-1 transition-colors duration-200 font-medium"
          aria-expanded={showFullDescription}
          aria-controls="plan-description"
          aria-label={showFullDescription ? 'Show less plan details' : 'Show more plan details'}
        >
          <span>
            {showFullDescription ? 'Read less' : 'Read more'}
          </span>
          {#if showFullDescription}
            <ChevronUp size={16} />
          {:else}
            <ChevronDown size={16} />
          {/if}
        </button>
      </div>
    {/if}
  </div>
</div>