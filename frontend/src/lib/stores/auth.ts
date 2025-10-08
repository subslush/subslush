import { writable, derived, get } from 'svelte/store';
import { goto } from '$app/navigation';
import { browser } from '$app/environment';
import { authService } from '$lib/api/auth.js';

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  initialized: boolean;
}

const initialState: AuthState = {
  user: null,
  isLoading: false,
  error: null,
  isAuthenticated: false,
  initialized: false
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
          error: null
        }));
      } catch (error: any) {
        console.error('🔐 [AUTH STORE] Session refresh failed:', error);

        // If refresh fails, user is not authenticated
        update(s => ({
          ...s,
          user: null,
          isAuthenticated: false,
          isLoading: false,
          initialized: true,
          error: null
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
        isAuthenticated: !!user,
        initialized: true
      });
    },

    // Set loading state
    setLoading: (isLoading: boolean) => {
      update(state => ({ ...state, isLoading, error: null }));
    },

    // Set error state
    setError: (error: string | null) => {
      update(state => ({ ...state, error, isLoading: false }));
    },

    // Clear error
    clearError: () => {
      update(state => ({ ...state, error: null }));
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