<script lang="ts">
  import { goto } from '$app/navigation';
  import { AlertTriangle, ChevronDown, Eye, EyeOff, X, XCircle } from 'lucide-svelte';
  import PinModal from '$lib/components/subscription/PinModal.svelte';
  import { subscriptionService } from '$lib/api/subscriptions.js';
  import { credits } from '$lib/stores/credits.js';
  import type { Subscription, SubscriptionStatus } from '$lib/types/subscription.js';
  import type { PageData } from './$types';
  import type { ApiError } from '$lib/types/api.js';

  export let data: PageData;

  let subscriptions: Subscription[] = data.subscriptions;
  let pagination = data.pagination;
  let creditBalance: number | null = data.creditBalance ?? null;

  $: subscriptions = data.subscriptions;
  $: pagination = data.pagination;
  $: creditBalance = data.creditBalance ?? null;

  const statusOptions: { value: 'all' | SubscriptionStatus; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'pending', label: 'Pending' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'expired', label: 'Expired' }
  ];

  let openSubscriptionId: string | null = null;
  let isPinModalOpen = false;
  let pinTargetId: string | null = null;

  let credentialsById: Record<string, string> = {};
  let credentialExpiryById: Record<string, number> = {};
  let revealErrorById: Record<string, string> = {};
  let revealLoadingById: Record<string, boolean> = {};
  let copyMessageById: Record<string, string> = {};
  const revealTimers: Record<string, ReturnType<typeof setTimeout>> = {};

  let cancelReasonById: Record<string, string> = {};
  let cancelErrorById: Record<string, string> = {};
  let cancelLoadingById: Record<string, boolean> = {};
  let autoRenewLoadingById: Record<string, boolean> = {};
  let autoRenewErrorById: Record<string, string> = {};

  let creditRenewModalOpen = false;
  let creditRenewTarget: Subscription | null = null;
  let creditRenewError = '';
  let creditRenewLoading = false;
  let creditRenewPriceCents: number | null = null;
  let creditRenewMissingCredits: number | null = null;


  const serviceLabels: Record<string, string> = {
    spotify: 'Spotify',
    netflix: 'Netflix',
    tradingview: 'TradingView'
  };

  const renewalStateLabels: Record<string, string> = {
    manual: 'Manual',
    unknown: 'Unscheduled',
    overdue: 'Overdue',
    due_soon: 'Due soon',
    scheduled: 'Scheduled'
  };

  const stripeFailureStatuses = new Set([
    'renewal_payment_failed',
    'auto_renew_missing_payment_method'
  ]);

  function getServiceLabel(value: string): string {
    return serviceLabels[value] || formatLabel(value);
  }

  function formatLabel(value: string): string {
    return value
      .replace(/[_-]+/g, ' ')
      .trim()
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  function formatDurationLabel(termMonths?: number | null): string {
    const normalized =
      termMonths !== null && termMonths !== undefined ? Number(termMonths) : null;
    if (!normalized || !Number.isFinite(normalized) || normalized <= 0) return '';
    const months = Math.floor(normalized);
    return `(${months} month${months === 1 ? '' : 's'})`;
  }

  function getSubscriptionLabel(subscription: Subscription): string {
    let baseLabel = '';
    const productName = subscription.product_name?.trim() || '';
    const variantName = subscription.variant_name?.trim() || '';
    if (productName && variantName) {
      baseLabel = variantName.toLowerCase().startsWith(productName.toLowerCase())
        ? variantName
        : `${productName} ${variantName}`;
    } else if (productName || variantName) {
      baseLabel = productName || variantName;
    } else {
      const service = getServiceLabel(subscription.service_type);
      const plan = subscription.service_plan ? formatLabel(subscription.service_plan) : '';
      if (plan && service && plan.toLowerCase().startsWith(service.toLowerCase())) {
        baseLabel = plan;
      } else {
        baseLabel = plan ? `${service} ${plan}` : service;
      }
    }

    const durationLabel = formatDurationLabel(subscription.term_months);
    return durationLabel ? `${baseLabel} ${durationLabel}` : baseLabel;
  }

  function getProductVariantLabel(subscription: Subscription): string {
    return getSubscriptionLabel(subscription);
  }

  function formatDate(value?: string | null): string {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatCurrency(amountCents?: number | null, currency?: string | null): string {
    if (amountCents === null || amountCents === undefined) return '-';
    const amount = amountCents / 100;
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: (currency || 'USD').toUpperCase()
      }).format(amount);
    } catch {
      return `$${amount.toFixed(2)}`;
    }
  }

  const renewalInfoText =
    'Renewal date is set 7 days before expiry so we have time to renew manually. You do not lose any subscription days.';
  const MS_PER_DAY = 1000 * 60 * 60 * 24;

  function formatCredits(value?: number | null): string {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  }

  function getDisplayPriceCents(subscription: Subscription): number | null {
    return subscription.display_price_cents ?? subscription.price_cents ?? null;
  }

  function getDisplayCurrency(subscription: Subscription): string | null {
    return subscription.display_currency ?? subscription.currency ?? null;
  }

  function getDaysUntilExpiry(subscription: Subscription): number | null {
    if (subscription.status !== 'active') return null;
    if (!subscription.end_date) return null;
    const endDate = new Date(subscription.end_date);
    if (Number.isNaN(endDate.getTime())) return null;
    const diffMs = endDate.getTime() - Date.now();
    if (diffMs < 0) return -1;
    return Math.ceil(diffMs / MS_PER_DAY);
  }

  function getRenewalStateLabel(state?: string): string {
    if (!state) return 'Scheduled';
    return renewalStateLabels[state] || 'Scheduled';
  }

  function resolveRenewalPriceCents(subscription: Subscription): number | null {
    const termMonths = subscription.term_months ?? 1;
    if (subscription.base_price_cents !== null && subscription.base_price_cents !== undefined) {
      const baseTotal = subscription.base_price_cents * termMonths;
      const discountPercent = subscription.discount_percent ?? 0;
      const discountCents = Math.round(baseTotal * (discountPercent / 100));
      return Math.max(0, baseTotal - discountCents);
    }
    return subscription.price_cents ?? null;
  }

  function resolveRenewalPriceCredits(subscription: Subscription): number | null {
    const priceCents = resolveRenewalPriceCents(subscription);
    if (!priceCents || priceCents <= 0) return null;
    return priceCents / 100;
  }

  function resolveMissingCredits(subscription: Subscription): number | null {
    if (creditBalance === null || creditBalance === undefined) return null;
    const required = resolveRenewalPriceCredits(subscription);
    if (required === null) return null;
    const missing = required - creditBalance;
    return missing > 0 ? missing : 0;
  }

  function isStripeRenewalFailure(subscription: Subscription): boolean {
    return (
      subscription.renewal_method === 'stripe' &&
      stripeFailureStatuses.has(subscription.status_reason || '')
    );
  }

  function statusLabel(status: SubscriptionStatus): string {
    return formatLabel(status);
  }

  function toggleManage(subscriptionId: string) {
    openSubscriptionId = openSubscriptionId === subscriptionId ? null : subscriptionId;
  }

  function updateFilters(status: string) {
    const params = new URLSearchParams();
    if (status !== 'all') {
      params.set('status', status);
    }
    params.set('page', '1');
    params.set('limit', `${data.filters.limit}`);
    goto(`/dashboard/subscriptions?${params.toString()}`);
  }

  function updatePage(nextPage: number) {
    const params = new URLSearchParams();
    if (data.filters.status !== 'all') {
      params.set('status', data.filters.status);
    }
    params.set('page', `${nextPage}`);
    params.set('limit', `${data.filters.limit}`);
    goto(`/dashboard/subscriptions?${params.toString()}`);
  }

  async function openPinModal(subscriptionId: string) {
    pinTargetId = subscriptionId;
    revealErrorById = { ...revealErrorById, [subscriptionId]: '' };
    isPinModalOpen = true;
  }

  function clearCredentials(subscriptionId: string) {
    const { [subscriptionId]: _removed, ...rest } = credentialsById;
    credentialsById = rest;

    const { [subscriptionId]: _expiryRemoved, ...expiryRest } = credentialExpiryById;
    credentialExpiryById = expiryRest;

    if (revealTimers[subscriptionId]) {
      clearTimeout(revealTimers[subscriptionId]);
      delete revealTimers[subscriptionId];
    }
  }

  function scheduleCredentialExpiry(subscriptionId: string) {
    const expiry = Date.now() + 10 * 60 * 1000;
    credentialExpiryById = { ...credentialExpiryById, [subscriptionId]: expiry };

    if (revealTimers[subscriptionId]) {
      clearTimeout(revealTimers[subscriptionId]);
    }

    revealTimers[subscriptionId] = setTimeout(() => {
      clearCredentials(subscriptionId);
    }, 10 * 60 * 1000);
  }

  async function handlePinVerified(event: CustomEvent<{ token: string }>) {
    if (!pinTargetId) return;

    const subscriptionId = pinTargetId;
    revealLoadingById = { ...revealLoadingById, [subscriptionId]: true };
    revealErrorById = { ...revealErrorById, [subscriptionId]: '' };

    try {
      const result = await subscriptionService.revealCredentials(subscriptionId, event.detail.token);
      credentialsById = { ...credentialsById, [subscriptionId]: result.credentials };
      scheduleCredentialExpiry(subscriptionId);
    } catch (error) {
      const apiError = error as ApiError;
      revealErrorById = {
        ...revealErrorById,
        [subscriptionId]: apiError.message || 'Unable to reveal credentials.'
      };
    } finally {
      revealLoadingById = { ...revealLoadingById, [subscriptionId]: false };
      pinTargetId = null;
    }
  }

  function handlePinSet() {
    pinTargetId = null;
  }

  function parseCredentials(raw: string): Record<string, string> | null {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const entries = Object.entries(parsed).reduce<Record<string, string>>((acc, [key, value]) => {
          acc[key] = typeof value === 'string' ? value : JSON.stringify(value);
          return acc;
        }, {});
        return entries;
      }
    } catch {
      return null;
    }
    return null;
  }

  async function copyCredentials(subscriptionId: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      copyMessageById = { ...copyMessageById, [subscriptionId]: 'Copied to clipboard.' };
      setTimeout(() => {
        copyMessageById = { ...copyMessageById, [subscriptionId]: '' };
      }, 2000);
    } catch {
      copyMessageById = { ...copyMessageById, [subscriptionId]: 'Copy failed. Please copy manually.' };
    }
  }

  async function cancelSubscription(subscriptionId: string) {
    cancelLoadingById = { ...cancelLoadingById, [subscriptionId]: true };
    cancelErrorById = { ...cancelErrorById, [subscriptionId]: '' };

    const reason = (cancelReasonById[subscriptionId] || '').trim();
    if (reason.length < 1) {
      cancelLoadingById = { ...cancelLoadingById, [subscriptionId]: false };
      cancelErrorById = { ...cancelErrorById, [subscriptionId]: 'Reason is required.' };
      return;
    }

    try {
      await subscriptionService.cancelSubscription(subscriptionId, reason);
      subscriptions = subscriptions.map(sub =>
        sub.id === subscriptionId ? { ...sub, status: 'cancelled', auto_renew: false } : sub
      );
    } catch (error) {
      const apiError = error as ApiError;
      cancelErrorById = { ...cancelErrorById, [subscriptionId]: apiError.message || 'Unable to cancel subscription.' };
    } finally {
      cancelLoadingById = { ...cancelLoadingById, [subscriptionId]: false };
    }
  }

  async function disableStripeAutoRenew(subscriptionId: string) {
    autoRenewLoadingById = { ...autoRenewLoadingById, [subscriptionId]: true };
    autoRenewErrorById = { ...autoRenewErrorById, [subscriptionId]: '' };

    try {
      const result = await subscriptionService.disableStripeAutoRenew(subscriptionId);
      const updated = result.subscription;
      subscriptions = subscriptions.map(sub =>
        sub.id === subscriptionId ? { ...sub, ...updated } : sub
      );
    } catch (error) {
      const apiError = error as ApiError;
      autoRenewErrorById = {
        ...autoRenewErrorById,
        [subscriptionId]: apiError.message || 'Unable to disable auto-renew.'
      };
    } finally {
      autoRenewLoadingById = { ...autoRenewLoadingById, [subscriptionId]: false };
    }
  }

  async function enableCreditsAutoRenew(subscriptionId: string) {
    autoRenewLoadingById = { ...autoRenewLoadingById, [subscriptionId]: true };
    autoRenewErrorById = { ...autoRenewErrorById, [subscriptionId]: '' };

    try {
      const result = await subscriptionService.enableCreditsAutoRenew(subscriptionId);
      const updated = result.subscription;
      subscriptions = subscriptions.map(sub =>
        sub.id === subscriptionId ? { ...sub, ...updated } : sub
      );
    } catch (error) {
      const apiError = error as ApiError;
      autoRenewErrorById = {
        ...autoRenewErrorById,
        [subscriptionId]: apiError.message || 'Unable to enable auto-renew.'
      };
    } finally {
      autoRenewLoadingById = { ...autoRenewLoadingById, [subscriptionId]: false };
    }
  }

  async function disableCreditsAutoRenew(subscriptionId: string) {
    autoRenewLoadingById = { ...autoRenewLoadingById, [subscriptionId]: true };
    autoRenewErrorById = { ...autoRenewErrorById, [subscriptionId]: '' };

    try {
      const result = await subscriptionService.disableStripeAutoRenew(subscriptionId);
      const updated = result.subscription;
      subscriptions = subscriptions.map(sub =>
        sub.id === subscriptionId ? { ...sub, ...updated } : sub
      );
    } catch (error) {
      const apiError = error as ApiError;
      autoRenewErrorById = {
        ...autoRenewErrorById,
        [subscriptionId]: apiError.message || 'Unable to disable auto-renew.'
      };
    } finally {
      autoRenewLoadingById = { ...autoRenewLoadingById, [subscriptionId]: false };
    }
  }

  function openCreditRenewModal(subscription: Subscription) {
    creditRenewTarget = subscription;
    creditRenewError = '';
    creditRenewModalOpen = true;
  }

  function closeCreditRenewModal() {
    creditRenewModalOpen = false;
    creditRenewTarget = null;
    creditRenewError = '';
    creditRenewLoading = false;
  }

  async function confirmCreditRenewal() {
    if (!creditRenewTarget) return;
    creditRenewLoading = true;
    creditRenewError = '';

    try {
      const result = await subscriptionService.renewCreditsSubscription(creditRenewTarget.id);
      subscriptions = subscriptions.map(sub =>
        sub.id === creditRenewTarget?.id ? { ...sub, ...result.subscription } : sub
      );
      if (result.transaction?.balance_after !== null && result.transaction?.balance_after !== undefined) {
        creditBalance = result.transaction.balance_after;
        credits.setBalance(result.transaction.balance_after);
      }
      closeCreditRenewModal();
    } catch (error) {
      const apiError = error as ApiError;
      creditRenewError = apiError.message || 'Unable to renew subscription.';
    } finally {
      creditRenewLoading = false;
    }
  }

  $: creditRenewPriceCents = creditRenewTarget
    ? resolveRenewalPriceCents(creditRenewTarget)
    : null;
  $: creditRenewMissingCredits = creditRenewTarget
    ? resolveMissingCredits(creditRenewTarget)
    : null;

