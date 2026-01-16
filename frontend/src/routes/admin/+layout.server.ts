import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { API_CONFIG } from '$lib/utils/constants';

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

export const load: LayoutServerLoad = async ({ locals, fetch, cookies }) => {
  if (!locals.user) {
    throw redirect(303, '/auth/login');
  }

  if (!ADMIN_ROLES.has(locals.user.role || '')) {
    throw redirect(303, '/dashboard');
  }

  try {
    const cacheBuster = `?t=${Date.now()}`;
    const response = await fetch(`${API_CONFIG.BASE_URL}/auth/profile${cacheBuster}`, {
      headers: {
        Cookie: cookies
          .getAll()
          .map(cookie => `${cookie.name}=${cookie.value}`)
          .join('; '),
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache'
      }
    });

    if (response.ok) {
      const data = await response.json();
      return { user: data.user };
    }

    cookies.delete('auth_token', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });
    throw redirect(303, '/auth/login');
  } catch (error) {
    console.error('Admin layout: Failed to get profile:', error);
    return {
      user: {
        id: locals.user.id,
        email: locals.user.email,
        role: locals.user.role,
        displayName: null
      }
    };
  }
};
