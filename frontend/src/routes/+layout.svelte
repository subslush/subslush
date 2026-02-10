<script lang="ts">
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { afterUpdate, onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import { base } from '$app/paths';
	import { auth } from '$lib/stores/auth';
	import { credits } from '$lib/stores/credits';
	import { initializeCurrency } from '$lib/stores/currency';
	import { page } from '$app/stores';
	import PromoBanner from '$lib/components/PromoBanner.svelte';
	import faviconIco from '$lib/assets/favicon.ico';
	import iconSvg from '$lib/assets/icon0.svg';
	import iconPng from '$lib/assets/icon1.png';
	import appleIcon from '$lib/assets/apple-icon.png';
	import manifest192 from '$lib/assets/web-app-manifest-192x192.png';
	import manifest512 from '$lib/assets/web-app-manifest-512x512.png';
	import { initConsentSideEffects } from '$lib/consent/thirdParty.js';
	import { identifyTikTokUser, trackPageView } from '$lib/utils/analytics.js';
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

	$: if (browser) {
		void identifyTikTokUser($auth.user);
	}

	const promoBannerExclusions = ['/auth', '/admin', '/terms', '/privacy', '/returns'];
	$: showPromoBanner = !promoBannerExclusions.some(prefix =>
		$page.url.pathname === prefix || $page.url.pathname.startsWith(`${prefix}/`)
	);

	const updateBannerOffset = () => {
		if (!browser) return;
		const bannerEl = document.getElementById('promo-banner');
		const height = bannerEl?.offsetHeight ?? 0;
		document.documentElement.style.setProperty('--promo-banner-height', `${height}px`);
	};

	let lastTrackedPath = '';

	afterNavigate(({ to }) => {
		if (!to?.url) return;
		const path = `${to.url.pathname}${to.url.search}${to.url.hash}`;
		if (path === lastTrackedPath) return;
		lastTrackedPath = path;
		void identifyTikTokUser($auth.user);
		trackPageView(path);
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

	$: if (data.currency !== undefined) {
		initializeCurrency(data.currency);
	}

	$: if (data.user !== undefined) {
		credits.init(data.user?.id || null);
	}

	onMount(() => {
		initConsentSideEffects();
		updateBannerOffset();
		window.addEventListener('resize', updateBannerOffset);
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

		return () => {
			window.removeEventListener('resize', updateBannerOffset);
		};
	});

	afterUpdate(() => {
		updateBannerOffset();
	});

	const manifestHref = `${base}/manifest.webmanifest`;
</script>

<svelte:head>
	<link rel="icon" href={faviconIco} type="image/x-icon" sizes="any" />
	<link rel="icon" href={iconSvg} type="image/svg+xml" />
	<link rel="icon" href={iconPng} type="image/png" sizes="96x96" />
	<link rel="apple-touch-icon" href={appleIcon} sizes="180x180" />
	<link rel="icon" href={manifest192} type="image/png" sizes="192x192" />
	<link rel="icon" href={manifest512} type="image/png" sizes="512x512" />
	<link rel="manifest" href={manifestHref} />
	<meta name="theme-color" content="#0F172A" />
	<meta name="application-name" content="SubSlush" />
	<meta name="apple-mobile-web-app-title" content="SubSlush" />
</svelte:head>

<QueryClientProvider client={queryClient}>
	{#if showPromoBanner}
		<PromoBanner />
	{/if}
	<slot />
</QueryClientProvider>
