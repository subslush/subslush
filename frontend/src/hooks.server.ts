import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import { ROUTES } from '$lib/utils/constants.js';

const PROTECTED_ROUTES = ['/dashboard', '/profile'];
const AUTH_ROUTES = ['/auth/login', '/auth/register'];

export const handle: Handle = async ({ event, resolve }) => {
  const { url, cookies } = event;
  const pathname = url.pathname;

  // Get auth token from cookie (this would need to match your auth implementation)
  const authToken = cookies.get('auth_token');
  const isAuthenticated = !!authToken;

  // Check if accessing protected route without authentication
  if (PROTECTED_ROUTES.some(route => pathname.startsWith(route))) {
    if (!isAuthenticated) {
      throw redirect(302, ROUTES.AUTH.LOGIN);
    }
  }

  // Check if accessing auth routes while authenticated
  if (AUTH_ROUTES.some(route => pathname.startsWith(route))) {
    if (isAuthenticated) {
      throw redirect(302, ROUTES.DASHBOARD);
    }
  }

  // Continue with request
  const response = await resolve(event);
  return response;
};