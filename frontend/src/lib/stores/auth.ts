import { writable, derived, get } from 'svelte/store';
import { goto } from '$app/navigation';
import { browser } from '$app/environment';
import { authService } from '$lib/api/auth.js';
import { identifyTikTokUser, trackCompleteRegistration, trackLogin } from '$lib/utils/analytics.js';

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  displayName?: string | null;
  pinSetAt?: string | null;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  errorAction: { text: string; url: string } | null;
  isAuthenticated: boolean;
  initialized: boolean;
}

const initialState: AuthState = {
  user: null,
  isLoading: false,
  error: null,
  errorAction: null,
  isAuthenticated: false,
  initialized: false
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const getErrorAction = (
  error: unknown
): { text: string; url: string } | null => {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const details = (error as { details?: unknown }).details;
  if (!details || typeof details !== 'object') {
    return null;
  }
  const loginText = (details as { loginText?: unknown }).loginText;
  const loginUrl = (details as { loginUrl?: unknown }).loginUrl;
  if (typeof loginText === 'string' && typeof loginUrl === 'string') {
    return { text: loginText, url: loginUrl };
  }
  return null;
};

const sanitizeRedirectPath = (value: string | null): string | null => {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized.startsWith('/') || normalized.startsWith('//')) {
    return null;
  }
  return normalized;
};

const resolvePostAuthRedirect = (): string => {
  if (!browser) {
    return '/';
  }

  const search = new globalThis.URLSearchParams(window.location.search);
  const redirect = sanitizeRedirectPath(search.get('redirect'));
  return redirect || '/';
};