</script>

<svelte:head>
  <title>Subscriptions - SubSlush</title>
  <meta name="description" content="Manage all subscriptions and credentials." />
</svelte:head>

<section class="space-y-6">
  <div class="flex items-center justify-between flex-wrap gap-3">
    <div>
      <h1 class="text-2xl font-semibold text-gray-900">Subscriptions</h1>
      <p class="text-sm text-gray-600 mt-1">View all subscriptions and manage credentials securely.</p>
    </div>
    {#if subscriptions.length > 0}
      <a
        href="/browse"
        class="inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
      >
        Go shopping
      </a>
    {/if}
  </div>

  <div class="flex flex-wrap gap-2">
    {#each statusOptions as option}
      <button
        on:click={() => updateFilters(option.value)}
        class={`px-4 py-2 text-sm font-medium rounded-lg border ${data.filters.status === option.value
          ? 'bg-gray-900 text-white border-gray-900'
          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'}`}
      >
        {option.label}
      </button>
    {/each}
  </div>

  {#if data.error}
    <div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {data.error}
    </div>
  {/if}

  {#if subscriptions.length === 0}
    <div class="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center">
      <p class="text-sm font-medium text-gray-900">No subscriptions found.</p>
      <p class="text-sm text-gray-600 mt-2">Browse subscriptions to get started.</p>
      <a
        href="/browse"
        class="mt-4 inline-flex items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
      >
        Go shopping
      </a>
    </div>
  {:else}
    <div class="space-y-4">
      {#each subscriptions as subscription (subscription.id)}
        <div class="rounded-xl border border-gray-200 bg-white p-5">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="text-base font-semibold text-gray-900 truncate">{getSubscriptionLabel(subscription)}</p>
              <p class="text-xs text-gray-500 mt-1">Subscription {subscription.id.slice(0, 8)}</p>
            </div>
            <button
              on:click={() => toggleManage(subscription.id)}
              class="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Manage
              <ChevronDown size={14} class={openSubscriptionId === subscription.id ? 'rotate-180' : ''} />
            </button>
          </div>

          <div class="mt-4 grid grid-cols-2 gap-4 text-xs text-gray-600 sm:grid-cols-4">
            <div>
              {#if subscription.status !== 'active'}
                <p class="text-[11px] uppercase tracking-wide text-gray-400">Dates</p>
                <p class="text-xs text-gray-500 mt-1">
                  Pending delivery.
                </p>
              {:else}
                {#if subscription.auto_renew}
                  <div class="flex items-center gap-1">
                    <p class="text-[11px] uppercase tracking-wide text-gray-400">Renews on</p>
                    <span
                      class="text-[10px] font-semibold text-gray-500 border border-gray-300 rounded-full w-4 h-4 flex items-center justify-center cursor-help"
                      title={renewalInfoText}
                    >
                      i
                    </span>
                  </div>
                  <p class="text-sm font-medium text-gray-700">
                    {formatDate(subscription.next_billing_at || subscription.renewal_date)}
                  </p>
                  <p class="text-xs text-gray-500 mt-1">
                    Ends on {formatDate(subscription.end_date)}
                  </p>
                {:else}
                  <p class="text-[11px] uppercase tracking-wide text-gray-400">Ends on</p>
                  <p class="text-sm font-medium text-gray-700">{formatDate(subscription.end_date)}</p>
                  {#if subscription.renewal_method === 'credits' && subscription.auto_renew === false}
                    {@const daysUntilExpiry = getDaysUntilExpiry(subscription)}
                    {#if daysUntilExpiry !== null && daysUntilExpiry <= 7 && daysUntilExpiry >= 0}
                      <p class="text-xs font-semibold text-amber-600 mt-1">Renewal available</p>
                    {/if}
                  {/if}
                {/if}
                {#if subscription.renewal_state}
                  <p class="text-xs text-gray-500 mt-1">{getRenewalStateLabel(subscription.renewal_state)}</p>
                {/if}
              {/if}
            </div>
            <div>
              <p class="text-[11px] uppercase tracking-wide text-gray-400">Status</p>
              <p class="text-sm font-medium text-gray-700">{statusLabel(subscription.status)}</p>
            </div>
            <div>
              <p class="text-[11px] uppercase tracking-wide text-gray-400">Auto-renew</p>
              <p class="text-sm font-medium text-gray-700">{subscription.auto_renew ? 'Enabled' : 'Manual'}</p>
            </div>
            <div>
              <p class="text-[11px] uppercase tracking-wide text-gray-400">Price</p>
              <p class="text-sm font-medium text-gray-700">
                {formatCurrency(
                  getDisplayPriceCents(subscription),
                  getDisplayCurrency(subscription)
                )}
              </p>
            </div>
          </div>

          {#if isStripeRenewalFailure(subscription)}
            <div class="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 flex flex-wrap items-center gap-2">
              <span class="font-medium">Renewal failed.</span>
              <span>Update your card or pay manually.</span>
              <a
                href={`/dashboard/subscriptions/${subscription.id}/billing`}
                class="text-red-700 underline underline-offset-2 hover:text-red-900"
              >
                Update card
              </a>
              <a
                href={`/dashboard/subscriptions/${subscription.id}/renewal`}
                class="text-red-700 underline underline-offset-2 hover:text-red-900"
              >
                Pay manually
              </a>
            </div>
          {/if}
          {#if subscription.status === 'pending' && subscription.status_reason === 'waiting_for_selection'}
            <div class="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex flex-wrap items-center gap-2">
              <span class="font-medium">Action required.</span>
              <span>Select how you want to upgrade this subscription.</span>
              <a
                href={`/dashboard/subscriptions/${subscription.id}`}
                class="text-amber-900 underline underline-offset-2 hover:text-amber-950"
              >
                Complete selection
              </a>
            </div>
          {/if}
          {#if subscription.status === 'pending' && subscription.status_reason === 'waiting_for_mmu_acknowledgement'}
            <div class="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex flex-wrap items-center gap-2">
              <span class="font-medium">Action required.</span>
              <span>Confirm the monthly renewal acknowledgement to continue.</span>
              <a
                href={`/dashboard/subscriptions/${subscription.id}`}
                class="text-amber-900 underline underline-offset-2 hover:text-amber-950"
              >
                Review acknowledgement
              </a>
            </div>
          {/if}

          {#if openSubscriptionId === subscription.id}
            <div class="mt-5 border-t border-gray-100 pt-4 space-y-4">
              {#if subscription.renewal_method === 'stripe'}
                <div class="rounded-lg border border-gray-200 p-4 space-y-3">
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <h3 class="text-sm font-semibold text-gray-900">Billing &amp; renewal</h3>
                      <p class="text-xs text-gray-500 mt-1">
                        Manage Stripe auto-renewal and manual renewal payments.
                      </p>
                    </div>
                    <span class="text-xs text-gray-500 uppercase tracking-wide">Stripe</span>
                  </div>

                  {#if subscription.status !== 'active'}
                    <p class="text-xs text-gray-500">
                      Pending delivery.
                    </p>
                  {/if}

                  {#if subscription.auto_renew}
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p class="text-xs text-gray-500">Next billing date</p>
                        {#if subscription.status === 'active'}
                          <p class="text-sm font-medium text-gray-700">
                            {formatDate(subscription.next_billing_at || subscription.renewal_date)}
                          </p>
                        {:else}
                          <p class="text-xs text-gray-500">Available after delivery</p>
                        {/if}
                      </div>
                      <div class="flex flex-wrap items-center gap-2">
                        <a
                          href={`/dashboard/subscriptions/${subscription.id}/billing`}
                          class="inline-flex items-center rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Update card
                        </a>
                        <button
                          on:click={() => disableStripeAutoRenew(subscription.id)}
                          class="inline-flex items-center rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          disabled={autoRenewLoadingById[subscription.id]}
                        >
                          {autoRenewLoadingById[subscription.id] ? 'Disabling...' : 'Disable auto-renew'}
                        </button>
                      </div>
                    </div>
                  {:else}
                    {@const daysUntilExpiry = getDaysUntilExpiry(subscription)}
                    {@const showManualPay =
                      daysUntilExpiry !== null && daysUntilExpiry <= 7 && daysUntilExpiry >= 0}
                    <div class="flex flex-wrap items-center gap-2">
                      <a
                        href={`/dashboard/subscriptions/${subscription.id}/billing`}
                        class="inline-flex items-center rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-black"
                      >
                        Enable auto-renew
                      </a>
                      {#if showManualPay}
                        <a
                          href={`/dashboard/subscriptions/${subscription.id}/renewal`}
                          class="inline-flex items-center rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Renew now
                        </a>
                      {/if}
                    </div>
                    {#if showManualPay && daysUntilExpiry !== null}
                      <p class="text-xs text-red-600">
                        {daysUntilExpiry === 0
                          ? 'Your subscription expires today.'
                          : `Your subscription expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}.`}
                        Enable auto-renew or renew now as soon as possible to avoid delays or expiration.
                      </p>
                    {/if}
                  {/if}

                  {#if autoRenewErrorById[subscription.id]}
                    <div class="text-xs text-red-700">{autoRenewErrorById[subscription.id]}</div>
                  {/if}
                </div>
              {:else if subscription.renewal_method === 'credits'}
                <div class="rounded-lg border border-gray-200 p-4 space-y-3">
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <h3 class="text-sm font-semibold text-gray-900">Billing &amp; renewal</h3>
                      <p class="text-xs text-gray-500 mt-1">
                        Manage credits auto-renewal and manual renewal payments.
                      </p>
                    </div>
                    <span class="text-xs text-gray-500 uppercase tracking-wide">Credits</span>
                  </div>

                  {#if subscription.status !== 'active'}
                    <p class="text-xs text-gray-500">
                      Pending delivery.
                    </p>
                  {/if}

                  {#if subscription.auto_renew}
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p class="text-xs text-gray-500">Next billing date</p>
                        {#if subscription.status === 'active'}
                          <p class="text-sm font-medium text-gray-700">
                            {formatDate(subscription.next_billing_at || subscription.renewal_date)}
                          </p>
                        {:else}
                          <p class="text-xs text-gray-500">Available after delivery</p>
                        {/if}
                      </div>
                      <div class="flex flex-wrap items-center gap-2">
                        <button
                          on:click={() => disableCreditsAutoRenew(subscription.id)}
                          class="inline-flex items-center rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          disabled={autoRenewLoadingById[subscription.id]}
                        >
                          {autoRenewLoadingById[subscription.id] ? 'Disabling...' : 'Disable auto-renew'}
                        </button>
                      </div>
                    </div>
                  {:else}
                    {@const daysUntilExpiry = getDaysUntilExpiry(subscription)}
                    {@const showManualPay =
                      daysUntilExpiry !== null && daysUntilExpiry <= 7 && daysUntilExpiry >= 0}
                    {@const missingCredits = resolveMissingCredits(subscription)}
                    <div class="flex flex-wrap items-center gap-2">
                      <button
                        on:click={() => enableCreditsAutoRenew(subscription.id)}
                        class="inline-flex items-center rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-black"
                        disabled={autoRenewLoadingById[subscription.id]}
                      >
                        {autoRenewLoadingById[subscription.id] ? 'Enabling...' : 'Enable auto-renew'}
                      </button>
                      {#if showManualPay}
                        <button
                          on:click={() => openCreditRenewModal(subscription)}
                          class="inline-flex items-center rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                          disabled={missingCredits !== null && missingCredits > 0}
                        >
                          Renew now
                        </button>
                      {/if}
                    </div>
                    {#if showManualPay && daysUntilExpiry !== null}
                      <p class="text-xs text-red-600">
                        {daysUntilExpiry === 0
                          ? 'Your subscription expires today.'
                          : `Your subscription expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}.`}
                        Renew now to avoid delays or expiration.
                      </p>
                    {/if}
                    {#if showManualPay && missingCredits !== null && missingCredits > 0}
                      <p class="text-xs text-red-600">
                        You need {formatCredits(missingCredits)} more credits to renew. Please top up before renewing.
                      </p>
                    {/if}
                  {/if}

                  {#if autoRenewErrorById[subscription.id]}
                    <div class="text-xs text-red-700">{autoRenewErrorById[subscription.id]}</div>
                  {/if}
                </div>
              {/if}

              <div class="flex items-start justify-between gap-4">
                <div>
                  <h3 class="text-sm font-semibold text-gray-900">Credentials</h3>
                  <p class="text-xs text-gray-500 mt-1">PIN required each time you reveal credentials.</p>
                </div>
                {#if subscription.status === 'active'}
                  {#if credentialsById[subscription.id]}
                    <button
                      on:click={() => clearCredentials(subscription.id)}
                      class="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <EyeOff size={14} />
                      Hide
                    </button>
                  {:else}
                    <button
                      on:click={() => openPinModal(subscription.id)}
                      class="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-black"
                      disabled={revealLoadingById[subscription.id]}
                    >
                      <Eye size={14} />
                      {revealLoadingById[subscription.id] ? 'Verifying' : 'Reveal'}
                    </button>
                  {/if}
                {:else}
                  <span class="text-xs text-gray-500">Credentials available for active subscriptions only.</span>
                {/if}
              </div>

              {#if revealErrorById[subscription.id]}
                <div class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {revealErrorById[subscription.id]}
                </div>
              {/if}

              {#if credentialsById[subscription.id]}
                {@const parsedCredentials = parseCredentials(credentialsById[subscription.id])}
                <div class="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                  {#if parsedCredentials}
                    {#each Object.entries(parsedCredentials) as [label, value]}
                      <div class="flex items-center justify-between gap-2">
                        <div>
                          <p class="text-xs uppercase text-gray-400">{label}</p>
                          <p class="text-sm font-mono text-gray-900 break-all">{value}</p>
                        </div>
                        <button
                          on:click={() => copyCredentials(subscription.id, value)}
                          class="text-xs text-gray-600 hover:text-gray-900"
                        >
                          Copy
                        </button>
                      </div>
                    {/each}
                  {:else}
                    <div>
                      <p class="text-xs uppercase text-gray-400">Credential data</p>
                      <pre class="text-sm font-mono text-gray-900 whitespace-pre-wrap break-all mt-1">{credentialsById[subscription.id]}</pre>
                      <button
                        on:click={() => copyCredentials(subscription.id, credentialsById[subscription.id])}
                        class="mt-2 text-xs text-gray-600 hover:text-gray-900"
                      >
                        Copy
                      </button>
                    </div>
                  {/if}

                  <div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Keep credentials secure and do not share them with others.
                  </div>
                  {#if copyMessageById[subscription.id]}
                    <div class="text-xs text-gray-600">{copyMessageById[subscription.id]}</div>
                  {/if}
                </div>
              {/if}

              {#if subscription.status === 'active'}
                <div class="border border-gray-200 rounded-lg p-4 space-y-3">
                  <div class="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <AlertTriangle size={16} class="text-gray-700" />
                    Cancel subscription
                  </div>
                  <p class="text-xs text-gray-600">Cancellation is immediate and revokes access.</p>
                  <textarea
                    rows="2"
                    bind:value={cancelReasonById[subscription.id]}
                    class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-400 focus:outline-none"
                    placeholder="Reason for cancellation"
                  ></textarea>
                  {#if cancelErrorById[subscription.id]}
                    <div class="text-xs text-red-700">{cancelErrorById[subscription.id]}</div>
                  {/if}
                  <button
                    on:click={() => cancelSubscription(subscription.id)}
                    class="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
                    disabled={cancelLoadingById[subscription.id]
                      || (cancelReasonById[subscription.id] || '').trim().length < 1}
                  >
                    <XCircle size={14} />
                    {cancelLoadingById[subscription.id] ? 'Cancelling' : 'Cancel subscription'}
                  </button>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    {#if pagination.totalPages > 1}
      <div class="flex items-center justify-between mt-6">
        <button
          on:click={() => updatePage(pagination.page - 1)}
          class="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          disabled={!pagination.hasPrevious}
        >
          Previous
        </button>
        <p class="text-xs text-gray-500">Page {pagination.page} of {pagination.totalPages}</p>
        <button
          on:click={() => updatePage(pagination.page + 1)}
          class="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
          disabled={!pagination.hasNext}
        >
          Next
        </button>
      </div>
    {/if}
  {/if}
</section>

<PinModal
  bind:isOpen={isPinModalOpen}
  on:verified={handlePinVerified}
  on:pinSet={handlePinSet}
  title="Verify PIN"
  description="Enter your PIN to reveal credentials."
/>

{#if creditRenewModalOpen && creditRenewTarget}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
    <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900">Confirm renewal</h2>
        <button
          class="inline-flex items-center justify-center rounded-full p-1 text-gray-500 hover:text-gray-700"
          on:click={closeCreditRenewModal}
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>
      <div class="mt-4 space-y-2 text-sm text-gray-700">
        <p class="font-medium text-gray-900">{getProductVariantLabel(creditRenewTarget)}</p>
        <p>Duration: {creditRenewTarget.term_months ?? 1} month{(creditRenewTarget.term_months ?? 1) === 1 ? '' : 's'}</p>
        <p>Renewal price: {formatCurrency(creditRenewPriceCents, creditRenewTarget.currency)}</p>
        <p>Current balance: {formatCredits(creditBalance)} credits</p>
      </div>
      {#if creditRenewMissingCredits !== null && creditRenewMissingCredits > 0}
        <div class="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          You need {formatCredits(creditRenewMissingCredits)} more credits to renew.
        </div>
      {/if}
      {#if creditRenewError}
        <div class="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {creditRenewError}
        </div>
      {/if}
      <div class="mt-5 flex gap-2">
        <button
          class="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          on:click={closeCreditRenewModal}
          disabled={creditRenewLoading}
        >
          Cancel
        </button>
        <button
          class="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-60"
          on:click={confirmCreditRenewal}
          disabled={creditRenewLoading || (creditRenewMissingCredits !== null && creditRenewMissingCredits > 0)}
        >
          {creditRenewLoading ? 'Processing...' : 'Confirm renewal'}
        </button>
      </div>
    </div>
  </div>
{/if}
