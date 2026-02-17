<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Search,
    User,
    ChevronDown,
    Play,
    Music,
    Bot,
    Headphones,
    ShoppingCart,
    LogIn,
    LogOut,
    UserPlus,
    LayoutDashboard,
    History,
    Calendar,
    Settings
  } from 'lucide-svelte';
  import { auth } from '$lib/stores/auth.js';
  import { cart, cartAddPulse } from '$lib/stores/cart.js';
  import { cartSidebar } from '$lib/stores/cartSidebar.js';
  import { currency } from '$lib/stores/currency.js';
  import { CURRENCY_OPTIONS } from '$lib/utils/currency.js';
  import { trackSearch } from '$lib/utils/analytics.js';
  import { subscriptionService } from '$lib/api/subscriptions.js';
  import { goto, invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import CartSidebar from '$lib/components/cart/CartSidebar.svelte';

  export let searchQuery = '';

  const categories = [
    'All products',
    'Streaming',
    'Music',
    'AI',
    'Productivity',
    'Software',
    'Gaming',
    'Security',
    'Social',
    'Education',
    'Fitness',
    'Design'
  ];

  let categoryMenuOpen = false;
  let selectedCategoryLabel = 'All products';
  let menuRef: HTMLDivElement | null = null;
  let triggerRef: HTMLButtonElement | null = null;
  let userMenuOpen = false;
  let userMenuRef: HTMLDivElement | null = null;
  let userMenuTriggerRef: HTMLButtonElement | null = null;
  let cartAnimating = false;
  let lastCartPulseSeen = 0;
  let cartAnimationTimer: ReturnType<typeof setTimeout> | null = null;
  let cartQueryOpenKey = '';
  $: isLoggedIn = $auth.isAuthenticated;
  $: userEmail = $auth.user?.email;

  const closeMenuOnOutsideClick = (event: MouseEvent) => {
    const target = event.target as Node;
    const clickedCategoryMenu = menuRef?.contains(target) || triggerRef?.contains(target);
    const clickedUserMenu = userMenuRef?.contains(target) || userMenuTriggerRef?.contains(target);

    if (!clickedCategoryMenu) {
      categoryMenuOpen = false;
    }

    if (!clickedUserMenu) {
      userMenuOpen = false;
    }
  };

  onMount(() => {
    document.addEventListener('click', closeMenuOnOutsideClick);
    return () => {
      document.removeEventListener('click', closeMenuOnOutsideClick);
      if (cartAnimationTimer) {
        clearTimeout(cartAnimationTimer);
        cartAnimationTimer = null;
      }
    };
  });

  function selectCategory(label: string) {
    selectedCategoryLabel = label;
    categoryMenuOpen = false;
  }

  function toggleUserMenu() {
    userMenuOpen = !userMenuOpen;
  }

  async function handleLogout() {
    await auth.logout();
    userMenuOpen = false;
  }

  async function handleLanguageChange(event: Event) {
    const target = event.currentTarget as HTMLSelectElement | null;
    const nextCurrency = target?.value || 'USD';
    currency.set(nextCurrency);
    const currentUrl = `${$page.url.pathname}${$page.url.search ? `?${$page.url.searchParams.toString()}` : ''}`;
    await goto(currentUrl, { replaceState: true });
    await invalidateAll();
    target?.blur();
  }

  function performSearch() {
    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery) {
      const externalId = getOrCreateGuestId();
      const eventId = buildSearchEventId(trimmedQuery);
      trackSearch(trimmedQuery, [], eventId);
      void subscriptionService.trackTikTokEvent({
        event: 'search',
        searchString: trimmedQuery,
        externalId,
        eventId
      });
    }
    const destination = trimmedQuery
      ? `/browse?${new URLSearchParams({ search: trimmedQuery }).toString()}`
      : '/browse';
    goto(destination);
  }

  const getOrCreateGuestId = (): string => {
    if (typeof window === 'undefined') return 'guest';
    try {
      const key = 'tiktok_guest_id';
      const existing = localStorage.getItem(key);
      if (existing) return existing;
      const generated =
        typeof crypto?.randomUUID === 'function'
          ? crypto.randomUUID()
          : `guest_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(key, generated);
      return generated;
    } catch {
      return 'guest';
    }
  };

  const buildSearchEventId = (query: string): string => {
    const ownerId = getOrCreateGuestId();
    const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, '_');
    return `search_${ownerId}_${normalizedQuery}_${Date.now()}`;
  };

  function handleSearchKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    performSearch();
  }

  $: if ($cartAddPulse > 0 && $cartAddPulse !== lastCartPulseSeen) {
    lastCartPulseSeen = $cartAddPulse;
    cartAnimating = false;
    if (cartAnimationTimer) {
      clearTimeout(cartAnimationTimer);
      cartAnimationTimer = null;
    }

    void requestAnimationFrame(() => {
      cartAnimating = true;
      cartAnimationTimer = setTimeout(() => {
        cartAnimating = false;
        cartAnimationTimer = null;
      }, 700);
    });
  }

  $: {
    const cartQuery = $page.url.searchParams.get('cart');
    if (cartQuery !== 'open') {
      cartQueryOpenKey = '';
    } else {
      const queryKey = `${$page.url.pathname}${$page.url.search}`;
      if (queryKey !== cartQueryOpenKey) {
        cartQueryOpenKey = queryKey;
        cartSidebar.open();
      }
    }
  }
</script>

<nav class="relative z-40 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-800 text-white border-b border-slate-800">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="grid grid-cols-[1fr,auto] items-start gap-3 py-3">
      <div class="flex items-center gap-2 md:gap-4">
        <a href="/" class="flex items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg px-1">
          <span class="text-2xl font-extrabold bg-gradient-to-r from-cyan-500 to-pink-500 bg-clip-text text-transparent">
            SubSlush
          </span>
        </a>
        <div class="hidden md:flex md:flex-wrap md:items-center md:gap-2 md:text-sm font-medium">
          <a href="/browse" class="whitespace-nowrap rounded-lg px-3 py-2 text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50">Browse all products</a>
          <a href="/dashboard/subscriptions" class="whitespace-nowrap rounded-lg px-3 py-2 text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50">My subscriptions</a>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2 text-white self-start">
        {#if !isLoggedIn}
          <a
            href="/auth/register"
            class="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-pink-500 px-2.5 py-2 text-xs font-semibold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 md:px-3 md:text-sm"
          >
            <span>Get Started</span>
          </a>
        {/if}
        <a
          href="/help"
          class="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-white rounded-lg hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 md:px-3 md:text-sm"
          aria-label="Help"
        >
          <Headphones size={18} class="text-white" aria-hidden="true" />
          <span class="hidden md:inline">Help</span>
        </a>
        <button
          type="button"
          class={`relative inline-flex items-center gap-1 rounded-lg border border-white/30 px-2.5 py-2 text-xs font-medium text-white transition-transform hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 md:px-3 md:text-sm ${cartAnimating ? 'cart-bounce' : ''}`}
          aria-label={$cart.length > 0 ? `Cart with ${$cart.length} item(s)` : 'Cart'}
          on:click={() => cartSidebar.open()}
        >
          <ShoppingCart size={18} class="text-white" aria-hidden="true" />
          <span class="hidden md:inline">Cart</span>
          {#if $cart.length > 0}
            <span class={`absolute -right-1.5 -top-1.5 inline-flex min-w-[1.15rem] items-center justify-center rounded-full bg-cyan-500 px-1 text-[10px] font-semibold text-white ${cartAnimating ? 'cart-badge-flash' : ''}`}>
              {$cart.length > 99 ? '99+' : $cart.length}
            </span>
          {/if}
        </button>
        <div class="flex flex-col items-center gap-0.5 rounded-lg md:px-3 md:py-1.5">
          <div class="relative w-full min-w-[96px] md:min-w-[120px]">
            <select
              class="lang-select nav-lang-select w-full appearance-none rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white shadow-sm backdrop-blur-sm transition-colors duration-150 hover:bg-white/15 hover:border-white/40 hover:shadow-md focus:outline-none focus:ring-0 focus:border-white/60 focus:bg-white/20"
              aria-label="Language and currency"
              on:change={handleLanguageChange}
              bind:value={$currency}
            >
              {#each CURRENCY_OPTIONS as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
            <ChevronDown class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-white/80" size={14} aria-hidden="true" />
          </div>
        </div>
        <div class="relative">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-lg border border-white/30 bg-transparent px-2.5 py-2 text-xs font-medium text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 md:px-3 md:text-sm"
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            on:click={toggleUserMenu}
            bind:this={userMenuTriggerRef}
          >
            <User size={18} class="text-white" aria-hidden="true" />
            <ChevronDown size={16} class={`transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {#if userMenuOpen}
            <div
              class="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white text-gray-900 shadow-2xl z-50"
              role="menu"
              bind:this={userMenuRef}
            >
              {#if isLoggedIn}
                <div class="px-4 py-3 border-b border-gray-100">
                  <p class="text-sm font-semibold text-gray-900">{userEmail}</p>
                </div>
                <div class="px-3 py-3 space-y-2">
                  <a
                    href="/dashboard/subscriptions"
                    class="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    role="menuitem"
                    on:click={() => userMenuOpen = false}
                  >
                    <Calendar size={16} class="text-gray-600" aria-hidden="true" />
                    <span>My subscriptions</span>
                  </a>
                  <a
                    href="/dashboard"
                    class="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    role="menuitem"
                    on:click={() => userMenuOpen = false}
                  >
                    <LayoutDashboard size={16} class="text-gray-600" aria-hidden="true" />
                    <span>Dashboard</span>
                  </a>
                  <a
                    href="/dashboard/orders"
                    class="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    role="menuitem"
                    on:click={() => userMenuOpen = false}
                  >
                    <History size={16} class="text-gray-600" aria-hidden="true" />
                    <span>Order History</span>
                  </a>
                  <a
                    href="/dashboard/settings"
                    class="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    role="menuitem"
                    on:click={() => userMenuOpen = false}
                  >
                    <Settings size={16} class="text-gray-600" aria-hidden="true" />
                    <span>Settings</span>
                  </a>
                </div>
                <div class="px-3 pb-3">
                  <button
                    class="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                    type="button"
                    on:click={handleLogout}
                    role="menuitem"
                  >
                    <LogOut size={16} class="text-red-600" aria-hidden="true" />
                    <span>Logout</span>
                  </button>
                </div>
              {:else}
                <div class="px-4 py-3 border-b border-gray-100">
                  <p class="text-sm font-semibold text-gray-900">Welcome!</p>
                </div>
                <div class="px-4 py-3 space-y-2">
                  <a
                    href="/auth/login"
                    class="flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-pink-500 px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
                    role="menuitem"
                    on:click={() => userMenuOpen = false}
                  >
                    <LogIn size={16} aria-hidden="true" />
                    <span>Sign in</span>
                  </a>
                  <p class="text-xs text-gray-500">Don't have an account?</p>
                  <a
                    href="/auth/register"
                    class="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50"
                    role="menuitem"
                    on:click={() => userMenuOpen = false}
                  >
                    <UserPlus size={16} aria-hidden="true" />
                    <span>Register</span>
                  </a>
                </div>
                <div class="px-4">
                  <div class="text-center text-sm text-gray-300">--------</div>
                </div>
                <div class="px-3 py-3 space-y-2">
                  <a
                    href="/dashboard/subscriptions"
                    class="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    role="menuitem"
                    on:click={() => userMenuOpen = false}
                  >
                    <Calendar size={16} class="text-gray-600" aria-hidden="true" />
                    <span>My subscriptions</span>
                  </a>
                  <a
                    href="/dashboard"
                    class="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    role="menuitem"
                    on:click={() => userMenuOpen = false}
                  >
                    <LayoutDashboard size={16} class="text-gray-600" aria-hidden="true" />
                    <span>Dashboard</span>
                  </a>
                  <a
                    href="/dashboard/orders"
                    class="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    role="menuitem"
                    on:click={() => userMenuOpen = false}
                  >
                    <History size={16} class="text-gray-600" aria-hidden="true" />
                    <span>Order History</span>
                  </a>
                  <a
                    href="/dashboard/settings"
                    class="flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    role="menuitem"
                    on:click={() => userMenuOpen = false}
                  >
                    <Settings size={16} class="text-gray-600" aria-hidden="true" />
                    <span>Settings</span>
                  </a>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      </div>

      <div class="col-span-2 md:hidden">
        <div class="flex items-center justify-start text-[11px] font-medium">
          <a href="/browse" class="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50">Browse all products</a>
        </div>
      </div>

      <div class="w-full col-span-2 md:col-span-1 md:col-start-1">
        <label class="sr-only" for="nav-search">Search subscriptions</label>
        <div class="relative w-full flex-1 min-w-0">
          <div class="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-none focus-within:ring-0 focus-within:border-transparent focus-within:shadow-none md:gap-3">
            <Search class="text-gray-500 shrink-0" size={18} aria-hidden="true" />
            <input
              id="nav-search"
              type="search"
              placeholder="Search subscriptions (Netflix, Spotify, Adobe...)"
              class="flex-1 min-w-0 bg-transparent text-sm text-gray-900 placeholder-gray-400 border-none focus:outline-none focus:ring-0 focus:border-0 focus-visible:ring-0"
              bind:value={searchQuery}
              on:keydown={handleSearchKeydown}
            />
            <span class="h-5 w-px bg-gray-200 shrink-0" aria-hidden="true"></span>
            <div class="relative">
              <button
                class="flex items-center gap-1 text-xs font-medium text-gray-800 hover:text-gray-900 focus:outline-none rounded-lg pl-1.5 pr-2 py-1 md:text-sm"
                aria-haspopup="listbox"
                aria-expanded={categoryMenuOpen}
                aria-controls="category-menu"
                bind:this={triggerRef}
                type="button"
                on:click={() => categoryMenuOpen = !categoryMenuOpen}
              >
                <span class="max-w-[90px] truncate sm:max-w-[120px] md:max-w-none">{selectedCategoryLabel}</span>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
              {#if categoryMenuOpen}
                <div
                  id="category-menu"
                  role="listbox"
                  class="absolute right-0 z-10 mt-2 w-48 rounded-xl border border-gray-100 bg-white shadow-lg focus:outline-none"
                  bind:this={menuRef}
                >
                  {#each categories as category}
                    <button
                      type="button"
                      class="flex w-full items-center px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:bg-gray-50"
                      role="option"
                      aria-selected={selectedCategoryLabel === category}
                      on:click={() => selectCategory(category)}
                    >
                      {category}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
            <span class="h-5 w-px bg-gray-200 shrink-0" aria-hidden="true"></span>
            <button
              type="button"
              class="rounded-lg p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 shrink-0"
              aria-label="Search"
              on:click={performSearch}
            >
              <Search size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-2 justify-items-center col-span-2 md:col-span-1 md:col-start-2 md:flex md:w-auto md:flex-wrap md:items-center md:justify-end md:gap-9">
        <a href="/browse?category=streaming" class="flex flex-col items-center gap-0.5 px-3 py-1.5 text-white hover:bg-white/10 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30">
          <Play size={18} aria-hidden="true" />
          <span class="text-xs font-medium">Streaming</span>
        </a>
        <a href="/browse?category=music" class="flex flex-col items-center gap-0.5 px-3 py-1.5 text-white hover:bg-white/10 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30">
          <Music size={18} aria-hidden="true" />
          <span class="text-xs font-medium">Music</span>
        </a>
        <a href="/browse?category=ai" class="flex flex-col items-center gap-0.5 px-3 py-1.5 text-white hover:bg-white/10 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30">
          <Bot size={18} aria-hidden="true" />
          <span class="text-xs font-medium">AI</span>
        </a>
      </div>
    </div>
  </div>
</nav>
<CartSidebar />

<style>
  @keyframes cart-bounce {
    0% {
      transform: scale(1);
    }
    20% {
      transform: scale(1.15);
    }
    45% {
      transform: scale(0.96);
    }
    70% {
      transform: scale(1.05);
    }
    100% {
      transform: scale(1);
    }
  }

  @keyframes cart-badge-flash {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(34, 211, 238, 0.5);
    }
    40% {
      transform: scale(1.16);
      box-shadow: 0 0 0 8px rgba(34, 211, 238, 0);
    }
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(34, 211, 238, 0);
    }
  }

  .cart-bounce {
    animation: cart-bounce 0.7s ease;
  }

  .cart-badge-flash {
    animation: cart-badge-flash 0.7s ease;
  }
</style>
