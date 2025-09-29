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

<div class="min-h-screen bg-gradient-to-br from-primary-50 to-secondary-50 dark:from-primary-900 dark:to-secondary-900 flex flex-col">
  <!-- Header -->
  <header class="py-6 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md mx-auto text-center">
      <h1 class="text-2xl font-bold text-primary-700 dark:text-primary-300">
        Subscription Platform
      </h1>
      <p class="mt-2 text-sm text-surface-600 dark:text-surface-400">
        Get premium subscriptions at unbeatable prices
      </p>
    </div>
  </header>

  <!-- Main Content -->
  <main class="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8">
    <div class="w-full max-w-md">
      <div class="bg-surface-50 dark:bg-surface-800 shadow-xl rounded-lg p-6 sm:p-8">
        <slot />
      </div>
    </div>
  </main>

  <!-- Footer -->
  <footer class="py-6 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md mx-auto text-center text-sm text-surface-600 dark:text-surface-400">
      <div class="flex justify-center space-x-6">
        <a href="/terms" class="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
          Terms of Service
        </a>
        <a href="/privacy" class="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
          Privacy Policy
        </a>
        <a href="/support" class="hover:text-primary-600 dark:hover:text-primary-400 transition-colors">
          Support
        </a>
      </div>
      <p class="mt-2">
        © 2024 Subscription Platform. All rights reserved.
      </p>
    </div>
  </footer>
</div>