export const API_CONFIG = {
  BASE_URL: '/api/v1',
  API_VERSION: 'v1',
  TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3
} as const;

export const API_ENDPOINTS = {
  AUTH: {
    REGISTER: '/auth/register',
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    SESSIONS: '/auth/sessions'
  }
} as const;

export const ROUTES = {
  HOME: '/',
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register'
  },
  DASHBOARD: '/dashboard',
  PROFILE: '/profile'
} as const;

export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection and try again.',
  INVALID_CREDENTIALS: 'Invalid email or password.',
  EMAIL_EXISTS: 'An account with this email already exists.',
  SESSION_EXPIRED: 'Your session has expired. Please log in again.',
  VALIDATION_ERROR: 'Please fix the errors below and try again.',
  GENERIC_ERROR: 'Something went wrong. Please try again later.',
  TOKEN_REFRESH_FAILED: 'Unable to refresh your session. Please log in again.'
} as const;

export const SUCCESS_MESSAGES = {
  REGISTRATION_SUCCESS: 'Registration successful! Welcome to the platform.',
  LOGIN_SUCCESS: 'Login successful! Welcome back.',
  LOGOUT_SUCCESS: 'You have been logged out successfully.',
  SESSION_REFRESHED: 'Your session has been refreshed.'
} as const;

export const PASSWORD_REQUIREMENTS = {
  MIN_LENGTH: 8,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_NUMBERS: true,
  REQUIRE_SYMBOLS: true
} as const;
