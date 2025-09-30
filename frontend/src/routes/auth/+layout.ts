import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { auth } from '$lib/stores/auth.js';
import { ROUTES } from '$lib/utils/constants.js';
import type { LayoutLoad } from './$types';

const REDIRECT_KEY = '__auth_redirecting';
const REDIRECT_TIMEOUT = 2000; // 2 seconds

export const load: LayoutLoad = async ({ url }) => {
  console.log('🔐 [AUTH GUARD] Running, URL:', url.pathname);

  if (browser) {
    console.log('🔐 [AUTH GUARD] In browser, checking auth...');

    // CRITICAL FIX: Check if we're already redirecting using session storage
    const redirectingUntil = sessionStorage.getItem(REDIRECT_KEY);
    if (redirectingUntil) {
      const timestamp = parseInt(redirectingUntil, 10);
      if (Date.now() < timestamp) {
        console.log('⚠️ [AUTH GUARD] Already redirecting, skipping...');
        return {};
      } else {
        // Timeout expired, clear the flag
        sessionStorage.removeItem(REDIRECT_KEY);
      }
    }

    await auth.ensureAuthInitialized();

    const authState = get(auth);
    console.log('🔐 [AUTH GUARD] Auth state:', {
      isAuthenticated: authState.isAuthenticated,
      hasToken: !!authState.accessToken,
      isLoading: authState.isLoading
    });

    if (authState.isAuthenticated) {
      console.log('⛔ [AUTH GUARD] Already authenticated, redirecting to:', ROUTES.DASHBOARD);

      // Set redirect flag in session storage with expiry timestamp
      sessionStorage.setItem(REDIRECT_KEY, (Date.now() + REDIRECT_TIMEOUT).toString());

      // Schedule cleanup
      setTimeout(() => {
        sessionStorage.removeItem(REDIRECT_KEY);
      }, REDIRECT_TIMEOUT);

      throw redirect(302, ROUTES.DASHBOARD);
    }

    console.log('✅ [AUTH GUARD] Not authenticated, allowing access to auth pages');
  }

  return {};
};