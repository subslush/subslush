import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { auth } from '$lib/stores/auth.js';
import { ROUTES } from '$lib/utils/constants.js';
import type { LayoutLoad } from './$types';

let isRedirecting = false;

export const load: LayoutLoad = async ({ url }) => {
  console.log('🔐 [AUTH GUARD] Running, URL:', url.pathname);

  if (browser) {
    console.log('🔐 [AUTH GUARD] In browser, checking auth...');

    // CRITICAL FIX: Prevent redirect loop
    if (isRedirecting) {
      console.log('⚠️ [AUTH GUARD] Already redirecting, skipping...');
      return {};
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
      isRedirecting = true;

      // Use setTimeout to prevent loop
      setTimeout(() => {
        isRedirecting = false;
      }, 1000);

      throw redirect(302, ROUTES.DASHBOARD);
    }

    console.log('✅ [AUTH GUARD] Not authenticated, allowing access to auth pages');
  }

  return {};
};