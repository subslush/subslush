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

<div class="dashboard-shell bg-gradient-to-br from-gray-50 via-blue-50/30 to-pink-50/30 relative">
	<!-- Animated background blobs for visual interest -->
	<div class="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-subslush-blue/20 to-transparent rounded-full blur-3xl animate-blob"></div>
	<div class="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-subslush-pink/20 to-transparent rounded-full blur-3xl animate-blob animation-delay-2000"></div>
	<div class="absolute top-1/2 left-1/2 w-96 h-96 bg-gradient-to-br from-subslush-purple/10 to-transparent rounded-full blur-3xl animate-blob animation-delay-4000"></div>

	<!-- Top Navigation -->
	<TopNav user={data.user} />

	<!-- Main Content with glass effect -->
	<main class="dashboard-content">
		<div class="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
			<slot />
		</div>
	</main>
</div>

<style>
	@keyframes blob {
		0%, 100% {
			transform: translate(0, 0) scale(1);
		}
		33% {
			transform: translate(30px, -50px) scale(1.1);
		}
		66% {
			transform: translate(-20px, 20px) scale(0.9);
		}
	}

	.animate-blob {
		animation: blob 20s infinite ease-in-out;
	}

	.animation-delay-2000 {
		animation-delay: 2s;
	}

	.animation-delay-4000 {
		animation-delay: 4s;
	}
</style>

