<script lang="ts">
	// Removed non-existent Card components - using Tailwind CSS instead
	import { CreditCard, Users, Shield, Zap } from 'lucide-svelte';
</script>

<svelte:head>
	<title>Subscription Platform - Manage Your Subscriptions</title>
	<meta name="description" content="Modern subscription platform with credit system" />
</svelte:head>

<div class="container mx-auto px-4 py-8">
	<!-- Hero Section -->
	<section class="text-center mb-16">
		<h1 class="h1 mb-4">Welcome to Subscription Platform</h1>
		<p class="text-xl text-surface-600-300-token mb-8 max-w-2xl mx-auto">
			Manage your subscriptions with our modern platform featuring a flexible credit system,
			secure authentication, and comprehensive analytics.
		</p>
		<div class="flex justify-center space-x-4">
			<a href="/auth/register" class="btn variant-filled-primary">Get Started</a>
			<a href="/auth/login" class="btn variant-ghost-surface">Sign In</a>
		</div>
	</section>

	<!-- Features Grid -->
	<section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
		<div class="bg-surface-50-900-token border border-surface-300-600-token rounded-lg shadow-lg text-center p-6">
			<div class="mb-4">
				<div class="mx-auto mb-4 p-3 bg-primary-500 text-white rounded-full w-fit">
					<CreditCard size={24} />
				</div>
				<h3 class="h3">Credit System</h3>
			</div>
			<div>
				<p class="text-surface-600-300-token">
					Flexible credit-based subscription management with real-time balance tracking.
				</p>
			</div>
		</div>

		<div class="bg-surface-50-900-token border border-surface-300-600-token rounded-lg shadow-lg text-center p-6">
			<div class="mb-4">
				<div class="mx-auto mb-4 p-3 bg-secondary-500 text-white rounded-full w-fit">
					<Shield size={24} />
				</div>
				<h3 class="h3">Secure Authentication</h3>
			</div>
			<div>
				<p class="text-surface-600-300-token">
					Enterprise-grade security with session management and Redis integration.
				</p>
			</div>
		</div>

		<div class="bg-surface-50-900-token border border-surface-300-600-token rounded-lg shadow-lg text-center p-6">
			<div class="mb-4">
				<div class="mx-auto mb-4 p-3 bg-tertiary-500 text-white rounded-full w-fit">
					<Users size={24} />
				</div>
				<h3 class="h3">User Management</h3>
			</div>
			<div>
				<p class="text-surface-600-300-token">
					Comprehensive user profiles with subscription history and preferences.
				</p>
			</div>
		</div>

		<div class="bg-surface-50-900-token border border-surface-300-600-token rounded-lg shadow-lg text-center p-6">
			<div class="mb-4">
				<div class="mx-auto mb-4 p-3 bg-warning-500 text-white rounded-full w-fit">
					<Zap size={24} />
				</div>
				<h3 class="h3">Real-time Updates</h3>
			</div>
			<div>
				<p class="text-surface-600-300-token">
					Live updates for subscriptions, credits, and account activities.
				</p>
			</div>
		</div>
	</section>

	<!-- Stats Section -->
	<section class="bg-surface-100-800-token rounded-lg p-8 mb-16">
		<h2 class="h2 text-center mb-8">Platform Statistics</h2>
		<div class="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
			<div>
				<div class="text-4xl font-bold text-primary-600 mb-2">10K+</div>
				<div class="text-surface-600-300-token">Active Users</div>
			</div>
			<div>
				<div class="text-4xl font-bold text-secondary-600 mb-2">50K+</div>
				<div class="text-surface-600-300-token">Transactions</div>
			</div>
			<div>
				<div class="text-4xl font-bold text-tertiary-600 mb-2">99.9%</div>
				<div class="text-surface-600-300-token">Uptime</div>
			</div>
		</div>
	</section>

	<!-- CTA Section -->
	<section class="text-center">
		<h2 class="h2 mb-4">Ready to Get Started?</h2>
		<p class="text-xl text-surface-600-300-token mb-8">
			Join thousands of users managing their subscriptions efficiently.
		</p>
		<a href="/auth/register" class="btn variant-filled-primary btn-lg">Create Your Account</a>
	</section>
</div>