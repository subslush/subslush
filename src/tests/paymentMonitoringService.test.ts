import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';

// Configure Jest for enterprise-grade stability
jest.setTimeout(15000); // 15 second timeout for all tests

// Mock external dependencies before imports
jest.mock('../utils/nowpaymentsClient');
jest.mock('../config/redis');
jest.mock('../config/database');
jest.mock('../services/creditAllocationService');
jest.mock('../services/paymentFailureService');

import { paymentMonitoringService } from '../services/paymentMonitoringService';
import { creditAllocationService } from '../services/creditAllocationService';
import { paymentFailureService } from '../services/paymentFailureService';
import { nowpaymentsClient } from '../utils/nowpaymentsClient';
import { redisClient } from '../config/redis';
import { getDatabasePool } from '../config/database';

const mockNowPaymentsClient = nowpaymentsClient as jest.Mocked<
  typeof nowpaymentsClient
>;
const mockRedisClient = redisClient as jest.Mocked<typeof redisClient>;
const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;
const mockCreditAllocationService = creditAllocationService as jest.Mocked<
  typeof creditAllocationService
>;
const mockPaymentFailureService = paymentFailureService as jest.Mocked<
  typeof paymentFailureService
>;

// Mock Redis client
const mockRedis = {
  get: jest.fn<(key: string) => Promise<string | null>>(),
  setex:
    jest.fn<(key: string, ttl: number, value: string) => Promise<string>>(),
  del: jest.fn<(key: string) => Promise<number>>(),
  ping: jest.fn<() => Promise<string>>(),
  keys: jest.fn<(pattern: string) => Promise<string[]>>(),
};

// Mock database pool
const mockDbClient = {
  query: jest.fn<(sql: string, params?: any[]) => Promise<any>>(),
  release: jest.fn<() => void>(),
};

const mockPool = {
  query: jest.fn<(sql: string, params?: any[]) => Promise<any>>(),
  connect: jest
    .fn<() => Promise<typeof mockDbClient>>()
    .mockResolvedValue(mockDbClient),
};

// Helper function to setup database transaction mocks in a standardized way
const setupTransactionMocks = ({
  currentPaymentStatus,
  shouldFindPayment = true,
  shouldTriggerUpdate = true,
  userId = 'user-123',
  priceAmount = 100
}: {
  currentPaymentStatus: string;
  shouldFindPayment?: boolean;
  shouldTriggerUpdate?: boolean;
  userId?: string;
  priceAmount?: number;
}) => {
  // Reset all mocks first
  mockDbClient.query.mockReset();
  mockPool.query.mockReset();

  // Setup transaction flow
  mockDbClient.query
    .mockResolvedValueOnce({ rows: [] }) // BEGIN
    .mockResolvedValueOnce({
      // SELECT current payment
      rows: shouldFindPayment ? [{
        id: 'tx-123',
        user_id: userId,
        payment_status: currentPaymentStatus,
        metadata: JSON.stringify({}),
      }] : [],
    })
    .mockResolvedValueOnce({ rows: [] }) // UPDATE (if needed)
    .mockResolvedValueOnce({ rows: [] }); // COMMIT

  // If handlePaymentSuccess will be triggered (finished status + status change)
  if (shouldTriggerUpdate && currentPaymentStatus !== 'finished') {
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        user_id: userId,
        metadata: JSON.stringify({ priceAmount }),
      }],
    });
  }
};

// Helper function to create standard payment status mock
const createPaymentStatusMock = (overrides: Partial<any> = {}) => ({
  payment_id: 'payment-123',
  payment_status: 'finished' as const,
  pay_address: 'addr-123',
  price_amount: 100,
  price_currency: 'usd',
  pay_amount: 0.001,
  actually_paid: 0.001,
  pay_currency: 'btc',
  order_id: 'order-123',
  purchase_id: 'purchase-123',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  ...overrides,
});

