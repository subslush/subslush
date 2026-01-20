<script lang="ts">
  import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
  import AdminEmptyState from '$lib/components/admin/AdminEmptyState.svelte';
  import { adminService } from '$lib/api/admin.js';
  import { formatOptionalDate, getBooleanLabel, pickValue, statusToneFromMap } from '$lib/utils/admin.js';
  import type { AdminReward } from '$lib/types/admin.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let claimedReferralRewards: AdminReward[] = data.claimedReferralRewards || [];
  let claimedPrelaunchRewards: AdminReward[] = data.claimedPrelaunchRewards || [];

  let searchQuery = '';
  let searchReferralRewards: AdminReward[] = [];
  let searchPrelaunchRewards: AdminReward[] = [];
  let searchLoading = false;
  let searchError = '';
  let hasSearched = false;

  let actionMessage = '';
  let actionError = '';

  let redeemReferralId: string | null = null;
  let redeemReferral = { userId: '', subscriptionId: '', appliedValueCents: 0 };

  let redeemPrelaunchId: string | null = null;
  let redeemPrelaunch = { userId: '', subscriptionId: '', appliedValueCents: 0 };

  const rewardStatusMap = {
    pending: 'warning',
    earned: 'info',
    redeemed: 'success',
    expired: 'danger'
  } as const;

  const resetFeedback = () => {
    actionMessage = '';
    actionError = '';
  };

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const resolveString = (value?: string | null) =>
    value && value.trim().length > 0 ? value : '--';

  const formatNumber = (value?: number | null) => {
    if (value === null || value === undefined) return '--';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  };

  const runSearch = async () => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      searchReferralRewards = [];
      searchPrelaunchRewards = [];
      hasSearched = true;
      return;
    }

    searchLoading = true;
    searchError = '';

    try {
      const [referralResult, prelaunchResult] = await Promise.all([
        adminService.listReferralRewards({ search: trimmed, limit: 200 }),
        adminService.listPrelaunchRewards({ search: trimmed, limit: 200 })
      ]);
      searchReferralRewards = referralResult;
      searchPrelaunchRewards = prelaunchResult;
      hasSearched = true;
    } catch (error) {
      searchError = getErrorMessage(error, 'Failed to search rewards.');
      hasSearched = true;
    } finally {
      searchLoading = false;
    }
  };

  const handleSearchKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      runSearch();
    }
  };

  const startReferralRedeem = (reward: AdminReward) => {
    resetFeedback();
    redeemReferralId = reward.id;
    redeemReferral = {
      userId: (pickValue(reward.redeemedByUserId, reward.redeemed_by_user_id, reward.userId, reward.user_id) as string) || '',
      subscriptionId: '',
      appliedValueCents: pickValue(reward.appliedValueCents, reward.applied_value_cents) || 0
    };
  };

  const submitReferralRedeem = async () => {
    if (!redeemReferralId) return;
    resetFeedback();
    try {
      const subscriptionId = redeemReferral.subscriptionId?.trim() || undefined;
      await adminService.redeemReferralReward(redeemReferralId, {
        userId: redeemReferral.userId,
        subscriptionId,
        appliedValueCents: redeemReferral.appliedValueCents
          ? Number(redeemReferral.appliedValueCents)
          : undefined
      });
      actionMessage = 'Referral reward redeemed.';
      redeemReferralId = null;
    } catch (error) {
      actionError = getErrorMessage(error, 'Failed to redeem referral reward.');
    }
  };

  const startPrelaunchRedeem = (reward: AdminReward) => {
    resetFeedback();
    redeemPrelaunchId = reward.id;
    redeemPrelaunch = {
      userId: (pickValue(reward.redeemedByUserId, reward.redeemed_by_user_id, reward.userId, reward.user_id) as string) || '',
      subscriptionId: '',
      appliedValueCents: pickValue(reward.appliedValueCents, reward.applied_value_cents) || 0
    };
  };

  const submitPrelaunchRedeem = async () => {
    if (!redeemPrelaunchId) return;
    resetFeedback();
    try {
      const subscriptionId = redeemPrelaunch.subscriptionId?.trim() || undefined;
      await adminService.redeemPrelaunchReward(redeemPrelaunchId, {
        userId: redeemPrelaunch.userId,
        subscriptionId,
        appliedValueCents: redeemPrelaunch.appliedValueCents
          ? Number(redeemPrelaunch.appliedValueCents)
          : undefined
      });
      actionMessage = 'Pre-launch reward redeemed.';
      redeemPrelaunchId = null;
    } catch (error) {
      actionError = getErrorMessage(error, 'Failed to redeem pre-launch reward.');
    }
  };
