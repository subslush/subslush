import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { authService } from '$lib/api/auth.js';
import { storage, STORAGE_KEYS } from '$lib/utils/storage.js';
import { ROUTES, ERROR_MESSAGES } from '$lib/utils/constants.js';
import type { AuthState, User, LoginRequest, RegisterRequest } from '$lib/types/auth.js';

const initialState: AuthState = {
  user: null,
  accessToken: null,
  sessionId: null,
  isAuthenticated: false,
  isLoading: false,
  error: null
};

// CRITICAL FIX: Auth initialization state to prevent redirect loops
let authInitialized = false;
let authInitPromise: Promise<void> | null = null;

function createAuthStore() {
  const { subscribe, set, update } = writable<AuthState>(initialState);

  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  const setLoading = (isLoading: boolean) => {
    console.log(`🔄 [AUTH STORE] setLoading(${isLoading}) called`);
    update(state => {
      const newState = { ...state, isLoading, error: null };
      console.log('🔄 [AUTH STORE] Store updated:', {
        oldLoading: state.isLoading,
        newLoading: newState.isLoading
      });
      return newState;
    });
  };

  const setError = (error: string | null) => {
    console.log(`⚠️ [AUTH STORE] setError("${error}") called`);
    update(state => {
      const newState = { ...state, error, isLoading: false };
      console.log('⚠️ [AUTH STORE] Store updated:', {
        oldError: state.error,
        newError: newState.error,
        oldLoading: state.isLoading,
        newLoading: newState.isLoading
      });
      return newState;
    });
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
    console.log('🧹 [AUTH] clearAuthData() called - clearing all auth state');
    storage.remove(STORAGE_KEYS.AUTH_TOKEN);
    storage.remove(STORAGE_KEYS.SESSION_ID);
    storage.remove(STORAGE_KEYS.USER_DATA);
    storage.remove(STORAGE_KEYS.REMEMBER_ME);

    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }

    // CRITICAL FIX: Reset initialization flag so auth can be re-initialized
    authInitialized = false;
    authInitPromise = null;
    console.log('🧹 [AUTH] Reset authInitialized flag and promise');

    set(initialState);
    console.log('🧹 [AUTH] Auth store reset to initial state');
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

  const loadPersistedAuth = async (): Promise<void> => {
    console.log('🔷 [AUTH] loadPersistedAuth() started');
    if (!browser) {
      console.log('🔷 [AUTH] Not in browser, skipping');
      authInitialized = true;
      return;
    }

    // CRITICAL FIX: Ensure this only runs once and is properly awaitable
    if (authInitialized) {
      console.log('🔷 [AUTH] Already initialized, returning');
      return;
    }
    if (authInitPromise) {
      console.log('🔷 [AUTH] Initialization in progress, awaiting...');
      return authInitPromise;
    }

    console.log('🔷 [AUTH] Starting new initialization...');
    authInitPromise = (async () => {
      const token = storage.get(STORAGE_KEYS.AUTH_TOKEN);
      const sessionId = storage.get(STORAGE_KEYS.SESSION_ID);
      const userData = storage.get(STORAGE_KEYS.USER_DATA);

      console.log('🔷 [AUTH] Stored credentials:', {
        hasToken: !!token,
        hasSessionId: !!sessionId,
        hasUserData: !!userData,
        tokenPreview: token ? `${token.substring(0, 10)}...` : null
      });

      if (token && sessionId && userData) {
        try {
          const user = JSON.parse(userData);
          console.log('🔷 [AUTH] Parsed user data:', { userId: user.id, email: user.email });

          // Set loading state while validating
          console.log('🔷 [AUTH] Setting loading state for validation...');
          update(state => ({ ...state, isLoading: true }));

          // CRITICAL FIX: Validate the token with the backend before trusting it
          try {
            console.log('🔷 [AUTH] Validating stored token with backend...');
            // Try to refresh/validate the session
            const response = await authService.refreshSession();
            console.log('✅ [AUTH] Token validation successful:', { userId: response.user.id });

            // If successful, set the auth data with new token
            set({
              user: response.user,
              accessToken: response.accessToken,
              sessionId: response.sessionId,
              isAuthenticated: true,
              isLoading: false,
              error: null
            });

            // Store updated token
            storage.set(STORAGE_KEYS.AUTH_TOKEN, response.accessToken);
            storage.set(STORAGE_KEYS.SESSION_ID, response.sessionId);
            storage.set(STORAGE_KEYS.USER_DATA, JSON.stringify(response.user));

            scheduleTokenRefresh();
            console.log('✅ [AUTH] Auth initialized: authenticated');
          } catch (validationError) {
            console.warn('❌ [AUTH] Token validation failed:', validationError);
            // Token is invalid or expired - clear everything
            clearAuthData();
            console.log('🔷 [AUTH] Auth initialized: unauthenticated (invalid token)');
          }
        } catch (error) {
          console.error('❌ [AUTH] Failed to parse stored auth data:', error);
          clearAuthData();
          console.log('🔷 [AUTH] Auth initialized: unauthenticated (parse error)');
        }
      } else {
        console.log('🔷 [AUTH] No stored credentials found');
        // No stored auth data
        update(state => ({ ...state, isLoading: false }));
        console.log('🔷 [AUTH] Auth initialized: no stored data');
      }

      authInitialized = true;
      console.log('✅ [AUTH] Auth initialization completed');
    })();

    return authInitPromise;
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
      // CRITICAL FIX: Ensure loading state is cleared immediately and reliably
      // Extract error message from various possible error formats
      let errorMessage: string = ERROR_MESSAGES.GENERIC_ERROR;

      // CRITICAL FIX: Handle both direct ApiError objects and Axios error objects
      if (error?.message && typeof error.message === 'string') {
        // Direct ApiError object from API client
        errorMessage = error.message;
      } else if (error?.response?.data?.message) {
        // Axios error format
        errorMessage = error.response.data.message;
      } else if (error?.response?.data?.error) {
        // Axios error format with error field
        errorMessage = error.response.data.error;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      console.log('🔧 [AUTH] Setting registration error message:', errorMessage);

      // CRITICAL FIX: Single state update to ensure consistency
      setError(errorMessage); // This sets both error and isLoading: false

      console.error('Registration failed:', error);
    }
  };

  const login = async (data: LoginRequest): Promise<void> => {
    console.log('🔵 [AUTH] Login started:', { email: data.email, rememberMe: data.rememberMe });
    setLoading(true);
    console.log('🔵 [AUTH] Loading state set to TRUE');

    try {
      console.log('🔵 [AUTH] Calling authService.login...');
      const response = await authService.login(data);
      console.log('✅ [AUTH] Login API call successful:', { userId: response.user.id });

      setAuthData(response.user, response.accessToken, response.sessionId, data.rememberMe);
      console.log('✅ [AUTH] Auth data set, navigating to dashboard...');

      if (browser) {
        goto(ROUTES.DASHBOARD);
      }
    } catch (error: any) {
      console.error('❌ [AUTH] Login failed - ERROR CAUGHT:', error);
      console.error('❌ [AUTH] Error structure:', {
        hasResponse: !!error?.response,
        hasResponseData: !!error?.response?.data,
        responseData: error?.response?.data,
        errorMessage: error?.message,
        errorType: typeof error,
        fullError: error
      });

      // Extract error message from various possible error formats
      let errorMessage: string = ERROR_MESSAGES.INVALID_CREDENTIALS;

      // CRITICAL FIX: Handle both direct ApiError objects and Axios error objects
      if (error?.message && typeof error.message === 'string') {
        // Direct ApiError object from API client
        errorMessage = error.message;
      } else if (error?.response?.data?.message) {
        // Axios error format
        errorMessage = error.response.data.message;
      } else if (error?.response?.data?.error) {
        // Axios error format with error field
        errorMessage = error.response.data.error;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      console.log('🔧 [AUTH] Setting error message and clearing loading state:', errorMessage);

      // CRITICAL FIX: Single state update to ensure consistency
      setError(errorMessage); // This sets both error and isLoading: false

      // CHECK: Verify the store state after setting error
      const currentState = get({ subscribe });
      console.log('🔍 [AUTH] Current store state after error:', {
        isLoading: currentState.isLoading,
        error: currentState.error,
        isAuthenticated: currentState.isAuthenticated
      });
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

  // CRITICAL FIX: Helper function to ensure auth is initialized
  const ensureAuthInitialized = async (): Promise<void> => {
    console.log('🔐 [AUTH] ensureAuthInitialized() called, authInitialized:', authInitialized);
    if (!authInitialized) {
      console.log('🔐 [AUTH] Auth not initialized, calling loadPersistedAuth()...');
      await loadPersistedAuth();
      console.log('🔐 [AUTH] loadPersistedAuth() completed');
    } else {
      console.log('🔐 [AUTH] Auth already initialized');
    }
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
    ensureAuthInitialized,
    // Export internal functions for testing
    _setAuthData: setAuthData,
    _clearAuthData: clearAuthData,
    _loadPersistedAuth: loadPersistedAuth,
    // TESTING: Manual refresh trigger
    _manualRefresh: refreshSession
  };
}

export const auth = createAuthStore();

// Derived stores for convenient access
export const user = derived(auth, $auth => $auth.user);
export const isAuthenticated = derived(auth, $auth => $auth.isAuthenticated);
export const isLoading = derived(auth, $auth => $auth.isLoading);
export const authError = derived(auth, $auth => $auth.error);