describe('PaymentMonitoringService', () => {
  // Mock setTimeout to avoid real delays in tests
  beforeAll(() => {
    jest.spyOn(global, 'setTimeout').mockImplementation((callback) => {
      if (typeof callback === 'function') callback();
      return {} as any;
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    // Clear all mocks completely
    jest.clearAllMocks();
    jest.resetAllMocks();

    // Setup Redis mock with consistent behavior
    mockRedisClient.getClient.mockReturnValue(mockRedis as any);
    mockRedisClient.isConnected.mockReturnValue(true);

    // Reset Redis mock functions
    mockRedis.get.mockReset();
    mockRedis.setex.mockReset();
    mockRedis.del.mockReset();
    mockRedis.ping.mockReset();
    mockRedis.keys.mockReset();

    // Setup database mock with consistent behavior
    mockGetDatabasePool.mockReturnValue(mockPool as any);

    // Reset database mock functions
    mockDbClient.query.mockReset();
    mockDbClient.release.mockReset();
    mockPool.query.mockReset();
    mockPool.connect.mockReset().mockResolvedValue(mockDbClient);

    // Setup service mocks with enterprise-grade responses
    mockCreditAllocationService.allocateCreditsForPayment.mockResolvedValue({
      success: true,
      data: {
        creditAmount: 100,
        transactionId: 'tx-123',
        balanceAfter: 100,
        userId: 'user-123',
        paymentId: 'payment-123',
      },
    });

    mockPaymentFailureService.handlePaymentFailure.mockResolvedValue({
      success: true,
      data: {
        action: 'user_notified',
        notificationSent: true,
      },
    });

    mockPaymentFailureService.handleMonitoringFailure.mockResolvedValue();

    // Setup NOWPayments mock with default healthy state
    mockNowPaymentsClient.healthCheck.mockResolvedValue(true);
    mockNowPaymentsClient.getPaymentStatus.mockReset();
  });

  afterEach(async () => {
    // Ensure monitoring service is properly stopped to prevent interference
    if (paymentMonitoringService.isMonitoringActive()) {
      await paymentMonitoringService.stopMonitoring();
    }

    // Reset metrics to clean state
    paymentMonitoringService.resetMetrics();

    // Clear any remaining timers/intervals
    jest.clearAllTimers();
  });

  describe('Service Lifecycle', () => {
    it('should start monitoring service successfully', async () => {
      // Mock database response for pending payments
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            payment_id: 'payment-123',
            user_id: 'user-123',
            created_at: new Date(),
          },
        ],
      });

      mockRedis.setex.mockResolvedValue('OK');

      await paymentMonitoringService.startMonitoring();

      // Wait a bit for initialization
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(paymentMonitoringService.isMonitoringActive()).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('payment_status IN')
      );
      expect(mockRedis.setex).toHaveBeenCalled();
    }, 8000);

    it('should stop monitoring service successfully', async () => {
      // Start first
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockRedis.setex.mockResolvedValue('OK');

      await paymentMonitoringService.startMonitoring();
      await paymentMonitoringService.stopMonitoring();

      expect(paymentMonitoringService.isMonitoringActive()).toBe(false);
    });

    it('should not start monitoring if already running', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockRedis.setex.mockResolvedValue('OK');

      await paymentMonitoringService.startMonitoring();

      // Try to start again
      await paymentMonitoringService.startMonitoring();

      expect(paymentMonitoringService.isMonitoringActive()).toBe(true);
    });
  });

  describe('Payment Monitoring', () => {
    it('should monitor specific payment successfully', async () => {
      const mockPaymentStatus = createPaymentStatusMock({ payment_status: 'finished' });

      mockNowPaymentsClient.getPaymentStatus.mockResolvedValue(mockPaymentStatus);

      // Setup standardized database mocks
      setupTransactionMocks({
        currentPaymentStatus: 'pending', // Different from 'finished' to trigger update
        shouldTriggerUpdate: true
      });

      await paymentMonitoringService.monitorPayment('payment-123');

      expect(mockNowPaymentsClient.getPaymentStatus).toHaveBeenCalledWith(
        'payment-123'
      );
      expect(
        mockCreditAllocationService.allocateCreditsForPayment
      ).toHaveBeenCalledWith('user-123', 'payment-123', 100, mockPaymentStatus);
    }, 10000);

    it('should handle payment status update correctly', async () => {
      const mockPaymentStatus = createPaymentStatusMock({ payment_status: 'confirmed' });

      // Setup standardized database mocks
      setupTransactionMocks({
        currentPaymentStatus: 'pending', // Different status to trigger update
        shouldTriggerUpdate: false // confirmed status doesn't trigger handlePaymentSuccess
      });

      await paymentMonitoringService.processPaymentUpdate(mockPaymentStatus);

      expect(mockDbClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE credit_transactions'),
        expect.arrayContaining([
          'confirmed',
          undefined,
          expect.any(String),
          'payment-123',
        ])
      );
    }, 5000);

    it('should handle payment monitoring failure with retry', async () => {
      const error = new Error('API Error');
      mockNowPaymentsClient.getPaymentStatus.mockRejectedValue(error);

      // Setup database mocks
      setupTransactionMocks({
        currentPaymentStatus: 'pending',
        shouldFindPayment: false
      });

      // Test should complete without hanging - no Promise.race needed for error cases
      await paymentMonitoringService.monitorPayment('payment-123');

      expect(
        mockPaymentFailureService.handleMonitoringFailure
      ).toHaveBeenCalledWith('payment-123', 'API Error');
    }, 10000);

    it('should skip monitoring if payment status unchanged', async () => {
      const mockPaymentStatus = createPaymentStatusMock({ payment_status: 'pending' });

      // Setup transaction mocks for unchanged status (no update needed)
      mockDbClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          // SELECT current payment with same status
          rows: [{
            id: 'tx-123',
            user_id: 'user-123',
            payment_status: 'pending', // Same status as incoming
            metadata: JSON.stringify({}),
          }],
        })
        .mockResolvedValueOnce({ rows: [] }); // COMMIT (no update needed)

      await paymentMonitoringService.processPaymentUpdate(mockPaymentStatus);

      // Should not call allocation service since status didn't change
      expect(
        mockCreditAllocationService.allocateCreditsForPayment
      ).not.toHaveBeenCalled();
    }, 5000);
  });

  describe('Payment Success Handling', () => {
    it('should allocate credits for successful payment', async () => {
      const mockPaymentData = createPaymentStatusMock({ payment_status: 'finished' });

      // Mock database query for payment info
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            user_id: 'user-123',
            metadata: JSON.stringify({ priceAmount: 100 }),
          },
        ],
      });

      await (paymentMonitoringService as any).handlePaymentSuccess(mockPaymentData);

      expect(
        mockCreditAllocationService.allocateCreditsForPayment
      ).toHaveBeenCalledWith('user-123', 'payment-123', 100, mockPaymentData);
    }, 5000);
  });

  describe('Payment Failure Handling', () => {
    it('should handle payment failure correctly', async () => {
      const mockPaymentData = createPaymentStatusMock({
        payment_status: 'failed',
        actually_paid: 0
      });

      await (paymentMonitoringService as any).handlePaymentFailure(mockPaymentData);

      expect(
        mockPaymentFailureService.handlePaymentFailure
      ).toHaveBeenCalledWith(
        'payment-123',
        'failed',
        'Payment failed during monitoring'
      );
    }, 5000);
  });

  describe('Pending Payments Management', () => {
    it('should add pending payment to monitoring queue', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify([]));
      mockRedis.setex.mockResolvedValue('OK');

      await paymentMonitoringService.addPendingPayment(
        'payment-123',
        'user-123'
      );

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'payment_monitoring:pending_payments',
        3600,
        JSON.stringify([{ paymentId: 'payment-123', userId: 'user-123' }])
      );
    });

    it('should not add duplicate pending payment', async () => {
      const existingPayments = [
        { paymentId: 'payment-123', userId: 'user-123' },
      ];
      mockRedis.get.mockResolvedValue(JSON.stringify(existingPayments));

      await paymentMonitoringService.addPendingPayment(
        'payment-123',
        'user-123'
      );

      expect(mockRedis.setex).not.toHaveBeenCalled();
    });
  });

  describe('Metrics and Health', () => {
    it('should return service metrics', () => {
      const metrics = paymentMonitoringService.getMetrics();

      expect(metrics).toEqual({
        totalPaymentsMonitored: expect.any(Number),
        successfulUpdates: expect.any(Number),
        failedUpdates: expect.any(Number),
        creditsAllocated: expect.any(Number),
        lastRunTime: expect.any(Date),
        averageProcessingTime: expect.any(Number),
        isActive: expect.any(Boolean),
      });
    });

    it('should reset metrics correctly', () => {
      paymentMonitoringService.resetMetrics();
      const metrics = paymentMonitoringService.getMetrics();

      expect(metrics.totalPaymentsMonitored).toBe(0);
      expect(metrics.successfulUpdates).toBe(0);
      expect(metrics.failedUpdates).toBe(0);
      expect(metrics.creditsAllocated).toBe(0);
    });

    it('should pass health check when all dependencies are healthy', async () => {
      mockRedis.ping.mockResolvedValue('PONG');
      mockPool.query.mockResolvedValue({ rows: [] });
      mockNowPaymentsClient.healthCheck.mockResolvedValue(true);

      const isHealthy = await paymentMonitoringService.healthCheck();

      expect(isHealthy).toBe(true);
    });

    it('should fail health check when dependencies are unhealthy', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Redis error'));

      const isHealthy = await paymentMonitoringService.healthCheck();

      expect(isHealthy).toBe(false);
    });
  });

  describe('Manual Payment Check', () => {
    it('should trigger manual payment check successfully', async () => {
      const mockPaymentStatus = createPaymentStatusMock({ payment_status: 'finished' });

      mockNowPaymentsClient.getPaymentStatus.mockResolvedValue(mockPaymentStatus);

      // Setup standardized database mocks
      setupTransactionMocks({
        currentPaymentStatus: 'pending', // Different from 'finished' to trigger update
        shouldTriggerUpdate: true
      });

      const result = await paymentMonitoringService.triggerPaymentCheck('payment-123');

      expect(result).toBe(true);
      expect(mockNowPaymentsClient.getPaymentStatus).toHaveBeenCalledWith(
        'payment-123'
      );
    }, 8000);

    it('should handle manual payment check failure', async () => {
      mockNowPaymentsClient.getPaymentStatus.mockRejectedValue(
        new Error('API Error')
      );

      // Setup database mocks
      setupTransactionMocks({
        currentPaymentStatus: 'pending',
        shouldFindPayment: false
      });

      // Test should complete without hanging - error cases resolve quickly
      const result = await paymentMonitoringService.triggerPaymentCheck('payment-123');

      expect(result).toBe(false);
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      mockPool.connect.mockRejectedValue(
        new Error('Database connection failed')
      );

      const mockPaymentStatus = createPaymentStatusMock({ payment_status: 'finished' });

      // Add timeout and proper error handling
      const updatePromise = paymentMonitoringService.processPaymentUpdate(mockPaymentStatus);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Test timeout after 3 seconds')), 3000)
      );

      // Should not throw error, but handle gracefully
      await expect(
        Promise.race([updatePromise, timeoutPromise])
      ).rejects.toThrow(); // Database connection error should be caught and re-thrown
    }, 5000);

    it('should handle allocation service errors gracefully', async () => {
      const mockPaymentStatus = createPaymentStatusMock({ payment_status: 'finished' });

      // Mock successful database operations
      setupTransactionMocks({
        currentPaymentStatus: 'pending',
        shouldTriggerUpdate: true
      });

      // Mock allocation service failure
      mockCreditAllocationService.allocateCreditsForPayment.mockRejectedValue(
        new Error('Allocation service error')
      );

      mockNowPaymentsClient.getPaymentStatus.mockResolvedValue(mockPaymentStatus);

      // Should complete gracefully despite allocation error
      await expect(paymentMonitoringService.monitorPayment('payment-123')).resolves.not.toThrow();

      expect(mockCreditAllocationService.allocateCreditsForPayment).toHaveBeenCalled();
    }, 10000);

    it('should handle Redis connection errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));

      // Should not throw error, but return empty array
      const pendingPayments = await (
        paymentMonitoringService as any
      ).getPendingPayments();
      expect(pendingPayments).toEqual([]);
    });
  });

  describe('Integration Tests', () => {
    it('should complete full payment monitoring cycle without hanging', async () => {
      const mockPaymentStatus = createPaymentStatusMock({ payment_status: 'finished' });

      mockNowPaymentsClient.getPaymentStatus.mockResolvedValue(mockPaymentStatus);

      // Setup comprehensive mocks for full cycle
      setupTransactionMocks({
        currentPaymentStatus: 'pending',
        shouldTriggerUpdate: true
      });

      // Ensure allocation service responds quickly
      mockCreditAllocationService.allocateCreditsForPayment.mockResolvedValue({
        success: true,
        data: {
          creditAmount: 100,
          transactionId: 'tx-123',
          balanceAfter: 100,
          userId: 'user-123',
          paymentId: 'payment-123',
        },
      });

      // Test complete monitoring flow
      const startTime = Date.now();
      await paymentMonitoringService.monitorPayment('payment-123');
      const duration = Date.now() - startTime;

      // Verify all expected calls were made
      expect(mockNowPaymentsClient.getPaymentStatus).toHaveBeenCalledWith('payment-123');
      expect(mockCreditAllocationService.allocateCreditsForPayment).toHaveBeenCalledWith(
        'user-123', 'payment-123', 100, mockPaymentStatus
      );

      // Ensure test completed quickly (no hanging)
      expect(duration).toBeLessThan(3000);
    }, 5000);
  });
});
