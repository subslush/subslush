<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { CreditCard, Users, Calendar, DollarSign, ChevronDown, Loader2 } from 'lucide-svelte';
  import { isAuthenticated } from '$lib/stores/auth.js';
  import { formatName } from '$lib/utils/formatters.js';
  import { extractTotalBalance, extractAvailableBalance, extractPendingBalance, formatCurrency } from '$lib/utils/credits.js';
  import { apiClient } from '$lib/api';
  import { browser } from '$app/environment';
  import StatCard from '$lib/components/dashboard/StatCard.svelte';
  import SubscriptionCard from '$lib/components/dashboard/SubscriptionCard.svelte';
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

  // Credit Balance Query - reactive and properly enabled (EXISTING - DO NOT RECREATE)
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
    retryDelay: 1000
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
      console.log('Current User (data):', currentUser);
      console.log('==============================================');
    }
  }

  // TODO PLACEHOLDER: Active subscriptions count
  // Expected endpoint: GET /api/v1/subscriptions/my-subscriptions?status=active
  // Expected response: { subscriptions: [...], total: number }
  $: activeSubscriptionsCount = 6; // Placeholder

  // TODO PLACEHOLDER: Upcoming renewals count
  // Calculate from subscription renewal dates within next 7 days
  $: upcomingRenewalsCount = 3; // Placeholder

  // Mock subscription data for display
  const mockSubscriptions = [
    {
      serviceName: 'Netflix',
      serviceCategory: 'Streaming',
      status: 'Active' as const,
      sharedBy: 'Emily Cena',
      seatsUsed: 5,
      totalSeats: 5,
      monthlyCost: '€6.99',
      renewsIn: '12 days',
      isPlanFull: true
    },
    {
      serviceName: 'Spotify',
      serviceCategory: 'Music',
      status: 'Active' as const,
      sharedBy: 'John Smith',
      seatsUsed: 3,
      totalSeats: 6,
      monthlyCost: '€4.99',
      renewsIn: '5 days',
      isPlanFull: false
    },
    {
      serviceName: 'TradingView',
      serviceCategory: 'Finance',
      status: 'Active' as const,
      sharedBy: 'Mike Johnson',
      seatsUsed: 2,
      totalSeats: 3,
      monthlyCost: '€12.99',
      renewsIn: '8 days',
      isPlanFull: false
    },
    {
      serviceName: 'HBO Max',
      serviceCategory: 'Streaming',
      status: 'Active' as const,
      sharedBy: 'Sarah Wilson',
      seatsUsed: 4,
      totalSeats: 4,
      monthlyCost: '€8.99',
      renewsIn: '20 days',
      isPlanFull: true
    }
  ];

  let activeTab = 'my-subscriptions';
  let sortBy = 'active';
</script>

<svelte:head>
	<title>Dashboard - Subscription Platform</title>
</svelte:head>

<!-- Greeting Row -->
<div class="flex items-center justify-between mb-6">
	<div>
		<h1 class="text-2xl font-bold text-gray-900">
			Good morning, {userName}
			<span class="inline-block animate-wave">👋</span>
		</h1>
		<p class="text-gray-600 mt-1 text-base">
			Here's how your subscriptions are performing today.
		</p>
	</div>

	<div class="flex gap-3">
		<a
			href="/dashboard/subscriptions"
			class="px-6 py-2.5 border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium rounded-lg transition-colors flex items-center space-x-2"
		>
			<span>➕</span>
			<span>Add Subscription</span>
		</a>
		<a
			href="/dashboard/credits"
			class="px-6 py-2.5 text-white text-sm font-medium rounded-lg transition-all duration-300 focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 flex items-center space-x-2 hover:shadow-lg hover:shadow-pink-500/30 hover:scale-105"
			style="background-color: #F06292;"
			onmouseover="this.style.backgroundColor='#E91E63'"
			onmouseout="this.style.backgroundColor='#F06292'"
		>
			<span>💳</span>
			<span>Top Up Credits</span>
		</a>
	</div>
</div>

