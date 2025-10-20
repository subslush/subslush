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
<div class="flex items-center justify-between mb-8">
	<div>
		<h1 class="text-3xl font-bold text-gray-900">
			Good morning, {userName} 👋
		</h1>
		<p class="text-gray-600 mt-1">
			Here's how your subscriptions are performing today.
		</p>
	</div>
	<div class="flex gap-3">
		<button class="btn variant-ghost-surface">
			+ Top Up Credits
		</button>
		<button class="btn variant-filled-primary">
			+ Add Subscription
		</button>
	</div>
</div>

<!-- Stats Cards Row -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
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
<div class="bg-white rounded-xl border border-gray-200 p-6 mb-8">
	<!-- Section Header with Tabs -->
	<div class="flex items-center justify-between mb-6">
		<div class="flex space-x-8">
			<button
				class="text-lg font-semibold transition-colors duration-200"
				class:text-subslush-blue={activeTab === 'my-subscriptions'}
				class:text-gray-500={activeTab !== 'my-subscriptions'}
				class:border-b-2={activeTab === 'my-subscriptions'}
				class:border-subslush-blue={activeTab === 'my-subscriptions'}
				on:click={() => activeTab = 'my-subscriptions'}
			>
				My Subscriptions ({mockSubscriptions.length})
			</button>
		</div>

		<div class="flex items-center space-x-2">
			<span class="text-sm text-gray-600">Sort by:</span>
			<div class="relative">
				<select
					bind:value={sortBy}
					class="appearance-none bg-white border border-gray-300 rounded-lg px-3 py-1 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-subslush-blue focus:border-transparent"
				>
					<option value="active">Active</option>
					<option value="renewal">Renewal Date</option>
					<option value="cost">Cost</option>
				</select>
				<ChevronDown size={16} class="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 pointer-events-none" />
			</div>
		</div>
	</div>

	<!-- Subscription Cards Grid -->
	<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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

<!-- Recent Activity Section ✅ (EXISTING - KEEP BELOW) -->
<div class="bg-white rounded-xl border border-gray-200 p-6 mb-8">
	<h2 class="text-xl font-semibold text-gray-900 mb-4">Recent Activity</h2>
	<div class="text-center py-12">
		<div class="p-4 bg-gray-50 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
			<svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
			</svg>
		</div>
		<p class="text-gray-600 mb-4">Recent activity will appear here once you make purchases</p>
		<a href="/dashboard/subscriptions" class="btn variant-filled-primary">
			Browse Services
		</a>
	</div>
</div>

<!-- Quick Actions Section ✅ (EXISTING - KEEP BELOW) -->
<div class="bg-white rounded-xl border border-gray-200 p-6">
	<h2 class="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
		<a href="/dashboard/subscriptions" class="btn variant-filled-primary">
			Browse Subscriptions
		</a>
		<a href="/dashboard/transactions" class="btn variant-ghost-surface">
			View Transactions
		</a>
		<a href="/profile" class="btn variant-ghost-surface">
			Manage Profile
		</a>
		<a href="/dashboard/settings" class="btn variant-ghost-surface">
			Account Settings
		</a>
	</div>
</div>