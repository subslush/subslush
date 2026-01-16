<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { auth, isAuthenticated } from '$lib/stores/auth.js';
  import { currency } from '$lib/stores/currency.js';
  import { CURRENCY_OPTIONS } from '$lib/utils/currency.js';
  import { ROUTES } from '$lib/utils/constants.js';
  import { Lock, ChevronDown } from 'lucide-svelte';

  let sessionCleared = false;
  let sessionExpired = false;

  $: sessionExpired = $page.url.searchParams.get('reason') === 'session-expired';
  $: if (!sessionExpired) {
    sessionCleared = false;
  }

  $: if (browser && sessionExpired && !sessionCleared) {
    sessionCleared = true;
    auth.setUser(null);
    auth.clearError();
  }

  $: if (browser && $isAuthenticated && !sessionExpired) {
    goto(ROUTES.HOME);
  }

  function handleCurrencyChange(event: Event) {
    const target = event.currentTarget as HTMLSelectElement | null;
    currency.set(target?.value || 'USD');
    target?.blur();
  }
</script>

<div class="min-h-screen bg-gradient-to-br from-subslush-blue/5 via-white to-subslush-pink/5 dark:from-subslush-blue-dark/20 dark:via-surface-900 dark:to-subslush-pink-dark/20 flex flex-col relative overflow-hidden">
  <!-- Animated Background Elements -->
  <div class="absolute inset-0 overflow-hidden pointer-events-none">
    <div class="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-subslush-blue/20 to-subslush-pink/20 rounded-full blur-3xl animate-pulse"></div>
    <div class="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-subslush-pink/20 to-subslush-purple/20 rounded-full blur-3xl animate-pulse" style="animation-delay: 2s;"></div>
  </div>

  <!-- Header -->
  <header class="relative">
    <nav class="bg-white text-gray-900 shadow-md border-b border-gray-100">
      <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid grid-cols-3 items-center h-14 gap-4">
          <div class="flex items-center gap-2 text-sm font-semibold text-black">
            <Lock size={18} class="text-black" aria-hidden="true" />
            <span>Secure login</span>
          </div>
          <a
            href={ROUTES.HOME}
            class="text-lg font-extrabold text-center subslush-text-gradient hover:opacity-90 transition-opacity"
            aria-label="SubSlush home"
          >
            SubSlush
          </a>
          <div class="relative justify-self-end">
            <select
              class="lang-select appearance-none pr-9 pl-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 shadow-sm focus:outline-none focus:ring-2 focus:ring-subslush-blue/30"
              aria-label="Language and currency"
              style="background-image: none;"
              bind:value={$currency}
              on:change={handleCurrencyChange}
            >
              {#each CURRENCY_OPTIONS as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
            <ChevronDown class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-500" size={16} aria-hidden="true" />
          </div>
        </div>
      </div>
    </nav>
  </header>

  <!-- Main Content -->
  <main class={`relative flex-1 flex ${$page.url.pathname === ROUTES.AUTH.REGISTER ? 'items-start pt-10 pb-12' : 'items-center'} justify-center px-4 sm:px-6 lg:px-8`}>
    <div class="w-full max-w-lg">
      <div class="bg-white/90 dark:bg-surface-800/90 backdrop-blur-xl shadow-2xl rounded-3xl p-8 sm:p-9 border border-white/20 dark:border-surface-700/50 relative"
           style="box-shadow: 0 25px 50px -12px rgba(79, 195, 247, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.05);">
        <!-- Glass effect overlay -->
        <div class="absolute inset-0 rounded-3xl bg-gradient-to-br from-white/10 to-transparent pointer-events-none"></div>

        <!-- Content -->
        <div class="relative">
          <slot />
        </div>
      </div>
    </div>
  </main>

  <!-- Footer -->
  <footer class="relative py-8 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md mx-auto text-center text-sm text-surface-500 dark:text-surface-500">
      <div class="flex justify-center space-x-8 mb-4">
        <a href="/terms" class="hover:text-subslush-blue dark:hover:text-subslush-blue-light transition-colors duration-200 font-medium">
          Terms of use
        </a>
        <a href="/privacy" class="hover:text-subslush-pink dark:hover:text-subslush-pink-light transition-colors duration-200 font-medium">
          Privacy policy
        </a>
        <a href="/help" class="hover:text-subslush-purple dark:hover:text-subslush-purple-light transition-colors duration-200 font-medium">
          Support
        </a>
      </div>
      <p class="text-xs opacity-75">
        Copyright © 2026 SUBSLUSH.COM. All Rights Reserved.
      </p>
    </div>
  </footer>
</div>
