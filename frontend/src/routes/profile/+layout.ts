import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { auth } from '$lib/stores/auth.js';
import { ROUTES } from '$lib/utils/constants.js';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ url }) => {
  console.log('👤 [PROFILE GUARD] Running, URL:', url.pathname);

  // Only run on client side
  if (browser) {
    console.log('👤 [PROFILE GUARD] In browser, checking auth...');

    // CRITICAL FIX: Ensure auth is fully initialized before making decisions
    console.log('👤 [PROFILE GUARD] Ensuring auth initialization...');
    await auth.ensureAuthInitialized();
    console.log('👤 [PROFILE GUARD] Auth initialization completed');

    const authState = get(auth);
    console.log('👤 [PROFILE GUARD] Auth state:', {
      isAuthenticated: authState.isAuthenticated,
      hasUser: !!authState.user,
      hasToken: !!authState.accessToken,
      isLoading: authState.isLoading
    });

    // If not authenticated after initialization, redirect to login
    if (!authState.isAuthenticated) {
      console.log('⛔ [PROFILE GUARD] Not authenticated, redirecting to login');
      throw redirect(302, `${ROUTES.AUTH.LOGIN}?redirect=${encodeURIComponent(url.pathname)}`);
    }

    console.log('✅ [PROFILE GUARD] Authenticated, allowing access');
  } else {
    console.log('👤 [PROFILE GUARD] Not in browser, skipping auth check');
  }

  return {};
};