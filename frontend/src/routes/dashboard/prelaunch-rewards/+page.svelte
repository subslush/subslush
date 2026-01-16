<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboardService } from '$lib/api/dashboard.js';
  import type { PageData } from './$types';
  import type {
    PrelaunchReward,
    PrelaunchVoucher,
    PrelaunchRaffleEntry
  } from '$lib/types/prelaunch.js';

  export let data: PageData;

  let rewards: PrelaunchReward[] = data.rewards;
  let vouchers: PrelaunchVoucher[] = data.vouchers;
  let raffleEntries: PrelaunchRaffleEntry[] = data.raffleEntries;

  const rewardTypeLabels: Record<string, string> = {
    pre_launch: 'Pre-launch reward',
    email_reward: 'Referral email reward',
    purchase_reward: 'Referral purchase reward'
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
    return rewardTypeLabels[reward.reward_type] || formatLabel(reward.reward_type);
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
                  {#if reward.tier || reward.applies_to}
                    <p class="text-xs text-gray-500">
                      {reward.tier ? formatLabel(reward.tier) : ''}{reward.applies_to ? ` • ${formatLabel(reward.applies_to)}` : ''}
                    </p>
                  {/if}
                </div>
                <span class="text-xs text-gray-500">{formatDate(reward.awarded_at)}</span>
              </div>
              <div class="flex flex-wrap gap-2 text-xs text-gray-600">
                {#if reward.free_months}
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
