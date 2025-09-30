import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { auth } from '$lib/stores/auth.js';
import { ROUTES } from '$lib/utils/constants.js';
import type { LayoutLoad } from './$types';

const REDIRECT_KEY = '__profile_redirecting';
const REDIRECT_TIMEOUT = 2000; // 2 seconds

export const load: LayoutLoad = async ({ url }) => {
  console.log('👤 [PROFILE GUARD] Running, URL:', url.pathname);

  if (browser) {
    console.log('👤 [PROFILE GUARD] In browser, checking auth...');

    // CRITICAL FIX: Check if we're already redirecting
    const redirectingUntil = sessionStorage.getItem(REDIRECT_KEY);
    if (redirectingUntil) {
      const timestamp = parseInt(redirectingUntil, 10);
      if (Date.now() < timestamp) {
        console.log('⚠️ [PROFILE GUARD] Already redirecting, skipping...');
        return {};
      } else {
        sessionStorage.removeItem(REDIRECT_KEY);
      }
    }

    await auth.ensureAuthInitialized();

    const authState = get(auth);
    console.log('👤 [PROFILE GUARD] Auth state:', {
      isAuthenticated: authState.isAuthenticated,
      hasUser: !!authState.user,
      hasToken: !!authState.accessToken,
      isLoading: authState.isLoading
    });

    if (!authState.isAuthenticated) {
      console.log('⛔ [PROFILE GUARD] Not authenticated, redirecting to login');

      // Set redirect flag
      sessionStorage.setItem(REDIRECT_KEY, (Date.now() + REDIRECT_TIMEOUT).toString());

      setTimeout(() => {
        sessionStorage.removeItem(REDIRECT_KEY);
      }, REDIRECT_TIMEOUT);

      throw redirect(302, `${ROUTES.AUTH.LOGIN}?redirect=${encodeURIComponent(url.pathname)}`);
    }

    console.log('✅ [PROFILE GUARD] Authenticated, allowing access');
  }

  return {};
};