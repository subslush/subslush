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
}
