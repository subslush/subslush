import { writable, derived } from 'svelte/store';
import { goto } from '$app/navigation';
import { browser } from '$app/environment';

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
}

const initialState: AuthState = {
  user: null,
  isLoading: false,
  error: null
};

function createAuthStore(initialUser: User | null = null) {
  const { subscribe, set, update } = writable<AuthState>({
    ...initialState,
    user: initialUser
  });

  return {
    subscribe,

    // Initialize with user data from server
    init: (user: User | null) => {
      set({
        user,
        isLoading: false,
        error: null
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
        // Call logout endpoint (will clear HTTP-only cookie)
        const response = await fetch('/api/v1/auth/logout', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ allDevices: false })
        });

        // Clear local state regardless of API response
        set({
          user: null,
          isLoading: false,
          error: null
        });

        // Redirect to home
        goto('/');
      } catch (error) {
        console.error('Logout error:', error);
        // Still clear local state and redirect on error
        set({
          user: null,
          isLoading: false,
          error: null
        });
        goto('/');
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
export const isAuthenticated = derived(auth, $auth => !!$auth.user);
export const isLoading = derived(auth, $auth => $auth.isLoading);
export const authError = derived(auth, $auth => $auth.error);