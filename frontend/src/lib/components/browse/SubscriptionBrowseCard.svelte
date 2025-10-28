<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    Star,
    Users,
    Clock,
    Check,
    ArrowRight,
    Eye,
    TrendingDown,
    Badge,
    Verified
  } from 'lucide-svelte';
  import type { BrowseSubscription } from '$lib/types/browse.js';

  export let subscription: BrowseSubscription;
  export let isHovered = false;
  export let showCompareButton = false;

  const dispatch = createEventDispatcher<{
    hover: BrowseSubscription;
    hoverEnd: BrowseSubscription;
    click: BrowseSubscription;
    compare: BrowseSubscription;
  }>();

  $: availabilityColor = getAvailabilityColor(subscription.availability.availableSeats);
  $: availabilityText = getAvailabilityText(subscription.availability);
  $: savingsBarWidth = Math.min(subscription.savingsPercentage, 100);

  function getAvailabilityColor(seats: number): string {
    if (seats <= 2) return 'text-red-600 bg-red-50 border-red-200';
    if (seats <= 4) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-green-600 bg-green-50 border-green-200';
  }

  function getAvailabilityText(availability: typeof subscription.availability): string {
    const { availableSeats, totalSeats, occupiedSeats } = availability;
    if (availableSeats <= 2) return `Only ${availableSeats} seats left!`;
    return `${occupiedSeats}/${totalSeats} seats filled`;
  }

  function handleMouseEnter() {
    dispatch('hover', subscription);
  }

  function handleMouseLeave() {
    dispatch('hoverEnd', subscription);
  }

  function handleClick() {
    dispatch('click', subscription);
  }

  function handleCompare(event: Event) {
    event.stopPropagation();
    dispatch('compare', subscription);
  }

  function getBadgeStyle(badge: string): string {
    const styles = {
      verified: 'bg-green-50 text-green-700 border-green-200',
      popular: 'bg-pink-50 text-pink-700 border-pink-200',
      new: 'bg-cyan-50 text-cyan-700 border-cyan-200',
      best_value: 'bg-purple-50 text-purple-700 border-purple-200',
      filling_fast: 'bg-red-50 text-red-700 border-red-200'
    };
    return styles[badge as keyof typeof styles] || 'bg-gray-50 text-gray-700 border-gray-200';
  }

  function getBadgeIcon(badge: string) {
    const icons = {
      verified: Verified,
      popular: TrendingDown,
      new: Badge,
      best_value: Star,
      filling_fast: Clock
    };
    return icons[badge as keyof typeof icons] || Badge;
  }

  function getBadgeText(badge: string): string {
    const texts = {
      verified: 'Verified',
      popular: 'Popular',
      new: 'New',
      best_value: 'Best Value',
      filling_fast: 'Filling Fast'
    };
    return texts[badge as keyof typeof texts] || badge;
  }
</script>

<div
  class="subscription-card group bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all duration-200 hover:scale-[1.02] cursor-pointer min-h-[420px] relative"
  class:ring-2={isHovered}
  class:ring-cyan-500={isHovered}
  class:shadow-lg={isHovered}
  on:mouseenter={handleMouseEnter}
  on:mouseleave={handleMouseLeave}
  on:click={handleClick}
  on:keydown={(e) => e.key === 'Enter' && handleClick()}
  role="button"
  tabindex="0"
  aria-label="View {subscription.serviceName} {subscription.planName} details"
