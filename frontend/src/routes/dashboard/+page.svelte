<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { derived } from 'svelte/store';
  import { CreditCard, Users, TrendingUp, Activity, ShoppingBag, Settings, User2, Calendar, Loader2 } from 'lucide-svelte';
  import { user, isAuthenticated } from '$lib/stores/auth.js';
  import { formatName, formatRelativeTime } from '$lib/utils/formatters.js';
  import { apiClient } from '$lib/api';
  import { browser } from '$app/environment';

  // Get user data reactively
  $: userId = $user?.id;
  $: userName = (() => {
    if (!$user) return 'User';

    console.log('🔍 [USERNAME DEBUG] User data:', { firstName: $user.firstName, lastName: $user.lastName });

    // Try direct User properties first
    const firstName = $user.firstName;
    const lastName = $user.lastName;

    console.log('🔍 [USERNAME DEBUG] Extracted names:', { firstName, lastName });

    const fullName = formatName(firstName, lastName);
    if (fullName) {
      console.log('🔍 [USERNAME DEBUG] Using full name:', fullName);
      return fullName;
    }

    // Fallback to email username
    const emailUsername = $user.email?.split('@')[0] || 'User';
    console.log('🔍 [USERNAME DEBUG] Falling back to email:', emailUsername);
    return emailUsername;
  })();
  $: userEmail = $user?.email || '';
  $: accountCreated = $user?.createdAt ? new Date($user.createdAt) : null;
  $: lastLogin = $user?.lastLoginAt ? new Date($user.lastLoginAt) : null;

  // Create derived store for query enablement
  const shouldFetchBalance = derived(
    [user, isAuthenticated],
    ([$user, $isAuthenticated]) => {
      const enabled = !!$user?.id && $isAuthenticated;
      console.log('🔍 [BALANCE QUERY] Enablement check:', {
        userId: $user?.id,
        isAuthenticated: $isAuthenticated,
        enabled
      });
      return enabled;
    }
  );

  // Credit Balance Query - now properly reactive
  const balanceQuery = createQuery({
    queryKey: ['creditBalance', userId],
    queryFn: async () => {
      const currentUserId = $user?.id;
      if (!currentUserId) {
        console.error('🏦 [DASHBOARD] No user ID available for balance fetch');
        throw new Error('User ID not available');
      }

      console.log('🏦 [DASHBOARD] Fetching credit balance for user:', currentUserId);
      try {
        const response = await apiClient.get(`/credits/balance/${currentUserId}`);
        console.log('🏦 [DASHBOARD] Credit balance response:', response.data);
        return response.data;
      } catch (error) {
        console.error('🏦 [DASHBOARD] Credit balance fetch error:', error);
        throw error;
      }
    },
    enabled: $shouldFetchBalance,  // ✓ Now reactive!
    staleTime: 30000,
    retry: 2,
    retryDelay: 1000
  });

  // Debug logging
  $: {
    if (browser) {
      console.log('🔍 [DASHBOARD DEBUG] ===== Credit Balance Query Debug =====');
      console.log('User ID:', userId);
      console.log('Is Authenticated:', $isAuthenticated);
      console.log('Should Fetch:', $shouldFetchBalance);
      console.log('Query Status:', {
        isLoading: $balanceQuery.isLoading,
        isError: $balanceQuery.isError,
        isFetching: $balanceQuery.isFetching,
        data: $balanceQuery.data,
        error: $balanceQuery.error
      });
      console.log('Full User Object:', $user);
      console.log('==============================================');
    }
  }

  // Calculate account age
  $: accountAge = accountCreated ? (() => {
    const diffTime = Math.abs(new Date().getTime() - accountCreated.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 30) return `${diffDays} days`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months`;
    return `${Math.floor(diffDays / 365)} years`;
  })() : 'Unknown';
</script>

<svelte:head>
	<title>Dashboard - Subscription Platform</title>
</svelte:head>

<div class="space-y-6">
	<!-- Welcome Section -->
	<div class="bg-surface-100-800-token border border-surface-300-600-token rounded-lg shadow-lg p-6">
		<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between">
			<div>
				<h1 class="text-3xl font-bold text-surface-900-50-token mb-2">
					Welcome back, {userName}!
				</h1>
				<p class="text-surface-600-300-token">
					{#if $user?.firstName}
						Good to see you again!
					{:else}
						Here's your dashboard overview
					{/if}
				</p>
				{#if userEmail}
					<div class="mt-2 flex items-center space-x-2">
						<div class="w-2 h-2 rounded-full bg-success-500"></div>
						<span class="text-sm text-surface-600-300-token">{userEmail}</span>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Credit Balance Card (PRIMARY FEATURE) -->
	<div class="bg-surface-100-800-token border border-surface-300-600-token rounded-lg shadow-lg p-6">
		<div class="flex items-center space-x-3 mb-4">
			<div class="p-3 bg-primary-500 text-white rounded-full">
				<CreditCard class="w-6 h-6" />
			</div>
			<h2 class="text-xl font-semibold text-surface-900-50-token">Credit Balance</h2>
		</div>

		{#if $balanceQuery.isLoading}
			<div class="flex items-center justify-center h-32">
				<div class="flex items-center space-x-3">
					<Loader2 class="w-6 h-6 animate-spin text-primary-500" />
					<span class="text-surface-600-300-token">Loading your balance...</span>
				</div>
			</div>
		{:else if $balanceQuery.isError}
			<div class="bg-error-100-800-token border border-error-300-600-token rounded-lg p-4">
				<p class="text-error-600-300-token mb-2">Failed to load credit balance</p>
				<button
					on:click={() => $balanceQuery.refetch()}
					class="btn variant-filled-primary btn-sm"
				>
					Try Again
				</button>
			</div>
		{:else if $balanceQuery.data}
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				<div class="text-center p-4 bg-surface-50-900-token rounded-lg">
					<p class="text-sm text-surface-600-300-token">Total Balance</p>
					<p class="text-3xl font-bold text-primary-600-300-token">
						${$balanceQuery.data.balance.totalBalance.toFixed(2)}
					</p>
				</div>
				<div class="text-center p-4 bg-surface-50-900-token rounded-lg">
					<p class="text-sm text-surface-600-300-token">Available</p>
					<p class="text-2xl font-semibold text-success-600-300-token">
						${$balanceQuery.data.balance.availableBalance.toFixed(2)}
					</p>
				</div>
				<div class="text-center p-4 bg-surface-50-900-token rounded-lg">
					<p class="text-sm text-surface-600-300-token">Pending</p>
					<p class="text-2xl font-semibold text-warning-600-300-token">
						${$balanceQuery.data.balance.pendingBalance.toFixed(2)}
					</p>
				</div>
			</div>
			<div class="mt-4">
				<a href="/dashboard/credits/add" class="btn variant-filled-primary">
					<CreditCard class="w-4 h-4" />
					<span>Add Credits</span>
				</a>
			</div>
		{/if}
	</div>

	<!-- Quick Stats Section -->
	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
		<div class="bg-surface-100-800-token border border-surface-300-600-token rounded-lg shadow-lg p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm text-surface-600-300-token">Active Subscriptions</p>
					<p class="text-2xl font-bold text-surface-900-50-token">0</p>
					<p class="text-xs text-surface-500-400-token mt-1">Coming in Phase 2</p>
				</div>
				<div class="p-3 bg-secondary-500 text-white rounded-full">
					<Users class="w-6 h-6" />
				</div>
			</div>
		</div>

		<div class="bg-surface-100-800-token border border-surface-300-600-token rounded-lg shadow-lg p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm text-surface-600-300-token">Total Credits Spent</p>
					<p class="text-2xl font-bold text-surface-900-50-token">$0.00</p>
					<p class="text-xs text-surface-500-400-token mt-1">Coming in Phase 2</p>
				</div>
				<div class="p-3 bg-warning-500 text-white rounded-full">
					<TrendingUp class="w-6 h-6" />
				</div>
			</div>
		</div>

		<div class="bg-surface-100-800-token border border-surface-300-600-token rounded-lg shadow-lg p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm text-surface-600-300-token">Account Age</p>
					<p class="text-2xl font-bold text-surface-900-50-token">{accountAge}</p>
					<p class="text-xs text-surface-500-400-token mt-1">Member since</p>
				</div>
				<div class="p-3 bg-tertiary-500 text-white rounded-full">
					<Calendar class="w-6 h-6" />
				</div>
			</div>
		</div>

		<div class="bg-surface-100-800-token border border-surface-300-600-token rounded-lg shadow-lg p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm text-surface-600-300-token">Last Login</p>
					<p class="text-lg font-bold text-surface-900-50-token">
						{lastLogin ? formatRelativeTime(lastLogin.toISOString()) : 'Now'}
					</p>
					<p class="text-xs text-surface-500-400-token mt-1">Activity</p>
				</div>
				<div class="p-3 bg-success-500 text-white rounded-full">
					<Activity class="w-6 h-6" />
				</div>
			</div>
		</div>
	</div>

	<!-- Recent Activity Section -->
	<div class="bg-surface-100-800-token border border-surface-300-600-token rounded-lg shadow-lg p-6">
		<h2 class="text-xl font-semibold text-surface-900-50-token mb-4">Recent Activity</h2>
		<div class="text-center py-12">
			<div class="p-4 bg-surface-50-900-token rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
				<Activity class="w-8 h-8 text-surface-600-300-token" />
			</div>
			<p class="text-surface-600-300-token mb-4">Recent activity will appear here once you make purchases</p>
			<a href="/services" class="btn variant-filled-primary">
				<ShoppingBag class="w-4 h-4" />
				<span>Browse Services</span>
			</a>
		</div>
	</div>

	<!-- Quick Actions Section -->
	<div class="bg-surface-100-800-token border border-surface-300-600-token rounded-lg shadow-lg p-6">
		<h2 class="text-xl font-semibold text-surface-900-50-token mb-4">Quick Actions</h2>
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
			<a href="/services" class="btn variant-filled-primary">
				<ShoppingBag class="w-4 h-4" />
				<span>Browse Subscriptions</span>
			</a>
			<a href="/dashboard/transactions" class="btn variant-ghost-surface">
				<TrendingUp class="w-4 h-4" />
				<span>View Transactions</span>
			</a>
			<a href="/profile" class="btn variant-ghost-surface">
				<User2 class="w-4 h-4" />
				<span>Manage Profile</span>
			</a>
			<a href="/dashboard/settings" class="btn variant-ghost-surface">
				<Settings class="w-4 h-4" />
				<span>Account Settings</span>
			</a>
		</div>
	</div>
</div>