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
  SUPABASE_URL: z.string().url('Invalid Supabase URL format'),
  SUPABASE_ANON_KEY: z.string().min(1, 'Supabase anonymous key is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'Supabase service role key is required'),
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
