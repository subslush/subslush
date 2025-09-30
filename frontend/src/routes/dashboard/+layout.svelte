<script lang="ts">
	import { LayoutDashboard, CreditCard, User, Settings, LogOut } from 'lucide-svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { auth } from '$lib/stores/auth.js';

	const sidebarItems = [
		{ icon: LayoutDashboard, label: 'Overview', href: '/dashboard' },
		{ icon: CreditCard, label: 'Subscriptions', href: '/dashboard/subscriptions' },
		{ icon: User, label: 'Profile', href: '/profile' },
		{ icon: Settings, label: 'Settings', href: '/dashboard/settings' }
	];

	const handleLogout = async () => {
		try {
			console.log('🚪 [LOGOUT] Starting logout process...');

			// Use the auth store logout method (preferred - already has proper endpoint)
			await auth.logout();

			console.log('✅ [LOGOUT] Logout successful, redirecting to home...');
			goto('/');
		} catch (error) {
			console.error('❌ [LOGOUT] Logout error:', error);

			// Force local logout even if API call fails
			console.log('🚪 [LOGOUT] Forcing local logout and clearing storage...');

			// Clear all auth-related storage
			if (typeof window !== 'undefined') {
				localStorage.removeItem('auth_user');
				localStorage.removeItem('auth_token');
				localStorage.removeItem('auth_refresh_token');
				sessionStorage.clear();
			}

			// Redirect to login page
			goto('/auth/login');
		}
	};
</script>

<div class="dashboard-layout grid grid-cols-1 lg:grid-cols-[250px_1fr] h-full">
	<!-- Sidebar -->
	<aside class="bg-surface-100-800-token border-r border-surface-300-600-token">
		<div class="p-4">
			<h2 class="text-lg font-semibold mb-6">Dashboard</h2>

			<nav class="space-y-2">
				{#each sidebarItems as item}
					<a
						href={item.href}
						class="flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors"
						class:bg-primary-100-800-token={$page.url.pathname === item.href}
						class:text-primary-600={$page.url.pathname === item.href}
						class:hover:bg-surface-200-700-token={$page.url.pathname !== item.href}
					>
						<svelte:component this={item.icon} size={18} />
						<span>{item.label}</span>
					</a>
				{/each}

				<button
					on:click={handleLogout}
					class="flex items-center space-x-3 px-3 py-2 rounded-lg text-sm w-full text-left hover:bg-surface-200-700-token transition-colors text-error-600"
				>
					<LogOut size={18} />
					<span>Logout</span>
				</button>
			</nav>
		</div>
	</aside>

	<!-- Main Content -->
	<main class="overflow-y-auto">
		<div class="p-6">
			<slot />
		</div>
	</main>
</div>

<style>
	.dashboard-layout {
		height: calc(100vh - 180px); /* Adjust based on header/footer height */
	}
</style>