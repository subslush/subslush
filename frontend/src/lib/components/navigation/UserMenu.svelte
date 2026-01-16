<script lang="ts">
	import { Receipt, Settings, LogOut, ChevronDown, User, Calendar } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import { auth } from '$lib/stores/auth.js';
	import { scale } from 'svelte/transition';
	import type { User as AuthUser } from '$lib/types/auth.js';

	export let user: AuthUser | null = null;
	export let variant: 'light' | 'dark' = 'light';

	let isOpen = false;
	let menuRef: HTMLDivElement | null = null;
	let triggerRef: HTMLButtonElement | null = null;

	const handleDocumentClick = (event: MouseEvent) => {
		const target = event.target as Node;
		const clickedMenu = menuRef?.contains(target) || triggerRef?.contains(target);
		if (!clickedMenu) {
			isOpen = false;
		}
	};

	const handleLogout = async () => {
		await auth.logout();
		isOpen = false;
	};

	const closeMenu = () => {
		isOpen = false;
	};

	const buttonBase =
		'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors';
	$: buttonClass =
		variant === 'dark'
			? `${buttonBase} border-white/30 text-white hover:bg-white/10`
			: `${buttonBase} border-gray-200 text-gray-700 hover:bg-gray-50`;
	$: chevronClass = variant === 'dark' ? 'text-white/70' : 'text-gray-500';
	$: iconClass = variant === 'dark' ? 'text-white' : 'text-gray-600';

	onMount(() => {
		document.addEventListener('click', handleDocumentClick);
		return () => {
			document.removeEventListener('click', handleDocumentClick);
		};
	});
</script>

<div class="relative">
	<button
		on:click={() => isOpen = !isOpen}
		class={buttonClass}
		aria-label="User menu"
		bind:this={triggerRef}
	>
		<User size={18} class={iconClass} />
		<ChevronDown
			size={16}
			class={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''} ${chevronClass}`}
		/>
	</button>

	{#if isOpen}
		<div
			transition:scale={{ duration: 200, start: 0.95 }}
			class="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50"
			bind:this={menuRef}
		>
			<!-- User Info Header -->
			<div class="px-4 py-3 border-b border-gray-100">
				<p class="text-sm font-semibold text-gray-900">
					{user?.displayName
						? user.displayName
						: user?.firstName
							? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`
							: user?.email?.split('@')[0] || 'User'}
				</p>
				<p class="text-xs text-gray-500 truncate">{user?.email || ''}</p>
			</div>

			<!-- Menu Items -->
			<a
				href="/dashboard/subscriptions"
				data-sveltekit-preload-data="hover"
				class="flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors group"
				on:click={closeMenu}
			>
				<div class="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 group-hover:bg-cyan-50 mr-3">
					<Calendar size={16} class="text-gray-600 group-hover:text-cyan-600" />
				</div>
				<span class="font-medium">My subscriptions</span>
			</a>

			<a
				href="/dashboard/orders"
				data-sveltekit-preload-data="hover"
				class="flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors group"
				on:click={closeMenu}
			>
				<div class="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 group-hover:bg-cyan-50 mr-3">
					<Receipt size={16} class="text-gray-600 group-hover:text-cyan-600" />
				</div>
				<span class="font-medium">Order history</span>
			</a>

			<a
				href="/dashboard/settings"
				data-sveltekit-preload-data="hover"
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
