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
  let totalRaffleEntries = 0;

  let claimReward: PrelaunchReward | null = null;
  let claimError = '';
  let claimSuccess = '';
  let isClaiming = false;
  let eligibleSubscriptions: PrelaunchRewardSubscription[] = [];
  let requiredTermMonths: number | null = null;
  let activeVoucher: PrelaunchVoucher | null = null;
  let isClaimingVoucher = false;
  let voucherClaimError = '';
  let voucherClaimSuccess = '';
  let voucherCategoryChoice: 'streaming' | 'music' | 'gaming' | '' = '';
  let activeVoucherCouponCode: string | null = null;
  let activeVoucherCouponStatus: 'active' | 'used' | null = null;
  let activeVoucherClaimAction: string = 'unavailable';

  const rewardTypeLabels: Record<string, string> = {
    pre_launch: 'Pre-launch reward',
    email_reward: 'Referral reward',
    purchase_reward: 'Referral reward'
  };

  const voucherTypeLabels: Record<string, string> = {
    percent_off: 'Percent off',
    free_months: 'Free months',
    free_month: 'Free month',
    stackable: 'Stackable'
  };

  type VoucherGroupKey =
    | 'entertainment'
    | 'ai'
    | 'productivity'
    | 'design'
    | 'social'
    | 'education'
    | 'other';

  type VoucherGroupDefinition = {
    key: VoucherGroupKey;
    label: string;
    keywords: string[];
  };

  type VoucherGroup = {
    key: VoucherGroupKey;
    label: string;
    vouchers: PrelaunchVoucher[];
    count: number;
  };

  const voucherGroupDefinitions: VoucherGroupDefinition[] = [
    {
      key: 'entertainment',
      label: 'Entertainment',
      keywords: [
        'paramount',
        'netflix',
        'hbo max',
        'hbo',
        'disney',
        'amazon prime',
        'prime video',
        'xbox game pass',
        'crunchyroll',
        'youtube',
        'spotify',
        'entertainment lane',
        'premium entertainment'
      ]
    },
    {
      key: 'ai',
      label: 'AI',
      keywords: ['perplexity', 'chatprd', 'chat prd', 'google ai', 'chatgpt', 'ai lane']
    },
    {
      key: 'productivity',
      label: 'Productivity',
      keywords: [
        'productivity lane',
        'productivity',
        'linear',
        'linear business',
        'tradingview',
        'trading view'
      ]
    },
    {
      key: 'design',
      label: 'Design',
      keywords: ['adobe', 'canva']
    },
    {
      key: 'social',
      label: 'Social',
      keywords: ['linkedin']
    },
    {
      key: 'education',
      label: 'Education',
      keywords: ['duolingo']
    },
    {
      key: 'other',
      label: 'Other',
      keywords: []
    }
  ];

  let voucherGroupOpen: Record<VoucherGroupKey, boolean> = buildVoucherGroupState();
  let visibleVouchers: PrelaunchVoucher[] = [];
  let voucherGroups: VoucherGroup[] = [];

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

  function formatNumber(
    value?: number | null,
    options: Intl.NumberFormatOptions = {}
  ): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '-';
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2,
      ...options
    }).format(value);
  }

  function toNumber(value?: number | string | null): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = typeof value === 'string' ? Number(value) : value;
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatVoucherScope(scope?: string | null): string {
    if (!scope) return 'Any product';
    const trimmed = scope.trim();
    if (!trimmed) return 'Any product';
    const normalized = trimmed.replace(/_/g, ' ').toLowerCase();
    const scopeLabels: Record<string, string> = {
      global: 'Any product',
      sitewide: 'Any product',
      'any 1y plan': 'Any 12 month subscription plan',
      'any annual subscription': 'Any 12 month subscription plan',
      'entertainment lane': 'Any Streaming, Music or Gaming product',
      'ai lane': 'Any AI Product',
      'chatgpt plus': 'ChatGPT',
      'crunchyroll 1y': 'Crunchyroll 12 month plan'
    };
    if (scopeLabels[normalized]) return scopeLabels[normalized];
    return trimmed.includes('_') ? formatLabel(trimmed) : trimmed;
  }

  function resolveVoucherMetadata(voucher: PrelaunchVoucher): Record<string, any> | null {
    if (!voucher.metadata || typeof voucher.metadata !== 'object') return null;
    return voucher.metadata as Record<string, any>;
  }

  function formatTermMonths(value: unknown): string | null {
    if (Array.isArray(value)) {
      const months = value
        .map(item => Number(item))
        .filter(item => Number.isFinite(item))
        .sort((a, b) => a - b);
      if (months.length === 0) return null;
      if (months.length === 1) {
        const label = months[0] === 1 ? 'month' : 'months';
        return `Valid for ${months[0]} ${label}`;
      }
      const list = months.map(month => `${month} months`);
      return `Valid for ${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}`;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      const label = value === 1 ? 'month' : 'months';
      return `Valid for ${value} ${label}`;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        const label = parsed === 1 ? 'month' : 'months';
        return `Valid for ${parsed} ${label}`;
      }
    }
    return null;
  }

  function formatVoucherTypeLabel(voucher: PrelaunchVoucher): string {
    const metadata = resolveVoucherMetadata(voucher);
    const baseLabel = voucherTypeLabels[voucher.voucher_type] || formatLabel(voucher.voucher_type);
    if (metadata?.stackable === true && voucher.voucher_type === 'percent_off') {
      return `${baseLabel} (stackable)`;
    }
    return baseLabel;
  }

  function formatVoucherAmount(voucher: PrelaunchVoucher): string {
    const metadata = resolveVoucherMetadata(voucher);
    const amount =
      toNumber(voucher.amount) ??
      toNumber(metadata?.amount ?? metadata?.value ?? null);
    const voucherType = voucher.voucher_type;

    if (metadata?.status === 'locked') {
      return 'Locked';
    }

    if (voucherType === 'percent_off') {
      if (amount === null) return '-';
      return `${formatNumber(amount, { maximumFractionDigits: 2 })}% off`;
    }

    if (voucherType === 'free_months' || voucherType === 'free_month') {
      const months = amount ?? toNumber(metadata?.free_months ?? metadata?.months ?? null);
      if (months === null) return '-';
      const label = months === 1 ? 'free month' : 'free months';
      return `${formatNumber(months, { maximumFractionDigits: 0 })} ${label}`;
    }

    if (voucherType === 'stackable') {
      const months = toNumber(metadata?.free_months ?? null);
      if (months !== null) {
        const label = months === 1 ? 'free month' : 'free months';
        return `${formatNumber(months, { maximumFractionDigits: 0 })} ${label}`;
      }
      if (amount === null) return '-';
      return `${formatNumber(amount, { maximumFractionDigits: 2 })}% stackable`;
    }

    if (amount === null) return '-';
    return formatAmount(amount);
  }

  function isStackableVoucher(voucher: PrelaunchVoucher): boolean {
    const metadata = resolveVoucherMetadata(voucher);
    return voucher.voucher_type === 'stackable' || metadata?.stackable === true;
  }

  function buildVoucherGroupState(): Record<VoucherGroupKey, boolean> {
    return voucherGroupDefinitions.reduce((state, group) => {
      state[group.key] = false;
      return state;
    }, {} as Record<VoucherGroupKey, boolean>);
  }

  function normalizeVoucherGroupText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value)
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/\\s+/g, ' ')
      .trim();
  }

  function extractVoucherPrimaryGroupText(voucher: PrelaunchVoucher): string {
    const metadata = resolveVoucherMetadata(voucher) || {};
    return [voucher.scope, metadata.display_title, metadata.claim_label]
      .map(normalizeVoucherGroupText)
      .filter(Boolean)
      .join(' ');
  }

  function extractVoucherChoiceGroupText(voucher: PrelaunchVoucher): string {
    const metadata = resolveVoucherMetadata(voucher) || {};
    const segments: string[] = [];

    const appendValue = (value: unknown) => {
      const normalized = normalizeVoucherGroupText(value);
      if (normalized) segments.push(normalized);
    };

    const appendArray = (value: unknown) => {
      if (!Array.isArray(value)) return;
      value.forEach(item => appendValue(item));
    };

    appendArray(metadata.eligible_services);
    if (typeof metadata.notes === 'string' && /^choose\\s+/i.test(metadata.notes)) {
      appendValue(metadata.notes.replace(/^choose\\s+/i, ''));
    }

    return segments.join(' ');
  }

  function matchVoucherGroupKey(text: string): VoucherGroupKey | null {
    if (!text) return null;
    const matches = voucherGroupDefinitions.filter(
      group =>
        group.key !== 'other' && group.keywords.some(keyword => text.includes(keyword))
    );
    if (matches.length === 1) return matches[0].key;
    if (matches.length > 1) return 'other';
    return null;
  }

  function resolveVoucherGroupKey(voucher: PrelaunchVoucher): VoucherGroupKey {
    const primaryMatch = matchVoucherGroupKey(extractVoucherPrimaryGroupText(voucher));
    if (primaryMatch) return primaryMatch;
    const choiceMatch = matchVoucherGroupKey(extractVoucherChoiceGroupText(voucher));
    if (choiceMatch) return choiceMatch;
    return 'other';
  }

  function buildVoucherGroups(list: PrelaunchVoucher[]): VoucherGroup[] {
    const buckets = new Map<VoucherGroupKey, PrelaunchVoucher[]>();
    voucherGroupDefinitions.forEach(group => {
      buckets.set(group.key, []);
    });

    list.forEach(voucher => {
      const groupKey = resolveVoucherGroupKey(voucher);
      const bucket = buckets.get(groupKey) || buckets.get('other');
      if (bucket) bucket.push(voucher);
    });

    return voucherGroupDefinitions.map(group => {
      const items = buckets.get(group.key) || [];
      return {
        key: group.key,
        label: group.label,
        vouchers: items,
        count: items.length
      };
    });
  }

  function toggleVoucherGroup(key: VoucherGroupKey) {
    voucherGroupOpen = { ...voucherGroupOpen, [key]: !voucherGroupOpen[key] };
  }

  function formatVoucherGroupCount(count: number): string {
    return count === 1 ? '1 voucher' : `${count} vouchers`;
  }

  function getVoucherDetails(voucher: PrelaunchVoucher): Array<{ label: string; value: string }> {
    const details: Array<{ label: string; value: string }> = [];
    const metadata = resolveVoucherMetadata(voucher) || {};

    const termLabel = formatTermMonths(metadata.term_months);
    if (termLabel) {
      details.push({ label: 'Term', value: termLabel });
    }

    const requiresPaid = toNumber(
      metadata.requires_paid_months ?? metadata.paid_months_required ?? null
    );
    if (requiresPaid !== null) {
      const label = requiresPaid === 1 ? 'month' : 'months';
      details.push({ label: 'Requirement', value: `Requires ${requiresPaid} paid ${label}` });
    }

    if (Array.isArray(metadata.eligible_services) && metadata.eligible_services.length > 0) {
      details.push({
        label: 'Eligible services',
        value: metadata.eligible_services.join(', ')
      });
    }

    if (metadata.notes) {
      const noteValue = String(metadata.notes);
      if (/^choose\\s+/i.test(noteValue)) {
        details.push({
          label: 'Eligible services',
          value: noteValue.replace(/^choose\\s+/i, '')
        });
      } else {
        details.push({ label: 'Notes', value: noteValue });
      }
    }

    if (metadata.message) {
      details.push({ label: 'Notes', value: String(metadata.message) });
    }

    if (metadata.bonus) {
      details.push({ label: 'Bonus', value: String(metadata.bonus) });
    }

    if (metadata.display_note) {
      details.push({ label: 'Detail', value: String(metadata.display_note) });
    }

    if (metadata.stackable === true || voucher.voucher_type === 'stackable') {
      details.push({ label: 'Stacking', value: 'Can be stacked with other offers.' });
    }

    if (metadata.status === 'locked') {
      details.push({ label: 'Availability', value: 'Locked until released.' });
    }

    return details;
  }

  function formatEntryLabel(count: number): string {
    return count === 1 ? 'entry' : 'entries';
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

  function openVoucherModal(voucher: PrelaunchVoucher) {
    activeVoucher = voucher;
    voucherClaimError = '';
    voucherClaimSuccess = '';
    voucherCategoryChoice = '';
  }

  function closeVoucherModal() {
    if (isClaimingVoucher) return;
    activeVoucher = null;
    voucherClaimError = '';
    voucherClaimSuccess = '';
    voucherCategoryChoice = '';
  }

  function resolveVoucherCouponCode(voucher: PrelaunchVoucher): string | null {
    const metadata = resolveVoucherMetadata(voucher);
    const value =
      voucher.coupon_code ??
      metadata?.coupon_code ??
      metadata?.couponCode ??
      null;
    return value ? String(value) : null;
  }

  function resolveVoucherCouponStatus(voucher: PrelaunchVoucher): 'active' | 'used' | null {
    const metadata = resolveVoucherMetadata(voucher);
    const value =
      voucher.coupon_status ??
      metadata?.coupon_status ??
      metadata?.couponStatus ??
      null;
    if (value === 'active' || value === 'used') return value;
    return null;
  }

  function isVoucherClaimed(voucher: PrelaunchVoucher): boolean {
    return Boolean(resolveVoucherCouponCode(voucher));
  }

  function formatCouponStatus(status: 'active' | 'used' | null): string {
    if (status === 'used') return 'Used';
    return 'Active';
  }

  function getVoucherClaimAction(voucher: PrelaunchVoucher): string {
    const action = voucher.claim_action;
    if (action) return action;
    return 'unavailable';
  }

  async function submitVoucherClaim() {
    if (!activeVoucher || isClaimingVoucher) return;
    voucherClaimError = '';
    voucherClaimSuccess = '';
    const action = getVoucherClaimAction(activeVoucher);
    if (action === 'unavailable') {
      voucherClaimError = 'This voucher is temporarily unavailable.';
      return;
    }
    if (action === 'choose_category' && !voucherCategoryChoice) {
      voucherClaimError = 'Select a category to continue.';
      return;
    }
    isClaimingVoucher = true;
    try {
      await dashboardService.claimVoucher({
        voucherId: activeVoucher.id,
        ...(action === 'choose_category' && voucherCategoryChoice
          ? { category: voucherCategoryChoice }
          : {})
      });
      voucherClaimSuccess = 'Coupon generated for your voucher.';
      const latest = await dashboardService.getPrelaunchRewards();
      vouchers = latest.vouchers || [];
      activeVoucher = vouchers.find(voucher => voucher.id === activeVoucher?.id) || null;
    } catch (error) {
      voucherClaimError =
        error instanceof Error ? error.message : 'Failed to claim voucher.';
    } finally {
      isClaimingVoucher = false;
    }
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

  $: totalRaffleEntries = raffleEntries.reduce(
    (total, entry) => total + (Number(entry.count) || 0),
    0
  );

  $: visibleVouchers = vouchers.filter(
    voucher => !isStackableVoucher(voucher) && voucher.claim_action !== 'removed'
  );
  $: voucherGroups = buildVoucherGroups(visibleVouchers);
  $: {
    if (activeVoucher) {
      activeVoucherCouponCode = resolveVoucherCouponCode(activeVoucher);
      activeVoucherCouponStatus = resolveVoucherCouponStatus(activeVoucher);
      activeVoucherClaimAction = getVoucherClaimAction(activeVoucher);
    } else {
      activeVoucherCouponCode = null;
      activeVoucherCouponStatus = null;
      activeVoucherClaimAction = 'unavailable';
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
      {#if visibleVouchers.length === 0}
        <div class="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-600">
          No vouchers yet.
        </div>
      {:else}
        <div class="space-y-3">
          {#each voucherGroups as group}
            <div class="overflow-hidden rounded-lg border border-gray-100 bg-white">
              <button
                type="button"
                class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-gray-50"
                on:click={() => toggleVoucherGroup(group.key)}
                aria-expanded={voucherGroupOpen[group.key]}
                aria-controls={`voucher-group-${group.key}`}
              >
                <div>
                  <p class="text-sm font-semibold text-gray-900">{group.label}</p>
                  <p class="text-xs text-gray-500">{formatVoucherGroupCount(group.count)}</p>
                </div>
                <span class="text-xs font-semibold text-cyan-600">
                  {voucherGroupOpen[group.key] ? 'Hide' : 'Show'}
                </span>
              </button>
              {#if voucherGroupOpen[group.key]}
                <div
                  id={`voucher-group-${group.key}`}
                  class="border-t border-gray-100 px-4 py-4 space-y-3"
                >
                  {#if group.count === 0}
                    <div class="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-600">
                      No vouchers in this group.
                    </div>
                  {:else}
                    {#each group.vouchers as voucher}
                      <button
                        type="button"
                        class="w-full text-left rounded-lg border border-gray-100 bg-white px-4 py-4 transition hover:border-cyan-200 hover:shadow-sm"
                        on:click={() => openVoucherModal(voucher)}
                        aria-haspopup="dialog"
                      >
                        <p class="text-sm font-semibold text-gray-900">
                          {formatVoucherScope(voucher.scope)}
                        </p>
                        <p class="mt-1 text-2xl font-semibold text-gray-900">
                          {formatVoucherAmount(voucher)}
                        </p>
                      </button>
                    {/each}
                  {/if}
                </div>
              {/if}
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
      <div class="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 px-5 py-4">
        <p class="text-xs font-semibold uppercase tracking-widest text-emerald-700">
          Total raffle tickets
        </p>
        <div class="mt-2 flex items-baseline gap-3">
          <p class="text-4xl font-semibold text-gray-900">
            {formatNumber(totalRaffleEntries, { maximumFractionDigits: 0 })}
          </p>
          <p class="text-sm text-emerald-700">
            {formatEntryLabel(totalRaffleEntries)} ready
          </p>
        </div>
      </div>
      <div class="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
        Raffle tickets can be used to enter on-site giveaway contests. One ticket equals one entry;
        more entries give you a higher chance to win.
      </div>
    </section>
  </div>
</section>

{#if activeVoucher}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      class="absolute inset-0 bg-black/40 backdrop-blur-sm"
      aria-label="Close voucher details"
      on:click={closeVoucherModal}
    ></button>
    <div
      class="relative z-10 w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-black/5"
      role="dialog"
      aria-modal="true"
    >
      <div class="flex items-start justify-between border-b border-gray-200 px-6 py-5">
        <div class="space-y-1">
          <p class="text-xs font-semibold uppercase tracking-widest text-gray-500">Voucher details</p>
          <h3 class="text-xl font-semibold text-gray-900">{formatVoucherScope(activeVoucher.scope)}</h3>
          <p class="text-sm text-gray-500">{formatVoucherTypeLabel(activeVoucher)}</p>
        </div>
        <button
          class="text-sm font-semibold text-gray-500 hover:text-gray-700"
          on:click={closeVoucherModal}
        >
          Close
        </button>
      </div>
      <div class="space-y-6 px-6 py-6">
        <div class="rounded-xl border border-gray-200 bg-gradient-to-br from-white via-gray-50 to-cyan-50 px-5 py-4">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div class="space-y-2">
              <p class="text-xs font-semibold uppercase tracking-widest text-gray-500">Value</p>
              <p class="text-3xl font-semibold text-gray-900">
                {formatVoucherAmount(activeVoucher)}
              </p>
            </div>
            {#if activeVoucherCouponCode}
              <div class="text-right space-y-1">
                <p class="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                  Coupon
                </p>
                <p class="text-sm font-semibold text-gray-900">
                  {activeVoucherCouponCode}
                </p>
                <span class="text-[11px] font-semibold uppercase tracking-widest text-emerald-700">
                  {formatCouponStatus(activeVoucherCouponStatus)}
                </span>
              </div>
            {:else if activeVoucherClaimAction === 'unavailable'}
              <span class="text-xs font-semibold uppercase tracking-widest text-gray-500">
                Temporarily unavailable
              </span>
            {:else if activeVoucherClaimAction === 'claim'}
              <button
                type="button"
                class="rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white"
                on:click={submitVoucherClaim}
                disabled={isClaimingVoucher}
              >
                {isClaimingVoucher ? 'Claiming...' : 'Claim'}
              </button>
            {/if}
          </div>
          <p class="mt-3 text-xs text-gray-600">
            Use this voucher on {formatVoucherScope(activeVoucher.scope)}.
          </p>
        </div>

        {#if !activeVoucherCouponCode && activeVoucherClaimAction === 'choose_category'}
          <div class="rounded-xl border border-gray-200 bg-white px-5 py-4 space-y-4">
            <div>
              <p class="text-xs font-semibold uppercase tracking-widest text-gray-500">
                Choose a category
              </p>
              <p class="text-sm text-gray-600">
                Select where this 5% off coupon should apply.
              </p>
            </div>
            <div class="flex flex-wrap gap-3 text-sm text-gray-700">
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="voucher-category"
                  value="streaming"
                  bind:group={voucherCategoryChoice}
                />
                Streaming
              </label>
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="voucher-category"
                  value="music"
                  bind:group={voucherCategoryChoice}
                />
                Music
              </label>
              <label class="flex items-center gap-2">
                <input
                  type="radio"
                  name="voucher-category"
                  value="gaming"
                  bind:group={voucherCategoryChoice}
                />
                Gaming
              </label>
            </div>
            <button
              type="button"
              class="rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white"
              on:click={submitVoucherClaim}
              disabled={isClaimingVoucher}
            >
              {isClaimingVoucher ? 'Claiming...' : 'Claim'}
            </button>
          </div>
        {/if}

        {#if voucherClaimError}
          <div class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {voucherClaimError}
          </div>
        {/if}
        {#if voucherClaimSuccess}
          <div class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {voucherClaimSuccess}
          </div>
        {/if}

        <div class="rounded-xl border border-gray-200 bg-white px-5 py-4">
          <p class="text-xs font-semibold uppercase tracking-widest text-gray-500">Conditions</p>
          <div class="mt-4 space-y-4">
            {#if getVoucherDetails(activeVoucher).length === 0}
              <p class="text-sm text-gray-600">No extra conditions listed for this voucher.</p>
            {:else}
              {#each getVoucherDetails(activeVoucher) as detail}
                <div>
                  <p class="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {detail.label}
                  </p>
                  <p class="text-sm text-gray-700">{detail.value}</p>
                </div>
              {/each}
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

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
