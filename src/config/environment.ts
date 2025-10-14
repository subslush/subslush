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
  SUPABASE_URL: z.string().url('Invalid Supabase URL format'),
  SUPABASE_ANON_KEY: z.string().min(1, 'Supabase anonymous key is required'),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, 'Supabase service role key is required'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().default(0),
  REDIS_TTL_DEFAULT: z.coerce.number().default(3600),
  REDIS_SESSION_TTL: z.coerce.number().default(86400),
  REDIS_MAX_RETRIES: z.coerce.number().default(3),
  REDIS_RETRY_DELAY: z.coerce.number().default(1000),
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  JWT_EXPIRY: z.coerce.number().default(86400),
  JWT_ALGORITHM: z.enum(['HS256', 'RS256']).default('HS256'),
  COOKIE_SECRET: z
    .string()
    .min(16, 'Cookie secret must be at least 16 characters')
    .default('your-secret-key-change-in-production'),
  SESSION_ENCRYPTION_KEY: z
    .string()
    .length(32, 'Session encryption key must be exactly 32 characters'),
  SESSION_IV_LENGTH: z.coerce.number().default(16),
  MAX_SESSIONS_PER_USER: z.coerce.number().default(5),
  SESSION_CLEANUP_INTERVAL: z.coerce.number().default(3600),
  NOWPAYMENTS_API_KEY: z.string().min(1, 'NOWPayments API key is required'),
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
});

function validateEnvironment(): EnvironmentConfig {
  try {
    const parsed = environmentSchema.parse(process.env);

    // Log critical configuration values for debugging in development only
    if (parsed.NODE_ENV === 'development') {
      // Environment configuration loaded
      // NODE_ENV, NOWPAYMENTS_SANDBOX_MODE, NOWPAYMENTS_BASE_URL validated
    }

    // Validate production configuration
    if (
      parsed.NODE_ENV === 'production' &&
      parsed.NOWPAYMENTS_SANDBOX_MODE === true
    ) {
      // Warning: Production environment detected but NOWPayments is in sandbox mode
    }

    return parsed;
  } catch (error) {
    // Environment validation failed - exiting
    process.stderr.write(`Environment validation failed: ${error}\n`);
    process.exit(1);
  }
}

export const env = validateEnvironment();
