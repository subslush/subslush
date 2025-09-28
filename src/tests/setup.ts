// Test setup file for Jest
// This file runs before all tests

import { Logger } from '../utils/logger';

// Extend Jest timeout for Redis operations
jest.setTimeout(30000);

// Mock environment variables for testing
process.env['NODE_ENV'] = 'test';
process.env['REDIS_HOST'] = 'localhost';
process.env['REDIS_PORT'] = '6379';
process.env['REDIS_PASSWORD'] = '';
process.env['REDIS_DB'] = '1'; // Use DB 1 for tests to avoid conflicts
process.env['REDIS_TTL_DEFAULT'] = '3600';
process.env['REDIS_SESSION_TTL'] = '86400';
process.env['REDIS_MAX_RETRIES'] = '3';
process.env['REDIS_RETRY_DELAY'] = '1000';

// JWT environment variables
process.env['JWT_SECRET'] = 'test-jwt-secret-key-for-testing-purposes-only';
process.env['JWT_EXPIRY'] = '86400';
process.env['JWT_ALGORITHM'] = 'HS256';

// Session encryption environment variables
process.env['SESSION_ENCRYPTION_KEY'] = 'test-session-encryption-key-32ch';
process.env['SESSION_IV_LENGTH'] = '16';
process.env['MAX_SESSIONS_PER_USER'] = '5';
process.env['SESSION_CLEANUP_INTERVAL'] = '3600';

// Supabase environment variables
process.env['SUPABASE_URL'] = 'https://test-project.supabase.co';
process.env['SUPABASE_ANON_KEY'] = 'test-anon-key-for-testing-purposes-only';

// Database environment (not used in Redis tests but required by environment validation)
process.env['DB_HOST'] = 'localhost';
process.env['DB_PORT'] = '6432';
process.env['DB_DATABASE'] = 'test_db';
process.env['DB_USER'] = 'test_user';
process.env['DB_PASSWORD'] = 'test_password';

// Payment monitoring environment variables for fast testing
process.env['PAYMENT_RETRY_ATTEMPTS'] = '2';
process.env['PAYMENT_RETRY_DELAY'] = '100'; // 100ms instead of 5000ms
process.env['PAYMENT_MONITORING_INTERVAL'] = '1000';
process.env['PAYMENT_MONITORING_BATCH_SIZE'] = '10';

Logger.info('🧪 Test environment setup complete');
