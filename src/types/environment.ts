export interface EnvironmentConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  DB_HOST: string;
  DB_PORT: number;
  DB_DATABASE: string;
  DB_USER: string;
  DB_PASSWORD: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string | undefined;
  REDIS_DB: number;
  REDIS_TTL_DEFAULT: number;
  REDIS_SESSION_TTL: number;
  REDIS_MAX_RETRIES: number;
  REDIS_RETRY_DELAY: number;
  JWT_SECRET: string;
  JWT_EXPIRY: number;
  JWT_ALGORITHM: 'HS256' | 'RS256';
  COOKIE_SECRET: string;
  SESSION_ENCRYPTION_KEY: string;
  SESSION_IV_LENGTH: number;
  MAX_SESSIONS_PER_USER: number;
  SESSION_CLEANUP_INTERVAL: number;
  NOWPAYMENTS_API_KEY: string;
  NOWPAYMENTS_IPN_SECRET: string;
  NOWPAYMENTS_BASE_URL: string;
  NOWPAYMENTS_SANDBOX_MODE: boolean;
  NOWPAYMENTS_WEBHOOK_URL: string;

  // Payment Monitoring Configuration
  PAYMENT_MONITORING_INTERVAL: number;
  PAYMENT_MONITORING_BATCH_SIZE: number;
  PAYMENT_RETRY_ATTEMPTS: number;
  PAYMENT_RETRY_DELAY: number;

  // Credit Allocation Settings
  CREDIT_ALLOCATION_RATE: number;
  CREDIT_ALLOCATION_TIMEOUT: number;

  // Refund Processing Configuration
  REFUND_APPROVAL_REQUIRED: boolean;
  REFUND_PROCESSING_TIMEOUT: number;
}
