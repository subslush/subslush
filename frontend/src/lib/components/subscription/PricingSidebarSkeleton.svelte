<script lang="ts">
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
</script>

<div class="lg:sticky lg:top-8 space-y-4 lg:space-y-6">
  <!-- Price Card -->
  <div class="bg-white border border-gray-200 rounded-lg p-6 animate-in slide-in-from-right-4 duration-300">
    <!-- Main Price Display -->
    <div class="text-center mb-6">
      <Skeleton width="w-24" height="h-10" className="mx-auto mb-2" />
      <Skeleton width="w-16" height="h-4" className="mx-auto" />

      <!-- Savings Display -->
      <div class="mt-2">
        <Skeleton width="w-32" height="h-4" className="mx-auto" />
      </div>
    </div>

    <!-- Duration Selector -->
    <div class="mb-6">
      <Skeleton width="w-20" height="h-4" className="mb-4" />
      <div class="grid grid-cols-2 gap-2">
        {#each Array(4) as _}
          <Skeleton width="w-full" height="h-12" />
        {/each}
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="space-y-4">
      <Skeleton width="w-full" height="h-12" />

      <!-- Trust Signals -->
      <div class="space-y-2">
        {#each Array(3) as _}
          <div class="flex items-center space-x-2">
            <Skeleton width="w-4" height="h-4" rounded="rounded-full" />
            <Skeleton width="w-32" height="h-4" />
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>