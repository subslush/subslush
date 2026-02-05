import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { jwtDecode } from 'jwt-decode';
import { API_CONFIG } from '$lib/utils/constants';

interface JWTPayload {
  userId: string;
  email: string;
  role?: string;
  sessionId: string;
  iat: number;
  exp: number;
}

const PROTECTED_ROUTES = ['/dashboard', '/profile', '/admin'];
const AUTH_ROUTES = ['/auth/login', '/auth/register'];
const PROFILE_URL = `${API_CONFIG.BASE_URL}/auth/profile`;
const PROFILE_CACHE_COOKIE = 'profile_cache';

const clearAuthCookie = (event: Parameters<Handle>[0]['event']) => {
  event.cookies.delete('auth_token', {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });
  event.cookies.delete(PROFILE_CACHE_COOKIE, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });
};

const fetchValidatedUser = async (
  event: Parameters<Handle>[0]['event'],
  authToken: string
) => {
  try {
    const response = await event.fetch(PROFILE_URL, {
      method: 'GET',
      headers: {
        Cookie: `auth_token=${authToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        clearAuthCookie(event);
      }
      return null;
    }

    const data = await response.json();
    return data?.user || null;
  } catch (error) {
    console.warn('Auth profile validation failed:', error);
    return null;
  }
};

export const handle: Handle = async ({ event, resolve }) => {
  const authToken = event.cookies.get('auth_token');

  // Initialize user as null
  event.locals.user = null;

  const { pathname } = event.url;
  const isProtectedRoute = PROTECTED_ROUTES.some(route => pathname.startsWith(route));
  const isAuthRoute = AUTH_ROUTES.some(route => pathname.startsWith(route));

  // If we have a token, validate it
  if (authToken) {
    try {
      // Decode JWT to get user info
      const payload = jwtDecode<JWTPayload>(authToken);

      // Check if token is expired
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp > now) {
        if (isAuthRoute) {
          // For auth routes, only trust a validated session to avoid redirect loops
          const validatedUser = await fetchValidatedUser(event, authToken);
          if (validatedUser) {
            event.locals.user = {
              id: validatedUser.id,
              email: validatedUser.email,
              firstName: validatedUser.firstName || undefined,
              lastName: validatedUser.lastName || undefined,
              role: validatedUser.role,
              sessionId: payload.sessionId
            };
          }
        } else {
          // Token is valid, set user data (firstName/lastName omitted as they're not in JWT)
          event.locals.user = {
            id: payload.userId,
            email: payload.email,
            role: payload.role,
            sessionId: payload.sessionId
          };
        }
      } else {
        // Token expired, clear cookie
        clearAuthCookie(event);
      }
    } catch (error) {
      // Invalid token, clear cookie
      console.warn('Invalid auth token, clearing cookie:', error);
      clearAuthCookie(event);
    }
  }

  // Redirect unauthenticated users from protected routes
  if (isProtectedRoute && !event.locals.user) {
    throw redirect(303, '/auth/login');
  }

  // Redirect authenticated users from auth routes
  if (isAuthRoute && event.locals.user) {
    throw redirect(303, '/');
  }

  // Continue with the request
  const response = await resolve(event, {
    filterSerializedResponseHeaders: (name) => name.toLowerCase() === 'content-type'
  });

  if (event.url.pathname.startsWith('/_app/immutable/')) {
    if (!response.headers.has('cache-control')) {
      response.headers.set('cache-control', 'public, max-age=31536000, immutable');
    }
  }

  return response;
};
