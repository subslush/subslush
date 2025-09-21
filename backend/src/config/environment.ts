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
