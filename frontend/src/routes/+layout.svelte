<script lang="ts">
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { onMount } from 'svelte';
	import { auth } from '$lib/stores/auth';
	import { page } from '$app/stores';
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

	// Check if we're on a dashboard route
	$: isDashboardRoute = $page.url.pathname.startsWith('/dashboard');

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
	<slot />
</QueryClientProvider>