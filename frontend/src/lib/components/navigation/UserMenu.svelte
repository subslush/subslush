<script lang="ts">
	import { User, Settings, LogOut, ChevronDown } from 'lucide-svelte';
	import { auth } from '$lib/stores/auth.js';
	import { fade, scale } from 'svelte/transition';

	export let user: any;

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
		class="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 transition-colors"
		aria-label="User menu"
	>
		<!-- Avatar with brand gradient -->
		<div class="w-10 h-10 bg-gradient-to-r from-cyan-500 to-pink-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
			{userInitials}
		</div>
		<ChevronDown
			size={16}
			class="text-gray-500 transition-transform duration-200 {isOpen ? 'rotate-180' : ''}"
		/>
	</button>

	{#if isOpen}
		<div
			transition:scale={{ duration: 200, start: 0.95 }}
			class="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50"
		>
			<!-- User Info Header -->
			<div class="px-4 py-3 border-b border-gray-100">
				<p class="text-sm font-semibold text-gray-900">
					{user?.firstName && user?.lastName
						? `${user.firstName} ${user.lastName}`
						: user?.email?.split('@')[0] || 'User'}
				</p>
				<p class="text-xs text-gray-500 truncate">{user?.email || ''}</p>
			</div>

			<!-- Menu Items -->
			<a
				href="/profile"
				class="flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors group"
				on:click={closeMenu}
			>
				<div class="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 group-hover:bg-cyan-50 mr-3">
					<User size={16} class="text-gray-600 group-hover:text-cyan-600" />
				</div>
				<span class="font-medium">Profile</span>
			</a>

			<a
				href="/dashboard/settings"
				class="flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors group"
				on:click={closeMenu}
			>
				<div class="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 group-hover:bg-cyan-50 mr-3">
					<Settings size={16} class="text-gray-600 group-hover:text-cyan-600" />
				</div>
				<span class="font-medium">Settings</span>
			</a>

			<hr class="my-2 border-gray-100" />

			<button
				on:click={handleLogout}
				class="flex items-center w-full px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors group"
			>
				<div class="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 group-hover:bg-red-100 mr-3">
					<LogOut size={16} class="text-red-600" />
				</div>
				<span class="font-medium">Logout</span>
			</button>
		</div>
	{/if}
</div>