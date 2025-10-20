<script lang="ts">
	import { User, Settings, LogOut, ChevronDown } from 'lucide-svelte';
	import { auth } from '$lib/stores/auth.js';
	import { createEventDispatcher } from 'svelte';
	// import { clickOutside } from '@skeletonlabs/skeleton';

	export let user: any;

	const dispatch = createEventDispatcher();
	let isOpen = false;

	const handleLogout = async () => {
		await auth.logout();
		isOpen = false;
	};

	const closeMenu = () => {
		isOpen = false;
	};

	$: userInitials = user?.firstName && user?.lastName
		? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
		: user?.email?.charAt(0).toUpperCase() || 'U';
</script>

<div class="relative">
	<button
		on:click={() => isOpen = !isOpen}
		class="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 transition-colors duration-200"
		aria-label="User menu"
	>
		<div class="w-8 h-8 bg-gradient-to-r from-subslush-blue to-subslush-pink rounded-full flex items-center justify-center text-white text-sm font-semibold">
			{userInitials}
		</div>
		<ChevronDown size={16} class="text-gray-500 transition-transform duration-200 {isOpen ? 'rotate-180' : ''}" />
	</button>

	{#if isOpen}
		<div
			class="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50"
		>
			<div class="px-4 py-2 border-b border-gray-100">
				<p class="text-sm font-medium text-gray-900">
					{user?.firstName && user?.lastName
						? `${user.firstName} ${user.lastName}`
						: user?.email?.split('@')[0] || 'User'}
				</p>
				<p class="text-xs text-gray-500">{user?.email || ''}</p>
			</div>

			<a
				href="/profile"
				class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
				on:click={closeMenu}
			>
				<User size={16} class="mr-3" />
				Profile
			</a>

			<a
				href="/dashboard/settings"
				class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
				on:click={closeMenu}
			>
				<Settings size={16} class="mr-3" />
				Settings
			</a>

			<hr class="my-1" />

			<button
				on:click={handleLogout}
				class="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
			>
				<LogOut size={16} class="mr-3" />
				Logout
			</button>
		</div>
	{/if}
</div>