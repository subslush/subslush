import { config } from 'dotenv';
import { z } from 'zod';
import { EnvironmentConfig } from '../types/environment';

config();

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z
    .string()
    .transform(val => parseInt(val, 10))
    .default('3001'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z
    .string()
    .transform(val => parseInt(val, 10))
    .default('6432'),
  DB_DATABASE: z.string().default('subscription_platform'),
  DB_USER: z.string().default('subscription_user'),
  DB_PASSWORD: z.string().min(1, 'Database password is required'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z
    .string()
    .transform(val => parseInt(val, 10))
    .default('6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z
    .string()
    .transform(val => parseInt(val, 10))
    .default('0'),
  REDIS_TTL_DEFAULT: z
    .string()
    .transform(val => parseInt(val, 10))
    .default('3600'),
  REDIS_SESSION_TTL: z
    .string()
    .transform(val => parseInt(val, 10))
    .default('86400'),
  REDIS_MAX_RETRIES: z
    .string()
    .transform(val => parseInt(val, 10))
    .default('3'),
  REDIS_RETRY_DELAY: z
    .string()
    .transform(val => parseInt(val, 10))
    .default('1000'),
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  JWT_EXPIRY: z
    .string()
    .transform(val => parseInt(val, 10))
    .default('86400'),
  JWT_ALGORITHM: z.enum(['HS256', 'RS256']).default('HS256'),
  SESSION_ENCRYPTION_KEY: z.string().length(32, 'Session encryption key must be exactly 32 characters'),
  SESSION_IV_LENGTH: z
    .string()
    .transform(val => parseInt(val, 10))
    .default('16'),
  MAX_SESSIONS_PER_USER: z
    .string()
    .transform(val => parseInt(val, 10))
    .default('5'),
  SESSION_CLEANUP_INTERVAL: z
    .string()
    .transform(val => parseInt(val, 10))
    .default('3600'),
  SUPABASE_URL: z.string().url('Valid Supabase URL is required'),
  SUPABASE_ANON_KEY: z.string().min(1, 'Supabase anonymous key is required'),
});

function validateEnvironment(): EnvironmentConfig {
  try {
    return environmentSchema.parse(process.env);
  } catch (error) {
    console.error('Environment validation failed:', error);
    process.exit(1);
  }
}

export const env = validateEnvironment();
