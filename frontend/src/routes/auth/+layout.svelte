<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated } from '$lib/stores/auth.js';
  import { ROUTES } from '$lib/utils/constants.js';

  // Redirect authenticated users to dashboard
  onMount(() => {
    const unsubscribe = isAuthenticated.subscribe((authenticated) => {
      if (authenticated) {
        goto(ROUTES.DASHBOARD);
      }
    });

    return unsubscribe;
  });
</script>

<div class="min-h-screen bg-gradient-to-br from-subslush-blue/5 via-white to-subslush-pink/5 dark:from-subslush-blue-dark/20 dark:via-surface-900 dark:to-subslush-pink-dark/20 flex flex-col relative overflow-hidden">
  <!-- Animated Background Elements -->
  <div class="absolute inset-0 overflow-hidden pointer-events-none">
    <div class="absolute -top-40 -right-40 w-80 h-80 bg-gradient-to-br from-subslush-blue/20 to-subslush-pink/20 rounded-full blur-3xl animate-pulse"></div>
    <div class="absolute -bottom-40 -left-40 w-80 h-80 bg-gradient-to-tr from-subslush-pink/20 to-subslush-purple/20 rounded-full blur-3xl animate-pulse" style="animation-delay: 2s;"></div>
  </div>

  <!-- Header -->
  <header class="relative py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md mx-auto text-center">
      <h1 class="text-4xl font-extrabold bg-gradient-to-r bg-clip-text text-transparent mb-4"
          style="background-image: linear-gradient(45deg, #4FC3F7, #F06292);">
        SubSlush
      </h1>
      <p class="text-base text-surface-600 dark:text-surface-400 font-medium">
        Premium subscriptions at unbeatable prices
      </p>
    </div>
  </header>

  <!-- Main Content -->
  <main class="relative flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8">
    <div class="w-full max-w-md">
      <div class="bg-white/90 dark:bg-surface-800/90 backdrop-blur-xl shadow-2xl rounded-3xl p-10 border border-white/20 dark:border-surface-700/50 relative"
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
          Terms
        </a>
        <a href="/privacy" class="hover:text-subslush-pink dark:hover:text-subslush-pink-light transition-colors duration-200 font-medium">
          Privacy
        </a>
        <a href="/support" class="hover:text-subslush-purple dark:hover:text-subslush-purple-light transition-colors duration-200 font-medium">
          Support
        </a>
      </div>
      <p class="text-xs opacity-75">
        © 2024 SubSlush. All rights reserved.
      </p>
    </div>
  </footer>
</div>