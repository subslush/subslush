import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { auth } from '$lib/stores/auth.js';
import { ROUTES } from '$lib/utils/constants.js';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ url }) => {
  // Only run on client side
  if (browser) {
    const authState = get(auth);

    // If not authenticated, redirect to login
    if (!authState.isAuthenticated) {
      throw redirect(302, `${ROUTES.AUTH.LOGIN}?redirect=${encodeURIComponent(url.pathname)}`);
    }
  }

  return {};
};