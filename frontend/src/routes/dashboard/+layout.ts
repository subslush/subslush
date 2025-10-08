import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { auth } from '$lib/stores/auth.js';
import { ROUTES } from '$lib/utils/constants.js';
import type { LayoutLoad } from './$types';

const REDIRECT_KEY = '__dashboard_redirecting';
const REDIRECT_TIMEOUT = 2000; // 2 seconds

export const load: LayoutLoad = async ({ url }) => {
  console.log('🛡️ [DASHBOARD GUARD] Running, URL:', url.pathname);

  if (browser) {
    console.log('🛡️ [DASHBOARD GUARD] In browser, checking auth...');

    // CRITICAL FIX: Check if we're already redirecting
    const redirectingUntil = sessionStorage.getItem(REDIRECT_KEY);
    if (redirectingUntil) {
      const timestamp = parseInt(redirectingUntil, 10);
      if (Date.now() < timestamp) {
        console.log('⚠️ [DASHBOARD GUARD] Already redirecting, skipping...');
        return {};
      } else {
        sessionStorage.removeItem(REDIRECT_KEY);
      }
    }

    await auth.ensureAuthInitialized();

    const authState = get(auth);
    console.log('🛡️ [DASHBOARD GUARD] Auth state:', {
      isAuthenticated: authState.isAuthenticated,
      hasUser: !!authState.user,
      userId: authState.user?.id,
      isLoading: authState.isLoading,
      initialized: authState.initialized
    });

    if (!authState.isAuthenticated) {
      const redirectUrl = `${ROUTES.AUTH.LOGIN}?redirect=${encodeURIComponent(url.pathname)}`;
      console.log('⛔ [DASHBOARD GUARD] Not authenticated, redirecting to:', redirectUrl);

      // Set redirect flag
      sessionStorage.setItem(REDIRECT_KEY, (Date.now() + REDIRECT_TIMEOUT).toString());

      setTimeout(() => {
        sessionStorage.removeItem(REDIRECT_KEY);
      }, REDIRECT_TIMEOUT);

      throw redirect(302, redirectUrl);
    }

    console.log('✅ [DASHBOARD GUARD] Authenticated, allowing access');
  }

  return {};
};