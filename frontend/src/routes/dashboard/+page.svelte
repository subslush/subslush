<script lang="ts">
	// Removed non-existent Card components - using Tailwind CSS instead
	import { CreditCard, Users, TrendingUp, Activity } from 'lucide-svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import axios from 'axios';
	import { env } from '$env/dynamic/public';

	const API_URL = env.PUBLIC_API_URL || 'http://localhost:3001';

	const dashboardQuery = createQuery({
		queryKey: ['dashboard'],
		queryFn: async () => {
			const response = await axios.get(`${API_URL}/dashboard`, {
				withCredentials: true
			});
			return response.data;
		}
	});

	// Mock data for demonstration
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
</script>

<svelte:head>
	<title>Dashboard - Subscription Platform</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div>
		<h1 class="h1 mb-2">Dashboard</h1>
		<p class="text-surface-600-300-token">Overview of your subscription platform activity</p>
	</div>

	<!-- Stats Grid -->
	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
		<div class="bg-surface-50-900-token border border-surface-300-600-token rounded-lg shadow-lg p-6">
			<div>
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm text-surface-600-300-token">Total Credits</p>
						<p class="text-2xl font-bold">{mockStats.totalCredits}</p>
					</div>
					<div class="p-3 bg-primary-500 text-white rounded-full">
						<CreditCard size={24} />
					</div>
				</div>
			</div>
		</div>

		<div class="bg-surface-50-900-token border border-surface-300-600-token rounded-lg shadow-lg p-6">
			<div>
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm text-surface-600-300-token">Used Credits</p>
						<p class="text-2xl font-bold">{mockStats.usedCredits}</p>
					</div>
					<div class="p-3 bg-warning-500 text-white rounded-full">
						<TrendingUp size={24} />
					</div>
				</div>
			</div>
		</div>

		<div class="bg-surface-50-900-token border border-surface-300-600-token rounded-lg shadow-lg p-6">
			<div>
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm text-surface-600-300-token">Active Subscriptions</p>
						<p class="text-2xl font-bold">{mockStats.activeSubscriptions}</p>
					</div>
					<div class="p-3 bg-secondary-500 text-white rounded-full">
						<Users size={24} />
					</div>
				</div>
			</div>
		</div>

		<div class="bg-surface-50-900-token border border-surface-300-600-token rounded-lg shadow-lg p-6">
			<div>
				<div class="flex items-center justify-between">
					<div>
						<p class="text-sm text-surface-600-300-token">Monthly Spend</p>
						<p class="text-2xl font-bold">${mockStats.monthlySpend}</p>
					</div>
					<div class="p-3 bg-tertiary-500 text-white rounded-full">
						<Activity size={24} />
					</div>
				</div>
			</div>
		</div>
	</div>

	<!-- Credit Usage Chart Placeholder -->
	<div class="bg-surface-50-900-token border border-surface-300-600-token rounded-lg shadow-lg p-6">
		<div class="mb-6">
			<h2 class="h3">Credit Usage Over Time</h2>
		</div>
		<div>
			<div class="h-64 bg-surface-100-800-token rounded-lg flex items-center justify-center">
				<p class="text-surface-600-300-token">Chart visualization will be implemented here</p>
			</div>
		</div>
	</div>

	<!-- Recent Activity -->
	<div class="bg-surface-50-900-token border border-surface-300-600-token rounded-lg shadow-lg p-6">
		<div class="mb-6">
			<h2 class="h3">Recent Activity</h2>
		</div>
		<div>
			<div class="space-y-4">
				{#each mockRecentActivity as activity}
					<div class="flex items-center justify-between p-4 bg-surface-100-800-token rounded-lg">
						<div class="flex items-center space-x-3">
							<div class="p-2 rounded-full" class:bg-primary-500={activity.type === 'subscription'} class:bg-success-500={activity.type === 'credit'}>
								{#if activity.type === 'subscription'}
									<CreditCard size={16} class="text-white" />
								{:else}
									<TrendingUp size={16} class="text-white" />
								{/if}
							</div>
							<div>
								<p class="font-medium">{activity.description}</p>
								<p class="text-sm text-surface-600-300-token">{activity.date}</p>
							</div>
						</div>
						<div class="text-right">
							<p class="font-medium" class:text-error-600={activity.amount < 0} class:text-success-600={activity.amount > 0}>
								{activity.amount > 0 ? '+' : ''}{activity.amount}
								{activity.type === 'credit' ? ' credits' : ''}
								{activity.type === 'subscription' ? '' : ''}
							</p>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>

	<!-- Quick Actions -->
	<div class="bg-surface-50-900-token border border-surface-300-600-token rounded-lg shadow-lg p-6">
		<div class="mb-6">
			<h2 class="h3">Quick Actions</h2>
		</div>
		<div>
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				<button class="btn variant-filled-primary">
					<CreditCard size={16} />
					<span>Buy Credits</span>
				</button>
				<button class="btn variant-ghost-surface">
					<Users size={16} />
					<span>Manage Subscriptions</span>
				</button>
				<button class="btn variant-ghost-surface">
					<Activity size={16} />
					<span>View Reports</span>
				</button>
			</div>
		</div>
	</div>
</div>