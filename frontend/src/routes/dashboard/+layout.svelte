<script lang="ts">
	import { auth } from '$lib/stores/auth.js';
	import { onMount } from 'svelte';
	import TopNav from '$lib/components/navigation/TopNav.svelte';

	export let data; // Data from +layout.server.ts

	// Initialize auth store with server data
	onMount(() => {
		if (data.user) {
			auth.init(data.user);
		}
	});
</script>

<div class="min-h-screen bg-gray-50">
	<!-- Top Navigation -->
	<TopNav user={data.user} />

	<!-- Main Content -->
	<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		<slot />
	</main>
</div>

