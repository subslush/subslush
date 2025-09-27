/**
 * Comprehensive Test Type Infrastructure
 *
 * Production-grade TypeScript definitions for all mock interfaces and test utilities.
 * Provides type-safe mock factories and builders for consistent testing patterns.
 */

import { jest } from '@jest/globals';
import type { NOWPaymentsPaymentStatus, PaymentStatus } from './payment';
// Database and Redis type imports handled locally to avoid dependency issues
import type { QueryResult } from 'pg';

// Database Mock Types
export interface MockQueryResult<T = any> {
  rows: T[];
  rowCount: number;
  command: string;
  oid: number;
  fields: any[];
}

export interface MockPoolClient {
  query: jest.MockedFunction<(text: string, params?: any[]) => Promise<MockQueryResult>>;
  release: jest.MockedFunction<() => void>;
}

export interface MockDatabasePool {
  query: jest.MockedFunction<(text: string, params?: any[]) => Promise<MockQueryResult>>;
  connect: jest.MockedFunction<() => Promise<MockPoolClient>>;
  end: jest.MockedFunction<() => Promise<void>>;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

// Redis Mock Types
export interface MockRedisClient {
  get: jest.MockedFunction<(key: string) => Promise<string | null>>;
  set: jest.MockedFunction<(key: string, value: string) => Promise<string>>;
  setex: jest.MockedFunction<(key: string, seconds: number, value: string) => Promise<string>>;
  del: jest.MockedFunction<(key: string) => Promise<number>>;
  ping: jest.MockedFunction<() => Promise<string>>;
  keys: jest.MockedFunction<(pattern: string) => Promise<string[]>>;
  exists: jest.MockedFunction<(key: string) => Promise<number>>;
  expire: jest.MockedFunction<(key: string, seconds: number) => Promise<number>>;
  ttl: jest.MockedFunction<(key: string) => Promise<number>>;
  isConnected: boolean;
  isReady: boolean;
}

// Service Mock Types
export interface MockCreditAllocationService {
  allocateCreditsForPayment: jest.MockedFunction<any>;
  manualCreditAllocation: jest.MockedFunction<any>;
  getPendingAllocations: jest.MockedFunction<any>;
  getMetrics: jest.MockedFunction<any>;
  resetMetrics: jest.MockedFunction<any>;
  healthCheck: jest.MockedFunction<any>;
}

export interface MockPaymentFailureService {
  handlePaymentFailure: jest.MockedFunction<any>;
  handleMonitoringFailure: jest.MockedFunction<any>;
  manualRetryPayment: jest.MockedFunction<any>;
  getFailedPayments: jest.MockedFunction<any>;
  getMetrics: jest.MockedFunction<any>;
  resetMetrics: jest.MockedFunction<any>;
  cleanupOldFailures: jest.MockedFunction<any>;
  healthCheck: jest.MockedFunction<any>;
}

export interface MockPaymentMonitoringService {
  startMonitoring: jest.MockedFunction<any>;
  stopMonitoring: jest.MockedFunction<any>;
  isMonitoringActive: jest.MockedFunction<any>;
  monitorPayment: jest.MockedFunction<any>;
  addPendingPayment: jest.MockedFunction<any>;
  triggerPaymentCheck: jest.MockedFunction<any>;
  getMetrics: jest.MockedFunction<any>;
  resetMetrics: jest.MockedFunction<any>;
  healthCheck: jest.MockedFunction<any>;
}

export interface MockRefundService {
  initiateRefund: jest.MockedFunction<any>;
  approveRefund: jest.MockedFunction<any>;
  rejectRefund: jest.MockedFunction<any>;
  manualRefund: jest.MockedFunction<any>;
  getPendingRefunds: jest.MockedFunction<any>;
  getAllRefunds: jest.MockedFunction<any>;
  getRefundStatistics: jest.MockedFunction<any>;
  getMetrics: jest.MockedFunction<any>;
  resetMetrics: jest.MockedFunction<any>;
  cleanupOldRefunds: jest.MockedFunction<any>;
  healthCheck: jest.MockedFunction<any>;
}

export interface MockNOWPaymentsClient {
  getPaymentStatus: jest.MockedFunction<(paymentId: string) => Promise<NOWPaymentsPaymentStatus>>;
  createPayment: jest.MockedFunction<any>;
  getPaymentHistory: jest.MockedFunction<any>;
  healthCheck: jest.MockedFunction<() => Promise<boolean>>;
}

// Test Data Interfaces
export interface TestPaymentData {
  payment_id: string;
  payment_status: PaymentStatus;
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  actually_paid: number;
  pay_currency: string;
  order_id: string;
  purchase_id: string;
  created_at: string;
  updated_at: string;
  payin_hash?: string;
  outcome_amount?: number;
  outcome_currency?: string;
}

export interface TestCreditTransaction {
  id: string;
  user_id: string;
  amount: number;
  payment_id?: string;
  payment_status: PaymentStatus;
  created_at: Date;
  updated_at: Date;
  metadata: Record<string, unknown>;
  monitoring_status?: string;
  last_monitored_at?: Date;
  retry_count?: number;
  next_retry_at?: Date;
}

export interface TestRefundRequest {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'processing' | 'completed' | 'failed' | 'rejected';
  payment_id?: string;
  requested_by: string;
  requested_at: Date;
  approved_by?: string;
  approved_at?: Date;
  processed_at?: Date;
  rejected_by?: string;
  rejected_at?: Date;
  rejection_reason?: string;
  metadata: Record<string, unknown>;
}

// Mock Factory Functions
export const createMockDatabasePool = (): MockDatabasePool => ({
  query: jest.fn(),
  connect: jest.fn(),
  end: jest.fn(),
  totalCount: 10,
  idleCount: 8,
  waitingCount: 0,
});

export const createMockPoolClient = (): MockPoolClient => ({
  query: jest.fn(),
  release: jest.fn(),
});

export const createMockRedisClient = (): MockRedisClient => ({
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  ping: jest.fn(),
  keys: jest.fn(),
  exists: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
  isConnected: true,
  isReady: true,
});

export const createMockQueryResult = <T>(rows: T[] = [], rowCount?: number): MockQueryResult<T> => ({
  rows,
  rowCount: rowCount ?? rows.length,
  command: 'SELECT',
  oid: 0,
  fields: [],
});

// Test Data Factories
export const createTestNOWPaymentsResponse = (
  overrides: Partial<NOWPaymentsPaymentStatus> = {}
): NOWPaymentsPaymentStatus => ({
  payment_id: 'payment-123',
  payment_status: 'waiting',
  pay_address: 'bc1qtest123456789',
  price_amount: 100,
  price_currency: 'usd',
  pay_amount: 0.001,
  actually_paid: 0,
  pay_currency: 'btc',
  order_id: 'order-123',
  purchase_id: 'purchase-123',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  payin_hash: '',
  outcome_amount: 100,
  outcome_currency: 'usd',
  ...overrides,
});

export const createTestCreditTransaction = (
  overrides: Partial<TestCreditTransaction> = {}
): TestCreditTransaction => ({
  id: 'tx-123',
  user_id: 'user-123',
  amount: 100,
  payment_id: 'payment-123',
  payment_status: 'pending',
  created_at: new Date('2024-01-01T00:00:00Z'),
  updated_at: new Date('2024-01-01T00:00:00Z'),
  metadata: {},
  monitoring_status: 'active',
  last_monitored_at: new Date('2024-01-01T00:00:00Z'),
  retry_count: 0,
  next_retry_at: new Date(),
  ...overrides,
});

export const createTestRefundRequest = (
  overrides: Partial<TestRefundRequest> = {}
): TestRefundRequest => ({
  id: 'refund-123',
  user_id: 'user-123',
  amount: 50,
  reason: 'user_request',
  status: 'pending',
  payment_id: 'payment-123',
  requested_by: 'user-123',
  requested_at: new Date('2024-01-01T00:00:00Z'),
  metadata: {},
  ...overrides,
});

export const createTestPaymentData = (
  overrides: Partial<TestPaymentData> = {}
): TestPaymentData => ({
  payment_id: 'payment-123',
  payment_status: 'waiting',
  pay_address: 'bc1qtest123456789',
  price_amount: 100,
  price_currency: 'usd',
  pay_amount: 0.001,
  actually_paid: 0,
  pay_currency: 'btc',
  order_id: 'order-123',
  purchase_id: 'purchase-123',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  payin_hash: '',
  outcome_amount: 100,
  outcome_currency: 'usd',
  ...overrides,
});

// Utility functions for test setup
export const setupDatabaseMocks = (mockPool: MockDatabasePool, mockClient: MockPoolClient) => {
  mockPool.connect.mockResolvedValue(mockClient);
  mockPool.query.mockResolvedValue(createMockQueryResult([]));
  mockClient.query.mockResolvedValue(createMockQueryResult([]));
  mockClient.release.mockImplementation(() => {});
};

export const setupRedisMocks = (mockRedis: MockRedisClient) => {
  mockRedis.get.mockResolvedValue(null);
  mockRedis.set.mockResolvedValue('OK');
  mockRedis.setex.mockResolvedValue('OK');
  mockRedis.del.mockResolvedValue(1);
  mockRedis.ping.mockResolvedValue('PONG');
  mockRedis.keys.mockResolvedValue([]);
  mockRedis.exists.mockResolvedValue(0);
  mockRedis.expire.mockResolvedValue(1);
  mockRedis.ttl.mockResolvedValue(-1);
};

export const setupServiceMocks = () => {
  return {
    creditAllocation: {
      allocateCreditsForPayment: jest.fn(),
      manualCreditAllocation: jest.fn(),
      getPendingAllocations: jest.fn(),
      getMetrics: jest.fn(),
      resetMetrics: jest.fn(),
      healthCheck: jest.fn(),
    } as MockCreditAllocationService,
    paymentFailure: {
      handlePaymentFailure: jest.fn(),
      handleMonitoringFailure: jest.fn(),
      manualRetryPayment: jest.fn(),
      getFailedPayments: jest.fn(),
      getMetrics: jest.fn(),
      resetMetrics: jest.fn(),
      cleanupOldFailures: jest.fn(),
      healthCheck: jest.fn(),
    } as MockPaymentFailureService,
    paymentMonitoring: {
      startMonitoring: jest.fn(),
      stopMonitoring: jest.fn(),
      isMonitoringActive: jest.fn(),
      monitorPayment: jest.fn(),
      addPendingPayment: jest.fn(),
      triggerPaymentCheck: jest.fn(),
      getMetrics: jest.fn(),
      resetMetrics: jest.fn(),
      healthCheck: jest.fn(),
    } as MockPaymentMonitoringService,
    refund: {
      initiateRefund: jest.fn(),
      approveRefund: jest.fn(),
      rejectRefund: jest.fn(),
      manualRefund: jest.fn(),
      getPendingRefunds: jest.fn(),
      getAllRefunds: jest.fn(),
      getRefundStatistics: jest.fn(),
      getMetrics: jest.fn(),
      resetMetrics: jest.fn(),
      cleanupOldRefunds: jest.fn(),
      healthCheck: jest.fn(),
    } as MockRefundService,
  };
};

// Type assertion helpers for Jest mocks
export const asMockedFunction = <T extends (...args: any[]) => any>(fn: T): jest.MockedFunction<T> =>
  fn as jest.MockedFunction<T>;

export const asMockedObject = <T extends Record<string, any>>(obj: T): jest.Mocked<T> =>
  obj as jest.Mocked<T>;