<script lang="ts">
  import StatusBadge from '$lib/components/admin/StatusBadge.svelte';
  import AdminEmptyState from '$lib/components/admin/AdminEmptyState.svelte';
  import { adminService } from '$lib/api/admin.js';
  import { formatOptionalDate, pickValue, statusToneFromMap } from '$lib/utils/admin.js';
  import type { AdminReward } from '$lib/types/admin.js';
  import type { PageData } from './$types';

  export let data: PageData;

  let referralRewards: AdminReward[] = data.referralRewards;
  let prelaunchRewards: AdminReward[] = data.prelaunchRewards;

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

  <section class="grid gap-6 lg:grid-cols-2">
    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-gray-900">Referral Rewards</h2>
        <p class="text-sm text-gray-500">{referralRewards.length} rewards</p>
      </div>
      {#if referralRewards.length === 0}
        <AdminEmptyState title="No referral rewards" message="Rewards will appear after referrals convert." />
      {:else}
        <div class="space-y-3">
          {#each referralRewards as reward}
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-semibold text-gray-900">{reward.id}</p>
                  <p class="text-xs text-gray-500">Code {reward.referralCode || reward.referral_code || '--'}</p>
                </div>
                <StatusBadge
                  label={(reward.status || 'pending').toString()}
                  tone={statusToneFromMap(reward.status, rewardStatusMap)}
                />
              </div>
              <div class="mt-2 text-xs text-gray-500">Redeemed {formatOptionalDate(reward.redeemedAt || reward.redeemed_at)}</div>
              <button class="mt-2 text-xs font-semibold text-cyan-600" on:click={() => startReferralRedeem(reward)}>
                Redeem
              </button>
              {#if redeemReferralId === reward.id}
                <div class="mt-3 grid gap-2 md:grid-cols-4">
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
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-gray-900">Pre-Launch Rewards</h2>
        <p class="text-sm text-gray-500">{prelaunchRewards.length} rewards</p>
      </div>
      {#if prelaunchRewards.length === 0}
        <AdminEmptyState title="No pre-launch rewards" message="Rewards will appear after migrations or campaigns." />
      {:else}
        <div class="space-y-3">
          {#each prelaunchRewards as reward}
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-semibold text-gray-900">{reward.id}</p>
                  <p class="text-xs text-gray-500">Type {reward.rewardType || reward.reward_type || 'reward'}</p>
                </div>
                <StatusBadge
                  label={(reward.status || 'pending').toString()}
                  tone={statusToneFromMap(reward.status, rewardStatusMap)}
                />
              </div>
              <div class="mt-2 text-xs text-gray-500">Redeemed {formatOptionalDate(reward.redeemedAt || reward.redeemed_at)}</div>
              <button class="mt-2 text-xs font-semibold text-cyan-600" on:click={() => startPrelaunchRedeem(reward)}>
                Redeem
              </button>
              {#if redeemPrelaunchId === reward.id}
                <div class="mt-3 grid gap-2 md:grid-cols-4">
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
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </section>
</div>
