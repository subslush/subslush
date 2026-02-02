<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { get } from 'svelte/store';
  import { CheckCircle } from 'lucide-svelte';
  import { auth } from '$lib/stores/auth.js';
  import { authService } from '$lib/api/auth.js';
  import { identifyTikTokUser, trackCompleteRegistration } from '$lib/utils/analytics.js';

  const getTrackingKey = (userId: string) =>
    `tiktok:complete_registration:${userId}`;

  const hasTracked = (storageKey: string): boolean => {
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch {
      return false;
    }
  };

  const markTracked = (storageKey: string): void => {
    try {
      localStorage.setItem(storageKey, '1');
    } catch {
      // Ignore storage errors (e.g., private mode); we still want the event.
    }
  };

  onMount(async () => {
    if (!browser) return;
    const state = get(auth);
    const user = state.user;
    if (!user) return;

    const storageKey = getTrackingKey(user.id);
    if (hasTracked(storageKey)) return;

    await identifyTikTokUser(user);
    try {
      await authService.trackVerifiedRegistration();
    } catch {
      // Ignore server tracking errors to avoid blocking the UX.
    }
    trackCompleteRegistration('email_verification');
    markTracked(storageKey);
  });
</script>

<svelte:head>
  <title>Email Verified - SubSlush</title>
  <meta name="description" content="Your email was successfully verified. Continue to the marketplace." />
</svelte:head>

<section class="mx-auto max-w-2xl space-y-8 text-center">
  <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-pink-500 text-white shadow-lg">
    <CheckCircle class="h-6 w-6" />
  </div>

  <div class="space-y-3">
    <h1 class="text-3xl font-semibold tracking-tight text-surface-900 dark:text-surface-100">
      Email verified
    </h1>
    <p class="text-base text-surface-600 dark:text-surface-400">
      Your account is now active. You can start browsing and purchase subscriptions immediately.
    </p>
  </div>

  <div class="flex flex-col items-center justify-center gap-3 sm:flex-row">
    <a
      href="/browse"
      class="inline-flex items-center justify-center rounded-lg bg-surface-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-surface-800 dark:bg-surface-100 dark:text-surface-900 dark:hover:bg-white"
    >
      Go to marketplace
    </a>
    <a
      href="/dashboard"
      class="inline-flex items-center justify-center rounded-lg border border-surface-200 px-5 py-2.5 text-sm font-semibold text-surface-900 transition hover:bg-surface-50 dark:border-surface-700 dark:text-surface-100 dark:hover:bg-surface-800"
    >
      Visit your dashboard
    </a>
  </div>
</section>
