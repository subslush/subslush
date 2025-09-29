<script lang="ts">
  import { onMount } from 'svelte';
  import { CreditCard, Users, TrendingUp, Activity, LogOut, User } from 'lucide-svelte';
  import { user, auth } from '$lib/stores/auth.js';
  import { formatName, formatRelativeTime } from '$lib/utils/formatters.js';

  // Mock data for demonstration - in a real app, this would come from your API
  const mockStats = {
    totalCredits: 1250,
    usedCredits: 750,
    activeSubscriptions: 3,
    monthlySpend: 89.99
  };

  const mockRecentActivity = [
    { id: 1, type: 'subscription', description: 'Netflix subscription renewed', amount: -15.99, date: '2024-01-15' },
    { id: 2, type: 'credit', description: 'Credits purchased', amount: +100, date: '2024-01-14' },
    { id: 3, type: 'subscription', description: 'Spotify subscription renewed', amount: -9.99, date: '2024-01-13' }
  ];

  async function handleLogout() {
    try {
      await auth.logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

  $: userName = $user ? formatName($user.firstName, $user.lastName) || $user.email : 'User';
  $: userInitials = $user ?
    (($user.firstName?.charAt(0) || '') + ($user.lastName?.charAt(0) || '')).toUpperCase() ||
    $user.email.charAt(0).toUpperCase() : 'U';
</script>

<svelte:head>
	<title>Dashboard - Subscription Platform</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header with User Info -->
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="h1 mb-2">Welcome back, {userName}!</h1>
			<p class="text-surface-600 dark:text-surface-400">Overview of your subscription platform activity</p>
		</div>
		<div class="mt-4 sm:mt-0 flex items-center space-x-4">
			<!-- User Avatar -->
			<div class="flex items-center space-x-3">
				<div class="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-medium">
					{userInitials}
				</div>
				<div class="hidden sm:block">
					<p class="text-sm font-medium text-surface-900 dark:text-surface-100">{userName}</p>
					<p class="text-xs text-surface-600 dark:text-surface-400">{$user?.email}</p>
				</div>
			</div>
			<!-- Logout Button -->
			<button
				on:click={handleLogout}
				class="btn variant-ghost-surface btn-sm"
				title="Sign out"
			>
				<LogOut class="w-4 h-4" />
				<span class="hidden sm:inline ml-2">Sign out</span>
			</button>
		</div>
	</div>

	<!-- Stats Grid -->
	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
		<div class="card p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm text-surface-600 dark:text-surface-400">Total Credits</p>
					<p class="text-2xl font-bold text-surface-900 dark:text-surface-100">{mockStats.totalCredits}</p>
				</div>
				<div class="p-3 bg-primary-500 text-white rounded-full">
					<CreditCard class="w-6 h-6" />
				</div>
			</div>
		</div>

		<div class="card p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm text-surface-600 dark:text-surface-400">Used Credits</p>
					<p class="text-2xl font-bold text-surface-900 dark:text-surface-100">{mockStats.usedCredits}</p>
				</div>
				<div class="p-3 bg-warning-500 text-white rounded-full">
					<TrendingUp class="w-6 h-6" />
				</div>
			</div>
		</div>

		<div class="card p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm text-surface-600 dark:text-surface-400">Active Subscriptions</p>
					<p class="text-2xl font-bold text-surface-900 dark:text-surface-100">{mockStats.activeSubscriptions}</p>
				</div>
				<div class="p-3 bg-secondary-500 text-white rounded-full">
					<Users class="w-6 h-6" />
				</div>
			</div>
		</div>

		<div class="card p-6">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm text-surface-600 dark:text-surface-400">Monthly Spend</p>
					<p class="text-2xl font-bold text-surface-900 dark:text-surface-100">${mockStats.monthlySpend}</p>
				</div>
				<div class="p-3 bg-tertiary-500 text-white rounded-full">
					<Activity class="w-6 h-6" />
				</div>
			</div>
		</div>
	</div>

	<!-- Credit Usage Chart Placeholder -->
	<div class="card p-6">
		<div class="mb-6">
			<h2 class="h3">Credit Usage Over Time</h2>
		</div>
		<div class="h-64 bg-surface-100 dark:bg-surface-800 rounded-lg flex items-center justify-center">
			<p class="text-surface-600 dark:text-surface-400">Chart visualization will be implemented here</p>
		</div>
	</div>

	<!-- Recent Activity -->
	<div class="card p-6">
		<div class="mb-6">
			<h2 class="h3">Recent Activity</h2>
		</div>
		<div class="space-y-4">
			{#each mockRecentActivity as activity}
				<div class="flex items-center justify-between p-4 bg-surface-100 dark:bg-surface-800 rounded-lg">
					<div class="flex items-center space-x-3">
						<div class="p-2 rounded-full" class:bg-primary-500={activity.type === 'subscription'} class:bg-success-500={activity.type === 'credit'}>
							{#if activity.type === 'subscription'}
								<CreditCard class="w-4 h-4 text-white" />
							{:else}
								<TrendingUp class="w-4 h-4 text-white" />
							{/if}
						</div>
						<div>
							<p class="font-medium text-surface-900 dark:text-surface-100">{activity.description}</p>
							<p class="text-sm text-surface-600 dark:text-surface-400">{formatRelativeTime(activity.date)}</p>
						</div>
					</div>
					<div class="text-right">
						<p class="font-medium" class:text-error-600={activity.amount < 0} class:text-success-600={activity.amount > 0}>
							{activity.amount > 0 ? '+' : ''}{activity.amount}
							{activity.type === 'credit' ? ' credits' : ''}
						</p>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Quick Actions -->
	<div class="card p-6">
		<div class="mb-6">
			<h2 class="h3">Quick Actions</h2>
		</div>
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			<button class="btn variant-filled-primary">
				<CreditCard class="w-4 h-4" />
				<span>Buy Credits</span>
			</button>
			<button class="btn variant-ghost-surface">
				<Users class="w-4 h-4" />
				<span>Manage Subscriptions</span>
			</button>
			<button class="btn variant-ghost-surface">
				<Activity class="w-4 h-4" />
				<span>View Reports</span>
			</button>
		</div>
	</div>
</div>