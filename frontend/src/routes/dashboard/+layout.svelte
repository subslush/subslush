<script lang="ts">
	import { auth } from '$lib/stores/auth.js';
	import { onMount } from 'svelte';
	import { subscriptionService } from '$lib/api/subscriptions.js';
	import TopNav from '$lib/components/navigation/TopNav.svelte';

	export let data; // Data from +layout.server.ts

	let userBalance = data.userBalance || 0;

	// Initialize auth store with server data
	onMount(async () => {
		if (data.user) {
			auth.init(data.user);

			// Load user balance
			try {
				const balanceResponse = await subscriptionService.getCreditBalance(data.user.id);
				userBalance = balanceResponse.balance;
			} catch (err) {
				console.warn('Could not load user credit balance:', err);
			}
		}
	});
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

