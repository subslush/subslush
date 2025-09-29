<script lang="ts">
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { onMount } from 'svelte';
	import '../app.css';

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: 1,
				refetchOnWindowFocus: false
			}
		}
	});

	onMount(() => {
		document.body.setAttribute('data-theme', 'skeleton');
	});
</script>

<QueryClientProvider client={queryClient}>
	<div class="app-shell">
		<header class="app-bar">
			<div class="container mx-auto px-4 py-4">
				<nav class="flex items-center justify-between">
					<a href="/" class="text-xl font-bold text-primary-600">Subscription Platform</a>
					<div class="flex items-center space-x-4">
						<a href="/dashboard" class="btn btn-sm variant-ghost-surface">Dashboard</a>
						<a href="/profile" class="btn btn-sm variant-ghost-surface">Profile</a>
						<a href="/auth/login" class="btn btn-sm variant-filled-primary">Login</a>
					</div>
				</nav>
			</div>
		</header>

		<main class="page-container">
			<slot />
		</main>

		<footer class="bg-surface-100-800-token border-t border-surface-300-600-token p-4">
			<div class="container mx-auto text-center text-sm text-surface-600-300-token">
				© 2024 Subscription Platform. All rights reserved.
			</div>
		</footer>
	</div>
</QueryClientProvider>