function createAuthStore(initialUser: User | null = null) {
  const { subscribe, set, update } = writable<AuthState>({
    ...initialState,
    user: initialUser,
    isAuthenticated: !!initialUser
  });

  return {
    subscribe,

    // Critical method needed by dashboard layout
    ensureAuthInitialized: async (): Promise<void> => {
      const state = get({ subscribe });

      // If already initialized, skip
      if (state.initialized) {
        console.log('🔐 [AUTH STORE] Already initialized, skipping');
        return;
      }

      // Only run in browser
      if (!browser) {
        console.log('🔐 [AUTH STORE] Server-side, skipping initialization');
        return;
      }

      console.log('🔐 [AUTH STORE] Initializing auth from session...');

      update(s => ({ ...s, isLoading: true }));

      try {
        // Try to refresh session from cookie
        const response = await authService.refreshSession();

        console.log('🔐 [AUTH STORE] Session refresh successful:', response.user);

        update(s => ({
          ...s,
          user: response.user,
          isAuthenticated: true,
          isLoading: false,
          initialized: true,
          error: null,
          errorAction: null
        }));
      } catch (error) {
        console.error('🔐 [AUTH STORE] Session refresh failed:', error);

        // If refresh fails, user is not authenticated
        update(s => ({
          ...s,
          user: null,
          isAuthenticated: false,
          isLoading: false,
          initialized: true,
          error: null,
          errorAction: null
        }));
      }
    },

    // Initialize with user data from server
    init: (user: User | null) => {
      console.log('🔐 [AUTH STORE] Initializing with user:', user);

      set({
        user,
        isLoading: false,
        error: null,
        errorAction: null,
        isAuthenticated: !!user,
        initialized: true
      });
    },

    // Set loading state
    setLoading: (isLoading: boolean) => {
      update(state => ({ ...state, isLoading, error: null, errorAction: null }));
    },

    // Set error state
    setError: (error: string | null) => {
      update(state => ({
        ...state,
        error,
        errorAction: null,
        isLoading: false
      }));
    },

    // Clear error
    clearError: () => {
      update(state => ({ ...state, error: null, errorAction: null }));
    },

    // Logout - clear user and redirect
    logout: async () => {
      if (!browser) return;

      update(state => ({ ...state, isLoading: true }));

      try {
        // Call logout endpoint using authService
        await authService.logout({ allDevices: false });

        // Clear local state
        set({
          user: null,
          isLoading: false,
          error: null,
          errorAction: null,
          isAuthenticated: false,
          initialized: false
        });

        // Redirect to login
        goto('/auth/login');
      } catch (error) {
        console.error('🔐 [AUTH STORE] Logout error:', error);
        // Still clear local state and redirect on error
        set({
          user: null,
          isLoading: false,
          error: null,
          errorAction: null,
          isAuthenticated: false,
          initialized: false
        });
        goto('/auth/login');
      }
    },

    // Update user data
    updateUser: (userData: Partial<User>) => {
      update(state => {
        if (state.user) {
          return {
            ...state,
            user: { ...state.user, ...userData }
          };
        }
        return state;
      });
    },

    // Register method - calls authService and handles response
    register: async (userData: {
      email: string;
      password: string;
      firstName?: string;
      lastName?: string;
      redirect?: string;
    }) => {
      if (!browser) return;

      update(state => ({ ...state, isLoading: true, error: null }));

      try {
        console.log('🔐 [AUTH STORE] Starting registration for:', userData.email);

        const response = await authService.register(userData);

        console.log('🔐 [AUTH STORE] Registration successful:', response.user);

        if (response.requiresEmailVerification) {
          update(state => ({
            ...state,
            user: null,
            isAuthenticated: false,
            isLoading: false,
            initialized: true,
            error: null,
            errorAction: null
          }));
          return response;
        }

        // Update auth store with user data
        update(state => ({
          ...state,
          user: response.user,
          isAuthenticated: true,
          isLoading: false,
          initialized: true,
          error: null,
          errorAction: null
        }));

        await identifyTikTokUser(response.user);

        // Force a complete page refresh to ensure server gets the cookie
        const redirectPath = resolvePostAuthRedirect();
        console.log('🔐 [AUTH STORE] Redirecting after register with refresh:', redirectPath);
        if (browser) {
          window.location.href = redirectPath;
        }

        return response;
      } catch (error) {
        console.error('🔐 [AUTH STORE] Registration error:', error);

        const errorMessage = getErrorMessage(
          error,
          'Registration failed. Please try again.'
        );
        const errorAction = getErrorAction(error);

        update(state => ({
          ...state,
          error: errorMessage,
          errorAction,
          isLoading: false
        }));

        throw error;
      }
    },

    // Login method - calls authService and handles response
    login: async (credentials: {
      email: string;
      password: string;
      rememberMe?: boolean;
    }) => {
      if (!browser) return;

      update(state => ({ ...state, isLoading: true, error: null }));

      try {
        console.log('🔐 [AUTH STORE] Starting login for:', credentials.email);

        const response = await authService.login(credentials);

        console.log('🔐 [AUTH STORE] Login successful:', response.user);

        // Update auth store with user data
        update(state => ({
          ...state,
          user: response.user,
          isAuthenticated: true,
          isLoading: false,
          initialized: true,
          error: null,
          errorAction: null
        }));

        await identifyTikTokUser(response.user);
        trackLogin('email', `user_${response.user.id}_login`);

        // Force a complete page refresh to ensure server gets the cookie
        const redirectPath = resolvePostAuthRedirect();
        console.log('🔐 [AUTH STORE] Redirecting after login with refresh:', redirectPath);
        if (browser) {
          window.location.href = redirectPath;
        }

        return response;
      } catch (error) {
        console.error('🔐 [AUTH STORE] Login error:', error);

        const errorMessage = getErrorMessage(
          error,
          'Login failed. Please try again.'
        );
        const errorAction = getErrorAction(error);

        update(state => ({
          ...state,
          error: errorMessage,
          errorAction,
          isLoading: false
        }));

        throw error;
      }
    },

    // Alias for init method - used for SSR hydration
    setUser: (user: User | null) => {
      console.log('🔐 [AUTH STORE] Hydrating with user:', user?.email);

      set({
        user,
        isLoading: false,
        error: null,
        errorAction: null,
        isAuthenticated: !!user,
        initialized: true
      });
    }
  };
}

// Create the auth store
export const auth = createAuthStore();

// Derived stores for convenience
export const user = derived(auth, $auth => $auth.user);
export const isAuthenticated = derived(auth, $auth => $auth.isAuthenticated);
export const isLoading = derived(auth, $auth => $auth.isLoading);
export const authError = derived(auth, $auth => $auth.error);
export const authErrorAction = derived(auth, $auth => $auth.errorAction);
