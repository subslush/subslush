<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import {
    Loader2,
    Music,
    Tv,
    TrendingUp,
    AlertCircle,
    Calendar,
    Clock,
    CheckCircle2,
    XCircle,
    RefreshCw,
    Eye,
    ShoppingBag
  } from 'lucide-svelte';
  import { subscriptionService } from '$lib/api/subscriptions.js';
  import { user } from '$lib/stores/auth.js';
  import { ERROR_MESSAGES } from '$lib/utils/constants.js';
  import type { Subscription, ServiceType, SubscriptionStatus } from '$lib/types/subscription.js';

  let selectedStatus: SubscriptionStatus | 'all' = 'all';
  let selectedService: ServiceType | 'all' = 'all';

  const subscriptionsQuery = createQuery({
    queryKey: ['subscriptions', 'my-subscriptions', selectedStatus, selectedService],
    queryFn: () => {
      const query: any = {};
      if (selectedStatus !== 'all') query.status = selectedStatus;
      if (selectedService !== 'all') query.service_type = selectedService;
      return subscriptionService.getMySubscriptions(query);
    },
    enabled: !!$user?.id,
    staleTime: 30000,
    retry: 2
  });

  const serviceDisplayNames = {
    spotify: 'Spotify',
    netflix: 'Netflix',
    tradingview: 'TradingView'
  };

  const serviceIcons = {
    spotify: Music,
    netflix: Tv,
    tradingview: TrendingUp
  };

  const serviceColors = {
    spotify: 'bg-green-500',
    netflix: 'bg-red-500',
    tradingview: 'bg-blue-500'
  };

  const statusConfig = {
    active: {
      label: 'Active',
      icon: CheckCircle2,
      badgeClass: 'badge variant-filled-success',
      textClass: 'text-success-600-300-token'
    },
    expired: {
      label: 'Expired',
      icon: Clock,
      badgeClass: 'badge variant-filled-warning',
      textClass: 'text-warning-600-300-token'
    },
    cancelled: {
      label: 'Cancelled',
      icon: XCircle,
      badgeClass: 'badge variant-filled-error',
      textClass: 'text-error-600-300-token'
    },
    pending: {
      label: 'Pending',
      icon: RefreshCw,
      badgeClass: 'badge variant-filled-surface',
      textClass: 'text-surface-600-300-token'
    }
  };

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function getTimeRemaining(endDate: string): string {
    const end = new Date(endDate);
    const now = new Date();
    const diffTime = end.getTime() - now.getTime();

    if (diffTime <= 0) return 'Expired';

    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return '1 day remaining';
    if (diffDays < 30) return `${diffDays} days remaining`;
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30);
      const remainingDays = diffDays % 30;
      if (remainingDays === 0) return `${months} month${months > 1 ? 's' : ''} remaining`;
      return `${months} month${months > 1 ? 's' : ''}, ${remainingDays} day${remainingDays > 1 ? 's' : ''} remaining`;
    }

    const years = Math.floor(diffDays / 365);
    return `${years} year${years > 1 ? 's' : ''} remaining`;
  }

  $: filteredSubscriptions = $subscriptionsQuery.data?.subscriptions || [];
</script>

<svelte:head>
  <title>My Subscriptions - Subscription Platform</title>
</svelte:head>

