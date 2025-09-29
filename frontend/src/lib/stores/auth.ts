import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { authService } from '$lib/api/auth.js';
import { storage, STORAGE_KEYS } from '$lib/utils/storage.js';
import { ROUTES, ERROR_MESSAGES, SUCCESS_MESSAGES } from '$lib/utils/constants.js';
import type { AuthState, User, LoginRequest, RegisterRequest } from '$lib/types/auth.js';

const initialState: AuthState = {
  user: null,
  accessToken: null,
  sessionId: null,
  isAuthenticated: false,
  isLoading: false,
  error: null
};

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>(initialState);

  let refreshTimer: NodeJS.Timeout | null = null;

  const setLoading = (isLoading: boolean) => {
    update(state => ({ ...state, isLoading, error: null }));
  };

  const setError = (error: string | null) => {
    update(state => ({ ...state, error, isLoading: false }));
  };

  const setAuthData = (user: User, accessToken: string, sessionId: string, rememberMe = false) => {
    // Store in localStorage
    storage.set(STORAGE_KEYS.AUTH_TOKEN, accessToken);
    storage.set(STORAGE_KEYS.SESSION_ID, sessionId);
    storage.set(STORAGE_KEYS.USER_DATA, JSON.stringify(user));

    if (rememberMe) {
      storage.set(STORAGE_KEYS.REMEMBER_ME, 'true');
    }

    // Update store
    set({
      user,
      accessToken,
      sessionId,
      isAuthenticated: true,
      isLoading: false,
      error: null
    });

    // Schedule token refresh (refresh 1 minute before expiry - tokens expire in 5 minutes)
    scheduleTokenRefresh();
  };

  const clearAuthData = () => {
    storage.remove(STORAGE_KEYS.AUTH_TOKEN);
    storage.remove(STORAGE_KEYS.SESSION_ID);
    storage.remove(STORAGE_KEYS.USER_DATA);
    storage.remove(STORAGE_KEYS.REMEMBER_ME);

    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }

    set(initialState);
  };

  const scheduleTokenRefresh = () => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    // Refresh token after 4 minutes (tokens expire in 5 minutes)
    refreshTimer = setTimeout(async () => {
      try {
        await refreshSession();
      } catch (error) {
        console.error('Failed to refresh token:', error);
        await logout();
      }
    }, 4 * 60 * 1000); // 4 minutes
  };

  const loadPersistedAuth = () => {
    if (!browser) return;

    const token = storage.get(STORAGE_KEYS.AUTH_TOKEN);
    const sessionId = storage.get(STORAGE_KEYS.SESSION_ID);
    const userData = storage.get(STORAGE_KEYS.USER_DATA);

    if (token && sessionId && userData) {
      try {
        const user = JSON.parse(userData);
        set({
          user,
          accessToken: token,
          sessionId,
          isAuthenticated: true,
          isLoading: false,
          error: null
        });
        scheduleTokenRefresh();
      } catch (error) {
        console.error('Failed to parse stored user data:', error);
        clearAuthData();
      }
    }
  };

  const register = async (data: RegisterRequest): Promise<void> => {
    setLoading(true);

    try {
      const response = await authService.register(data);
      setAuthData(response.user, response.accessToken, response.sessionId);

      if (browser) {
        goto(ROUTES.DASHBOARD);
      }
    } catch (error: any) {
      const errorMessage = error?.message || ERROR_MESSAGES.GENERIC_ERROR;
      setError(errorMessage);
      throw error;
    }
  };

  const login = async (data: LoginRequest): Promise<void> => {
    setLoading(true);

    try {
      const response = await authService.login(data);
      setAuthData(response.user, response.accessToken, response.sessionId, data.rememberMe);

      if (browser) {
        goto(ROUTES.DASHBOARD);
      }
    } catch (error: any) {
      const errorMessage = error?.message || ERROR_MESSAGES.INVALID_CREDENTIALS;
      setError(errorMessage);
      throw error;
    }
  };

  const logout = async (allDevices = false): Promise<void> => {
    setLoading(true);

    try {
      await authService.logout({ allDevices });
      clearAuthData();

      if (browser) {
        goto(ROUTES.HOME);
      }
    } catch (error: any) {
      // Even if logout fails on server, clear local auth data
      clearAuthData();

      if (browser) {
        goto(ROUTES.HOME);
      }

      console.error('Logout error:', error);
    }
  };

  const refreshSession = async (): Promise<void> => {
    try {
      const response = await authService.refreshSession();
      const currentState = get({ subscribe });

      if (currentState.user) {
        setAuthData(response.user, response.accessToken, response.sessionId);
      }
    } catch (error: any) {
      console.error('Session refresh failed:', error);
      clearAuthData();

      if (browser) {
        goto(ROUTES.AUTH.LOGIN);
      }

      throw error;
    }
  };

  const checkAuthStatus = async (): Promise<boolean> => {
    const currentState = get({ subscribe });

    if (!currentState.accessToken) {
      return false;
    }

    try {
      await refreshSession();
      return true;
    } catch (error) {
      return false;
    }
  };

  const updateUser = (userData: Partial<User>) => {
    update(state => {
      if (state.user) {
        const updatedUser = { ...state.user, ...userData };
        storage.set(STORAGE_KEYS.USER_DATA, JSON.stringify(updatedUser));
        return { ...state, user: updatedUser };
      }
      return state;
    });
  };

  // Initialize auth state from localStorage on browser
  if (browser) {
    loadPersistedAuth();
  }

  return {
    subscribe,
    register,
    login,
    logout,
    refreshSession,
    checkAuthStatus,
    updateUser,
    clearError: () => setError(null),
    // Export internal functions for testing
    _setAuthData: setAuthData,
    _clearAuthData: clearAuthData,
    _loadPersistedAuth: loadPersistedAuth
  };
}

export const auth = createAuthStore();

// Derived stores for convenient access
export const user = derived(auth, $auth => $auth.user);
export const isAuthenticated = derived(auth, $auth => $auth.isAuthenticated);
export const isLoading = derived(auth, $auth => $auth.isLoading);
export const authError = derived(auth, $auth => $auth.error);