<!-- Stats Cards Row -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
	<!-- Active Subscribed Plans -->
	<StatCard
		title="Active Subscribed Plans"
		value={activeSubscriptionsCount}
		subtitle="active all subscriptions"
		icon={Users}
		iconColor="bg-blue-500"
	/>

	<!-- Upcoming Renewals -->
	<StatCard
		title="Upcoming Renewals"
		value={upcomingRenewalsCount}
		subtitle="next 7 days"
		icon={Calendar}
		iconColor="bg-yellow-500"
	/>

	<!-- Credit Balance ✅ (EXISTING - DO NOT RECREATE) -->
	{#if $balanceQuery.isLoading}
		<div class="bg-white rounded-xl border border-gray-200 p-6">
			<div class="flex items-center justify-center h-24">
				<div class="flex items-center space-x-3">
					<Loader2 class="w-6 h-6 animate-spin text-subslush-blue" />
					<span class="text-gray-600">Loading balance...</span>
				</div>
			</div>
		</div>
	{:else if $balanceQuery.isError}
		<div class="bg-white rounded-xl border border-gray-200 p-6">
			<div class="text-center">
				<p class="text-red-600 mb-2">Failed to load balance</p>
				<button
					on:click={() => $balanceQuery.refetch()}
					class="btn variant-filled-primary btn-sm"
				>
					Try Again
				</button>
			</div>
		</div>
	{:else if $balanceQuery.data}
		<StatCard
			title="Credit Balance"
			value="€{formatCurrency(extractAvailableBalance($balanceQuery.data)).replace('€', '')}"
			subtitle="available credits"
			icon={DollarSign}
			iconColor="bg-green-500"
			valueColor="text-green-600"
		/>
	{/if}
</div>

<!-- Subscription Cards Section -->
<div class="bg-white rounded-lg border border-gray-200 p-4 mb-6">
	<!-- Section Header -->
	<div class="flex items-center justify-between mb-4">
		<div>
			<button
				class="px-4 py-2 text-sm font-medium text-pink-600 border-b-2 border-pink-600"
				style="color: #F06292; border-bottom-color: #F06292;"
				on:click={() => activeTab = 'my-subscriptions'}
			>
				My Subscriptions ({mockSubscriptions.length})
			</button>
		</div>

		<div class="flex items-center space-x-3">
			<span class="text-sm font-medium text-gray-600">Sort by:</span>
			<div class="relative">
				<select
					bind:value={sortBy}
					class="appearance-none bg-white border border-gray-300 rounded-lg px-3 py-2 pr-8 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
				>
					<option value="active">Active</option>
					<option value="renewal">Renewal Date</option>
					<option value="cost">Cost</option>
				</select>
				<ChevronDown size={16} class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
			</div>
		</div>
	</div>

	<!-- Subscription Cards Grid -->
	<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
		{#each mockSubscriptions as subscription}
			<SubscriptionCard
				serviceName={subscription.serviceName}
				serviceCategory={subscription.serviceCategory}
				status={subscription.status}
				sharedBy={subscription.sharedBy}
				seatsUsed={subscription.seatsUsed}
				totalSeats={subscription.totalSeats}
				monthlyCost={subscription.monthlyCost}
				renewsIn={subscription.renewsIn}
				isPlanFull={subscription.isPlanFull}
			/>
		{/each}
	</div>
</div>

<!-- Recent Activity Section -->
<div class="bg-white rounded-lg border border-gray-200 p-6 mb-6">
	<h2 class="text-xl font-semibold text-gray-900 mb-4 flex items-center">
		<span class="mr-2 text-2xl">⚡</span>
		Recent Activity
	</h2>

	<div class="text-center py-12">
		<div class="mb-4 p-4 bg-gray-100 rounded-full inline-block">
			<svg class="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
			</svg>
		</div>

		<p class="text-gray-600 mb-4 text-base">Recent activity will appear here once you make purchases</p>

		<a
			href="/dashboard/subscriptions"
			class="inline-flex items-center px-6 py-2.5 text-white text-sm font-medium rounded-lg transition-colors focus:ring-2 focus:ring-offset-2"
			style="background-color: #4FC3F7; focus:ring-color: #4FC3F7;"
			onmouseover="this.style.backgroundColor='#29B6F6'"
			onmouseout="this.style.backgroundColor='#4FC3F7'"
		>
			<span class="mr-2">🛒</span>
			Browse Services
		</a>
	</div>
</div>

<!-- Quick Actions Section -->
<div class="bg-white rounded-lg border border-gray-200 p-6">
	<h2 class="text-xl font-semibold text-gray-900 mb-4 flex items-center">
		<span class="mr-2 text-2xl">🚀</span>
		Quick Actions
	</h2>

	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
		<a
			href="/dashboard/subscriptions"
			class="p-4 text-white rounded-lg transition-colors"
			style="background-color: #4FC3F7;"
			onmouseover="this.style.backgroundColor='#29B6F6'"
			onmouseout="this.style.backgroundColor='#4FC3F7'"
		>
			<span class="text-2xl mb-2 block">🛍️</span>
			<span class="font-medium text-sm">Browse Subscriptions</span>
		</a>

		<a
			href="/dashboard/transactions"
			class="p-4 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
		>
			<span class="text-2xl mb-2 block">📊</span>
			<span class="font-medium text-sm text-gray-700">View Transactions</span>
		</a>

		<a
			href="/profile"
			class="p-4 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
		>
			<span class="text-2xl mb-2 block">👤</span>
			<span class="font-medium text-sm text-gray-700">Manage Profile</span>
		</a>

		<a
			href="/dashboard/settings"
			class="p-4 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
		>
			<span class="text-2xl mb-2 block">⚙️</span>
			<span class="font-medium text-sm text-gray-700">Account Settings</span>
		</a>
	</div>
</div>

<style>
	@keyframes wave {
		0%, 100% { transform: rotate(0deg); }
		10%, 30% { transform: rotate(14deg); }
		20% { transform: rotate(-8deg); }
		40% { transform: rotate(-4deg); }
		50% { transform: rotate(10deg); }
	}

	.animate-wave {
		animation: wave 2.5s ease-in-out infinite;
		transform-origin: 70% 70%;
		display: inline-block;
	}
</style>