<div class="space-y-6">
  <!-- Page Header -->
  <div class="bg-surface-100-800-token border border-surface-300-600-token rounded-lg shadow-lg p-6">
    <div class="flex items-center space-x-3 mb-2">
      <div class="p-3 bg-primary-500 text-white rounded-full">
        <Calendar class="w-6 h-6" />
      </div>
      <h1 class="text-3xl font-bold text-surface-900-50-token">My Subscriptions</h1>
    </div>
    <p class="text-surface-600-300-token">
      Manage your active subscriptions and view subscription history
    </p>
  </div>

  <!-- Filters -->
  <div class="bg-surface-100-800-token border border-surface-300-600-token rounded-lg shadow-lg p-6">
    <h2 class="text-lg font-semibold text-surface-900-50-token mb-4">Filters</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <!-- Status Filter -->
      <div>
        <label for="status-filter" class="block text-sm font-medium text-surface-900-50-token mb-2">
          Status
        </label>
        <select
          id="status-filter"
          bind:value={selectedStatus}
          class="select w-full"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
          <option value="cancelled">Cancelled</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      <!-- Service Filter -->
      <div>
        <label for="service-filter" class="block text-sm font-medium text-surface-900-50-token mb-2">
          Service
        </label>
        <select
          id="service-filter"
          bind:value={selectedService}
          class="select w-full"
        >
          <option value="all">All Services</option>
          <option value="spotify">Spotify</option>
          <option value="netflix">Netflix</option>
          <option value="tradingview">TradingView</option>
        </select>
      </div>
    </div>
  </div>

  <!-- Main Content -->
  {#if $subscriptionsQuery.isLoading}
    <div class="flex items-center justify-center h-64">
      <div class="flex items-center space-x-3">
        <Loader2 class="w-8 h-8 animate-spin text-primary-500" />
        <span class="text-lg text-surface-600-300-token">Loading your subscriptions...</span>
      </div>
    </div>

  {:else if $subscriptionsQuery.isError}
    <div class="bg-error-100-800-token border border-error-300-600-token rounded-lg p-6">
      <div class="flex items-center space-x-3 mb-4">
        <AlertCircle class="w-6 h-6 text-error-600-300-token" />
        <h2 class="text-lg font-semibold text-error-600-300-token">Failed to Load Subscriptions</h2>
      </div>
      <p class="text-error-600-300-token mb-4">
        {ERROR_MESSAGES.LOAD_SUBSCRIPTIONS_FAILED}
      </p>
      <button
        on:click={() => $subscriptionsQuery.refetch()}
        class="btn variant-filled-error"
      >
        Try Again
      </button>
    </div>

  {:else if filteredSubscriptions.length === 0}
    <div class="bg-surface-100-800-token border border-surface-300-600-token rounded-lg shadow-lg p-12">
      <div class="text-center">
        <div class="p-4 bg-surface-50-900-token rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
          <Calendar class="w-8 h-8 text-surface-600-300-token" />
        </div>
        <h2 class="text-xl font-semibold text-surface-900-50-token mb-2">No Subscriptions Found</h2>
        <p class="text-surface-600-300-token mb-6">
          {selectedStatus === 'all' && selectedService === 'all'
            ? "You don't have any subscriptions yet. Browse our plans to get started."
            : "No subscriptions found matching your current filters."
          }
        </p>
        <div class="flex flex-col sm:flex-row gap-3 justify-center">
          <a href="/dashboard/subscriptions" class="btn variant-filled-primary">
            <ShoppingBag class="w-4 h-4" />
            Browse Subscriptions
          </a>
          {#if selectedStatus !== 'all' || selectedService !== 'all'}
            <button
              on:click={() => {
                selectedStatus = 'all';
                selectedService = 'all';
              }}
              class="btn variant-ghost-surface"
            >
              Clear Filters
            </button>
          {/if}
        </div>
      </div>
    </div>

  {:else}
    <!-- Subscriptions Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {#each filteredSubscriptions as subscription}
        {@const IconComponent = serviceIcons[subscription.service_type]}
        {@const serviceName = serviceDisplayNames[subscription.service_type]}
        {@const serviceColor = serviceColors[subscription.service_type]}
        {@const statusInfo = statusConfig[subscription.status]}
        {@const StatusIcon = statusInfo.icon}

        <div class="bg-surface-100-800-token border border-surface-300-600-token rounded-lg shadow-lg p-6 hover:shadow-xl transition-shadow">
          <!-- Header -->
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center space-x-3">
              <div class="p-3 {serviceColor} text-white rounded-full">
                <IconComponent class="w-6 h-6" />
              </div>
              <div>
                <h3 class="text-lg font-semibold text-surface-900-50-token">{serviceName}</h3>
                <p class="text-sm text-surface-600-300-token capitalize">{subscription.service_plan}</p>
              </div>
            </div>
            <div class="{statusInfo.badgeClass}">
              <StatusIcon class="w-3 h-3" />
              <span>{statusInfo.label}</span>
            </div>
          </div>

          <!-- Subscription Details -->
          <div class="space-y-3 mb-4">
            <div class="flex items-center justify-between text-sm">
              <span class="text-surface-600-300-token">Start Date:</span>
              <span class="text-surface-900-50-token">{formatDate(subscription.start_date)}</span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-surface-600-300-token">End Date:</span>
              <span class="text-surface-900-50-token">{formatDate(subscription.end_date)}</span>
            </div>
            {#if subscription.status === 'active'}
              <div class="flex items-center justify-between text-sm">
                <span class="text-surface-600-300-token">Time Remaining:</span>
                <span class="text-surface-900-50-token font-medium">
                  {getTimeRemaining(subscription.end_date)}
                </span>
              </div>
            {/if}
            <div class="flex items-center justify-between text-sm">
              <span class="text-surface-600-300-token">Auto-Renewal:</span>
              <span class="text-surface-900-50-token">
                {#if subscription.auto_renew}
                  <span class="text-success-600-300-token">Enabled</span>
                {:else}
                  <span class="text-warning-600-300-token">Disabled</span>
                {/if}
              </span>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex space-x-3">
            <a
              href="/dashboard/subscriptions/{subscription.id}"
              class="btn variant-ghost-primary flex-1"
            >
              <Eye class="w-4 h-4" />
              View Details
            </a>
            {#if subscription.status === 'active'}
              <!-- Cancel button would go here in Phase 2 -->
              <button class="btn variant-ghost-surface opacity-50 cursor-not-allowed">
                Cancel (Phase 2)
              </button>
            {/if}
          </div>

          <!-- Renewal Notice for Active Subscriptions -->
          {#if subscription.status === 'active' && subscription.auto_renew}
            <div class="mt-4 bg-info-100-800-token border border-info-300-600-token rounded-lg p-3">
              <div class="flex items-center space-x-2">
                <RefreshCw class="w-4 h-4 text-info-600-300-token" />
                <span class="text-sm text-info-600-300-token">
                  Will auto-renew on {formatDate(subscription.renewal_date)}
                </span>
              </div>
            </div>
          {:else if subscription.status === 'active' && !subscription.auto_renew}
            <div class="mt-4 bg-warning-100-800-token border border-warning-300-600-token rounded-lg p-3">
              <div class="flex items-center space-x-2">
                <Clock class="w-4 h-4 text-warning-600-300-token" />
                <span class="text-sm text-warning-600-300-token">
                  Subscription will expire on {formatDate(subscription.end_date)}
                </span>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Summary Stats -->
    {#if filteredSubscriptions.length > 0}
      <div class="bg-surface-100-800-token border border-surface-300-600-token rounded-lg shadow-lg p-6">
        <h2 class="text-lg font-semibold text-surface-900-50-token mb-4">Summary</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p class="text-2xl font-bold text-surface-900-50-token">
              {filteredSubscriptions.filter(s => s.status === 'active').length}
            </p>
            <p class="text-sm text-surface-600-300-token">Active</p>
          </div>
          <div>
            <p class="text-2xl font-bold text-surface-900-50-token">
              {filteredSubscriptions.filter(s => s.status === 'expired').length}
            </p>
            <p class="text-sm text-surface-600-300-token">Expired</p>
          </div>
          <div>
            <p class="text-2xl font-bold text-surface-900-50-token">
              {filteredSubscriptions.filter(s => s.auto_renew).length}
            </p>
            <p class="text-sm text-surface-600-300-token">Auto-Renewal</p>
          </div>
          <div>
            <p class="text-2xl font-bold text-surface-900-50-token">
              {filteredSubscriptions.length}
            </p>
            <p class="text-sm text-surface-600-300-token">Total</p>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>