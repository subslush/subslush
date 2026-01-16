<script lang="ts">
  import { page } from '$app/stores';
  import type { ComponentType } from 'svelte';
  import {
    LayoutDashboard,
    Package,
    ShoppingCart,
    CreditCard,
    Repeat,
    Wallet,
    Gift,
    ClipboardList,
    Shuffle,
    Users,
    Tag,
    Bell,
    MessageSquareText,
    Key
  } from 'lucide-svelte';

  export let isOpen = false;
  export let onClose: (() => void) | null = null;

  const navItems: Array<{ label: string; href: string; icon: ComponentType }> = [
    { label: 'Overview', href: '/admin', icon: LayoutDashboard },
    { label: 'Products', href: '/admin/products', icon: Package },
    { label: 'Orders', href: '/admin/orders', icon: ShoppingCart },
    { label: 'Payments', href: '/admin/payments', icon: CreditCard },
    { label: 'Subscriptions', href: '/admin/subscriptions', icon: Repeat },
    { label: 'Credits', href: '/admin/credits', icon: Wallet },
    { label: 'Users', href: '/admin/users', icon: Users },
    { label: 'PIN reset', href: '/admin/pin-reset', icon: Key },
    { label: 'Rewards', href: '/admin/rewards', icon: Gift },
    { label: 'Coupons', href: '/admin/coupons', icon: Tag },
    { label: 'Tasks', href: '/admin/tasks', icon: ClipboardList },
    { label: 'Notification announcements', href: '/admin/notifications', icon: Bell },
    { label: 'BIS', href: '/admin/bis', icon: MessageSquareText },
    { label: 'Migration', href: '/admin/migration', icon: Shuffle }
  ];

  const isActive = (href: string, currentPath: string) => {
    if (href === '/admin') {
      return currentPath === '/admin';
    }
    return currentPath.startsWith(href);
  };
</script>

<div class="lg:hidden">
  {#if isOpen}
    <div
      class="fixed inset-0 bg-gray-900/40 z-30"
      aria-hidden="true"
      on:click={() => onClose && onClose()}
    ></div>
  {/if}
</div>

<aside
  class={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-auto ${
    isOpen ? 'translate-x-0' : '-translate-x-full'
  }`}
>
  <div class="h-full flex flex-col">
    <div class="flex items-center justify-between px-6 py-5 border-b border-gray-100">
      <a href="/admin" class="text-xl font-bold text-gray-900">
        Admin Console
      </a>
      <button
        class="lg:hidden text-gray-500 hover:text-gray-900"
        on:click={() => onClose && onClose()}
        aria-label="Close sidebar"
      >
        X
      </button>
    </div>

    <nav class="flex-1 px-4 py-6 space-y-1">
      {#each navItems as item}
        <a
          href={item.href}
          class={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
            isActive(item.href, $page.url.pathname)
              ? 'bg-gradient-to-r from-cyan-500/10 to-pink-500/10 text-gray-900 border border-cyan-100'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <svelte:component this={item.icon} size={18} class="text-gray-500" />
          <span>{item.label}</span>
        </a>
      {/each}
    </nav>

    <div class="px-6 py-4 border-t border-gray-100">
      <div class="rounded-lg bg-gray-50 border border-gray-200 px-3 py-3">
        <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">Environment</p>
        <p class="text-sm font-medium text-gray-700 mt-1">Operations</p>
      </div>
    </div>
  </div>
</aside>
