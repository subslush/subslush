<script lang="ts">
  import { Check } from 'lucide-svelte';

  export let features: string[];
  export let title: string = 'Key Features';
</script>

<div class="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow duration-300 animate-in slide-in-from-bottom-4 duration-700">
  <h3 class="text-xl font-semibold text-gray-900 mb-4">
    {title}
  </h3>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
    {#each features as feature}
      <div class="flex items-start space-x-3">
        <div class="flex-shrink-0 mt-0.5">
          <Check size={20} class="text-green-500" />
        </div>
        <span class="text-gray-700 leading-relaxed">
          {feature}
        </span>
      </div>
    {/each}
  </div>
</div>