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
      active: { class: 'bg-green-100 text-green-800', icon: CheckCircle2, text: 'Active' },
      expired: { class: 'bg-red-100 text-red-800', icon: XCircle, text: 'Expired' },
      cancelled: { class: 'bg-gray-100 text-gray-800', icon: XCircle, text: 'Cancelled' },
      pending: { class: 'bg-yellow-100 text-yellow-800', icon: Clock, text: 'Pending' }
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
  <title>My Subscriptions - SubSlush</title>
  <meta name="description" content="Manage your active subscriptions and view account details." />
</svelte:head>

<!-- Header Section -->
<div class="flex items-center justify-between mb-6">
  <div>
    <h1 class="text-2xl font-bold text-gray-900">
      My Subscriptions
      <span class="inline-block">📺</span>
    </h1>
    <p class="text-gray-600 mt-1 text-base">
      Manage your active subscriptions and view account details
    </p>
  </div>

  <div class="flex gap-3">
    <a
      href="/dashboard/subscriptions"
      class="px-6 py-2.5 text-white text-sm font-medium rounded-lg transition-all duration-300 focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 flex items-center space-x-2 hover:shadow-lg hover:shadow-pink-500/30 hover:scale-105"
      style="background-color: #F06292;"
      onmouseover="this.style.backgroundColor='#E91E63'"
      onmouseout="this.style.backgroundColor='#F06292'"
    >
      <Plus size={20} />
      <span>Browse Plans</span>
    </a>
  </div>
</div>

<!-- Status Filters -->
<div class="bg-white rounded-xl border border-gray-200 p-6 mb-6">
  <div class="flex items-center space-x-2 mb-4">
    <Filter size={20} class="text-gray-600" />
    <span class="text-sm font-medium text-gray-700">Filter by Status</span>
  </div>
  <div class="flex flex-wrap gap-3">
    {#each statusFilters as filter}
      <button
        on:click={() => selectedFilter = filter.value}
        class="flex items-center space-x-2 px-4 py-2 rounded-lg border transition-all duration-200 {selectedFilter === filter.value
          ? 'bg-blue-500 text-white border-blue-500'
          : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'}"
      >
        <span class="font-medium">{filter.label}</span>
        <span class="text-xs px-2 py-1 rounded-full {selectedFilter === filter.value
          ? 'bg-white bg-opacity-20'
          : 'bg-gray-200'}">{filter.count}</span>
      </button>
    {/each}
  </div>
</div>

<!-- Subscriptions List -->
{#if filteredSubscriptions.length === 0}
  <div class="bg-white rounded-xl border border-gray-200 p-12 text-center">
    <div class="mb-4 p-4 bg-gray-100 rounded-full inline-block">
      <ShoppingBag class="w-10 h-10 text-gray-400" />
    </div>
    <h3 class="text-lg font-medium text-gray-900 mb-2">
      No subscriptions found
    </h3>
    <p class="text-gray-500 mb-6">
      {selectedFilter === 'all'
        ? "You don't have any subscriptions yet."
        : `No ${selectedFilter} subscriptions found.`}
    </p>
    <a
      href="/dashboard/subscriptions"
      class="inline-flex items-center px-6 py-2.5 text-white text-sm font-medium rounded-lg transition-colors focus:ring-2 focus:ring-offset-2"
      style="background-color: #4FC3F7; focus:ring-color: #4FC3F7;"
      onmouseover="this.style.backgroundColor='#29B6F6'"
      onmouseout="this.style.backgroundColor='#4FC3F7'"
    >
      <Plus size={16} class="mr-2" />
      Browse Available Plans
    </a>
  </div>
  {:else}
    <div class="space-y-4">
      {#each filteredSubscriptions as subscription (subscription.id)}
        {@const Icon = getServiceIcon(subscription.service_type)}
        {@const statusBadge = getStatusBadge(subscription.status)}
        {@const daysUntilExpiry = getDaysUntilExpiry(subscription.end_date)}
        {@const isExpiringSoon = daysUntilExpiry <= 7 && subscription.status === 'active'}

        <div class="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow">
          <!-- Subscription Header -->
          <div class="flex items-start justify-between mb-4">
            <div class="flex items-center space-x-4">
              <div class="p-3 bg-blue-100 rounded-lg">
                <svelte:component this={Icon} size={24} class="text-blue-600" />
              </div>

              <div>
                <h3 class="text-lg font-semibold text-gray-900">
                  {getServiceName(subscription.service_type)}
                </h3>
                <p class="text-gray-600 text-sm capitalize">
                  {subscription.service_plan} Plan
                </p>
              </div>
            </div>

            <!-- Status Badge -->
            <div class="flex items-center space-x-2">
              {#if isExpiringSoon}
                <span class="bg-yellow-100 text-yellow-800 text-xs font-medium px-2 py-1 rounded-full">
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
              <Calendar size={16} class="text-gray-400" />
              <div>
                <p class="text-gray-600">Start Date</p>
                <p class="font-medium text-gray-900">{formatDate(subscription.start_date)}</p>
              </div>
            </div>

            <div class="flex items-center space-x-3 text-sm">
              <Clock size={16} class="text-gray-400" />
              <div>
                <p class="text-gray-600">End Date</p>
                <p class="font-medium text-gray-900">{formatDate(subscription.end_date)}</p>
              </div>
            </div>

            <div class="flex items-center space-x-3 text-sm">
              <CheckCircle2 size={16} class="text-gray-400" />
              <div>
                <p class="text-gray-600">Auto Renew</p>
                <p class="font-medium text-gray-900">
                  {subscription.auto_renew ? 'Enabled' : 'Disabled'}
                </p>
              </div>
            </div>
          </div>

          <!-- Credentials Section (Placeholder) -->
          <div class="border-t border-gray-200 pt-4">
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-medium text-gray-700">Account Credentials</h4>
              <button
                on:click={() => toggleCredentials(subscription.id)}
                class="inline-flex items-center text-sm text-blue-600 hover:text-blue-700 transition-colors"
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
              <div class="mt-3 p-3 bg-gray-50 rounded-lg">
                <div class="space-y-2 text-sm">
                  <div class="flex justify-between">
                    <span class="text-gray-600">Email:</span>
                    <span class="font-mono text-gray-900">account@example.com</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-600">Password:</span>
                    <span class="font-mono text-gray-900">••••••••••</span>
                  </div>
                  <p class="text-xs text-gray-500 mt-2">
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
              class="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              View Details
            </a>
            {#if subscription.status === 'active'}
              <button class="text-sm text-red-600 hover:text-red-700 transition-colors">
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
          class="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
        >
          Previous
        </button>
        <span class="text-sm text-gray-600">
          Page {data.pagination.page} of {data.pagination.totalPages}
        </span>
        <button
          disabled={!data.pagination.hasNext}
          class="px-4 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50"
        >
          Next
        </button>
      </div>
    </div>
  {/if}
{/if}