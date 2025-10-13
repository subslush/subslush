import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { API_CONFIG } from '$lib/utils/constants';

export const load: LayoutServerLoad = async ({ locals, fetch, cookies }) => {
  // If no user from hooks, redirect to login
  if (!locals.user) {
    throw redirect(303, '/auth/login');
  }

  // Get full user data from backend API with cache busting
  try {
    const cacheBuster = `?t=${Date.now()}`;
    const response = await fetch(`${API_CONFIG.BASE_URL}/auth/profile${cacheBuster}`, {
      headers: {
        'Cookie': cookies.getAll().map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('🔍 [LAYOUT SERVER] Profile API response:', JSON.stringify(data, null, 2));

      // Return user data from the API response (which has firstName/lastName from authMiddleware)
      return {
        user: data.user
      };
    } else {
      // Session invalid on backend, clear cookie and redirect
      cookies.delete('auth_token', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      });
      throw redirect(303, '/auth/login');
    }
  } catch (error) {
    console.error('Dashboard layout: Failed to get profile:', error);
    // On network error, still allow access if JWT is valid (offline tolerance)
    // Note: firstName/lastName will be undefined here since they come from the backend
    return {
      user: {
        id: locals.user.id,
        email: locals.user.email,
        firstName: locals.user.firstName, // Will be undefined
        lastName: locals.user.lastName, // Will be undefined
        role: locals.user.role
      }
    };
  }
};