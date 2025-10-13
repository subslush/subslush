<script lang="ts">
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { onMount } from 'svelte';
	import { auth } from '$lib/stores/auth';
	import type { LayoutData } from './$types';
	import '../app.css';

	export let data: LayoutData;

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				retry: 1,
				refetchOnWindowFocus: false
			}
		}
	});

	// Hydrate auth store with server data immediately when data changes (SSR + CSR)
	// CRITICAL: Only hydrate if server data has complete firstName/lastName or if user is null
	$: {
		if (data.user !== undefined) {
			// Always prioritize server data since it has complete profile
			console.log('🔐 [LAYOUT] Hydrating auth store with complete server user:', data.user?.email || 'null');
			console.log('🔐 [LAYOUT] Server user firstName:', data.user?.firstName);
			console.log('🔐 [LAYOUT] Server user lastName:', data.user?.lastName);
			auth.setUser(data.user);
		}
	}

	onMount(() => {
		document.body.setAttribute('data-theme', 'skeleton');

		console.log('🔐 [LAYOUT] Component mounted');
		console.log('🔐 [LAYOUT] Current auth state:', {
			isAuthenticated: $auth.isAuthenticated,
			userEmail: $auth.user?.email,
		});

		// CRITICAL: Always force complete user data refresh from server data
		// This prevents cached/stale user data from being displayed
		if (data.user) {
			console.log('🔐 [LAYOUT] FORCING complete user data refresh with server data');
			console.log('🔐 [LAYOUT] Server user data:', JSON.stringify(data.user, null, 2));
			auth.setUser(data.user);
		}
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