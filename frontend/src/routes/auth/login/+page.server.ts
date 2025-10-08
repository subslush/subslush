import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { API_CONFIG } from '$lib/utils/constants';

export const load: PageServerLoad = async ({ locals }) => {
  // If already authenticated, redirect to dashboard
  if (locals.user) {
    throw redirect(303, '/dashboard');
  }

  // Return empty object to show login form
  return {};
};

export const actions: Actions = {
  default: async ({ request, cookies, fetch }) => {
    const data = await request.formData();
    const email = data.get('email') as string;
    const password = data.get('password') as string;
    const rememberMe = data.get('rememberMe') === 'on';

    if (!email || !password) {
      return fail(400, {
        error: 'Email and password are required',
        email
      });
    }

    try {
      const response = await fetch(`${API_CONFIG.BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          password,
          rememberMe
        })
      });

      const result = await response.json();

      if (!response.ok) {
        return fail(response.status, {
          error: result.message || 'Login failed',
          email
        });
      }

      // Backend should have set the auth_token cookie
      // The cookie will be automatically sent with subsequent requests

      // Return success response instead of redirecting
      return { success: true, user: result.user };
    } catch (error) {
      console.error('Login error:', error);
      return fail(500, {
        error: 'Network error. Please try again.',
        email
      });
    }
  }
};