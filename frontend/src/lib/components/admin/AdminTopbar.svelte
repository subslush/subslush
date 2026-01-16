<script lang="ts">
  import { Menu, Search } from 'lucide-svelte';
  import UserMenu from '$lib/components/navigation/UserMenu.svelte';
  import type { User } from '$lib/types/auth.js';

  export let user: User | null = null;
  export let onToggle: (() => void) | null = null;
</script>

<header class="sticky top-0 z-20 bg-white border-b border-gray-200">
  <div class="flex items-center justify-between gap-4 px-4 py-3 lg:px-6">
    <div class="flex items-center gap-3">
      <button
        class="lg:hidden p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
        on:click={() => onToggle && onToggle()}
        aria-label="Open sidebar"
      >
        <Menu size={18} />
      </button>
      <div>
        <p class="text-xs uppercase tracking-wide text-gray-500 font-semibold">Admin Console</p>
        <p class="text-lg font-semibold text-gray-900">Operations Dashboard</p>
      </div>
    </div>

    <div class="flex items-center gap-3">
      <div class="hidden md:flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
        <Search size={16} />
        <input
          class="bg-transparent focus:outline-none w-48"
          type="search"
          placeholder="Search orders, users, payments"
          aria-label="Search admin data"
        />
      </div>

      {#if user}
        <span class="hidden md:inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
          {user.role || 'admin'}
        </span>
      {/if}
      <UserMenu {user} />
    </div>
  </div>
</header>
