<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { CreditCard, Users, Calendar, DollarSign, ChevronDown, ChevronRight, Loader2 } from 'lucide-svelte';
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
      isPlanFull: true,
      autoRenew: true
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
      isPlanFull: false,
      autoRenew: true
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
      isPlanFull: false,
      autoRenew: false
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
      isPlanFull: true,
      autoRenew: true
    }
  ];

  let activeTab = 'my-subscriptions';
  let sortBy = 'active';

  /**
   * Determines the appropriate status badge for a subscription based on:
   * - Days until renewal
   * - User's current balance
   * - Subscription cost
   *
   * @param subscription - The subscription object
   * @param userBalance - User's current credit balance
   * @returns Status badge configuration object
   */
  function getSubscriptionStatusBadge(subscription: any, userBalance: number) {
    // Parse renewal days from string like "12 days" or "5 days"
    const renewalMatch = subscription.renewsIn.match(/(\d+)/);
    const daysUntilRenewal = renewalMatch ? parseInt(renewalMatch[0]) : 999;

    // Parse monthly cost from string like "€6.99"
    const costMatch = subscription.monthlyCost.match(/[\d.]+/);
    const renewalCost = costMatch ? parseFloat(costMatch[0]) : 0;

    // Determine status priority (highest priority first)

    // CRITICAL: Low balance AND renewal soon
    if (userBalance < renewalCost && daysUntilRenewal <= 7) {
      return {
        text: 'Low Balance',
        class: 'bg-orange-100 text-orange-800 border border-orange-200',
        icon: '⚠️',
        priority: 'critical'
      };
    }

    // URGENT: Renewal very soon (1-3 days)
    if (daysUntilRenewal <= 3) {
      return {
        text: 'Renewing Soon',
        class: 'bg-amber-100 text-amber-800 border border-amber-200',
        icon: '⏰',
        priority: 'urgent'
      };
    }

    // WARNING: Renewal coming up (4-7 days)
    if (daysUntilRenewal <= 7) {
      return {
        text: 'Renewal Coming',
        class: 'bg-amber-100 text-amber-800 border border-amber-200',
        icon: '🔄',
        priority: 'warning'
      };
    }

    // SUCCESS: All good
    return {
      text: 'Active',
      class: 'bg-green-100 text-green-800 border border-green-200',
      icon: '✓',
      priority: 'success'
    };
  }
</script>

<svelte:head>
	<title>Dashboard - Subscription Platform</title>
</svelte:head>

