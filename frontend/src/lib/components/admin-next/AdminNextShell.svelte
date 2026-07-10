<script lang="ts">
  import {
    Bell,
    CreditCard,
    FileText,
    LayoutDashboard,
    Megaphone,
    Package,
    Percent,
    Search,
    ShoppingBag,
    Users,
  } from 'lucide-svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { adminNextService } from '$lib/api/adminNext.js';
  import type { AdminNextSearchResult } from '$lib/types/adminNext.js';
  import type { User } from '$lib/types/auth.js';

  export let user: User | null = null;
  export let fulfillmentCount = 0;

  const navItems = [
    { label: 'Overview', href: '/admin-next', icon: LayoutDashboard, enabled: true },
    { label: 'Fulfillment', href: '/admin-next/fulfillment', icon: ShoppingBag, enabled: true },
    { label: 'Orders', href: '/admin-next/orders', icon: FileText, enabled: true },
    { label: 'Subscriptions', href: '/admin-next/subscriptions', icon: Bell, enabled: true },
    { label: 'Products', href: '/admin-next/products', icon: Package, enabled: true },
    { label: 'Payments', href: '/admin-next/payments', icon: CreditCard, enabled: true },
    { label: 'Coupons', href: '/admin-next/coupons', icon: Percent, enabled: true },
    { label: 'Users', href: '/admin-next/users', icon: Users, enabled: true },
    { label: 'Announcements', href: '/admin-next/announcements', icon: Megaphone, enabled: true },
  ];

  let searchQuery = '';
  let searchResults: AdminNextSearchResult[] = [];
  let searchOpen = false;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  $: initials =
    (user?.displayName || user?.email || 'Admin')
      .split(/[ @._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase())
      .join('') || 'A';
  $: displayName = user?.displayName || user?.email || 'Admin';

  const runSearch = () => {
    if (searchTimer) clearTimeout(searchTimer);
    const q = searchQuery.trim();
    if (q.length < 2) {
      searchResults = [];
      searchOpen = false;
      return;
    }
    searchTimer = setTimeout(async () => {
      try {
        const payload = await adminNextService.search(q);
        searchResults = payload.results;
        searchOpen = searchResults.length > 0;
      } catch {
        searchResults = [];
        searchOpen = false;
      }
    }, 180);
  };

  const openResult = async (result: AdminNextSearchResult) => {
    searchOpen = false;
    searchQuery = '';
    await goto(result.href);
  };
</script>

<div class="admin-next-shell">
  <aside class="sidebar">
    <a class="brand" href="/admin-next">
      <span class="brand-mark">S</span>
      <span>SubSlush</span>
    </a>

    <nav aria-label="Admin next navigation">
      {#each navItems as item}
        {@const Icon = item.icon}
        {@const active = $page.url.pathname === item.href || (item.href !== '/admin-next' && $page.url.pathname.startsWith(item.href))}
        {#if item.enabled}
          <a class:active class="nav-item" href={item.href}>
            <Icon size={17} strokeWidth={1.8} />
            <span>{item.label}</span>
            {#if item.label === 'Fulfillment' && fulfillmentCount > 0}
              <span class="count-badge">{fulfillmentCount}</span>
            {/if}
          </a>
        {:else}
          <span class="nav-item disabled" title="Coming next">
            <Icon size={17} strokeWidth={1.8} />
            <span>{item.label}</span>
            <span class="coming">Next</span>
          </span>
        {/if}
      {/each}
    </nav>
  </aside>

  <div class="main-wrap">
    <header class="topbar">
      <div class="search-wrap">
        <div class="search-box">
          <Search size={17} strokeWidth={1.8} />
          <input
            bind:value={searchQuery}
            on:input={runSearch}
            on:focus={() => (searchOpen = searchResults.length > 0)}
            placeholder="Search orders, emails, payment refs..."
            aria-label="Global admin search"
          />
        </div>
        {#if searchOpen}
          <div class="search-results">
            {#each searchResults as result}
              <button type="button" on:click={() => openResult(result)}>
                <span>{result.type.slice(0, 1).toUpperCase()}</span>
                <strong>{result.label}</strong>
                <small>{result.description || result.type}</small>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <div class="identity">
        <span class="avatar">{initials}</span>
        <span>
          <strong>{displayName}</strong>
          <small>{user?.role || 'admin'}</small>
        </span>
      </div>
    </header>

    <main>
      <slot />
    </main>
  </div>
</div>

<style>
  :global(.admin-next-body) {
    background: #f6f6f7;
  }

  .admin-next-shell {
    min-height: 100vh;
    background: #f6f6f7;
    color: #1a1a1c;
    font-family:
      'Instrument Sans',
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      'Segoe UI',
      sans-serif;
    font-size: 14px;
  }

  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 30;
    width: 236px;
    border-right: 1px solid #ececee;
    background: #fbfbfc;
    padding: 18px 14px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 24px;
    color: #1a1a1c;
    font-weight: 800;
    text-decoration: none;
  }

  .brand-mark {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 10px;
    background: #5b46e0;
    color: #ffffff;
  }

  nav {
    display: grid;
    gap: 5px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 38px;
    border-radius: 999px;
    padding: 0 11px;
    color: #5f5f66;
    text-decoration: none;
    font-weight: 650;
  }

  .nav-item.active {
    background: #ffffff;
    color: #1a1a1c;
    box-shadow:
      0 0 0 1px rgba(236, 236, 238, 0.9),
      0 8px 20px rgba(26, 26, 28, 0.06);
  }

  .nav-item.disabled {
    opacity: 0.56;
    cursor: default;
  }

  .count-badge {
    margin-left: auto;
    border-radius: 999px;
    background: #5b46e0;
    color: #ffffff;
    padding: 2px 7px;
    font-size: 11px;
    font-weight: 750;
  }

  .coming {
    margin-left: auto;
    color: #9a9aa0;
    font-size: 11px;
    font-weight: 650;
  }

  .main-wrap {
    min-width: 0;
    padding-left: 236px;
  }

  .topbar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 60px;
    border-bottom: 1px solid #ececee;
    background: rgba(246, 246, 247, 0.94);
    padding: 0 28px;
    backdrop-filter: blur(12px);
  }

  .search-wrap {
    position: relative;
    width: min(520px, 52vw);
  }

  .search-box {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    height: 38px;
    border: 1px solid #ececee;
    border-radius: 10px;
    background: #ffffff;
    padding: 0 12px;
    color: #9a9aa0;
  }

  input {
    width: 100%;
    border: 0;
    outline: none;
    color: #1a1a1c;
    font: inherit;
  }

  input::placeholder {
    color: #9a9aa0;
  }

  .search-results {
    position: absolute;
    top: 44px;
    left: 0;
    z-index: 50;
    display: grid;
    gap: 4px;
    width: 100%;
    border: 1px solid #ececee;
    border-radius: 12px;
    background: #ffffff;
    padding: 6px;
    box-shadow: 0 16px 38px rgba(20, 20, 24, 0.12);
  }

  .search-results button {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    gap: 2px 10px;
    align-items: center;
    border: 0;
    border-radius: 8px;
    background: transparent;
    padding: 8px;
    color: #1a1a1c;
    text-align: left;
    cursor: pointer;
  }

  .search-results button:hover {
    background: #f6f6f7;
  }

  .search-results button > span {
    grid-row: span 2;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 999px;
    background: #eef0f2;
    color: #5f5f66;
    font-size: 12px;
    font-weight: 800;
  }

  .search-results strong,
  .search-results small {
    max-width: none;
  }

  .identity {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .avatar {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    background: #ece8fb;
    color: #5b46e0;
    font-weight: 800;
  }

  strong,
  small {
    display: block;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    color: #71717a;
    font-size: 12px;
    text-transform: capitalize;
  }

  main {
    max-width: 1320px;
    padding: 28px;
  }

  @media (max-width: 1024px) {
    .topbar {
      padding: 0 20px;
    }

    main {
      padding: 22px;
    }
  }
</style>
