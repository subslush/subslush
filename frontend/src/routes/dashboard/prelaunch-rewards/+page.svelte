<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboardService } from '$lib/api/dashboard.js';
  import type { PageData } from './$types';
  import type {
    PrelaunchReward,
    PrelaunchVoucher,
    PrelaunchRaffleEntry,
    PrelaunchRewardSubscription
  } from '$lib/types/prelaunch.js';

  export let data: PageData;

  let rewards: PrelaunchReward[] = data.rewards;
  let vouchers: PrelaunchVoucher[] = data.vouchers;
  let raffleEntries: PrelaunchRaffleEntry[] = data.raffleEntries;
  let subscriptions: PrelaunchRewardSubscription[] = data.subscriptions || [];
  let firstSubscription: PrelaunchRewardSubscription | null =
    data.firstSubscription || null;

  let claimReward: PrelaunchReward | null = null;
  let claimError = '';
  let claimSuccess = '';
  let isClaiming = false;
  let eligibleSubscriptions: PrelaunchRewardSubscription[] = [];
  let requiredTermMonths: number | null = null;

  const rewardTypeLabels: Record<string, string> = {
    pre_launch: 'Pre-launch reward',
    email_reward: 'Referral reward',
    purchase_reward: 'Referral reward'
  };

  const voucherStatusStyles: Record<string, string> = {
    issued: 'border-amber-200 bg-amber-50 text-amber-700',
    redeemed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    expired: 'border-gray-200 bg-gray-100 text-gray-700'
  };

  function formatLabel(value?: string | null): string {
    if (!value) return '-';
    return value
      .replace(/_/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  function formatDate(value?: string | null): string {
    if (!value) return '-';
    return new Date(value).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  function formatAmount(value?: number | string | null): string {
    if (value === null || value === undefined || value === '') return '-';
    const amount = typeof value === 'string' ? Number(value) : value;
    if (Number.isNaN(amount)) return `${value}`;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  function getRewardTitle(reward: PrelaunchReward): string {
    if (reward.source_type === 'referral_reward') {
      return 'Referral reward';
    }
    return rewardTypeLabels[reward.reward_type] || formatLabel(reward.reward_type);
  }

  function resolveRewardMetadata(reward: PrelaunchReward): Record<string, any> | null {
    if (!reward.metadata) return null;
    return reward.metadata as Record<string, any>;
  }

  function isRewardRedeemed(reward: PrelaunchReward): boolean {
    const metadata = resolveRewardMetadata(reward);
    if (!metadata) return false;
    return Boolean(
      metadata.redeemed_at ||
        metadata.redeemedAt ||
        metadata.redeemed_by ||
        metadata.redeemed_by_user_id ||
        metadata.redeemedByUserId ||
        metadata.is_redeemed === true ||
        metadata.isRedeemed === true
    );
  }

  function getRewardRedeemedAt(reward: PrelaunchReward): string | null {
    const metadata = resolveRewardMetadata(reward);
    if (!metadata) return null;
    return (metadata.redeemed_at || metadata.redeemedAt || null) as string | null;
  }

  function getFreeMonths(reward: PrelaunchReward): number {
    const months = reward.free_months ?? 0;
    return months > 0 ? months : 1;
  }

  function getReferralRewardSummary(reward: PrelaunchReward): string {
    const months = getFreeMonths(reward);
    const label = months === 1 ? 'month' : 'months';
    return `Adds ${months} free ${label} to your subscription.`;
  }

  function getReferralRewardRequirement(reward: PrelaunchReward): string {
    if (reward.applies_to === 'first_purchase') {
      return 'Can only be applied to the first subscription you purchase.';
    }
    if (reward.applies_to === 'min_1_year') {
      return 'Claimable on subscriptions with a minimum 12-month term.';
    }
    if (reward.applies_to === 'min_2_years') {
      return 'Claimable on subscriptions with a minimum 24-month term.';
    }
    return 'Claimable once you have an eligible active subscription.';
  }

  function formatSubscriptionLabel(subscription: PrelaunchRewardSubscription): string {
    const productName = subscription.product_name?.trim() || '';
    const variantName = subscription.variant_name?.trim() || '';
    let baseLabel = 'Subscription';
    if (productName && variantName) {
      baseLabel = variantName.toLowerCase().startsWith(productName.toLowerCase())
        ? variantName
        : `${productName} ${variantName}`;
    } else if (productName || variantName) {
      baseLabel = productName || variantName;
    }
    const termMonths = subscription.term_months ?? null;
    if (termMonths && termMonths > 0) {
      return `${baseLabel} (${termMonths} months)`;
    }
    return baseLabel;
  }

  function formatShortId(id?: string | null): string {
    if (!id) return '';
    return id.slice(0, 8);
  }

  function getRequiredTermMonths(appliesTo?: string | null): number | null {
    if (appliesTo === 'min_1_year') return 12;
    if (appliesTo === 'min_2_years') return 24;
    return null;
  }

  function getEligibleSubscriptions(reward: PrelaunchReward): PrelaunchRewardSubscription[] {
    const required = getRequiredTermMonths(reward.applies_to);
    if (!required) {
      return subscriptions;
    }
    return subscriptions.filter(sub => (sub.term_months || 0) >= required);
  }

  function openClaimModal(reward: PrelaunchReward) {
    claimReward = reward;
    claimError = '';
    claimSuccess = '';
  }

  function closeClaimModal() {
    if (isClaiming) return;
    claimReward = null;
    claimError = '';
    claimSuccess = '';
  }

  async function submitClaim(subscriptionId: string) {
    if (!claimReward) return;
    claimError = '';
    claimSuccess = '';
    isClaiming = true;
    try {
      await dashboardService.claimReferralReward({
        perkId: claimReward.id,
        subscriptionId
      });
      claimSuccess = 'Reward applied to your subscription.';
      const latest = await dashboardService.getPrelaunchRewards();
      rewards = latest.rewards || [];
      vouchers = latest.vouchers || [];
      raffleEntries = latest.raffleEntries || [];
      subscriptions = latest.subscriptions || [];
      firstSubscription = latest.firstSubscription || null;
      claimReward = null;
    } catch (error) {
      claimError =
        error instanceof Error ? error.message : 'Failed to claim reward.';
    } finally {
      isClaiming = false;
    }
  }

  $: {
    if (claimReward && claimReward.applies_to !== 'first_purchase') {
      requiredTermMonths = getRequiredTermMonths(claimReward.applies_to);
      eligibleSubscriptions = getEligibleSubscriptions(claimReward);
    } else {
      requiredTermMonths = null;
      eligibleSubscriptions = [];
    }
  }

  onMount(() => {
    let isActive = true;

    const refreshRewards = async () => {
      try {
        const latest = await dashboardService.getPrelaunchRewards();
        if (!isActive) return;
        rewards = latest.rewards || [];
        vouchers = latest.vouchers || [];
        raffleEntries = latest.raffleEntries || [];
        subscriptions = latest.subscriptions || [];
        firstSubscription = latest.firstSubscription || null;
      } catch (error) {
        console.warn('Failed to refresh pre-launch rewards:', error);
      }
    };

    void refreshRewards();

    return () => {
      isActive = false;
    };
  });
</script>

<svelte:head>
  <title>Pre-launch Rewards - SubSlush</title>
  <meta
    name="description"
    content="View pre-launch rewards, vouchers, and raffle entries tied to your account."
  />
</svelte:head>

<section class="space-y-6">
  <div class="flex items-center justify-between flex-wrap gap-3">
    <div>
      <h1 class="text-2xl font-semibold text-gray-900">Pre-launch rewards</h1>
      <p class="text-sm text-gray-600 mt-1">
        View referral rewards, vouchers, and raffle entries from the pre-launch campaign.
      </p>
    </div>
  </div>

  {#if data.error}
    <div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {data.error}
    </div>
  {/if}

  <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
    <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Rewards</h2>
        <p class="text-sm text-gray-600">Referral and pre-launch perks.</p>
      </div>
      {#if rewards.length === 0}
        <div class="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-600">
          No rewards yet.
        </div>
      {:else}
        <div class="space-y-3">
          {#each rewards as reward}
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-gray-900">{getRewardTitle(reward)}</p>
                  {#if reward.source_type !== 'referral_reward' && (reward.tier || reward.applies_to)}
                    <p class="text-xs text-gray-500">
                      {reward.tier ? formatLabel(reward.tier) : ''}{reward.applies_to ? ` • ${formatLabel(reward.applies_to)}` : ''}
                    </p>
                  {/if}
                </div>
                {#if reward.source_type !== 'referral_reward'}
                  <span class="text-xs text-gray-500">{formatDate(reward.awarded_at)}</span>
                {/if}
              </div>
              <div class="flex flex-wrap gap-2 text-xs text-gray-600">
                {#if reward.free_months && reward.source_type !== 'referral_reward'}
                  <span class="rounded-full border border-gray-200 bg-white px-2 py-0.5">
                    +{reward.free_months} months
                  </span>
                {/if}
                {#if reward.founder_status}
                  <span class="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
                    Founder
                  </span>
                {/if}
                {#if reward.prize_won}
                  <span class="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
                    Prize: {reward.prize_won}
                  </span>
                {/if}
              </div>
              {#if reward.notes}
                <p class="text-xs text-gray-500">{reward.notes}</p>
              {/if}
              {#if reward.source_type === 'referral_reward'}
                <div class="space-y-2 text-xs text-gray-600">
                  <p>{getReferralRewardSummary(reward)} {getReferralRewardRequirement(reward)}</p>
                  <div class="flex items-center justify-between">
                    <span class="text-gray-500">
                      {isRewardRedeemed(reward) ? 'Claimed' : 'Available to claim'}
                    </span>
                    {#if isRewardRedeemed(reward)}
                      <span class="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
                        Used
                      </span>
                    {:else}
                      <button
                        class="text-xs font-semibold text-cyan-600"
                        on:click={() => openClaimModal(reward)}
                      >
                        Claim
                      </button>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Vouchers</h2>
        <p class="text-sm text-gray-600">Calendar vouchers issued to your account.</p>
      </div>
      {#if vouchers.length === 0}
        <div class="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-600">
          No vouchers yet.
        </div>
      {:else}
        <div class="space-y-3">
          {#each vouchers as voucher}
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-gray-900">{formatLabel(voucher.voucher_type)}</p>
                  <p class="text-xs text-gray-500">Event date: {formatDate(voucher.event_date)}</p>
                </div>
                <span class={`text-xs border rounded-full px-2 py-0.5 ${voucherStatusStyles[voucher.status] || 'border-gray-200 bg-gray-100 text-gray-700'}`}>
                  {formatLabel(voucher.status)}
                </span>
              </div>
              <div class="flex items-center justify-between text-xs text-gray-600">
                <span>Amount: {formatAmount(voucher.amount)}</span>
                <span>Issued {formatDate(voucher.issued_at)}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
      <div>
        <h2 class="text-lg font-semibold text-gray-900">Raffle entries</h2>
        <p class="text-sm text-gray-600">Tickets earned from calendar drops.</p>
      </div>
      {#if raffleEntries.length === 0}
        <div class="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-600">
          No raffle entries yet.
        </div>
      {:else}
        <div class="space-y-3">
          {#each raffleEntries as entry}
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-semibold text-gray-900">Raffle {entry.raffle_id}</p>
                  <p class="text-xs text-gray-500">Source: {formatLabel(entry.source)}</p>
                </div>
                <span class="text-xs text-gray-500">{formatDate(entry.event_date)}</span>
              </div>
              <div class="flex items-center justify-between text-xs text-gray-600">
                <span>Entries: {entry.count}</span>
                <span>Logged {formatDate(entry.created_at || null)}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</section>

{#if claimReward}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      class="absolute inset-0 bg-black/40 backdrop-blur-sm"
      aria-label="Close claim modal"
      on:click={closeClaimModal}
    ></button>
    <div
      class="relative z-10 w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-black/5"
      role="dialog"
      aria-modal="true"
    >
      <div class="flex items-center justify-between border-b border-gray-200 px-6 py-5">
        <div class="space-y-1">
          <h3 class="text-xl font-semibold text-gray-900">Claim reward</h3>
          <p class="text-sm text-gray-500">{getRewardTitle(claimReward)}</p>
        </div>
        <button
          class="text-sm font-semibold text-gray-500 hover:text-gray-700"
          on:click={closeClaimModal}
        >
          Close
        </button>
      </div>
      <div class="space-y-5 px-6 py-6">
        <div class="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="space-y-1">
              <p class="text-xs font-semibold uppercase tracking-widest text-gray-500">Reward</p>
              <p class="text-sm font-semibold text-gray-900">{getRewardTitle(claimReward)}</p>
              <p class="text-xs text-gray-600">{getReferralRewardSummary(claimReward)}</p>
            </div>
            <div class="text-right">
              <p class="text-xs font-semibold uppercase tracking-widest text-gray-500">Months to add</p>
              <p class="text-2xl font-semibold text-gray-900 leading-tight">
                {getFreeMonths(claimReward)}
              </p>
              <p class="text-xs text-gray-500">
                {getFreeMonths(claimReward) === 1 ? 'month' : 'months'}
              </p>
            </div>
          </div>
          <div class="mt-3 text-xs text-gray-600">{getReferralRewardRequirement(claimReward)}</div>
        </div>
        {#if claimError}
          <div class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {claimError}
          </div>
        {/if}
        {#if claimSuccess}
          <div class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {claimSuccess}
          </div>
        {/if}

        {#if claimReward.applies_to === 'first_purchase'}
          {#if !firstSubscription}
            <div class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              You need an active subscription before you can claim this reward. Once your
              first order is delivered and activated, you can apply it.
            </div>
          {:else if firstSubscription.status !== 'active'}
            <div class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              Your first subscription is not active yet. After activation, you can claim
              this reward.
            </div>
          {:else}
            <div class="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
              <div class="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Subscription
                  </p>
                  <div class="flex flex-wrap items-center gap-2">
                    <div class="text-sm font-semibold text-gray-900">
                      {formatSubscriptionLabel(firstSubscription)}
                    </div>
                    {#if firstSubscription.id}
                      <span class="text-xs text-gray-500">
                        ID: {formatShortId(firstSubscription.id)}
                      </span>
                    {/if}
                  </div>
                </div>
                <button
                  class="rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white"
                  on:click={() => {
                    if (!firstSubscription) return;
                    submitClaim(firstSubscription.id);
                  }}
                  disabled={isClaiming}
                >
                  {isClaiming
                    ? 'Applying...'
                    : `Add ${getFreeMonths(claimReward)} ${
                        getFreeMonths(claimReward) === 1 ? 'month' : 'months'
                      }`}
                </button>
              </div>
            </div>
          {/if}
        {:else}
          {#if subscriptions.length === 0}
            <div class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              You need an active subscription before you can claim this reward.
            </div>
          {:else if eligibleSubscriptions.length === 0}
            <div class="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              {#if requiredTermMonths}
                This reward can only be applied to a subscription with minimum {requiredTermMonths}-month duration.
              {:else}
                No eligible subscriptions available for this reward.
              {/if}
            </div>
          {:else}
            <div class="space-y-3">
              <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Select subscription
              </p>
              {#each eligibleSubscriptions as subscription}
                <div class="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Subscription
                      </p>
                      <div class="flex flex-wrap items-center gap-2">
                        <div class="text-sm font-semibold text-gray-900">
                          {formatSubscriptionLabel(subscription)}
                        </div>
                        {#if subscription.id}
                          <span class="text-xs text-gray-500">
                            ID: {formatShortId(subscription.id)}
                          </span>
                        {/if}
                      </div>
                    </div>
                    <button
                      class="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white"
                      on:click={() => submitClaim(subscription.id)}
                      disabled={isClaiming}
                    >
                      {isClaiming
                        ? 'Applying...'
                        : `Add ${getFreeMonths(claimReward)} ${
                            getFreeMonths(claimReward) === 1 ? 'month' : 'months'
                          }`}
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}
