<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { derived } from 'svelte/store';
  import { CreditCard, Users, TrendingUp, Activity, ShoppingBag, Settings, User2, Calendar, Loader2 } from 'lucide-svelte';
  import { user, isAuthenticated } from '$lib/stores/auth.js';
  import { formatName, formatRelativeTime } from '$lib/utils/formatters.js';
  import { extractTotalBalance, extractAvailableBalance, extractPendingBalance, formatCurrency } from '$lib/utils/credits.js';
  import { apiClient } from '$lib/api';
  import { browser } from '$app/environment';
  import type { PageData } from './$types';

  export let data: PageData;

  // PERMANENT FIX: Always use server data (data.user) which has complete firstName/lastName
  // Never fall back to auth store ($user) which only has incomplete JWT data
  $: currentUser = data.user;
  $: userId = currentUser?.id;
  $: userName = (() => {
    if (!currentUser) return 'User';

    console.log('🔍 [USERNAME DEBUG] User data:', { firstName: currentUser.firstName, lastName: currentUser.lastName });

    // Try direct User properties first
    const firstName = currentUser.firstName;
    const lastName = currentUser.lastName;

    console.log('🔍 [USERNAME DEBUG] Extracted names:', { firstName, lastName });

    const fullName = formatName(firstName, lastName);
    if (fullName) {
      console.log('🔍 [USERNAME DEBUG] Using full name:', fullName);
      return fullName;
    }

    // Fallback to email username
    const emailUsername = currentUser.email?.split('@')[0] || 'User';
    console.log('🔍 [USERNAME DEBUG] Falling back to email:', emailUsername);
    return emailUsername;
  })();
  $: userEmail = currentUser?.email || '';
  $: accountCreated = currentUser?.createdAt ? new Date(currentUser.createdAt) : null;
  $: lastLogin = currentUser?.lastLoginAt ? new Date(currentUser.lastLoginAt) : null;

  // Credit Balance Query - reactive and properly enabled
  $: balanceQuery = createQuery({
    queryKey: ['creditBalance', currentUser?.id, $isAuthenticated ? 'auth' : 'unauth'],
    queryFn: async () => {
      const currentUserId = currentUser?.id;
      if (!currentUserId) {
        console.error('🏦 [DASHBOARD] No user ID available for balance fetch');
        throw new Error('User ID not available');
      }

      console.log('🏦 [DASHBOARD] Fetching credit balance for user:', currentUserId);
      console.log('🏦 [DASHBOARD] API call URL:', `/credits/balance/${currentUserId}`);

      try {
        const response = await apiClient.get(`/credits/balance/${currentUserId}`);
        console.log('🏦 [DASHBOARD] Credit balance response:', response.data);
        console.log('🏦 [DASHBOARD] Response status:', response.status);
        return response.data;
      } catch (error: any) {
        console.error('🏦 [DASHBOARD] Credit balance fetch error:', {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          config: {
            url: error.config?.url,
            method: error.config?.method,
            headers: error.config?.headers
          }
        });
        throw error;
      }
    },
    enabled: !!currentUser?.id && $isAuthenticated,
    staleTime: 0,  // ✓ Always fetch fresh data for debugging
    retry: 2,
    retryDelay: 1000,
    onError: (error) => {
      console.error('🏦 [DASHBOARD] TanStack Query error:', error);
    },
    onSuccess: (data) => {
      console.log('🏦 [DASHBOARD] TanStack Query success:', data);
    }
  });

  // Debug logging
  $: {
    if (browser) {
      console.log('🔍 [DASHBOARD DEBUG] ===== Credit Balance Query Debug =====');
      console.log('User ID:', userId);
      console.log('Current User ID:', currentUser?.id);
      console.log('Is Authenticated:', $isAuthenticated);
      console.log('Query Enabled:', !!currentUser?.id && $isAuthenticated);
      console.log('Query Status:', {
        isLoading: $balanceQuery.isLoading,
        isError: $balanceQuery.isError,
        isFetching: $balanceQuery.isFetching,
        data: $balanceQuery.data,
        error: $balanceQuery.error?.message
      });
      console.log('Full User Object (store):', $user);
      console.log('Current User (data):', currentUser);
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
					{#if currentUser?.firstName}
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
						{formatCurrency(extractTotalBalance($balanceQuery.data))}
					</p>
				</div>
				<div class="text-center p-4 bg-surface-50-900-token rounded-lg">
					<p class="text-sm text-surface-600-300-token">Available</p>
					<p class="text-2xl font-semibold text-success-600-300-token">
						{formatCurrency(extractAvailableBalance($balanceQuery.data))}
					</p>
				</div>
				<div class="text-center p-4 bg-surface-50-900-token rounded-lg">
					<p class="text-sm text-surface-600-300-token">Pending</p>
					<p class="text-2xl font-semibold text-warning-600-300-token">
						{formatCurrency(extractPendingBalance($balanceQuery.data))}
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