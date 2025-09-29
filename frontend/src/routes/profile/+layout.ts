import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { auth, isLoading } from '$lib/stores/auth.js';
import { ROUTES } from '$lib/utils/constants.js';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ url }) => {
  // Only run on client side
  if (browser) {
    // Wait a moment for auth initialization if it's still loading
    const loadingState = get(isLoading);
    if (loadingState) {
      // Wait up to 1 second for auth to initialize
      await new Promise((resolve) => {
        let waited = 0;
        const checkInterval = setInterval(() => {
          waited += 50;
          if (!get(isLoading) || waited >= 1000) {
            clearInterval(checkInterval);
            resolve(undefined);
          }
        }, 50);
      });
    }

    const authState = get(auth);

    // If not authenticated after initialization, redirect to login
    if (!authState.isAuthenticated) {
      throw redirect(302, `${ROUTES.AUTH.LOGIN}?redirect=${encodeURIComponent(url.pathname)}`);
    }
  }

  return {};
};