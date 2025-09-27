module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  // Module mocking for problematic ESM packages
  moduleNameMapper: {
    '^uuid$': '<rootDir>/src/tests/__mocks__/uuid.ts'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/tests/**/*.ts',
  ],
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.ts'],
  testTimeout: 30000, // 30 seconds for Redis operations
  maxWorkers: 1, // Run tests sequentially to avoid Redis conflicts
};