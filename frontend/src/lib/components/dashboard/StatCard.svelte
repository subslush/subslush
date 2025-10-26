<script lang="ts">
	import type { ComponentType } from 'svelte';

	export let title: string;
	export let value: string | number;
	export let subtitle: string;
	export let icon: ComponentType;
	export let iconColor: string = 'bg-cyan-50';
	export let iconTextColor: string = 'text-cyan-600';
	export let valueColor: string = 'text-gray-900';
</script>

<!-- Card content -->
<div class="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
	<div class="flex items-center mb-4">
		<div class="p-3 {iconColor} rounded-lg">
			<svelte:component this={icon} size={24} class={iconTextColor} />
		</div>
		<div class="ml-4">
			<p class="text-sm font-medium text-gray-600">{title}</p>
			<p class="text-3xl font-bold {valueColor}">{value}</p>
		</div>
	</div>
	<p class="text-sm text-gray-500">{subtitle}</p>
</div>