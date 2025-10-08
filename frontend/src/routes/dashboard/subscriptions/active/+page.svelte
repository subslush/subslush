<script lang="ts">
  import { Music, Film, TrendingUp, Calendar, Clock, CheckCircle2, XCircle, Eye, EyeOff, ShoppingBag, Filter, Plus } from 'lucide-svelte';
  import { user } from '$lib/stores/auth.js';
  import type { Subscription, ServiceType, SubscriptionStatus } from '$lib/types/subscription.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let showCredentials: Record<string, boolean> = {};
  let selectedFilter: SubscriptionStatus | 'all' = 'all';

  // Filter subscriptions based on status
  $: filteredSubscriptions = selectedFilter === 'all'
    ? data.subscriptions
    : data.subscriptions.filter(sub => sub.status === selectedFilter);

  // Service icons and names mapping
  const serviceIcons = {
    spotify: Music,
    netflix: Film,
    tradingview: TrendingUp
  };

  const serviceNames = {
    spotify: 'Spotify',
    netflix: 'Netflix',
    tradingview: 'TradingView'
  };

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function getStatusBadge(status: SubscriptionStatus) {
    const badges = {
      active: { class: 'bg-success-100 text-success-800 dark:bg-success-900 dark:text-success-200', icon: CheckCircle2, text: 'Active' },
      expired: { class: 'bg-error-100 text-error-800 dark:bg-error-900 dark:text-error-200', icon: XCircle, text: 'Expired' },
      cancelled: { class: 'bg-surface-100 text-surface-800 dark:bg-surface-700 dark:text-surface-200', icon: XCircle, text: 'Cancelled' },
      pending: { class: 'bg-warning-100 text-warning-800 dark:bg-warning-900 dark:text-warning-200', icon: Clock, text: 'Pending' }
    };
    return badges[status] || badges.pending;
  }

  function getDaysUntilExpiry(endDate: string): number {
    const today = new Date();
    const expiry = new Date(endDate);
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  function toggleCredentials(subscriptionId: string) {
    showCredentials[subscriptionId] = !showCredentials[subscriptionId];
  }

  function getServiceIcon(serviceType: ServiceType) {
    return serviceIcons[serviceType] || Music;
  }

  function getServiceName(serviceType: ServiceType) {
    return serviceNames[serviceType] || serviceType;
  }

  // Status filter options
  const statusFilters = [
    { value: 'all' as const, label: 'All Status', count: data.subscriptions.length },
    { value: 'active' as const, label: 'Active', count: data.subscriptions.filter(s => s.status === 'active').length },
    { value: 'expired' as const, label: 'Expired', count: data.subscriptions.filter(s => s.status === 'expired').length },
    { value: 'cancelled' as const, label: 'Cancelled', count: data.subscriptions.filter(s => s.status === 'cancelled').length }
  ] as const;
</script>

<svelte:head>
  <title>My Subscriptions - Subscription Platform</title>
  <meta name="description" content="Manage your active subscriptions and view account details." />
</svelte:head>

<div class="container mx-auto p-6 max-w-7xl">
  <!-- Header Section -->
  <div class="mb-8">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold text-surface-900 dark:text-surface-100 mb-2">
          My Subscriptions
        </h1>
        <p class="text-surface-600 dark:text-surface-300">
          Manage your active subscriptions and view account details
        </p>
      </div>

      <a
        href="/dashboard/subscriptions"
        class="inline-flex items-center justify-center bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition-colors"
      >
        <Plus size={16} class="mr-2" />
        Browse Plans
      </a>
    </div>
  </div>

  <!-- Status Filters -->
  <div class="mb-6">
    <div class="flex items-center space-x-2 mb-4">
      <Filter size={20} class="text-surface-600 dark:text-surface-300" />
      <span class="text-sm font-medium text-surface-700 dark:text-surface-300">Filter by Status</span>
    </div>
    <div class="flex flex-wrap gap-3">
      {#each statusFilters as filter}
        <button
          on:click={() => selectedFilter = filter.value}
          class="flex items-center space-x-2 px-4 py-2 rounded-lg border transition-all duration-200 {selectedFilter === filter.value
            ? 'bg-primary-600 text-white border-primary-600'
            : 'bg-surface-50 dark:bg-surface-800 text-surface-700 dark:text-surface-300 border-surface-300 dark:border-surface-600 hover:bg-surface-100 dark:hover:bg-surface-700'}"
        >
          <span class="font-medium">{filter.label}</span>
          <span class="text-xs px-2 py-1 rounded-full {selectedFilter === filter.value
            ? 'bg-white bg-opacity-20'
            : 'bg-surface-200 dark:bg-surface-700'}">{filter.count}</span>
        </button>
      {/each}
    </div>
  </div>

  <!-- Subscriptions List -->
  {#if filteredSubscriptions.length === 0}
    <div class="text-center py-12">
      <div class="bg-surface-100 dark:bg-surface-800 rounded-lg p-8">
        <ShoppingBag size={48} class="mx-auto text-surface-400 dark:text-surface-500 mb-4" />
        <h3 class="text-lg font-medium text-surface-900 dark:text-surface-100 mb-2">
          No subscriptions found
        </h3>
        <p class="text-surface-600 dark:text-surface-300 mb-6">
          {selectedFilter === 'all'
            ? "You don't have any subscriptions yet."
            : `No ${selectedFilter} subscriptions found.`}
        </p>
        <a
          href="/dashboard/subscriptions"
          class="inline-flex items-center bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} class="mr-2" />
          Browse Available Plans
        </a>
      </div>
    </div>
  {:else}
    <div class="space-y-4">
      {#each filteredSubscriptions as subscription (subscription.id)}
        {@const Icon = getServiceIcon(subscription.service_type)}
        {@const statusBadge = getStatusBadge(subscription.status)}
        {@const daysUntilExpiry = getDaysUntilExpiry(subscription.end_date)}
        {@const isExpiringSoon = daysUntilExpiry <= 7 && subscription.status === 'active'}

        <div class="bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-lg p-6 hover:shadow-lg transition-shadow">
          <!-- Subscription Header -->
          <div class="flex items-start justify-between mb-4">
            <div class="flex items-center space-x-4">
              <div class="p-3 bg-primary-100 dark:bg-primary-900 rounded-lg">
                <svelte:component this={Icon} size={24} class="text-primary-600 dark:text-primary-400" />
              </div>

              <div>
                <h3 class="text-lg font-semibold text-surface-900 dark:text-surface-100">
                  {getServiceName(subscription.service_type)}
                </h3>
                <p class="text-surface-600 dark:text-surface-300 text-sm capitalize">
                  {subscription.service_plan} Plan
                </p>
              </div>
            </div>

            <!-- Status Badge -->
            <div class="flex items-center space-x-2">
              {#if isExpiringSoon}
                <span class="bg-warning-100 text-warning-800 dark:bg-warning-900 dark:text-warning-200 text-xs font-medium px-2 py-1 rounded-full">
                  Expires in {daysUntilExpiry} day{daysUntilExpiry === 1 ? '' : 's'}
                </span>
              {/if}
              <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium {statusBadge.class}">
                <svelte:component this={statusBadge.icon} size={14} class="mr-1" />
                {statusBadge.text}
              </span>
            </div>
          </div>

          <!-- Subscription Details -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div class="flex items-center space-x-3 text-sm">
              <Calendar size={16} class="text-surface-400 dark:text-surface-500" />
              <div>
                <p class="text-surface-600 dark:text-surface-300">Start Date</p>
                <p class="font-medium text-surface-900 dark:text-surface-100">{formatDate(subscription.start_date)}</p>
              </div>
            </div>

            <div class="flex items-center space-x-3 text-sm">
              <Clock size={16} class="text-surface-400 dark:text-surface-500" />
              <div>
                <p class="text-surface-600 dark:text-surface-300">End Date</p>
                <p class="font-medium text-surface-900 dark:text-surface-100">{formatDate(subscription.end_date)}</p>
              </div>
            </div>

            <div class="flex items-center space-x-3 text-sm">
              <CheckCircle2 size={16} class="text-surface-400 dark:text-surface-500" />
              <div>
                <p class="text-surface-600 dark:text-surface-300">Auto Renew</p>
                <p class="font-medium text-surface-900 dark:text-surface-100">
                  {subscription.auto_renew ? 'Enabled' : 'Disabled'}
                </p>
              </div>
            </div>
          </div>

          <!-- Credentials Section (Placeholder) -->
          <div class="border-t border-surface-200 dark:border-surface-600 pt-4">
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-medium text-surface-700 dark:text-surface-300">Account Credentials</h4>
              <button
                on:click={() => toggleCredentials(subscription.id)}
                class="inline-flex items-center text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
              >
                {#if showCredentials[subscription.id]}
                  <EyeOff size={16} class="mr-1" />
                  Hide
                {:else}
                  <Eye size={16} class="mr-1" />
                  Show
                {/if}
              </button>
            </div>

            {#if showCredentials[subscription.id]}
              <div class="mt-3 p-3 bg-surface-100 dark:bg-surface-700 rounded-lg">
                <div class="space-y-2 text-sm">
                  <div class="flex justify-between">
                    <span class="text-surface-600 dark:text-surface-300">Email:</span>
                    <span class="font-mono text-surface-900 dark:text-surface-100">account@example.com</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-surface-600 dark:text-surface-300">Password:</span>
                    <span class="font-mono text-surface-900 dark:text-surface-100">••••••••••</span>
                  </div>
                  <p class="text-xs text-surface-500 dark:text-surface-400 mt-2">
                    Account credentials will be provided via secure delivery after purchase processing.
                  </p>
                </div>
              </div>
            {/if}
          </div>

          <!-- Action Buttons -->
          <div class="flex justify-end space-x-3 mt-4">
            <a
              href="/dashboard/subscriptions/{subscription.id}"
              class="inline-flex items-center text-sm text-surface-600 dark:text-surface-300 hover:text-surface-900 dark:hover:text-surface-100 transition-colors"
            >
              View Details
            </a>
            {#if subscription.status === 'active'}
              <button class="text-sm text-error-600 hover:text-error-700 transition-colors">
                Cancel Subscription
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>

    <!-- Pagination (if needed) -->
    {#if data.pagination && data.pagination.totalPages > 1}
      <div class="mt-8 flex justify-center">
        <div class="flex items-center space-x-2">
          <button
            disabled={!data.pagination.hasPrevious}
            class="px-3 py-1 text-sm border rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span class="text-sm text-surface-600 dark:text-surface-300">
            Page {data.pagination.page} of {data.pagination.totalPages}
          </span>
          <button
            disabled={!data.pagination.hasNext}
            class="px-3 py-1 text-sm border rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    {/if}
  {/if}

  <!-- Quick Actions -->
  <div class="mt-12 bg-surface-100 dark:bg-surface-800 rounded-lg p-6">
    <h2 class="text-xl font-semibold text-surface-900 dark:text-surface-100 mb-4">
      Quick Actions
    </h2>
    <div class="flex flex-wrap gap-4">
      <a
        href="/dashboard/subscriptions"
        class="inline-flex items-center bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition-colors"
      >
        <ShoppingBag size={16} class="mr-2" />
        Browse More Plans
      </a>
      <a
        href="/dashboard/credits"
        class="inline-flex items-center bg-surface-50 dark:bg-surface-700 hover:bg-surface-200 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-300 px-4 py-2 rounded-lg transition-colors"
      >
        <Plus size={16} class="mr-2" />
        Add Credits
      </a>
    </div>
  </div>
</div>