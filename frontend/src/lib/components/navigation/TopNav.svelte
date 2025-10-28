<script lang="ts">
	import { Bell, ChevronDown, CreditCard, Plus } from 'lucide-svelte';
	import { page } from '$app/stores';
	import UserMenu from './UserMenu.svelte';
	import logoPng from '$lib/assets/logo.png';

	export let user: any;
	export let userBalance = 0;

	const navItems = [
		{ label: 'Dashboard', href: '/dashboard' },
		{ label: 'Browse Subscriptions', href: '/dashboard/browse' },
		{ label: 'My Subscriptions', href: '/dashboard/subscriptions/active' }
	];

	$: currentPath = $page.url.pathname;

	// Intelligent route matching function that handles navigation hierarchy properly
	function isActivePath(itemHref: string, currentPath: string): boolean {
		// Exact match for dashboard root
		if (itemHref === '/dashboard') {
			return currentPath === '/dashboard';
		}

		// Match for Browse Subscriptions (includes all browse routes)
		if (itemHref === '/dashboard/browse') {
			return currentPath.startsWith('/dashboard/browse');
		}

		// Exact match for My Subscriptions (specific child route)
		if (itemHref === '/dashboard/subscriptions/active') {
			return currentPath === '/dashboard/subscriptions/active';
		}

		// Fallback to exact match for any other routes
		return currentPath === itemHref;
	}

	// Proper reactive function that generates CSS classes based on current path
	$: getNavClass = (itemHref: string) => {
		const isActive = isActivePath(itemHref, currentPath);
		return isActive
			? 'bg-gradient-to-br from-cyan-500/5 to-pink-500/5 border border-cyan-200 text-gray-900'
			: 'text-gray-600 hover:bg-gray-100';
	};

	// Mobile navigation class function
	$: getMobileNavClass = (itemHref: string) => {
		const isActive = isActivePath(itemHref, currentPath);
		return isActive
			? 'bg-gradient-to-br from-cyan-500/5 to-pink-500/5 border border-cyan-200 text-gray-900'
			: 'text-gray-600 hover:bg-gray-50';
	};
</script>

<nav class="sticky top-0 z-50 h-16 bg-white border-b border-gray-200">
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
		<div class="flex items-center justify-between h-16">

			<!-- LEFT: SubSlush Text Branding -->
			<a href="/" class="flex items-center">
				<span class="text-2xl font-extrabold bg-gradient-to-r from-cyan-500 to-pink-500 bg-clip-text text-transparent">
					SubSlush
				</span>
			</a>


			<!-- CENTER: Navigation Links -->
			<div class="hidden md:flex items-center space-x-1">
				{#each navItems as item}
					<a
						href={item.href}
						class="px-4 py-2 text-sm font-medium rounded-lg transition-colors {getNavClass(item.href)}"
					>
						{item.label}
					</a>
				{/each}
			</div>

			<!-- Right section: Balance, Notifications and User Menu -->
			<div class="flex items-center space-x-4">
				<!-- Balance Display with Add Credits -->
				<div class="hidden md:flex items-center space-x-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
					<div class="flex items-center space-x-2">
						<CreditCard size={16} class="text-gray-600" />
						<span class="text-sm font-medium text-gray-700">{userBalance}</span>
						<span class="text-xs text-gray-500">credits</span>
					</div>
					<a
						href="/dashboard/credits"
						class="bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 text-white font-semibold py-2 px-4 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 inline-flex items-center text-xs"
					>
						<Plus size={14} class="mr-1" />
						Top Up
					</a>
				</div>

				<!-- Notifications with animated badge -->
				<button
					class="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
					aria-label="Notifications"
				>
					<Bell size={20} />

					<!-- Notification badge -->
					<span class="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
						2
					</span>
				</button>

				<!-- User Menu -->
				<UserMenu {user} />
			</div>
		</div>

		<!-- Mobile Navigation Menu -->
		<div class="md:hidden border-t border-gray-200 pt-2 pb-2 bg-white">
			<div class="flex flex-col space-y-1">
				{#each navItems as item}
					<a
						href={item.href}
						class="px-4 py-3 rounded-lg text-sm font-medium transition-colors {getMobileNavClass(item.href)}"
					>
						{item.label}
					</a>
				{/each}
			</div>
		</div>
	</div>
</nav>

