<script lang="ts">
  import type { AdminStatusTone } from '$lib/types/admin.js';

  export let label: string;
  export let tone: AdminStatusTone = 'neutral';
  export let size: 'sm' | 'md' = 'sm';

  const toneClasses: Record<AdminStatusTone, string> = {
    neutral: 'border-gray-200 bg-gray-100 text-gray-700',
    success: 'border-green-200 bg-green-100 text-green-700',
    warning: 'border-amber-200 bg-amber-100 text-amber-700',
    danger: 'border-red-200 bg-red-100 text-red-700',
    info: 'border-blue-200 bg-blue-100 text-blue-700'
  };

  $: toneClass = toneClasses[tone] || toneClasses.neutral;
  $: sizeClass = size === 'md' ? 'text-sm px-3 py-1' : 'text-xs px-2 py-0.5';
</script>

<span class="inline-flex items-center rounded-full border font-semibold uppercase tracking-wide {toneClass} {sizeClass}">
  {label}
</span>
