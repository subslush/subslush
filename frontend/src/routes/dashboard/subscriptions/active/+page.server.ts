import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
  // Server-side authentication check
  if (!locals.user) {
    throw redirect(303, '/auth/login');
  }

  console.log('📦 [ACTIVE SUBSCRIPTIONS SERVER] User authenticated:', locals.user.email);

  // Return minimal data for SSR - actual data fetching will happen client-side
  // This prevents 500 errors on page refresh while maintaining auth security
  return {
    user: locals.user,
    // Indicate this is server-side rendered data
    serverLoaded: true
  };
};