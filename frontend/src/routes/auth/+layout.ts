import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { auth } from '$lib/stores/auth.js';
import { ROUTES } from '$lib/utils/constants.js';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ url }) => {
  console.log('🔐 [AUTH GUARD] Running, URL:', url.pathname);

  // Only run on client side
  if (browser) {
    console.log('🔐 [AUTH GUARD] In browser, checking auth...');

    // CRITICAL FIX: Ensure auth is fully initialized before making decisions
    console.log('🔐 [AUTH GUARD] Ensuring auth initialization...');
    await auth.ensureAuthInitialized();
    console.log('🔐 [AUTH GUARD] Auth initialization completed');

    const authState = get(auth);
    console.log('🔐 [AUTH GUARD] Auth state:', {
      isAuthenticated: authState.isAuthenticated,
      hasToken: !!authState.accessToken,
      isLoading: authState.isLoading
    });

    // If authenticated after initialization, redirect to dashboard
    if (authState.isAuthenticated) {
      console.log('⛔ [AUTH GUARD] Already authenticated, redirecting to:', ROUTES.DASHBOARD);
      throw redirect(302, ROUTES.DASHBOARD);
    }

    console.log('✅ [AUTH GUARD] Not authenticated, allowing access to auth pages');
  } else {
    console.log('🔐 [AUTH GUARD] Not in browser, skipping auth check');
  }

  return {};
};