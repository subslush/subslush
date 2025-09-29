import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { auth } from '$lib/stores/auth.js';
import { ROUTES } from '$lib/utils/constants.js';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ url }) => {
  console.log('🛡️ [DASHBOARD GUARD] Running, URL:', url.pathname);

  // Only run on client side
  if (browser) {
    console.log('🛡️ [DASHBOARD GUARD] In browser, checking auth...');

    // CRITICAL FIX: Ensure auth is fully initialized before making decisions
    console.log('🛡️ [DASHBOARD GUARD] Ensuring auth initialization...');
    await auth.ensureAuthInitialized();
    console.log('🛡️ [DASHBOARD GUARD] Auth initialization completed');

    const authState = get(auth);
    console.log('🛡️ [DASHBOARD GUARD] Auth state:', {
      isAuthenticated: authState.isAuthenticated,
      hasUser: !!authState.user,
      hasToken: !!authState.accessToken,
      isLoading: authState.isLoading
    });

    // If not authenticated after initialization, redirect to login
    if (!authState.isAuthenticated) {
      const redirectUrl = `${ROUTES.AUTH.LOGIN}?redirect=${encodeURIComponent(url.pathname)}`;
      console.log('⛔ [DASHBOARD GUARD] Not authenticated, redirecting to:', redirectUrl);
      throw redirect(302, redirectUrl);
    }

    console.log('✅ [DASHBOARD GUARD] Authenticated, allowing access');
  } else {
    console.log('🛡️ [DASHBOARD GUARD] Not in browser, skipping auth check');
  }

  return {};
};