>
  <!-- Compare checkbox (shown on hover) -->
  {#if showCompareButton}
    <div
      class="absolute top-4 left-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
    >
      <button
        type="button"
        class="w-6 h-6 rounded border-2 border-gray-300 bg-white hover:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 flex items-center justify-center"
        on:click={handleCompare}
        aria-label="Add to comparison"
      >
        <Check size={14} class="text-cyan-500 opacity-0 group-hover:opacity-100" />
      </button>
    </div>
  {/if}

  <!-- Service logo and badges -->
  <div class="flex items-start justify-between mb-4">
    <div class="flex items-center space-x-3">
      {#if subscription.logoUrl}
        <img
          src={subscription.logoUrl}
          alt="{subscription.serviceName} logo"
          class="w-16 h-16 rounded-lg object-cover"
          loading="lazy"
          onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'"
        />
      {/if}
      <!-- Fallback logo -->
      <div
        class="w-16 h-16 rounded-lg bg-gradient-to-br from-cyan-500/10 to-pink-500/10 flex items-center justify-center text-2xl font-bold text-gray-700"
        style="display: {subscription.logoUrl ? 'none' : 'flex'}"
      >
        {subscription.serviceName.charAt(0)}
      </div>
    </div>

    <!-- Primary badge -->
    {#if subscription.badges.length > 0}
      {@const primaryBadge = subscription.badges[0]}
      {@const BadgeIcon = getBadgeIcon(primaryBadge)}
      <div class="flex items-center space-x-1 px-2 py-1 rounded-md text-xs font-medium border {getBadgeStyle(primaryBadge)}">
        <svelte:component this={BadgeIcon} size={12} />
        <span>{getBadgeText(primaryBadge)}</span>
      </div>
    {/if}
  </div>

  <!-- Service info -->
  <div class="mb-4">
    <h3 class="font-bold text-gray-900 text-lg mb-1">
      {subscription.serviceName}
    </h3>
    <p class="text-gray-600 text-sm mb-2">
      {subscription.planName} • {subscription.availability.totalSeats} Seats
    </p>

    <!-- Ratings -->
    <div class="flex items-center space-x-2 mb-3">
      <div class="flex items-center space-x-1">
        {#each Array(5) as _, i}
          <Star
            size={14}
            class={i < Math.floor(subscription.ratings.average) ? 'text-yellow-400 fill-current' : 'text-gray-300'}
          />
        {/each}
      </div>
      <span class="text-sm font-medium text-gray-900">
        {subscription.ratings.average.toFixed(1)}
      </span>
      <span class="text-sm text-gray-500">
        ({subscription.ratings.count} reviews)
      </span>
    </div>
  </div>

  <!-- Availability status -->
  <div class="mb-4">
    <div class="flex items-center space-x-2 p-3 rounded-lg border {availabilityColor}">
      <Users size={16} />
      <span class="text-sm font-medium">{availabilityText}</span>
      {#if subscription.availability.availableSeats <= 2}
        <div class="w-2 h-2 bg-red-500 rounded-full animate-pulse ml-auto"></div>
      {/if}
    </div>
    <div class="flex items-center space-x-2 mt-2 text-xs text-gray-500">
      <Clock size={12} />
      <span>Updated {subscription.host.lastUpdated ? new Date(subscription.host.lastUpdated).toLocaleString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }) : '2 hours ago'}</span>
    </div>
  </div>

  <!-- Features (max 3) -->
  <div class="mb-4">
    {#each subscription.features.slice(0, 3) as feature}
      <div class="flex items-center space-x-2 text-sm text-gray-600 mb-1">
        <Check size={14} class="text-green-500 flex-shrink-0" />
        <span>{feature}</span>
      </div>
    {/each}
  </div>

  <!-- Pricing section -->
  <div class="mt-auto">
    <div class="bg-gray-50 rounded-lg p-4 mb-4">
      <div class="flex justify-between items-center mb-2">
        <span class="text-sm text-gray-600">Retail:</span>
        <span class="text-sm text-gray-500 line-through">
          €{subscription.originalPrice.toFixed(2)}/mo
        </span>
      </div>
      <div class="flex justify-between items-center mb-3">
        <span class="text-sm font-medium text-gray-900">SubSlush:</span>
        <span class="text-lg font-bold text-gray-900">
          €{subscription.price.toFixed(2)}/mo
        </span>
      </div>

      <!-- Savings bar -->
      <div class="mb-3">
        <div class="w-full bg-gray-200 rounded-full h-2">
          <div
            class="bg-gradient-to-r from-cyan-500 to-pink-500 h-2 rounded-full transition-all duration-500"
            style="width: {savingsBarWidth}%"
          ></div>
        </div>
        <div class="flex items-center justify-center mt-2 space-x-1">
          <TrendingDown size={14} class="text-green-600" />
          <span class="text-sm font-semibold text-green-600">
            Save €{subscription.monthlySavings.toFixed(2)}/mo ({subscription.savingsPercentage}% off)
          </span>
        </div>
      </div>
    </div>

    <!-- CTA Button -->
    <button
      type="button"
      class="w-full bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-600 hover:to-pink-600 text-white font-medium py-3 px-6 rounded-lg transition-all duration-200 hover:shadow-lg group-hover:scale-105 flex items-center justify-center space-x-2"
      on:click={(e) => { e.stopPropagation(); handleClick(); }}
    >
      <Eye size={16} />
      <span>View Details</span>
      <ArrowRight size={16} class="transform group-hover:translate-x-1 transition-transform" />
    </button>
  </div>
</div>

<style>
  .subscription-card {
    /* Ensure consistent heights in grid */
    display: flex;
    flex-direction: column;
  }

  .subscription-card:hover {
    transform: translateY(-4px) scale(1.02);
  }

  @media (max-width: 768px) {
    .subscription-card {
      min-h: auto;
    }
  }
</style>