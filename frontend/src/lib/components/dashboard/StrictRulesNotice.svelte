<script lang="ts">
	export let text: string;
	export let version: number | null | undefined = null;
</script>

<div
	data-testid="strict-rules-text"
	class="mt-3 max-h-72 overflow-auto whitespace-pre-line rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700"
>
	{text}
</div>
{#if version}
	<p class="mt-2 text-xs text-gray-500">Rules version {version}</p>
{/if}