<!-- Greeting Row -->
<div class="flex items-center justify-between mb-6">
	<div>
		<h1 class="text-3xl font-bold text-gray-900">
			Hey {userName}!
			<span class="inline-block animate-wave">👋</span>
		</h1>
		<p class="text-gray-600 mt-1 text-base">
			{#if activeSubscriptionsCount > 0 && upcomingRenewalsCount > 0}
				All <span class="font-semibold text-gray-900">{activeSubscriptionsCount} subscriptions</span> active –
				<span class="font-semibold text-amber-600">{upcomingRenewalsCount} renew{upcomingRenewalsCount === 1 ? 's' : ''}</span> in the next 7 days
			{:else if activeSubscriptionsCount > 0}
				All <span class="font-semibold text-gray-900">{activeSubscriptionsCount} subscriptions</span> running smoothly ✓
			{:else}
				You're saving up to <span class="font-semibold text-green-600">90%</span> on premium subscriptions 💰
			{/if}
		</p>

		<!-- Subtle Trust Indicators -->
		<div class="flex flex-wrap gap-3 mt-2">
			<span class="inline-flex items-center gap-1.5 text-xs text-gray-500">
				<svg class="w-3.5 h-3.5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
					<path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/>
				</svg>
				<span>Encrypted</span>
			</span>
			<span class="inline-flex items-center gap-1.5 text-xs text-gray-500">
				<svg class="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
				</svg>
				<span>99.9% Uptime</span>
			</span>
			<span class="inline-flex items-center gap-1.5 text-xs text-gray-500">
				<svg class="w-3.5 h-3.5 text-cyan-600" fill="currentColor" viewBox="0 0 20 20">
					<path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z"/>
				</svg>
				<span>2,847+ Users</span>
			</span>
		</div>
	</div>

	<div class="flex gap-3">
		<button
			class="bg-cyan-500 hover:bg-cyan-600 text-white font-medium py-2.5 px-5 rounded-lg transition-colors duration-150 flex items-center space-x-2"
		>
			<span>➕</span>
			<span>Add Subscription</span>
		</button>
		<a
			href="/dashboard/credits"
			class="bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 text-white font-semibold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 flex items-center space-x-2"
		>
			<span>⚡</span>
			<span>Top Up Credits</span>
		</a>
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
		iconColor="bg-cyan-50"
		iconTextColor="text-cyan-600"
	/>

	<!-- Enhanced Upcoming Renewals -->
	<div class="bg-white rounded-xl border border-gray-200 p-6">
		<div class="flex items-center mb-4">
			<div class="p-3 bg-amber-50 rounded-lg">
				<Calendar class="w-6 h-6 text-amber-600" />
			</div>
			<div class="ml-4">
				<p class="text-sm font-medium text-gray-600">Upcoming Renewals</p>
				<p class="text-3xl font-bold text-amber-600">{upcomingRenewalsCount}</p>
			</div>
		</div>

		{#if upcomingRenewalsCount > 0}
			{@const estimatedCost = upcomingRenewalsCount * 7}
			{@const userBalance = $balanceQuery.data ? extractAvailableBalance($balanceQuery.data) : 0}
			{@const hasSufficientBalance = userBalance >= estimatedCost}

			<div class="border-t border-gray-100 pt-3 mt-3">
				<div class="flex items-center justify-between text-sm mb-2">
					<span class="text-gray-600">Next 7 days</span>
					<span class="font-semibold text-gray-900">~€{estimatedCost.toFixed(2)}</span>
				</div>

				{#if hasSufficientBalance}
					<div class="flex items-center text-xs text-green-600 bg-green-50 rounded px-2 py-1">
						<svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
							<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
						</svg>
						<span class="font-medium">You're fully covered!</span>
					</div>
				{:else}
					<div class="flex items-center text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
						<svg class="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
							<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
						</svg>
						<span class="font-medium">Add €{(estimatedCost - userBalance).toFixed(2)} to cover renewals</span>
					</div>
					<a href="/dashboard/credits" class="inline-flex items-center mt-2 text-sm font-medium text-cyan-600 hover:text-cyan-700">
						<span>Top Up Now</span>
						<ChevronRight size={16} class="ml-1" />
					</a>
				{/if}
			</div>
		{:else}
			<p class="text-sm text-gray-500 border-t border-gray-100 pt-3 mt-3">
				No renewals in the next 7 days
			</p>
		{/if}
	</div>

	<!-- Credit Balance ✅ (EXISTING - DO NOT RECREATE) -->
	{#if $balanceQuery.isLoading}
		<div class="bg-white rounded-xl border border-gray-200 p-6">
			<div class="flex items-center justify-center h-24">
				<div class="flex items-center space-x-3">
					<Loader2 class="w-6 h-6 animate-spin text-cyan-500" />
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
		{@const balance = extractAvailableBalance($balanceQuery.data)}
		{@const canAffordSpotify = balance >= 4.99}
		{@const canAffordNetflix = balance >= 6.99}
		{@const servicesCount = Math.floor(balance / 5)}

		<div class="bg-white rounded-xl border border-gray-200 p-6 relative">
			<!-- Low Balance Pulse Indicator -->
			{#if balance > 0 && balance < 20}
				<div class="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full low-balance-pulse"></div>
			{/if}

			<div class="flex items-center mb-2">
				<div class="p-3 bg-green-100 rounded-lg {balance > 0 && balance < 20 ? 'ring-2 ring-amber-400 ring-offset-2' : ''}">
					<DollarSign class="w-6 h-6 text-green-600" />
				</div>
				<div class="ml-4">
					<p class="text-sm font-medium text-gray-600">Credit Balance</p>
					<p class="text-3xl font-bold {balance > 0 && balance < 20 ? 'text-amber-600' : 'text-green-600'}">€{balance.toFixed(2)}</p>
				</div>
			</div>

			<!-- Value Context -->
			{#if balance >= 5}
				<p class="text-sm text-gray-600 mt-3">
					💡 <span class="font-medium">Enough for {servicesCount}+ subscriptions!</span>
				</p>
			{:else if balance > 0 && balance < 5}
				<p class="text-sm text-amber-600 mt-3 font-medium flex items-center gap-1">
					<svg class="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
					</svg>
					<span>Add €{(5 - balance).toFixed(2)} more to unlock your first subscription</span>
				</p>
			{:else}
				<p class="text-sm text-gray-600 mt-3">
					Get started with just €5 in credits
				</p>
			{/if}

			<!-- Enhanced Quick Action for Low Balance -->
			{#if balance > 0 && balance < 20}
				<a
					href="/dashboard/credits"
					class="mt-3 w-full bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 text-white font-semibold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 inline-flex items-center justify-center gap-2"
				>
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
					</svg>
					<span>Top Up Now</span>
				</a>
			{:else if balance < 50}
				<a
					href="/dashboard/credits"
					class="mt-3 inline-flex items-center text-sm font-medium text-cyan-600 hover:text-cyan-700"
				>
					<span>⚡ Top Up Now</span>
					<ChevronRight size={16} class="ml-1" />
				</a>
			{/if}
		</div>
	{/if}
</div>

<!-- Subscription Cards Section -->
<div class="bg-white rounded-xl border border-gray-200 p-6 mb-8">
	<!-- Section Header -->
	<div class="flex items-center justify-between mb-4">
		<div>
			<button
				class="px-4 py-2 text-sm font-medium bg-gradient-to-br from-cyan-500/[0.08] to-pink-500/[0.08] border border-cyan-200/50 text-gray-900 rounded-lg"
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
	<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
		{#each mockSubscriptions as subscription}
			{@const userBalance = $balanceQuery.data ? extractAvailableBalance($balanceQuery.data) : 0}
			{@const statusBadge = getSubscriptionStatusBadge(subscription, userBalance)}
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
				autoRenew={subscription.autoRenew ? 'Auto' : 'Manual'}
				enhancedStatusBadge={{...statusBadge, userBalance}}
			/>
		{/each}
	</div>
</div>

<!-- Social Proof Section -->
<div class="bg-white border border-gray-200 rounded-xl p-6 mt-6">
	<div class="flex items-start space-x-3 mb-4">
		<div class="flex-shrink-0">
			<div class="w-10 h-10 bg-cyan-50 rounded-full flex items-center justify-center">
				<svg class="w-6 h-6 text-cyan-600" fill="currentColor" viewBox="0 0 20 20">
					<path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
				</svg>
			</div>
		</div>
		<div class="flex-1">
			<h3 class="text-xl font-semibold text-gray-900 mb-2">
				⭐ What SubSlush Users Are Saving
			</h3>
			<div class="space-y-3">
				<blockquote class="bg-gray-50 rounded-lg p-4 border border-gray-200">
					<p class="text-sm text-gray-700 mb-2">"Saved <span class="font-bold text-green-600">€1,680</span> on Netflix this year! This platform is incredible."</p>
					<cite class="text-xs text-gray-500 not-italic">— Maria K., Premium User</cite>
				</blockquote>
				<blockquote class="bg-gray-50 rounded-lg p-4 border border-gray-200">
					<p class="text-sm text-gray-700 mb-2">"TradingView Pro for <span class="font-bold text-green-600">€12.99</span>? Absolute no-brainer for day traders!"</p>
					<cite class="text-xs text-gray-500 not-italic">— Alex R., Day Trader</cite>
				</blockquote>
			</div>
			<a href="/browse" class="inline-flex items-center mt-4 text-sm font-medium text-cyan-600 hover:text-cyan-700">
				See all success stories
				<ChevronRight size={16} class="ml-1" />
			</a>
		</div>
	</div>
</div>

<!-- Enhanced Quick Actions Section -->
<div class="mt-8 bg-white rounded-xl border border-gray-200 p-6">
	<div class="flex items-center mb-4">
		<svg class="w-5 h-5 text-cyan-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
			<path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/>
		</svg>
		<h2 class="text-2xl font-bold text-gray-900">Quick Actions</h2>
	</div>

	<div class="space-y-3">
		<!-- PRIMARY ACTION -->
		<a
			href="/browse/subscriptions"
			class="block w-full bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 text-white rounded-lg p-4 transition-all duration-200 hover:shadow-lg hover:shadow-xl hover:scale-[1.02] group"
		>
			<div class="flex items-center justify-between">
				<div class="flex items-center space-x-3">
					<div class="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
						<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
						</svg>
					</div>
					<div class="text-left">
						<p class="font-semibold">Browse Subscriptions</p>
						<p class="text-sm text-white/90">Save up to 90% on 50+ services</p>
					</div>
				</div>
				<ChevronRight size={20} class="group-hover:translate-x-1 transition-transform" />
			</div>
		</a>

		<!-- SECONDARY ACTIONS -->
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			<a
				href="/dashboard/subscriptions/active"
				class="bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg p-4 transition-colors group"
			>
				<div class="flex items-center space-x-2 text-gray-700">
					<svg class="w-5 h-5 text-gray-400 group-hover:text-gray-600" fill="currentColor" viewBox="0 0 20 20">
						<path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/>
						<path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"/>
					</svg>
					<span class="font-medium text-sm">My Subscriptions</span>
				</div>
			</a>

			<a
				href="/dashboard/credits"
				class="bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg p-4 transition-colors group"
			>
				<div class="flex items-center space-x-2 text-gray-700">
					<svg class="w-5 h-5 text-gray-400 group-hover:text-gray-600" fill="currentColor" viewBox="0 0 20 20">
						<path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z"/>
						<path fill-rule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clip-rule="evenodd"/>
					</svg>
					<span class="font-medium text-sm">Credit History</span>
				</div>
			</a>

			<a
				href="/profile"
				class="bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg p-4 transition-colors group"
			>
				<div class="flex items-center space-x-2 text-gray-700">
					<svg class="w-5 h-5 text-gray-400 group-hover:text-gray-600" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd"/>
					</svg>
					<span class="font-medium text-sm">Settings</span>
				</div>
			</a>
		</div>
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

	@keyframes subtle-pulse {
		0%, 100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.85;
			transform: scale(1.05);
		}
	}

	.animate-wave {
		animation: wave 2.5s ease-in-out infinite;
		transform-origin: 70% 70%;
		display: inline-block;
	}

	.low-balance-pulse {
		animation: subtle-pulse 3s ease-in-out infinite;
	}
</style>