import type { LayoutLoad } from './$types';
import { browser } from '$app/environment';

export const load: LayoutLoad = async ({ parent, url }) => {
  console.log('🛡️ [DASHBOARD GUARD] Running, URL:', url.pathname);

  // Get parent data (from +layout.server.ts)
  const data = await parent();

  console.log('🛡️ [DASHBOARD GUARD] Parent data:', {
    hasUser: !!data.user,
    userEmail: data.user?.email,
  });

  // Server-side protection is already handled in +layout.server.ts
  // This client-side guard was causing race conditions after login
  // The server-side layout redirects to /auth/login if no user cookie

  console.log('✅ [DASHBOARD GUARD] Allowing access, server-side auth handles protection');

  // Pass user data through
  return {
    user: data.user,
  };
};