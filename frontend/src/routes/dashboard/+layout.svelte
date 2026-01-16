<script lang="ts">
	import { auth } from '$lib/stores/auth.js';
	import { onMount } from 'svelte';
	import { credits } from '$lib/stores/credits.js';
	import TopNav from '$lib/components/navigation/TopNav.svelte';
	import type { LayoutData } from './$types';

	export let data: LayoutData & { userBalance?: number };

	let initialBalance = data.userBalance || 0;
	let userBalance = initialBalance;

	// Initialize auth store with server data
	onMount(async () => {
		if (data.user) {
			auth.init(data.user);
		}
	});

	$: userBalance = $credits.balance ?? initialBalance;
</script>

<div class="dashboard-shell bg-gray-50 relative">

	<!-- Top Navigation -->
	<TopNav user={data.user} {userBalance} />

	<!-- Main Content -->
	<main class="dashboard-content">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
			<slot />
		</div>
	</main>
</div>
