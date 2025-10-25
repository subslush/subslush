<script lang="ts">
  import Skeleton from '$lib/components/ui/Skeleton.svelte';
</script>

<div class="bg-white border border-gray-200 rounded-lg p-6 animate-in slide-in-from-bottom-4 duration-300">
  <!-- Service Logo and Name -->
  <div class="flex items-start justify-between mb-6">
    <div class="flex items-center space-x-4">
      <Skeleton width="w-16" height="h-16" rounded="rounded-lg" />
      <div class="space-y-2">
        <Skeleton width="w-32" height="h-8" />
        <Skeleton width="w-24" height="h-6" />
      </div>
    </div>
  </div>

  <!-- Badges -->
  <div class="flex flex-wrap gap-2 mb-4">
    <Skeleton width="w-16" height="h-6" rounded="rounded-full" />
    <Skeleton width="w-20" height="h-6" rounded="rounded-full" />
    <Skeleton width="w-18" height="h-6" rounded="rounded-full" />
  </div>

  <!-- Rating and Reviews -->
  <div class="flex items-center space-x-4 mb-4">
    <div class="flex items-center space-x-1">
      <Skeleton width="w-20" height="h-5" />
      <Skeleton width="w-8" height="h-6" />
      <Skeleton width="w-24" height="h-5" />
    </div>
  </div>

  <!-- Description -->
  <div class="space-y-4">
    <Skeleton width="w-full" height="h-4" />
    <Skeleton width="w-4/5" height="h-4" />
    <Skeleton width="w-3/4" height="h-4" />
  </div>
</div>