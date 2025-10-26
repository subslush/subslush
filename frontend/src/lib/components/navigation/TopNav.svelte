<script lang="ts">
	import { Bell, ChevronDown, CreditCard, Plus } from 'lucide-svelte';
	import { page } from '$app/stores';
	import UserMenu from './UserMenu.svelte';
	import logoPng from '$lib/assets/logo.png';

	export let user: any;
	export let userBalance = 0;

	const navItems = [
		{ label: 'Browse Subscriptions', href: '/dashboard/subscriptions' },
		{ label: 'Dashboard', href: '/dashboard' },
		{ label: 'My Subscriptions', href: '/dashboard/subscriptions/active' }
	];

	$: currentPath = $page.url.pathname;
</script>

<nav class="sticky top-0 z-50 h-16 bg-white border-b border-gray-200">
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
		<div class="flex items-center justify-between h-16">

			<!-- LEFT: SubSlush Text Branding -->
			<a href="/" class="flex items-center">
				<span
					class="text-2xl font-extrabold bg-gradient-to-r bg-clip-text text-transparent"
					style="background-image: linear-gradient(45deg, #4FC3F7, #F06292);"
				>
					SubSlush
				</span>
			</a>

			<!-- Trust Signals -->
			<div class="hidden lg:flex items-center space-x-4 ml-6 border-l border-gray-200 pl-6">
				<div class="flex items-center space-x-2 text-xs text-gray-600">
					<svg class="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/>
					</svg>
					<span class="font-medium">256-bit Encrypted</span>
				</div>
				<div class="flex items-center space-x-2 text-xs text-gray-600">
					<svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
					</svg>
					<span class="font-medium">99.9% Uptime</span>
				</div>
				<div class="flex items-center space-x-2 text-xs text-gray-600">
					<svg class="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
						<path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/>
					</svg>
					<span class="font-medium">2,847+ Users</span>
				</div>
			</div>

			<!-- CENTER: Navigation Links -->
			<div class="hidden md:flex items-center space-x-1">
				{#each navItems as item}
					<a
						href={item.href}
						class="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
						class:text-white={currentPath === item.href}
						class:text-gray-700={currentPath !== item.href}
						class:hover:bg-gray-100={currentPath !== item.href}
						style={currentPath === item.href ? 'background-color: #4FC3F7;' : ''}
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
						class="inline-flex items-center text-white text-xs font-medium px-3 py-1.5 rounded-md transition-all hover:shadow-lg relative overflow-hidden group"
					>
						<!-- Orange Background -->
						<span class="absolute inset-0 bg-orange-500"></span>

						<!-- Hover Effect Layer -->
						<span class="absolute inset-0 bg-orange-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></span>

						<!-- Button Content -->
						<span class="relative z-10 flex items-center">
							<Plus size={14} class="mr-1" />
							Top Up
						</span>
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
						class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
						class:text-white={currentPath === item.href}
						class:text-gray-700={currentPath !== item.href}
						class:hover:bg-gray-50={currentPath !== item.href}
						style={currentPath === item.href ? 'background-color: #4FC3F7;' : ''}
					>
						{item.label}
					</a>
				{/each}
			</div>
		</div>
	</div>
</nav>

