<script lang="ts">
	import { Bell, ChevronDown } from 'lucide-svelte';
	import { page } from '$app/stores';
	import UserMenu from './UserMenu.svelte';
	import logoPng from '$lib/assets/logo.png';

	export let user: any;

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
			<!-- Left section: Logo and Navigation -->
			<div class="flex items-center space-x-8">
				<!-- Brand text only -->
				<a href="/" class="flex items-center">
					<span
						class="text-3xl font-extrabold bg-gradient-to-r bg-clip-text text-transparent"
						style="background-image: linear-gradient(45deg, #4FC3F7, #F06292);"
					>
						SubSlush
					</span>
				</a>

				<!-- Navigation Links with modern styling -->
				<div class="hidden md:flex space-x-2">
					{#each navItems as item}
						<a
							href={item.href}
							class="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
							class:text-white={currentPath === item.href}
							class:text-gray-700={currentPath !== item.href}
							class:hover:bg-gray-100={currentPath !== item.href}
							style={currentPath === item.href ? 'background-color: #4FC3F7;' : ''}
						>
							{item.label}

						</a>
					{/each}
				</div>
			</div>

			<!-- Right section: Notifications and User Menu -->
			<div class="flex items-center space-x-4">
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

