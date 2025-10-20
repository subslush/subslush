<script lang="ts">
	import type { ComponentType } from 'svelte';

	export let title: string;
	export let value: string | number;
	export let subtitle: string;
	export let icon: ComponentType;
	export let iconColor: string = 'bg-blue-500';
	export let valueColor: string = 'text-gray-900';
</script>

<div class="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow duration-200">
	<div class="flex items-center justify-between">
		<div class="flex-1">
			<p class="text-sm font-medium text-gray-500 mb-1">{title}</p>
			<p class="text-3xl font-bold {valueColor} mb-1">{value}</p>
			<p class="text-xs text-gray-500">{subtitle}</p>
		</div>
		<div class="w-12 h-12 {iconColor} rounded-full flex items-center justify-center text-white">
			<svelte:component this={icon} size={24} />
		</div>
	</div>
</div>