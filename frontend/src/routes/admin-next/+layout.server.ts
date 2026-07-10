import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { API_CONFIG } from '$lib/utils/constants';
import { createAdminNextService } from '$lib/api/adminNext.js';
import { orderOpenCount } from '$lib/utils/adminNext.js';

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

export const load: LayoutServerLoad = async ({ locals, fetch, cookies }) => {
  if (!locals.user) {
    throw redirect(303, '/auth/login');
  }

  if (!ADMIN_ROLES.has(locals.user.role || '')) {
    throw redirect(303, '/dashboard');
  }

  const cookieHeader = cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');

  let user = {
    id: locals.user.id,
    email: locals.user.email,
    role: locals.user.role,
    displayName: null,
  };

  try {
    const cacheBuster = `?t=${Date.now()}`;
    const response = await fetch(`${API_CONFIG.BASE_URL}/auth/profile${cacheBuster}`, {
      headers: {
        Cookie: cookieHeader,
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });

    if (response.ok) {
      const data = await response.json();
      user = data.user;
    } else {
      cookies.delete('auth_token', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });
      throw redirect(303, '/auth/login');
    }
  } catch (error) {
    console.error('Admin next layout: Failed to get profile:', error);
  }

  let fulfillmentCount = 0;
  try {
    const adminNext = createAdminNextService(fetch, { cookie: cookieHeader });
    const tabs = await Promise.all([
      adminNext.getQueue({ tab: 'new_orders', limit: 200 }),
      adminNext.getQueue({ tab: 'mmu', limit: 200 }),
      adminNext.getQueue({ tab: 'awaiting_customer', limit: 200 }),
      adminNext.getQueue({ tab: 'issues', limit: 200 }),
    ]);
    fulfillmentCount = tabs.reduce((total, response) => total + orderOpenCount(response.orders), 0);
  } catch {
    fulfillmentCount = 0;
  }

  return { user, fulfillmentCount };
};
