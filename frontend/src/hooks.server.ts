import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { jwtDecode } from 'jwt-decode';

interface JWTPayload {
  userId: string;
  email: string;
  role?: string;
  sessionId: string;
  iat: number;
  exp: number;
}

const PROTECTED_ROUTES = ['/dashboard', '/profile'];
const AUTH_ROUTES = ['/auth/login', '/auth/register'];

export const handle: Handle = async ({ event, resolve }) => {
  const authToken = event.cookies.get('auth_token');

  // Initialize user as null
  event.locals.user = null;

  // If we have a token, validate it
  if (authToken) {
    try {
      // Decode JWT to get user info
      const payload = jwtDecode<JWTPayload>(authToken);

      // Check if token is expired
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp > now) {
        // Token is valid, set user data (firstName/lastName omitted as they're not in JWT)
        event.locals.user = {
          id: payload.userId,
          email: payload.email,
          role: payload.role,
          sessionId: payload.sessionId
        };
      } else {
        // Token expired, clear cookie
        event.cookies.delete('auth_token', {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict'
        });
      }
    } catch (error) {
      // Invalid token, clear cookie
      console.warn('Invalid auth token, clearing cookie:', error);
      event.cookies.delete('auth_token', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      });
    }
  }

  const { pathname } = event.url;
  const isProtectedRoute = PROTECTED_ROUTES.some(route => pathname.startsWith(route));
  const isAuthRoute = AUTH_ROUTES.some(route => pathname.startsWith(route));

  // Redirect unauthenticated users from protected routes
  if (isProtectedRoute && !event.locals.user) {
    throw redirect(303, '/auth/login');
  }

  // Redirect authenticated users from auth routes
  if (isAuthRoute && event.locals.user) {
    throw redirect(303, '/dashboard');
  }

  // Continue with the request
  const response = await resolve(event);
  return response;
};