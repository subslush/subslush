import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { API_CONFIG } from '$lib/utils/constants';

export const load: LayoutServerLoad = async ({ locals, fetch, cookies }) => {
  // If no user from hooks, redirect to login
  if (!locals.user) {
    throw redirect(303, '/auth/login');
  }

  // Get full user data from backend API
  try {
    const response = await fetch(`${API_CONFIG.BASE_URL}/auth/sessions`, {
      headers: {
        'Cookie': cookies.getAll().map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
      }
    });

    if (response.ok) {
      const data = await response.json();
      // If the response contains user session info, we know the session is valid

      // Return user data for the layout
      return {
        user: {
          id: locals.user.id,
          email: locals.user.email,
          firstName: locals.user.firstName,
          lastName: locals.user.lastName,
          role: locals.user.role
        }
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
    console.error('Dashboard layout: Failed to validate session:', error);
    // On network error, still allow access if JWT is valid (offline tolerance)
    return {
      user: {
        id: locals.user.id,
        email: locals.user.email,
        firstName: locals.user.firstName,
        lastName: locals.user.lastName,
        role: locals.user.role
      }
    };
  }
};