import type { LayoutServerLoad } from './$types';
import { Buffer } from 'node:buffer';
import { redirect } from '@sveltejs/kit';
import { API_CONFIG } from '$lib/utils/constants';

const PROFILE_CACHE_COOKIE = 'profile_cache';
const PROFILE_CACHE_MAX_AGE_SECONDS = 300;

const decodeProfileCache = (
  raw: string | undefined,
  userId?: string
) => {
  if (!raw || !userId) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) as {
      id?: string;
      email?: string;
      role?: string;
      firstName?: string;
      lastName?: string;
      displayName?: string | null;
      pinSetAt?: string | null;
    };
    if (!parsed?.id || !parsed.email || parsed.id !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
};

const sanitizeProfileUser = (value: unknown) => {
  if (!value || typeof value !== 'object') return null;
  const profile = value as Record<string, unknown>;
  const id = typeof profile.id === 'string' ? profile.id : null;
  const email = typeof profile.email === 'string' ? profile.email : null;
  if (!id || !email) return null;
  return {
    id,
    email,
    role: typeof profile.role === 'string' ? profile.role : undefined,
    firstName: typeof profile.firstName === 'string' ? profile.firstName : undefined,
    lastName: typeof profile.lastName === 'string' ? profile.lastName : undefined,
    displayName:
      typeof profile.displayName === 'string' ? profile.displayName : null,
    pinSetAt: typeof profile.pinSetAt === 'string' ? profile.pinSetAt : null
  };
};

export const load: LayoutServerLoad = async ({ locals, fetch, cookies }) => {
  // If no user from hooks, redirect to login
  if (!locals.user) {
    throw redirect(303, '/auth/login');
  }

  const cachedUser = decodeProfileCache(
    cookies.get(PROFILE_CACHE_COOKIE),
    locals.user.id
  );
  if (cachedUser) {
    return {
      user: cachedUser
    };
  }

  // Get full user data from backend API (periodic revalidation)
  try {
    const response = await fetch(`${API_CONFIG.BASE_URL}/auth/profile`, {
      headers: {
        'Cookie': cookies.getAll().map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('🔍 [LAYOUT SERVER] Profile API response:', JSON.stringify(data, null, 2));

      // Return user data from the API response (which has firstName/lastName from authMiddleware)
      const user = sanitizeProfileUser(data?.user);
      if (user) {
        const encoded = Buffer.from(JSON.stringify(user)).toString('base64');
        cookies.set(PROFILE_CACHE_COOKIE, encoded, {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: PROFILE_CACHE_MAX_AGE_SECONDS
        });
        return {
          user
        };
      }
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
      cookies.delete(PROFILE_CACHE_COOKIE, {
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
    // Note: firstName/lastName are omitted since they're not in JWT and backend call failed
    return {
      user: {
        id: locals.user.id,
        email: locals.user.email,
        role: locals.user.role,
        // firstName/lastName intentionally omitted - they're not available offline
        displayName: null
      }
    };
  }
};
