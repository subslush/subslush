// Test setup file for Jest
// This file runs before all tests

// Extend Jest timeout for Redis operations
jest.setTimeout(30000);

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.REDIS_PASSWORD = '';
process.env.REDIS_DB = '1'; // Use DB 1 for tests to avoid conflicts
process.env.REDIS_TTL_DEFAULT = '3600';
process.env.REDIS_SESSION_TTL = '86400';
process.env.REDIS_MAX_RETRIES = '3';
process.env.REDIS_RETRY_DELAY = '1000';

// Database environment (not used in Redis tests but required by environment validation)
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '6432';
process.env.DB_DATABASE = 'test_db';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';

console.log('🧪 Test environment setup complete');