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
  },
  SUBSCRIPTIONS: {
    AVAILABLE: '/subscriptions/available',
    VALIDATE: '/subscriptions/validate-purchase',
    PURCHASE: '/subscriptions/purchase',
    MY_SUBSCRIPTIONS: '/subscriptions/my-subscriptions',
    DETAILS: '/subscriptions'
  },
  CREDITS: {
    BALANCE: '/credits/balance'
  }
} as const;

export const ROUTES = {
  HOME: '/',
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register'
  },
  DASHBOARD: '/dashboard',
  PROFILE: '/profile',
  SUBSCRIPTIONS: {
    BROWSE: '/dashboard/subscriptions',
    MY_SUBSCRIPTIONS: '/dashboard/subscriptions/active'
  },
  CREDITS: '/dashboard/credits'
} as const;

export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection and try again.',
  INVALID_CREDENTIALS: 'Invalid email or password.',
  EMAIL_EXISTS: 'An account with this email already exists.',
  SESSION_EXPIRED: 'Your session has expired. Please log in again.',
  VALIDATION_ERROR: 'Please fix the errors below and try again.',
  GENERIC_ERROR: 'Something went wrong. Please try again later.',
  TOKEN_REFRESH_FAILED: 'Unable to refresh your session. Please log in again.',
  INSUFFICIENT_CREDITS: 'You do not have enough credits for this purchase.',
  SUBSCRIPTION_EXISTS: 'You already have an active subscription for this service.',
  PURCHASE_FAILED: 'Failed to complete the purchase. Please try again.',
  LOAD_PLANS_FAILED: 'Failed to load subscription plans. Please refresh the page.',
  LOAD_SUBSCRIPTIONS_FAILED: 'Failed to load your subscriptions. Please refresh the page.'
} as const;

export const SUCCESS_MESSAGES = {
  REGISTRATION_SUCCESS: 'Registration successful! Welcome to the platform.',
  LOGIN_SUCCESS: 'Login successful! Welcome back.',
  LOGOUT_SUCCESS: 'You have been logged out successfully.',
  SESSION_REFRESHED: 'Your session has been refreshed.',
  PURCHASE_SUCCESS: 'Subscription purchased successfully!',
  SUBSCRIPTION_CANCELLED: 'Subscription cancelled successfully.'
} as const;

export const PASSWORD_REQUIREMENTS = {
  MIN_LENGTH: 8,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_NUMBERS: true,
  REQUIRE_SYMBOLS: true
} as const;
