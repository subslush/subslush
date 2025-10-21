<script lang="ts">
	import type { ComponentType } from 'svelte';

	export let title: string;
	export let value: string | number;
	export let subtitle: string;
	export let icon: ComponentType;
	export let iconColor: string = 'bg-blue-500';
	export let valueColor: string = 'text-gray-900';

</script>

<!-- Card content -->
<div class="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-lg transition-shadow duration-300">
	<div class="flex items-start justify-between">
		<div class="flex-1">
			<p class="text-sm font-medium text-gray-500 mb-2">{title}</p>
			<p class="text-2xl font-bold {valueColor} mb-1">{value}</p>
			<p class="text-xs text-gray-500">{subtitle}</p>
		</div>

		<!-- Icon with solid background -->
		<div class="w-10 h-10 {iconColor} rounded-lg flex items-center justify-center text-white">
			<svelte:component this={icon} size={20} />
		</div>
	</div>
</div>