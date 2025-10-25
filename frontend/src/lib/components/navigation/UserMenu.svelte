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
		class="flex items-center space-x-2 p-2 rounded-xl hover:bg-gradient-to-br hover:from-gray-100 hover:to-gray-50 transition-all duration-300 group"
		aria-label="User menu"
	>
		<!-- Avatar with gradient border and glow effect -->
		<div class="relative">
			<div class="absolute inset-0 bg-gradient-to-r from-subslush-blue to-subslush-pink rounded-full blur-md opacity-60 group-hover:opacity-100 transition-opacity duration-300"></div>
			<div class="relative w-10 h-10 bg-gradient-to-r from-subslush-blue to-subslush-pink rounded-full flex items-center justify-center text-white text-sm font-bold shadow-lg">
				{userInitials}
			</div>
		</div>
		<ChevronDown
			size={16}
			class="text-gray-500 transition-all duration-300 {isOpen ? 'rotate-180 text-subslush-blue' : ''}"
		/>
	</button>

	{#if isOpen}
		<div
			transition:scale={{ duration: 200, start: 0.95 }}
			class="absolute right-0 mt-2 w-64 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-200/50 py-2 z-50 overflow-hidden"
		>
			<!-- User Info Header with gradient background -->
			<div class="px-4 py-3 bg-gradient-to-r from-subslush-blue/10 to-subslush-pink/10 border-b border-gray-100">
				<p class="text-sm font-semibold text-gray-900">
					{user?.firstName && user?.lastName
						? `${user.firstName} ${user.lastName}`
						: user?.email?.split('@')[0] || 'User'}
				</p>
				<p class="text-xs text-gray-500 truncate">{user?.email || ''}</p>
			</div>

			<!-- Menu Items with hover effects -->
			<a
				href="/profile"
				class="flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-subslush-blue/10 hover:to-transparent transition-all duration-200 group"
				on:click={closeMenu}
			>
				<div class="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 group-hover:bg-subslush-blue group-hover:text-white transition-all duration-200 mr-3">
					<User size={16} />
				</div>
				<span class="font-medium">Profile</span>
			</a>

			<a
				href="/dashboard/settings"
				class="flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-gradient-to-r hover:from-subslush-purple/10 hover:to-transparent transition-all duration-200 group"
				on:click={closeMenu}
			>
				<div class="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 group-hover:bg-subslush-purple group-hover:text-white transition-all duration-200 mr-3">
					<Settings size={16} />
				</div>
				<span class="font-medium">Settings</span>
			</a>

			<hr class="my-2 border-gray-100" />

			<button
				on:click={handleLogout}
				class="flex items-center w-full px-4 py-3 text-sm text-red-600 hover:bg-gradient-to-r hover:from-red-50 hover:to-transparent transition-all duration-200 group"
			>
				<div class="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 group-hover:bg-red-500 group-hover:text-white transition-all duration-200 mr-3">
					<LogOut size={16} />
				</div>
				<span class="font-medium">Logout</span>
			</button>
		</div>
	{/if}
</div>