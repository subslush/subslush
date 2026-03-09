import { config } from 'dotenv';
import { z } from 'zod';
import { EnvironmentConfig } from '../types/environment';

config();

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3001),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().default(6432),
  DB_DATABASE: z.string().default('subscription_platform'),
  DB_USER: z.string().default('subscription_user'),
  DB_PASSWORD: z.string().min(1, 'Database password is required'),
  DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: z.coerce.number().default(120000),
  SUPABASE_URL: z.string().url('Invalid Supabase URL format'),
  SUPABASE_ANON_KEY: z.string().min(1, 'Supabase anonymous key is required'),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, 'Supabase service role key is required'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().default(0),
  REDIS_RATE_LIMIT_DB: z.coerce.number().optional(),
  REDIS_TTL_DEFAULT: z.coerce.number().default(3600),
  REDIS_SESSION_TTL: z.coerce.number().default(86400),
  REDIS_MAX_RETRIES: z.coerce.number().default(3),
  REDIS_RETRY_DELAY: z.coerce.number().default(1000),
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  JWT_EXPIRY: z.coerce.number().default(86400),
  JWT_ALGORITHM: z.enum(['HS256', 'RS256']).default('HS256'),
  STRIPE_ENABLED: z
    .union([z.string(), z.boolean()])
    .optional()
    .default(true)
    .transform(val => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') {
        if (val.toLowerCase() === 'true') return true;
        if (val.toLowerCase() === 'false') return false;
      }
      return true;
    }),
  STRIPE_SECRET_KEY: z.preprocess(
    value => (typeof value === 'string' ? value.trim() : value),
    z.string().optional()
  ).default(''),
  STRIPE_WEBHOOK_SECRET: z.preprocess(
    value => (typeof value === 'string' ? value.trim() : value),
    z.string().optional()
  ).default(''),
  PAY4BIT_ENABLED: z
    .union([z.string(), z.boolean()])
    .optional()
    .default(false)
    .transform(val => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') {
        if (val.toLowerCase() === 'true') return true;
        if (val.toLowerCase() === 'false') return false;
      }
      return false;
    }),
  PAY4BIT_PUBLIC_KEY: z.preprocess(
    value => (typeof value === 'string' ? value.trim() : value),
    z.string().optional()
  ).default(''),
  PAY4BIT_SECRET_KEY: z.preprocess(
    value => (typeof value === 'string' ? value.trim() : value),
    z.string().optional()
  ).default(''),
  PAY4BIT_CALLBACK_URL: z.preprocess(
    value => (typeof value === 'string' ? value.trim() : value),
    z.string().optional()
  ).default(''),
  PAY4BIT_BASE_URL: z.preprocess(
    value => (typeof value === 'string' ? value.trim() : value),
    z.string().optional()
  ).default(''),
  COOKIE_SECRET: z
    .string()
    .min(16, 'Cookie secret must be at least 16 characters')
    .default('your-secret-key-change-in-production'),
  SESSION_ENCRYPTION_KEY: z
    .string()
    .length(32, 'Session encryption key must be exactly 32 characters'),
  SESSION_IV_LENGTH: z.coerce.number().default(16),
  CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .length(32, 'Credentials encryption key must be exactly 32 characters'),
  CREDENTIALS_IV_LENGTH: z.coerce.number().default(12),
  MAX_SESSIONS_PER_USER: z.coerce.number().default(5),
  SESSION_CLEANUP_INTERVAL: z.coerce.number().default(3600),
  NOWPAYMENTS_API_KEY: z.string().min(1, 'NOWPayments API key is required'),
  NOWPAYMENTS_SANDBOX_API_KEY: z.preprocess(
    value =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().min(1).optional()
  ),
  NOWPAYMENTS_IPN_SECRET: z
    .string()
    .min(1, 'NOWPayments IPN secret is required'),
  NOWPAYMENTS_BASE_URL: z
    .string()
    .url()
    .default('https://api.nowpayments.io/v1'),
  NOWPAYMENTS_SANDBOX_MODE: z
    .union([z.string(), z.boolean()])
    .optional()
    .default(false)
    .transform(val => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') {
        if (val.toLowerCase() === 'true') return true;
        if (val.toLowerCase() === 'false') return false;
      }
      return false;
    }),
  NOWPAYMENTS_WEBHOOK_URL: z.string().url('Invalid webhook URL format'),
  NOWPAYMENTS_CURRENCY_CACHE_TTL: z.coerce.number().default(3600),
  NOWPAYMENTS_CURRENCY_LKG_TTL: z.coerce.number().default(86400),
  NOWPAYMENTS_CURRENCY_REFRESH_INTERVAL: z.coerce.number().default(900000),
  CURRENCYAPI_KEY: z.preprocess(
    value => (typeof value === 'string' ? value.trim() : value),
    z.string().optional()
  ).default(''),
  FX_ENGINE_ENABLED: z
    .union([z.string(), z.boolean()])
    .optional()
    .default(false)
    .transform(val => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') {
        if (val.toLowerCase() === 'true') return true;
        if (val.toLowerCase() === 'false') return false;
      }
      return false;
    }),
  FX_FETCH_JOB_ENABLED: z
    .union([z.string(), z.boolean()])
    .optional()
    .default(false)
    .transform(val => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') {
        if (val.toLowerCase() === 'true') return true;
        if (val.toLowerCase() === 'false') return false;
      }
      return false;
    }),
  FX_PUBLISH_JOB_ENABLED: z
    .union([z.string(), z.boolean()])
    .optional()
    .default(false)
    .transform(val => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') {
        if (val.toLowerCase() === 'true') return true;
        if (val.toLowerCase() === 'false') return false;
      }
      return false;
    }),
  FX_FETCH_SCHEDULE_CRON: z.string().default('0 0 * * *'),
  FX_PUBLISH_SCHEDULE_CRON: z.string().default('59 23 * * 0'),
  FX_RATE_STALE_MINUTES: z.coerce.number().int().positive().default(1560),
  FX_RATE_MAX_STALE_MINUTES: z.coerce.number()
    .int()
    .positive()
    .default(2880),
  FX_ROUNDING_RULE_VERSION: z
    .string()
    .min(1)
    .default('2026-02-v1'),
  PASSWORD_RESET_REDIRECT_URL: z.preprocess(
    value =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().url().optional()
  ),
  APP_BASE_URL: z.preprocess(
    value =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().url().optional()
  ),
  TIKTOK_EVENTS_ACCESS_TOKEN: z.preprocess(
    value =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().optional()
  ),
  TIKTOK_EVENTS_TEST_CODE: z.preprocess(
    value =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().optional()
  ),
  TIKTOK_PIXEL_ID: z
    .preprocess(
      value =>
        typeof value === 'string' && value.trim() === '' ? undefined : value,
      z.string().optional()
    )
    .default('D62CLGJC77U8OPSUBNLG'),
  EMAIL_PROVIDER: z.enum(['smtp', 'console', 'resend']).default('console'),
  EMAIL_FROM: z.preprocess(
    value =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().optional()
  ),
  EMAIL_REPLY_TO: z.preprocess(
    value =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().email().optional()
  ),
  RESEND_API_KEY: z.preprocess(
    value =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().optional()
  ),
  SMTP_HOST: z.preprocess(
    value =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().optional()
  ),
  SMTP_PORT: z.preprocess(
    value =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.coerce.number().optional()
  ),
  SMTP_SECURE: z
    .union([z.string(), z.boolean()])
    .optional()
    .default(false)
    .transform(val => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') {
        if (val.toLowerCase() === 'true') return true;
        if (val.toLowerCase() === 'false') return false;
      }
      return false;
    }),
  SMTP_USER: z.preprocess(
    value =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().optional()
  ),
  SMTP_PASSWORD: z.preprocess(
    value =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().optional()
  ),
  SMTP_CONNECTION_TIMEOUT: z.coerce.number().default(10000),
  SMTP_GREETING_TIMEOUT: z.coerce.number().default(10000),
  SMTP_SOCKET_TIMEOUT: z.coerce.number().default(10000),
  PASSWORD_RESET_EMAIL_SUBJECT: z
    .string()
    .min(1)
    .default('Reset your password'),
  CATALOG_DB_PRICING: z
    .union([z.string(), z.boolean()])
    .optional()
    .default(true)
    .transform(val => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') {
        if (val.toLowerCase() === 'true') return true;
        if (val.toLowerCase() === 'false') return false;
      }
      return true;
    }),
  COUPON_RESERVATION_MINUTES: z.coerce.number().default(30),
  CHECKOUT_ABANDON_TTL_MINUTES: z.preprocess(
    value =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.coerce.number().optional()
  ),
  CHECKOUT_ABANDON_SWEEP_INTERVAL: z.coerce.number().default(300000),
  CHECKOUT_ABANDON_SWEEP_BATCH_SIZE: z.coerce.number().default(100),

  // Payment Monitoring Configuration
  PAYMENT_MONITORING_INTERVAL: z.coerce.number().default(30000),
  PAYMENT_MONITORING_BATCH_SIZE: z.coerce.number().default(50),
  PAYMENT_RETRY_ATTEMPTS: z.coerce.number().default(3),
  PAYMENT_RETRY_DELAY: z.coerce.number().default(5000),

  // Credit Allocation Settings
  CREDIT_ALLOCATION_RATE: z.coerce.number().default(1.0),
  CREDIT_ALLOCATION_TIMEOUT: z.coerce.number().default(30000),

  // Refund Processing Configuration
  REFUND_APPROVAL_REQUIRED: z
    .union([z.string(), z.boolean()])
    .optional()
    .default(true)
    .transform(val => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') {
        if (val.toLowerCase() === 'true') return true;
        if (val.toLowerCase() === 'false') return false;
      }
      return true;
    }),
  REFUND_PROCESSING_TIMEOUT: z.coerce.number().default(300000),

  // Background Jobs / Monitors
  JOBS_ENABLED: z
    .union([z.string(), z.boolean()])
    .optional()
    .default(true)
    .transform(val => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') {
        if (val.toLowerCase() === 'true') return true;
        if (val.toLowerCase() === 'false') return false;
      }
      return true;
    }),
  PAYMENT_MONITORING_AUTO_START: z
    .union([z.string(), z.boolean()])
    .optional()
    .default(true)
    .transform(val => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') {
        if (val.toLowerCase() === 'true') return true;
        if (val.toLowerCase() === 'false') return false;
      }
      return true;
    }),
  SUBSCRIPTION_RENEWAL_INTERVAL: z.coerce.number().default(300000),
  SUBSCRIPTION_RENEWAL_LOOKAHEAD_MINUTES: z.coerce.number().default(1440),
  SUBSCRIPTION_RENEWAL_BATCH_SIZE: z.coerce.number().default(50),
  SUBSCRIPTION_RENEWAL_RETRY_MINUTES: z.coerce.number().default(60),
  SUBSCRIPTION_EXPIRY_INTERVAL: z.coerce.number().default(3600000),
  SUBSCRIPTION_REMINDER_INTERVAL: z.coerce.number().default(3600000),
  UPGRADE_SELECTION_REMINDER_INTERVAL: z.coerce.number().default(3600000),
  MANUAL_MONTHLY_UPGRADE_INTERVAL: z.coerce.number().default(86400000),
  PIN_LOCKOUT_MONITOR_INTERVAL: z.coerce.number().default(300000),
  SUBSCRIPTION_DATA_QUALITY_INTERVAL: z.coerce.number().default(3600000),
  ORDER_ALLOCATION_RECONCILIATION_INTERVAL: z.coerce.number().default(86400000),
  CONTEST_PRIZE_INTERVAL: z.coerce.number().default(86400000),
  VIRAL_METRICS_INTERVAL: z.coerce.number().default(86400000),
  EMAIL_VERIFICATION_SYNC_INTERVAL: z.coerce.number().default(300000),
  EMAIL_VERIFICATION_SYNC_BATCH_SIZE: z.coerce.number().default(200),
});

function isValidAbsoluteUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function validateEnvironment(): EnvironmentConfig {
  try {
    const rawPasswordReset = process.env['PASSWORD_RESET_REDIRECT_URL'];
    if (
      typeof rawPasswordReset === 'string' &&
      rawPasswordReset.trim() === ''
    ) {
      process.stderr.write(
        'Warning: PASSWORD_RESET_REDIRECT_URL is set but empty; treating as undefined.\n'
      );
    }

    const parsed = environmentSchema.parse(process.env);
    const withRedisDefaults = {
      ...parsed,
      REDIS_RATE_LIMIT_DB: parsed.REDIS_RATE_LIMIT_DB ?? parsed.REDIS_DB,
    };
    const withCheckoutDefaults = {
      ...withRedisDefaults,
      CHECKOUT_ABANDON_TTL_MINUTES:
        withRedisDefaults.CHECKOUT_ABANDON_TTL_MINUTES ??
        withRedisDefaults.COUPON_RESERVATION_MINUTES,
    };

    if (parsed.REDIS_RATE_LIMIT_DB === undefined) {
      process.stderr.write(
        `Warning: REDIS_RATE_LIMIT_DB is not set; using REDIS_DB (${parsed.REDIS_DB}). ` +
          'Rate limit keys will share the same Redis database as sessions.\n'
      );
    }

    const withTestOverrides = applyTestOverrides(withCheckoutDefaults);

    if (withTestOverrides.STRIPE_ENABLED) {
      const missing: string[] = [];
      if (!withTestOverrides.STRIPE_SECRET_KEY) missing.push('STRIPE_SECRET_KEY');
      if (!withTestOverrides.STRIPE_WEBHOOK_SECRET) {
        missing.push('STRIPE_WEBHOOK_SECRET');
      }
      if (missing.length > 0) {
        throw new Error(
          `Stripe configuration missing required fields: ${missing.join(', ')}`
        );
      }
    }

    if (withTestOverrides.PAY4BIT_ENABLED) {
      const missing: string[] = [];
      if (!withTestOverrides.PAY4BIT_PUBLIC_KEY) {
        missing.push('PAY4BIT_PUBLIC_KEY');
      }
      if (!withTestOverrides.PAY4BIT_SECRET_KEY) {
        missing.push('PAY4BIT_SECRET_KEY');
      }
      if (!withTestOverrides.PAY4BIT_CALLBACK_URL) {
        missing.push('PAY4BIT_CALLBACK_URL');
      }
      if (!withTestOverrides.PAY4BIT_BASE_URL) {
        missing.push('PAY4BIT_BASE_URL');
      }
      if (!withTestOverrides.CURRENCYAPI_KEY) {
        missing.push('CURRENCYAPI_KEY');
      }
      if (missing.length > 0) {
        throw new Error(
          `Pay4bit/FX configuration missing required fields: ${missing.join(', ')}`
        );
      }
      if (!isValidAbsoluteUrl(withTestOverrides.PAY4BIT_CALLBACK_URL)) {
        throw new Error('PAY4BIT_CALLBACK_URL must be a valid URL');
      }
      if (!isValidAbsoluteUrl(withTestOverrides.PAY4BIT_BASE_URL)) {
        throw new Error('PAY4BIT_BASE_URL must be a valid URL');
      }
    }

    if (
      withTestOverrides.FX_FETCH_JOB_ENABLED ||
      withTestOverrides.FX_PUBLISH_JOB_ENABLED
    ) {
      if (!withTestOverrides.FX_ENGINE_ENABLED) {
        throw new Error(
          'FX_ENGINE_ENABLED must be true when FX_FETCH_JOB_ENABLED or FX_PUBLISH_JOB_ENABLED is true'
        );
      }
    }

    if (withTestOverrides.FX_ENGINE_ENABLED && !withTestOverrides.CURRENCYAPI_KEY) {
      throw new Error('CURRENCYAPI_KEY is required when FX_ENGINE_ENABLED is true');
    }

    if (
      withTestOverrides.FX_RATE_MAX_STALE_MINUTES <
      withTestOverrides.FX_RATE_STALE_MINUTES
    ) {
      throw new Error(
        'FX_RATE_MAX_STALE_MINUTES must be greater than or equal to FX_RATE_STALE_MINUTES'
      );
    }

    // Log critical configuration values for debugging in development only
    if (withTestOverrides.NODE_ENV === 'development') {
      // Environment configuration loaded
      // NODE_ENV, NOWPAYMENTS_SANDBOX_MODE, NOWPAYMENTS_BASE_URL validated
    }

    // Validate production configuration
    if (
      withTestOverrides.NODE_ENV === 'production' &&
      withTestOverrides.NOWPAYMENTS_SANDBOX_MODE === true
    ) {
      // Warning: Production environment detected but NOWPayments is in sandbox mode
    }

    if (
      withTestOverrides.NODE_ENV === 'production' &&
      withTestOverrides.EMAIL_PROVIDER === 'console'
    ) {
      throw new Error('EMAIL_PROVIDER must not be console in production');
    }

    if (withTestOverrides.EMAIL_PROVIDER === 'smtp') {
      const missing: string[] = [];
      if (!withTestOverrides.EMAIL_FROM) missing.push('EMAIL_FROM');
      if (!withTestOverrides.SMTP_HOST) missing.push('SMTP_HOST');
      if (!withTestOverrides.SMTP_PORT) missing.push('SMTP_PORT');
      if (missing.length > 0) {
        throw new Error(
          `SMTP email configuration missing required fields: ${missing.join(', ')}`
        );
      }

      if (
        (withTestOverrides.SMTP_USER && !withTestOverrides.SMTP_PASSWORD) ||
        (!withTestOverrides.SMTP_USER && withTestOverrides.SMTP_PASSWORD)
      ) {
        throw new Error(
          'SMTP_USER and SMTP_PASSWORD must be set together when using SMTP auth'
        );
      }
    }

    if (withTestOverrides.EMAIL_PROVIDER === 'resend') {
      const missing: string[] = [];
      if (!withTestOverrides.EMAIL_FROM) missing.push('EMAIL_FROM');
      if (!withTestOverrides.RESEND_API_KEY) missing.push('RESEND_API_KEY');
      if (missing.length > 0) {
        throw new Error(
          `Resend email configuration missing required fields: ${missing.join(', ')}`
        );
      }
    }

    return withTestOverrides;
  } catch (error) {
    // Environment validation failed - exiting
    process.stderr.write(`Environment validation failed: ${error}\n`);
    process.exit(1);
  }
}

function applyTestOverrides(config: EnvironmentConfig): EnvironmentConfig {
  const isTestEnv =
    config.NODE_ENV === 'test' || process.env['JEST_WORKER_ID'] !== undefined;

  if (!isTestEnv) {
    return config;
  }

  const overrides: Partial<EnvironmentConfig> = {
    PAYMENT_MONITORING_INTERVAL: 100,
    PAYMENT_RETRY_ATTEMPTS: 1,
    PAYMENT_RETRY_DELAY: 50,
    JOBS_ENABLED: false,
    PAYMENT_MONITORING_AUTO_START: false,
  };

  return {
    ...config,
    ...overrides,
  };
}

export const env = validateEnvironment();