</script>

<svelte:head>
  <title>Rewards - Admin</title>
  <meta name="description" content="Manage referral and pre-launch rewards." />
</svelte:head>

<div class="space-y-6">
  <section>
    <h1 class="text-2xl font-bold text-gray-900">Rewards & Referrals</h1>
    <p class="text-sm text-gray-600">Monitor reward issuance and redemption.</p>
  </section>

  {#if actionMessage}
    <p class="text-sm text-green-600">{actionMessage}</p>
  {/if}
  {#if actionError}
    <p class="text-sm text-red-600">{actionError}</p>
  {/if}

  <section class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
    <div class="flex flex-col gap-3 md:flex-row md:items-center">
      <input
        class="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        placeholder="Search by UID or email"
        bind:value={searchQuery}
        on:keydown={handleSearchKeydown}
      />
      <button
        class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
        on:click={runSearch}
        disabled={searchLoading}
      >
        {searchLoading ? 'Searching...' : 'Search'}
      </button>
    </div>
    {#if searchError}
      <p class="text-sm text-red-600">{searchError}</p>
    {/if}
  </section>

  <section class="grid gap-6 lg:grid-cols-2">
    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-gray-900">Referral rewards (search)</h2>
        {#if hasSearched}
          <p class="text-sm text-gray-500">{searchReferralRewards.length} rewards</p>
        {/if}
      </div>
      {#if !hasSearched}
        <AdminEmptyState title="Search for a user" message="Enter a UID or email to load referral rewards." />
      {:else if searchReferralRewards.length === 0}
        <AdminEmptyState title="No referral rewards found" message="Try a different UID or email." />
      {:else}
        <div class="space-y-3">
          {#each searchReferralRewards as reward}
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
              <div class="flex items-start justify-between gap-3">
                <div class="space-y-1">
                  <p class="text-sm font-semibold text-gray-900">{reward.id}</p>
                  <p class="text-xs text-gray-500">
                    User ID {resolveString(pickValue(reward.userId, reward.user_id))}
                  </p>
                  <p class="text-xs text-gray-500">
                    Email {resolveString(pickValue(reward.userEmail, reward.user_email, reward.preRegistrationEmail, reward.pre_registration_email))}
                  </p>
                </div>
                <StatusBadge
                  label={(reward.status || 'pending').toString()}
                  tone={statusToneFromMap(reward.status, rewardStatusMap)}
                />
              </div>
              <div class="flex flex-wrap gap-2 text-xs text-gray-600">
                <span>Type {resolveString(pickValue(reward.rewardType, reward.reward_type))}</span>
                <span>Tier {resolveString(reward.tier)}</span>
                <span>Applies {resolveString(reward.applies_to)}</span>
                <span>Free months {formatNumber(reward.free_months)}</span>
                <span>Applied value (cents) {formatNumber(reward.applied_value_cents)}</span>
              </div>
              <div class="text-xs text-gray-500">
                Earned {formatOptionalDate(reward.earnedAt || reward.earned_at)}
              </div>
              <div class="text-xs text-gray-500">
                Redeemed {formatOptionalDate(reward.redeemedAt || reward.redeemed_at)} -
                By {resolveString(pickValue(reward.redeemedByUserId, reward.redeemed_by_user_id))}
              </div>
              <div class="text-xs text-gray-500">
                Code {resolveString(reward.referralCode || reward.referral_code)} -
                Referred by {resolveString(reward.referredByCode || reward.referred_by_code)}
              </div>
              {#if reward.subscriptionId || reward.subscription_id}
                <div class="text-xs text-gray-500">
                  Subscription {resolveString(pickValue(reward.subscriptionId, reward.subscription_id))}
                </div>
              {/if}
              {#if reward.status !== 'redeemed'}
                <button class="text-xs font-semibold text-cyan-600" on:click={() => startReferralRedeem(reward)}>
                  Redeem
                </button>
                {#if redeemReferralId === reward.id}
                  <div class="mt-2 grid gap-2 md:grid-cols-4">
                    <input
                      class="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs"
                      placeholder="Redeem for user ID"
                      bind:value={redeemReferral.userId}
                    />
                    <input
                      class="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs"
                      placeholder="Subscription ID (optional)"
                      bind:value={redeemReferral.subscriptionId}
                    />
                    <input
                      class="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs"
                      type="number"
                      min="0"
                      placeholder="Applied value (cents)"
                      bind:value={redeemReferral.appliedValueCents}
                    />
                    <button
                      class="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white"
                      on:click={submitReferralRedeem}
                    >
                      Confirm
                    </button>
                  </div>
                {/if}
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-gray-900">Pre-launch rewards (search)</h2>
        {#if hasSearched}
          <p class="text-sm text-gray-500">{searchPrelaunchRewards.length} rewards</p>
        {/if}
      </div>
      {#if !hasSearched}
        <AdminEmptyState title="Search for a user" message="Enter a UID or email to load pre-launch rewards." />
      {:else if searchPrelaunchRewards.length === 0}
        <AdminEmptyState title="No pre-launch rewards found" message="Try a different UID or email." />
      {:else}
        <div class="space-y-3">
          {#each searchPrelaunchRewards as reward}
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
              <div class="flex items-start justify-between gap-3">
                <div class="space-y-1">
                  <p class="text-sm font-semibold text-gray-900">{reward.id}</p>
                  <p class="text-xs text-gray-500">
                    User ID {resolveString(pickValue(reward.userId, reward.user_id))}
                  </p>
                  <p class="text-xs text-gray-500">
                    Email {resolveString(pickValue(reward.userEmail, reward.user_email, reward.preRegistrationEmail, reward.pre_registration_email))}
                  </p>
                </div>
                <StatusBadge
                  label={(reward.status || 'pending').toString()}
                  tone={statusToneFromMap(reward.status, rewardStatusMap)}
                />
              </div>
              <div class="flex flex-wrap gap-2 text-xs text-gray-600">
                <span>Type {resolveString(pickValue(reward.rewardType, reward.reward_type))}</span>
                <span>Free months {formatNumber(reward.free_months)}</span>
                <span>Founder {getBooleanLabel(reward.founder_status)}</span>
                <span>Prize {resolveString(reward.prize_won)}</span>
                <span>Applied value (cents) {formatNumber(reward.applied_value_cents)}</span>
              </div>
              {#if reward.notes}
                <p class="text-xs text-gray-500">{reward.notes}</p>
              {/if}
              <div class="text-xs text-gray-500">
                Awarded {formatOptionalDate(reward.awardedAt || reward.awarded_at)}
              </div>
              <div class="text-xs text-gray-500">
                Redeemed {formatOptionalDate(reward.redeemedAt || reward.redeemed_at)} -
                By {resolveString(pickValue(reward.redeemedByUserId, reward.redeemed_by_user_id))}
              </div>
              {#if reward.status !== 'redeemed'}
                <button class="text-xs font-semibold text-cyan-600" on:click={() => startPrelaunchRedeem(reward)}>
                  Redeem
                </button>
                {#if redeemPrelaunchId === reward.id}
                  <div class="mt-2 grid gap-2 md:grid-cols-4">
                    <input
                      class="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs"
                      placeholder="Redeem for user ID"
                      bind:value={redeemPrelaunch.userId}
                    />
                    <input
                      class="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs"
                      placeholder="Subscription ID (optional)"
                      bind:value={redeemPrelaunch.subscriptionId}
                    />
                    <input
                      class="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs"
                      type="number"
                      min="0"
                      placeholder="Applied value (cents)"
                      bind:value={redeemPrelaunch.appliedValueCents}
                    />
                    <button
                      class="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white"
                      on:click={submitPrelaunchRedeem}
                    >
                      Confirm
                    </button>
                  </div>
                {/if}
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </section>

  <section class="grid gap-6 lg:grid-cols-2">
    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-gray-900">Claimed referral rewards</h2>
        <p class="text-sm text-gray-500">{claimedReferralRewards.length} rewards</p>
      </div>
      {#if claimedReferralRewards.length === 0}
        <AdminEmptyState title="No claimed referral rewards" message="Claimed rewards will appear here." />
      {:else}
        <div class="space-y-3">
          {#each claimedReferralRewards as reward}
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
              <div class="flex items-start justify-between gap-3">
                <div class="space-y-1">
                  <p class="text-sm font-semibold text-gray-900">{reward.id}</p>
                  <p class="text-xs text-gray-500">
                    User ID {resolveString(pickValue(reward.userId, reward.user_id))}
                  </p>
                  <p class="text-xs text-gray-500">
                    Email {resolveString(pickValue(reward.userEmail, reward.user_email, reward.preRegistrationEmail, reward.pre_registration_email))}
                  </p>
                </div>
                <StatusBadge
                  label={(reward.status || 'pending').toString()}
                  tone={statusToneFromMap(reward.status, rewardStatusMap)}
                />
              </div>
              <div class="flex flex-wrap gap-2 text-xs text-gray-600">
                <span>Type {resolveString(pickValue(reward.rewardType, reward.reward_type))}</span>
                <span>Tier {resolveString(reward.tier)}</span>
                <span>Applies {resolveString(reward.applies_to)}</span>
                <span>Free months {formatNumber(reward.free_months)}</span>
                <span>Applied value (cents) {formatNumber(reward.applied_value_cents)}</span>
              </div>
              <div class="text-xs text-gray-500">
                Earned {formatOptionalDate(reward.earnedAt || reward.earned_at)}
              </div>
              <div class="text-xs text-gray-500">
                Redeemed {formatOptionalDate(reward.redeemedAt || reward.redeemed_at)} -
                By {resolveString(pickValue(reward.redeemedByUserId, reward.redeemed_by_user_id))}
              </div>
              {#if reward.subscriptionId || reward.subscription_id}
                <div class="text-xs text-gray-500">
                  Subscription {resolveString(pickValue(reward.subscriptionId, reward.subscription_id))}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-gray-900">Claimed pre-launch rewards</h2>
        <p class="text-sm text-gray-500">{claimedPrelaunchRewards.length} rewards</p>
      </div>
      {#if claimedPrelaunchRewards.length === 0}
        <AdminEmptyState title="No claimed pre-launch rewards" message="Claimed rewards will appear here." />
      {:else}
        <div class="space-y-3">
          {#each claimedPrelaunchRewards as reward}
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 space-y-2">
              <div class="flex items-start justify-between gap-3">
                <div class="space-y-1">
                  <p class="text-sm font-semibold text-gray-900">{reward.id}</p>
                  <p class="text-xs text-gray-500">
                    User ID {resolveString(pickValue(reward.userId, reward.user_id))}
                  </p>
                  <p class="text-xs text-gray-500">
                    Email {resolveString(pickValue(reward.userEmail, reward.user_email, reward.preRegistrationEmail, reward.pre_registration_email))}
                  </p>
                </div>
                <StatusBadge
                  label={(reward.status || 'pending').toString()}
                  tone={statusToneFromMap(reward.status, rewardStatusMap)}
                />
              </div>
              <div class="flex flex-wrap gap-2 text-xs text-gray-600">
                <span>Type {resolveString(pickValue(reward.rewardType, reward.reward_type))}</span>
                <span>Free months {formatNumber(reward.free_months)}</span>
                <span>Founder {getBooleanLabel(reward.founder_status)}</span>
                <span>Prize {resolveString(reward.prize_won)}</span>
                <span>Applied value (cents) {formatNumber(reward.applied_value_cents)}</span>
              </div>
              {#if reward.notes}
                <p class="text-xs text-gray-500">{reward.notes}</p>
              {/if}
              <div class="text-xs text-gray-500">
                Awarded {formatOptionalDate(reward.awardedAt || reward.awarded_at)}
              </div>
              <div class="text-xs text-gray-500">
                Redeemed {formatOptionalDate(reward.redeemedAt || reward.redeemed_at)} -
                By {resolveString(pickValue(reward.redeemedByUserId, reward.redeemed_by_user_id))}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </section>
</div>
