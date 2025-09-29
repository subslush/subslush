import { browser } from '$app/environment';

export const storage = {
  get: (key: string): string | null => {
    if (!browser) return null;
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn('Failed to read from localStorage:', error);
      return null;
    }
  },

  set: (key: string, value: string): void => {
    if (!browser) return;
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn('Failed to write to localStorage:', error);
    }
  },

  remove: (key: string): void => {
    if (!browser) return;
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('Failed to remove from localStorage:', error);
    }
  },

  clear: (): void => {
    if (!browser) return;
    try {
      localStorage.clear();
    } catch (error) {
      console.warn('Failed to clear localStorage:', error);
    }
  }
};

export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  SESSION_ID: 'session_id',
  USER_DATA: 'user_data',
  REMEMBER_ME: 'remember_me'
} as const;