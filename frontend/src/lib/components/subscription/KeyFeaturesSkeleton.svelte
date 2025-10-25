<script lang="ts">
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
</script>

<div class="bg-white border border-gray-200 rounded-lg p-6 animate-in slide-in-from-bottom-4 duration-300">
  <Skeleton width="w-32" height="h-6" className="mb-4" />

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    {#each Array(6) as _}
      <div class="flex items-start space-x-4">
        <Skeleton width="w-5" height="h-5" rounded="rounded-full" className="mt-0.5" />
        <Skeleton width="w-full" height="h-4" />
      </div>
    {/each}
  </div>
</div>