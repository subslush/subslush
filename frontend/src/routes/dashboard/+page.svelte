<script lang="ts">
  import { Calendar, CreditCard, Package, AlertTriangle, Clock } from 'lucide-svelte';
  import StatCard from '$lib/components/dashboard/StatCard.svelte';
  import type { PageData } from './$types';
  import type {
    DashboardAlert,
    DashboardOverview,
    DashboardOrderSummary,
    DashboardUpcomingRenewal
  } from '$lib/types/dashboard.js';

  export let data: PageData;

  $: overview = data.overview as DashboardOverview;
  $: user = data.user;

  const serviceLabels: Record<string, string> = {
    spotify: 'Spotify',
    netflix: 'Netflix',
    tradingview: 'TradingView'
  };

  const alertStyles: Record<DashboardAlert['severity'], string> = {
    critical: 'border-red-200 bg-red-50 text-red-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    info: 'border-gray-200 bg-gray-50 text-gray-900'
  };

  const renewalStateLabels: Record<string, string> = {
    manual: 'Manual',
    unknown: 'Unscheduled',
    overdue: 'Overdue',
    due_soon: 'Due soon',
    scheduled: 'Scheduled'
  };

  const renewalStateStyles: Record<string, string> = {
    overdue: 'bg-red-100 text-red-800 border-red-200',
    due_soon: 'bg-amber-100 text-amber-800 border-amber-200',
    scheduled: 'bg-gray-100 text-gray-800 border-gray-200',
    manual: 'bg-gray-100 text-gray-800 border-gray-200',
    unknown: 'bg-gray-100 text-gray-800 border-gray-200'
  };

  function getUserLabel(): string {
    if (!user) return 'there';
    if (user.displayName) return user.displayName;
    if (user.firstName) return user.firstName;
    if (user.email) return user.email.split('@')[0];
    return 'there';
  }

  function formatDate(value?: string | null): string {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatCurrency(amount: number, currency = 'USD'): string {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.toUpperCase()
      }).format(amount);
    } catch {
      return `$${amount.toFixed(2)}`;
    }
  }

  function formatCents(amountCents?: number | null, currency?: string | null): string {
    if (amountCents === null || amountCents === undefined) return '-';
    return formatCurrency(amountCents / 100, currency || 'USD');
  }

  function getServiceLabel(value: string): string {
    return serviceLabels[value] || value.replace(/_/g, ' ');
  }

  function formatServiceLabel(value: string): string {
    if (!value) return value;
    return value
      .replace(/_/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  function stripOrderPrefix(label: string): string {
    return label
      .replace(/^subscription\s+purchase\s*[:\-–—]\s*/i, '')
      .replace(/^subscription\s*[:\-–—]\s*/i, '')
      .trim();
  }

  function formatStatusLabel(value: string): string {
    return value
      .replace(/_/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  function getRenewalDate(item: DashboardUpcomingRenewal): string {
    return formatDate(item.next_billing_at || item.renewal_date);
  }

  function getRenewalStateLabel(state: string): string {
    return renewalStateLabels[state] || 'Scheduled';
  }

  function getOrderLabel(order: DashboardOrderSummary): string {
    const metadata = order.metadata && typeof order.metadata === 'object'
      ? (order.metadata as Record<string, unknown>)
      : null;
    const serviceType = metadata && typeof metadata.service_type === 'string'
      ? metadata.service_type
      : undefined;
    if (order.items && order.items.length > 0) {
      const description = order.items[0]?.description;
      if (description) {
        const cleaned = stripOrderPrefix(description);
        if (serviceType && cleaned.toLowerCase().startsWith(serviceType.toLowerCase())) {
          return `${getServiceLabel(serviceType)}${cleaned.slice(serviceType.length)}`;
        }
        return cleaned;
      }
    }
    if (order.metadata && typeof order.metadata === 'object') {
      const service = (order.metadata as Record<string, unknown>).service_type;
      if (typeof service === 'string') {
        return `${formatServiceLabel(service)} subscription`;
      }
    }
    return `Order ${order.id.slice(0, 8)}`;
  }

  function getOrderAmount(order: DashboardOrderSummary): string {
    const amountCents =
      order.display_total_cents ?? order.total_cents ?? order.subtotal_cents ?? 0;
    const currency = order.display_currency || order.currency || 'USD';
    return formatCents(amountCents, currency);
  }
</script>

<svelte:head>
  <title>Dashboard - SubSlush</title>
  <meta name="description" content="Overview of subscriptions, credits, and recent activity." />
</svelte:head>

<section class="space-y-8">
  <div class="flex items-center justify-between flex-wrap gap-4">
    <div>
      <h1 class="text-2xl font-semibold text-gray-900">Welcome back, {getUserLabel()}</h1>
      <p class="text-sm text-gray-600 mt-1">Track subscriptions, renewals, and credits in one place.</p>
    </div>
    <a
      href="/browse"
      class="inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
    >
      Go shopping
    </a>
  </div>

  <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
    <StatCard
      title="Active subscriptions"
      value={overview.counts.active_subscriptions}
      subtitle="Currently active"
      icon={Package}
      iconColor="bg-gray-100"
      iconTextColor="text-gray-700"
      valueColor="text-gray-900"
    />
    <StatCard
      title="Upcoming renewals"
      value={overview.counts.upcoming_renewals}
      subtitle="Next 7 days"
      icon={Calendar}
      iconColor="bg-gray-100"
      iconTextColor="text-gray-700"
      valueColor="text-gray-900"
    />
    <StatCard
      title="Available credits"
      value={formatCurrency(overview.credits.available_balance, overview.credits.currency)}
      subtitle={overview.credits.pending_balance > 0
        ? `${formatCurrency(overview.credits.pending_balance, overview.credits.currency)} pending`
        : 'Ready to spend'}
      icon={CreditCard}
      iconColor="bg-gray-100"
      iconTextColor="text-gray-700"
      valueColor="text-gray-900"
    />
  </div>

  {#if overview.alerts.length > 0}
    <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div class="flex items-center gap-2 mb-4">
        <AlertTriangle size={18} class="text-gray-700" />
        <h2 class="text-lg font-semibold text-gray-900">Alerts</h2>
      </div>
      <div class="space-y-3">
        {#each overview.alerts as alert}
          <div class={`flex items-start gap-3 rounded-lg border px-4 py-3 ${alertStyles[alert.severity]}`}>
            <div class="mt-0.5">
              <Clock size={16} class="text-current" />
            </div>
            <div>
              <p class="text-sm font-medium">{alert.message}</p>
              {#if alert.metadata}
                <p class="text-xs text-gray-600 mt-1">Review credits or renewal details to resolve.</p>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-lg font-semibold text-gray-900">Upcoming renewals</h2>
          <p class="text-sm text-gray-600">Next scheduled billings</p>
        </div>
        <a href="/dashboard/subscriptions" class="text-sm font-medium text-gray-700 hover:text-gray-900">View all</a>
      </div>

      {#if overview.upcoming_renewals.length === 0}
        <div class="rounded-lg border border-dashed border-gray-200 p-6 text-sm text-gray-600">
          <p>No renewals scheduled in the next 7 days.</p>
        </div>
      {:else}
        <div class="space-y-4">
          {#each overview.upcoming_renewals as renewal}
            <div class="flex items-start justify-between gap-4 border border-gray-100 rounded-lg p-4">
              <div>
                <p class="text-sm font-medium text-gray-900">{getServiceLabel(renewal.service_type)}</p>
                <p class="text-xs text-gray-500 capitalize">{renewal.service_plan} plan</p>
                <div class="mt-2 inline-flex items-center gap-2">
                  <span class={`text-xs border rounded-full px-2 py-0.5 ${renewalStateStyles[renewal.renewal_state] || renewalStateStyles.unknown}`}>
                    {getRenewalStateLabel(renewal.renewal_state)}
                  </span>
                  {#if renewal.days_until_renewal !== null && renewal.days_until_renewal !== undefined}
                    <span class="text-xs text-gray-500">
                      {renewal.days_until_renewal < 0
                        ? `${Math.abs(renewal.days_until_renewal)} days overdue`
                        : `${renewal.days_until_renewal} days remaining`}
                    </span>
                  {/if}
                </div>
              </div>
              <div class="text-right">
                <p class="text-sm font-medium text-gray-900">{getRenewalDate(renewal)}</p>
                <p class="text-xs text-gray-500 mt-1">
                  {formatCents(
                    renewal.display_price_cents ?? renewal.price_cents,
                    renewal.display_currency ?? renewal.currency
                  )}
                </p>
                {#if renewal.renewal_method}
                  <p class="text-xs text-gray-500 capitalize">{renewal.renewal_method}</p>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-lg font-semibold text-gray-900">Recent orders</h2>
          <p class="text-sm text-gray-600">Latest activity and receipts</p>
        </div>
        <a href="/dashboard/orders" class="text-sm font-medium text-gray-700 hover:text-gray-900">View all</a>
      </div>

      {#if overview.recent_orders.length === 0}
        <div class="rounded-lg border border-dashed border-gray-200 p-6 text-sm text-gray-600">
          <p>No recent orders yet.</p>
        </div>
      {:else}
        <div class="space-y-4">
          {#each overview.recent_orders as order}
            <div class="flex items-start justify-between gap-4 border border-gray-100 rounded-lg p-4">
              <div>
                <p class="text-sm font-medium text-gray-900">{getOrderLabel(order)}</p>
                <p class="text-xs text-gray-500">{formatDate(order.created_at)}</p>
                <div class="mt-2 inline-flex items-center gap-2">
                  <span class="text-xs text-gray-500">{formatStatusLabel(order.status)}</span>
                </div>
              </div>
              <div class="text-right">
                <p class="text-sm font-medium text-gray-900">{getOrderAmount(order)}</p>
                <p class="text-xs text-gray-500">Order {order.id.slice(0, 8)}</p>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</section>
