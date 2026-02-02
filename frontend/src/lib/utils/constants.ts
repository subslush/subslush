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
    CONFIRM_EMAIL: '/auth/confirm',
    VERIFIED_TRACK: '/auth/verified/track',
    PASSWORD_RESET: '/auth/password-reset',
    PASSWORD_RESET_CONFIRM: '/auth/password-reset/confirm',
    SESSIONS: '/auth/sessions'
  },
  DASHBOARD: {
    OVERVIEW: '/dashboard/overview',
    PRELAUNCH_REWARDS: '/dashboard/prelaunch-rewards',
    PRELAUNCH_REWARDS_CLAIM: '/dashboard/prelaunch-rewards/claim',
    PRELAUNCH_VOUCHERS_CLAIM: '/dashboard/prelaunch-rewards/vouchers/claim'
  },
  SUBSCRIPTIONS: {
    AVAILABLE: '/subscriptions/available',
    PRODUCTS_AVAILABLE: '/subscriptions/products/available',
    PRODUCT_DETAIL: '/subscriptions/products',
    VALIDATE: '/subscriptions/validate-purchase',
    PURCHASE: '/subscriptions/purchase',
    MY_SUBSCRIPTIONS: '/subscriptions/my-subscriptions',
    DETAILS: '/subscriptions',
    AUTO_RENEW_ENABLE: '/subscriptions',
    AUTO_RENEW_CONFIRM: '/subscriptions',
    AUTO_RENEW_DISABLE: '/subscriptions',
    RENEWAL_CHECKOUT: '/subscriptions'
  },
  CREDITS: {
    BALANCE: '/credits/balance',
    HISTORY: '/credits/history'
  },
  ORDERS: {
    LIST: '/orders'
  },
  NOTIFICATIONS: {
    LIST: '/notifications',
    READ: '/notifications/read',
    CLEAR: '/notifications'
  },
  NEWSLETTER: {
    SUBSCRIBE: '/newsletter/subscribe'
  },
  BIS: {
    SUBMIT: '/bis/inquiries'
  },
  PAYMENTS: {
    CREATE: '/payments/create-payment',
    STATUS: '/payments/status',
    CURRENCIES: '/payments/currencies',
    ESTIMATE: '/payments/estimate',
    MIN_AMOUNT: '/payments/min-amount',
    HISTORY: '/payments/history',
    CHECKOUT: '/payments/checkout',
    CHECKOUT_CANCEL: '/payments/checkout/cancel',
    QUOTE: '/payments/quote'
  },
  USERS: {
    PROFILE: '/users/profile',
    PASSWORD: '/users/password',
    PIN_STATUS: '/users/pin/status',
    PIN_SET: '/users/pin/set',
    PIN_VERIFY: '/users/pin/verify',
    PIN_RESET: '/users/pin/reset-request'
  },
  ADMIN: {
    OVERVIEW: '/admin/overview',
    PRODUCTS: '/admin/products',
    PRODUCT_VARIANTS: '/admin/product-variants',
    PRODUCT_VARIANT_TERMS: '/admin/product-variant-terms',
    PRODUCT_LABELS: '/admin/product-labels',
    PRODUCT_MEDIA: '/admin/product-media',
    PRICE_HISTORY: '/admin/price-history',
    ORDERS: '/admin/orders',
    PAYMENTS: '/admin/payments',
    SUBSCRIPTIONS: '/admin/subscriptions',
    CREDITS: '/admin/credits',
    USERS: '/admin/users',
    REWARDS: '/admin/rewards',
    TASKS: '/admin/tasks',
    PRELAUNCH_REWARD_TASKS: '/admin/tasks/prelaunch-rewards',
    MIGRATION: '/admin/migration',
    COUPONS: '/admin/coupons',
    NOTIFICATIONS: '/admin/notifications',
    BIS: '/admin/bis',
    PIN_RESET: '/admin/pin-reset'
  }
} as const;

export const ROUTES = {
  HOME: '/',
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    FORGOT_PASSWORD: '/auth/forgot-password',
    RESET_PASSWORD: '/auth/reset-password'
  },
  DASHBOARD: '/dashboard',
  SETTINGS: '/dashboard/settings',
  ADMIN: '/admin',
  SUBSCRIPTIONS: {
    MY_SUBSCRIPTIONS: '/dashboard/subscriptions'
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
