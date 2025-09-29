<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { isAuthenticated, isLoading } from '$lib/stores/auth.js';
  import { ROUTES } from '$lib/utils/constants.js';

  export let requireAuth = false;
  export let requireGuest = false;
  export let redirectTo: string | null = null;

  let mounted = false;

  onMount(() => {
    mounted = true;
  });

  $: if (mounted && !$isLoading) {
    if (requireAuth && !$isAuthenticated) {
      // Redirect to login with return URL
      const returnUrl = encodeURIComponent($page.url.pathname + $page.url.search);
      goto(`${ROUTES.AUTH.LOGIN}?redirect=${returnUrl}`);
    } else if (requireGuest && $isAuthenticated) {
      // Redirect authenticated users away from guest-only pages
      goto(redirectTo || ROUTES.DASHBOARD);
    }
  }
</script>

{#if mounted && !$isLoading}
  {#if (requireAuth && $isAuthenticated) || (requireGuest && !$isAuthenticated) || (!requireAuth && !requireGuest)}
    <slot />
  {:else}
    <!-- Show loading or nothing while redirecting -->
    <div class="flex items-center justify-center min-h-screen">
      <div class="text-center">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
        <p class="mt-2 text-sm text-surface-600 dark:text-surface-400">Redirecting...</p>
      </div>
    </div>
  {/if}
{:else}
  <!-- Show loading while checking auth -->
  <div class="flex items-center justify-center min-h-screen">
    <div class="text-center">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
      <p class="mt-2 text-sm text-surface-600 dark:text-surface-400">Loading...</p>
    </div>
  </div>
{/if}