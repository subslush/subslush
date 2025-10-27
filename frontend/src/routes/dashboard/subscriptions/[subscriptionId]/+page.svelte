<script lang="ts">
  import { Music, Film, TrendingUp, Calendar, Clock, CheckCircle2, XCircle, Eye, EyeOff, ArrowLeft, AlertTriangle, RotateCcw, CreditCard } from 'lucide-svelte';
  import { goto } from '$app/navigation';
  import type { Subscription, ServiceType, SubscriptionStatus } from '$lib/types/subscription.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let showCredentials = false;

  $: subscription = data?.subscription;
  $: isLoading = !subscription;

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
      month: 'long',
      day: 'numeric'
    });
  }

  function formatTime(dateString: string): string {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
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

  function getServiceIcon(serviceType: ServiceType) {
    return serviceIcons[serviceType] || Music;
  }

  function getServiceName(serviceType: ServiceType) {
    return serviceNames[serviceType] || serviceType;
  }

  function goBack() {
    goto('/dashboard/subscriptions/active');
  }

  function toggleCredentials() {
    showCredentials = !showCredentials;
  }

  $: Icon = subscription ? getServiceIcon(subscription.service_type) : Music;
  $: statusBadge = subscription ? getStatusBadge(subscription.status) : { class: 'bg-surface-100 text-surface-800', icon: Clock, text: 'Loading...' };
  $: daysUntilExpiry = subscription ? getDaysUntilExpiry(subscription.end_date) : 0;
  $: isExpiringSoon = subscription ? daysUntilExpiry <= 7 && subscription.status === 'active' : false;
  $: isExpired = subscription ? subscription.status === 'expired' : false;
</script>

<svelte:head>
  <title>{subscription ? getServiceName(subscription.service_type) : 'Loading'} Subscription - Subscription Platform</title>
  <meta name="description" content="View and manage your {subscription ? getServiceName(subscription.service_type) : ''} subscription details." />
</svelte:head>

<div class="container mx-auto p-6 max-w-4xl">
  <!-- Back Button -->
  <button
    on:click={goBack}
    class="inline-flex items-center text-surface-600 dark:text-surface-300 hover:text-surface-900 dark:hover:text-surface-100 transition-colors mb-6"
  >
    <ArrowLeft size={20} class="mr-2" />
    Back to My Subscriptions
  </button>

  {#if isLoading}
    <!-- Loading State -->
    <div class="space-y-8">
      <!-- Header Skeleton -->
      <div class="bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-lg p-6">
        <div class="flex items-start justify-between">
          <div class="flex items-center space-x-4">
            <div class="p-4 bg-surface-200 dark:bg-surface-700 rounded-lg animate-pulse">
              <div class="w-8 h-8"></div>
            </div>
            <div class="space-y-2">
              <div class="h-6 bg-surface-200 dark:bg-surface-700 rounded animate-pulse w-32"></div>
              <div class="h-4 bg-surface-200 dark:bg-surface-700 rounded animate-pulse w-24"></div>
              <div class="h-3 bg-surface-200 dark:bg-surface-700 rounded animate-pulse w-40"></div>
            </div>
          </div>
          <div class="h-8 w-20 bg-surface-200 dark:bg-surface-700 rounded-full animate-pulse"></div>
        </div>
      </div>

      <!-- Content Skeleton -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div class="bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-lg p-6">
          <div class="h-6 bg-surface-200 dark:bg-surface-700 rounded animate-pulse w-48 mb-6"></div>
          <div class="space-y-4">
            {#each Array(4) as _}
              <div class="flex justify-between py-3">
                <div class="h-4 bg-surface-200 dark:bg-surface-700 rounded animate-pulse w-24"></div>
                <div class="h-4 bg-surface-200 dark:bg-surface-700 rounded animate-pulse w-32"></div>
              </div>
            {/each}
          </div>
        </div>
        <div class="bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-lg p-6">
          <div class="h-6 bg-surface-200 dark:bg-surface-700 rounded animate-pulse w-40 mb-6"></div>
          <div class="h-32 bg-surface-200 dark:bg-surface-700 rounded animate-pulse"></div>
        </div>
      </div>
    </div>
  {:else if subscription}

  <!-- Header Section -->
  <div class="bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-lg p-6 mb-8">
    <div class="flex items-start justify-between">
      <div class="flex items-center space-x-4">
        <div class="p-4 bg-primary-100 dark:bg-primary-900 rounded-lg">
          <svelte:component this={Icon} size={32} class="text-primary-600 dark:text-primary-400" />
        </div>

        <div>
          <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-100 mb-1">
            {getServiceName(subscription.service_type)}
          </h1>
          <p class="text-surface-600 dark:text-surface-300 text-lg capitalize">
            {subscription.service_plan} Plan
          </p>
          <p class="text-surface-500 dark:text-surface-400 text-sm">
            Subscription ID: {subscription.id}
          </p>
        </div>
      </div>

      <!-- Status Badge -->
      <div class="text-right">
        <span class="inline-flex items-center px-4 py-2 rounded-full text-sm font-medium {statusBadge.class} mb-2">
          <svelte:component this={statusBadge.icon} size={16} class="mr-2" />
          {statusBadge.text}
        </span>

        {#if isExpiringSoon}
          <div class="bg-warning-100 text-warning-800 dark:bg-warning-900 dark:text-warning-200 text-sm font-medium px-3 py-1 rounded-full">
            <AlertTriangle size={14} class="inline mr-1" />
            Expires in {daysUntilExpiry} day{daysUntilExpiry === 1 ? '' : 's'}
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Subscription Details -->
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
    <!-- Subscription Information -->
    <div class="bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-lg p-6">
      <h2 class="text-xl font-semibold text-surface-900 dark:text-surface-100 mb-6">
        Subscription Details
      </h2>

      <div class="space-y-4">
        <div class="flex items-center justify-between py-3 border-b border-surface-200 dark:border-surface-600">
          <div class="flex items-center space-x-3">
            <Calendar size={18} class="text-surface-400 dark:text-surface-500" />
            <span class="text-surface-600 dark:text-surface-300">Start Date</span>
          </div>
          <span class="font-medium text-surface-900 dark:text-surface-100">
            {formatDate(subscription.start_date)}
          </span>
        </div>

        <div class="flex items-center justify-between py-3 border-b border-surface-200 dark:border-surface-600">
          <div class="flex items-center space-x-3">
            <Clock size={18} class="text-surface-400 dark:text-surface-500" />
            <span class="text-surface-600 dark:text-surface-300">End Date</span>
          </div>
          <span class="font-medium text-surface-900 dark:text-surface-100">
            {formatDate(subscription.end_date)}
          </span>
        </div>

        <div class="flex items-center justify-between py-3 border-b border-surface-200 dark:border-surface-600">
          <div class="flex items-center space-x-3">
            <RotateCcw size={18} class="text-surface-400 dark:text-surface-500" />
            <span class="text-surface-600 dark:text-surface-300">Auto Renewal</span>
          </div>
          <span class="font-medium text-surface-900 dark:text-surface-100">
            {subscription.auto_renew ? 'Enabled' : 'Disabled'}
          </span>
        </div>

        {#if subscription.auto_renew && subscription.status === 'active'}
          <div class="flex items-center justify-between py-3 border-b border-surface-200 dark:border-surface-600">
            <div class="flex items-center space-x-3">
              <Calendar size={18} class="text-surface-400 dark:text-surface-500" />
              <span class="text-surface-600 dark:text-surface-300">Next Renewal</span>
            </div>
            <span class="font-medium text-surface-900 dark:text-surface-100">
              {formatDate(subscription.renewal_date)}
            </span>
          </div>
        {/if}

        <div class="flex items-center justify-between py-3">
          <div class="flex items-center space-x-3">
            <Clock size={18} class="text-surface-400 dark:text-surface-500" />
            <span class="text-surface-600 dark:text-surface-300">Created</span>
          </div>
          <span class="font-medium text-surface-900 dark:text-surface-100">
            {formatDate(subscription.created_at)} at {formatTime(subscription.created_at)}
          </span>
        </div>
      </div>
    </div>

    <!-- Account Credentials -->
    <div class="bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-lg p-6">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-semibold text-surface-900 dark:text-surface-100">
          Account Credentials
        </h2>
        <button
          on:click={toggleCredentials}
          class="inline-flex items-center text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
        >
          {#if showCredentials}
            <EyeOff size={16} class="mr-1" />
            Hide
          {:else}
            <Eye size={16} class="mr-1" />
            Show
          {/if}
        </button>
      </div>

      {#if showCredentials}
        <div class="space-y-4">
          <div class="p-4 bg-surface-100 dark:bg-surface-700 rounded-lg">
            <dl class="space-y-3">
              <div>
                <dt class="text-sm font-medium text-surface-700 dark:text-surface-300">
                  Email Address
                </dt>
                <dd class="mt-1 p-3 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded font-mono text-sm">
                  premium.account@example.com
                </dd>
              </div>

              <div>
                <dt class="text-sm font-medium text-surface-700 dark:text-surface-300">
                  Password
                </dt>
                <dd class="mt-1 p-3 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded font-mono text-sm">
                  SecurePassword123!
                </dd>
              </div>

            </dl>

            <div class="p-3 bg-warning-50 dark:bg-warning-900 border border-warning-200 dark:border-warning-700 rounded-lg">
              <p class="text-warning-800 dark:text-warning-200 text-sm">
                <AlertTriangle size={16} class="inline mr-2" />
                Keep these credentials secure. Do not share them with others.
              </p>
            </div>
          </div>
        </div>
      {:else}
        <div class="text-center py-8">
          <div class="w-16 h-16 mx-auto bg-surface-200 dark:bg-surface-700 rounded-full flex items-center justify-center mb-4">
            <Eye size={24} class="text-surface-400 dark:text-surface-500" />
          </div>
          <p class="text-surface-600 dark:text-surface-300 text-sm">
            Click "Show" to reveal your account credentials
          </p>
        </div>
      {/if}
    </div>
  </div>

  <!-- Action Buttons -->
  <div class="mt-8 bg-surface-100 dark:bg-surface-800 rounded-lg p-6">
    <h3 class="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-4">
      Subscription Actions
    </h3>

    <div class="flex flex-wrap gap-4">
      {#if subscription.status === 'active'}
        <button class="inline-flex items-center bg-error-600 hover:bg-error-700 text-white px-4 py-2 rounded-lg transition-colors">
          <XCircle size={16} class="mr-2" />
          Cancel Subscription
        </button>

        <button class="inline-flex items-center bg-surface-50 dark:bg-surface-700 hover:bg-surface-200 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-300 border border-surface-300 dark:border-surface-600 px-4 py-2 rounded-lg transition-colors">
          <RotateCcw size={16} class="mr-2" />
          {subscription.auto_renew ? 'Disable' : 'Enable'} Auto-Renewal
        </button>
      {:else if subscription.status === 'expired'}
        <button class="inline-flex items-center bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition-colors">
          <RotateCcw size={16} class="mr-2" />
          Renew Subscription
        </button>
      {/if}

      <a
        href="/browse"
        class="inline-flex items-center bg-surface-50 dark:bg-surface-700 hover:bg-surface-200 dark:hover:bg-surface-600 text-surface-700 dark:text-surface-300 border border-surface-300 dark:border-surface-600 px-4 py-2 rounded-lg transition-colors"
      >
        Browse Other Plans
      </a>
    </div>

    {#if subscription.status === 'active'}
      <div class="mt-4 p-4 bg-warning-50 dark:bg-warning-900 border border-warning-200 dark:border-warning-700 rounded-lg">
        <p class="text-warning-800 dark:text-warning-200 text-sm">
          <AlertTriangle size={16} class="inline mr-2" />
          Cancelling your subscription will revoke access immediately. This action cannot be undone.
        </p>
      </div>
    {/if}
  </div>

  <!-- Purchase History (Placeholder) -->
  <div class="mt-8 bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-600 rounded-lg p-6">
    <h3 class="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-4">
      Purchase History
    </h3>

    <div class="space-y-3">
      <div class="flex items-center justify-between py-3 border-b border-surface-200 dark:border-surface-600">
        <div class="flex items-center space-x-3">
          <CreditCard size={18} class="text-surface-400 dark:text-surface-500" />
          <div>
            <p class="font-medium text-surface-900 dark:text-surface-100">
              {getServiceName(subscription.service_type)} {subscription.service_plan} Plan
            </p>
            <p class="text-sm text-surface-600 dark:text-surface-300">
              Purchased on {formatDate(subscription.created_at)}
            </p>
          </div>
        </div>
        <span class="text-sm font-medium text-surface-900 dark:text-surface-100">
          150 credits
        </span>
      </div>
    </div>
  </div>

  {:else}
    <!-- Error State -->
    <div class="text-center py-12">
      <div class="bg-surface-100 dark:bg-surface-800 rounded-lg p-8">
        <AlertTriangle size={48} class="mx-auto text-error-500 mb-4" />
        <h3 class="text-lg font-medium text-surface-900 dark:text-surface-100 mb-2">
          Subscription not found
        </h3>
        <p class="text-surface-600 dark:text-surface-300 mb-6">
          The subscription you're looking for doesn't exist or you don't have access to it.
        </p>
        <a
          href="/dashboard/subscriptions/active"
          class="inline-flex items-center bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <ArrowLeft size={16} class="mr-2" />
          Back to My Subscriptions
        </a>
      </div>
    </div>
  {/if}
</div>