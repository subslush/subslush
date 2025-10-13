import type { LayoutLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';

export const load: LayoutLoad = async ({ parent, url }) => {
  console.log('🛡️ [DASHBOARD GUARD] Running, URL:', url.pathname);

  // Get parent data (from +layout.server.ts)
  const data = await parent();

  console.log('🛡️ [DASHBOARD GUARD] Parent data:', {
    hasUser: !!data.user,
    userEmail: data.user?.email,
  });

  // If no user in server data, redirect to login
  if (!data.user) {
    console.log('❌ [DASHBOARD GUARD] No authenticated user, redirecting to login');
    throw redirect(302, '/auth/login');
  }

  console.log('✅ [DASHBOARD GUARD] User authenticated:', data.user.email);

  // Pass user data through
  return {
    user: data.user,
  };
};