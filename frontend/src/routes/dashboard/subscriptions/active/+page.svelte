<script lang="ts">
  import { Music, Film, TrendingUp, Calendar, Clock, CheckCircle2, XCircle, Eye, EyeOff, ShoppingBag, Filter, Plus, AlertTriangle } from 'lucide-svelte';
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
      active: { class: 'bg-green-100 text-green-800 border border-green-200', icon: CheckCircle2, text: 'Active' },
      expired: { class: 'bg-red-100 text-red-800 border border-red-200', icon: XCircle, text: 'Expired' },
      cancelled: { class: 'bg-gray-100 text-gray-800 border border-gray-200', icon: XCircle, text: 'Cancelled' },
      pending: { class: 'bg-amber-100 text-amber-800 border border-amber-200', icon: Clock, text: 'Pending' }
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

<div class="min-h-screen bg-gray-50">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <!-- Header Section -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-3xl font-bold text-gray-900 mb-2">
          My Subscriptions
        </h1>
        <p class="text-base text-gray-600">
          Manage your active subscriptions and access credentials
        </p>
      </div>

      <div class="flex gap-4">
        <a
          href="/dashboard/subscriptions"
          class="bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 text-white font-semibold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 inline-flex items-center gap-2"
        >
          <Plus size={20} />
          <span>Add New Subscription</span>
        </a>
      </div>
    </div>

    <!-- Status Filters -->
    <div class="bg-white rounded-xl border border-gray-200 p-6 mb-8 shadow-sm">
      <div class="flex items-center gap-2 mb-4">
        <Filter size={20} class="text-gray-600" />
        <span class="text-sm font-medium text-gray-700">Filter by Status</span>
      </div>
      <div class="flex flex-wrap gap-2">
        {#each statusFilters as filter}
          <button
            on:click={() => selectedFilter = filter.value}
            class="px-4 py-2 text-sm font-medium rounded-lg transition-colors duration-150 {selectedFilter === filter.value
              ? 'bg-gradient-to-br from-cyan-500/[0.08] to-pink-500/[0.08] border border-cyan-200/50 text-gray-900'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border border-transparent'}"
          >
            <span>{filter.label}</span>
            <span class="ml-2 text-xs px-2 py-0.5 rounded-full {selectedFilter === filter.value
              ? 'bg-cyan-100 text-cyan-800'
              : 'bg-gray-200 text-gray-600'}">({filter.count})</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Subscriptions List -->
    {#if filteredSubscriptions.length === 0}
      <div class="text-center py-12 bg-white rounded-xl border border-gray-200 shadow-sm">
        <div class="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
          <ShoppingBag size={32} class="text-gray-400" />
        </div>
        <h3 class="text-lg font-semibold text-gray-900 mb-2">
          No subscriptions found
        </h3>
        <p class="text-base text-gray-600 mb-6">
          {selectedFilter === 'all'
            ? "You haven't added any subscriptions yet."
            : `No ${selectedFilter} subscriptions found.`}
        </p>
        <a href="/dashboard/subscriptions"
           class="inline-flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 text-white font-semibold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105">
          <Plus size={20} />
          <span>Browse Subscriptions</span>
        </a>
      </div>
    {:else}
      <div class="grid gap-6">
        {#each filteredSubscriptions as subscription (subscription.id)}
          {@const Icon = getServiceIcon(subscription.service_type)}
          {@const statusBadge = getStatusBadge(subscription.status)}
          {@const daysUntilExpiry = getDaysUntilExpiry(subscription.end_date)}
          {@const isExpiringSoon = daysUntilExpiry <= 7 && subscription.status === 'active'}

          <div class="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
            <!-- Subscription Header -->
            <div class="flex items-start justify-between mb-4">
              <div class="flex items-center gap-3">
                <div class="p-3 bg-cyan-50 rounded-lg">
                  <svelte:component this={Icon} size={24} class="text-cyan-600" />
                </div>

                <div>
                  <h3 class="text-lg font-semibold text-gray-900">
                    {getServiceName(subscription.service_type)}
                  </h3>
                  <p class="text-sm text-gray-500 capitalize">
                    {subscription.service_plan} Plan
                  </p>
                </div>
              </div>

              <!-- Status Badge -->
              <div class="flex items-center gap-2">
                {#if isExpiringSoon}
                  <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                    <Clock size={12} class="mr-1.5" />
                    Expires in {daysUntilExpiry} day{daysUntilExpiry === 1 ? '' : 's'}
                  </span>
                {/if}
                <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium {statusBadge.class}">
                  <svelte:component this={statusBadge.icon} size={14} class="mr-1.5" />
                  {statusBadge.text}
                </span>
              </div>
            </div>

            <!-- Subscription Details -->
            <div class="space-y-3 pt-4 border-t border-gray-200">
              <div class="flex items-center justify-between text-sm">
                <span class="text-gray-600">Start Date:</span>
                <span class="font-medium text-gray-900">{formatDate(subscription.start_date)}</span>
              </div>
              <div class="flex items-center justify-between text-sm">
                <span class="text-gray-600">End Date:</span>
                <span class="font-medium text-gray-900">{formatDate(subscription.end_date)}</span>
              </div>
              <div class="flex items-center justify-between text-sm">
                <span class="text-gray-600">Days Remaining:</span>
                <span class="font-medium text-gray-900">{getDaysUntilExpiry(subscription.end_date)} days</span>
              </div>
              <div class="flex items-center justify-between text-sm">
                <span class="text-gray-600">Auto Renew:</span>
                <span class="font-medium text-gray-900">
                  {subscription.auto_renew ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>

            <!-- Credentials Section -->
            <div class="mt-4 pt-4 border-t border-gray-200">
              <div class="flex items-center justify-between">
                <h4 class="text-sm font-medium text-gray-700">Account Credentials</h4>
                <button
                  on:click={() => toggleCredentials(subscription.id)}
                  class="inline-flex items-center text-sm font-medium text-cyan-600 hover:text-cyan-700 transition-colors"
                >
                  {#if showCredentials[subscription.id]}
                    <EyeOff size={16} class="mr-1.5" />
                    Hide
                  {:else}
                    <Eye size={16} class="mr-1.5" />
                    Show
                  {/if}
                </button>
              </div>

              {#if showCredentials[subscription.id]}
                <div class="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                      <span class="text-gray-600">Email:</span>
                      <span class="font-mono text-gray-900">account@example.com</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-gray-600">Password:</span>
                      <span class="font-mono text-gray-900">••••••••••</span>
                    </div>
                  </div>
                  <div class="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p class="text-xs text-amber-800">
                      <AlertTriangle size={12} class="inline mr-1.5" />
                      Keep these credentials secure. Do not share with others.
                    </p>
                  </div>
                </div>
              {/if}
            </div>

            <!-- Action Buttons -->
            <div class="mt-4 pt-4 border-t border-gray-200 flex gap-3">
              <a
                href="/dashboard/subscriptions/{subscription.id}"
                class="flex-1 text-center bg-cyan-500 hover:bg-cyan-600 text-white font-medium py-2.5 px-4 rounded-lg transition-colors duration-150"
              >
                View Details
              </a>
              <button class="flex-1 bg-white hover:bg-gray-50 text-gray-700 font-medium py-2.5 px-4 rounded-lg border border-gray-300 transition-colors duration-150">
                Manage
              </button>
            </div>
          </div>
        {/each}
      </div>

      <!-- Pagination (if needed) -->
      {#if data.pagination && data.pagination.totalPages > 1}
        <div class="mt-8 flex justify-center">
          <div class="flex items-center gap-2">
            <button
              disabled={!data.pagination.hasPrevious}
              class="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50 text-gray-700 font-medium transition-colors"
            >
              Previous
            </button>
            <span class="text-sm text-gray-600 px-4">
              Page {data.pagination.page} of {data.pagination.totalPages}
            </span>
            <button
              disabled={!data.pagination.hasNext}
              class="px-4 py-2 text-sm bg-white border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-gray-50 text-gray-700 font-medium transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>