import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { paymentMonitoringService } from '../services/paymentMonitoringService';
import { creditAllocationService } from '../services/creditAllocationService';
import { paymentFailureService } from '../services/paymentFailureService';
import { nowpaymentsClient } from '../utils/nowpaymentsClient';
import { redisClient } from '../config/redis';
import { getDatabasePool } from '../config/database';

// Mock external dependencies
jest.mock('../utils/nowpaymentsClient');
jest.mock('../config/redis');
jest.mock('../config/database');
jest.mock('../services/creditAllocationService');
jest.mock('../services/paymentFailureService');

const mockNowPaymentsClient = nowpaymentsClient as jest.Mocked<typeof nowpaymentsClient>;
const mockRedisClient = redisClient as jest.Mocked<typeof redisClient>;
const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<typeof getDatabasePool>;
const mockCreditAllocationService = creditAllocationService as jest.Mocked<typeof creditAllocationService>;
const mockPaymentFailureService = paymentFailureService as jest.Mocked<typeof paymentFailureService>;

// Mock Redis client
const mockRedis = {
  get: jest.fn<(key: string) => Promise<string | null>>(),
  setex: jest.fn<(key: string, ttl: number, value: string) => Promise<string>>(),
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
  connect: jest.fn<() => Promise<typeof mockDbClient>>().mockResolvedValue(mockDbClient),
};

describe('PaymentMonitoringService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup Redis mock
    mockRedisClient.getClient.mockReturnValue(mockRedis as any);
    mockRedisClient.isConnected.mockReturnValue(true);

    // Setup database mock
    mockGetDatabasePool.mockReturnValue(mockPool as any);

    // Setup service mocks
    mockCreditAllocationService.allocateCreditsForPayment.mockResolvedValue({
      success: true,
      data: {
        creditAmount: 100,
        transactionId: 'tx-123',
        balanceAfter: 100,
        userId: 'user-123',
        paymentId: 'payment-123'
      }
    });

    mockPaymentFailureService.handlePaymentFailure.mockResolvedValue({
      success: true,
      data: {
        action: 'user_notified',
        notificationSent: true
      }
    });

    mockPaymentFailureService.handleMonitoringFailure.mockResolvedValue();

    // Setup NOWPayments mock
    mockNowPaymentsClient.healthCheck.mockResolvedValue(true);
  });

  afterEach(async () => {
    if (paymentMonitoringService.isMonitoringActive()) {
      await paymentMonitoringService.stopMonitoring();
    }
  });

  describe('Service Lifecycle', () => {
    it('should start monitoring service successfully', async () => {
      // Mock database response for pending payments
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            payment_id: 'payment-123',
            user_id: 'user-123',
            created_at: new Date()
          }
        ]
      });

      mockRedis.setex.mockResolvedValue('OK');

      paymentMonitoringService.startMonitoring();

      // Wait a bit for initialization
      await new Promise(resolve => global.setTimeout(resolve, 100));

      expect(paymentMonitoringService.isMonitoringActive()).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('payment_status IN')
      );
      expect(mockRedis.setex).toHaveBeenCalled();
    });

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
      const mockPaymentStatus = {
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
        updated_at: '2024-01-01T00:00:00Z'
      };

      mockNowPaymentsClient.getPaymentStatus.mockResolvedValue(mockPaymentStatus);

      // Mock database queries for payment processing
      mockDbClient.query
        .mockResolvedValueOnce({ // BEGIN
          rows: []
        })
        .mockResolvedValueOnce({ // SELECT current payment
          rows: [{
            id: 'tx-123',
            user_id: 'user-123',
            payment_status: 'pending',
            metadata: JSON.stringify({})
          }]
        })
        .mockResolvedValueOnce({ // UPDATE payment status
          rows: []
        })
        .mockResolvedValueOnce({ // COMMIT
          rows: []
        });

      await paymentMonitoringService.monitorPayment('payment-123');

      expect(mockNowPaymentsClient.getPaymentStatus).toHaveBeenCalledWith('payment-123');
      expect(mockCreditAllocationService.allocateCreditsForPayment).toHaveBeenCalledWith(
        'user-123',
        'payment-123',
        100,
        mockPaymentStatus
      );
    });

    it('should handle payment status update correctly', async () => {
      const mockPaymentStatus = {
        payment_id: 'payment-123',
        payment_status: 'confirmed' as const,
        pay_address: 'addr-123',
        price_amount: 100,
        price_currency: 'usd',
        pay_amount: 0.001,
        actually_paid: 0.001,
        pay_currency: 'btc',
        order_id: 'order-123',
        purchase_id: 'purchase-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      // Mock database queries
      mockDbClient.query
        .mockResolvedValueOnce({ // BEGIN
          rows: []
        })
        .mockResolvedValueOnce({ // SELECT current payment
          rows: [{
            id: 'tx-123',
            user_id: 'user-123',
            payment_status: 'pending',
            metadata: JSON.stringify({})
          }]
        })
        .mockResolvedValueOnce({ // UPDATE payment status
          rows: []
        })
        .mockResolvedValueOnce({ // COMMIT
          rows: []
        });

      await paymentMonitoringService.processPaymentUpdate(mockPaymentStatus);

      expect(mockDbClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE credit_transactions'),
        expect.arrayContaining(['confirmed', undefined, expect.any(String), 'payment-123'])
      );
    });

    it('should handle payment monitoring failure with retry', async () => {
      const error = new Error('API Error');
      mockNowPaymentsClient.getPaymentStatus.mockRejectedValue(error);

      await paymentMonitoringService.monitorPayment('payment-123');

      expect(mockPaymentFailureService.handleMonitoringFailure).toHaveBeenCalledWith(
        'payment-123',
        'API Error'
      );
    });

    it('should skip monitoring if payment status unchanged', async () => {
      const mockPaymentStatus = {
        payment_id: 'payment-123',
        payment_status: 'pending' as const,
        pay_address: 'addr-123',
        price_amount: 100,
        price_currency: 'usd',
        pay_amount: 0.001,
        actually_paid: 0.001,
        pay_currency: 'btc',
        order_id: 'order-123',
        purchase_id: 'purchase-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      mockDbClient.query
        .mockResolvedValueOnce({ // BEGIN
          rows: []
        })
        .mockResolvedValueOnce({ // SELECT current payment
          rows: [{
            id: 'tx-123',
            user_id: 'user-123',
            payment_status: 'pending', // Same status
            metadata: JSON.stringify({})
          }]
        })
        .mockResolvedValueOnce({ // COMMIT
          rows: []
        });

      await paymentMonitoringService.processPaymentUpdate(mockPaymentStatus);

      // Should not call allocation service since status didn't change
      expect(mockCreditAllocationService.allocateCreditsForPayment).not.toHaveBeenCalled();
    });
  });

  describe('Payment Success Handling', () => {
    it('should allocate credits for successful payment', async () => {
      const mockPaymentData = {
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
        updated_at: '2024-01-01T00:00:00Z'
      };

      // Mock database query for payment info
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          user_id: 'user-123',
          metadata: JSON.stringify({ priceAmount: 100 })
        }]
      });

      await (paymentMonitoringService as any).handlePaymentSuccess(mockPaymentData);

      expect(mockCreditAllocationService.allocateCreditsForPayment).toHaveBeenCalledWith(
        'user-123',
        'payment-123',
        100,
        mockPaymentData
      );
    });
  });

  describe('Payment Failure Handling', () => {
    it('should handle payment failure correctly', async () => {
      const mockPaymentData = {
        payment_id: 'payment-123',
        payment_status: 'failed' as const,
        pay_address: 'addr-123',
        price_amount: 100,
        price_currency: 'usd',
        pay_amount: 0.001,
        actually_paid: 0,
        pay_currency: 'btc',
        order_id: 'order-123',
        purchase_id: 'purchase-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      };

      await (paymentMonitoringService as any).handlePaymentFailure(mockPaymentData);

      expect(mockPaymentFailureService.handlePaymentFailure).toHaveBeenCalledWith(
        'payment-123',
        'failed',
        'Payment failed during monitoring'
      );
    });
  });

  describe('Pending Payments Management', () => {
    it('should add pending payment to monitoring queue', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify([]));
      mockRedis.setex.mockResolvedValue('OK');

      await paymentMonitoringService.addPendingPayment('payment-123', 'user-123');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'payment_monitoring:pending_payments',
        3600,
        JSON.stringify([{ paymentId: 'payment-123', userId: 'user-123' }])
      );
    });

    it('should not add duplicate pending payment', async () => {
      const existingPayments = [{ paymentId: 'payment-123', userId: 'user-123' }];
      mockRedis.get.mockResolvedValue(JSON.stringify(existingPayments));

      await paymentMonitoringService.addPendingPayment('payment-123', 'user-123');

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
        averageProcessingTime: expect.any(Number)
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
      const mockPaymentStatus = {
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
        updated_at: '2024-01-01T00:00:00Z'
      };

      mockNowPaymentsClient.getPaymentStatus.mockResolvedValue(mockPaymentStatus);

      mockDbClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ // SELECT current payment
          rows: [{
            id: 'tx-123',
            user_id: 'user-123',
            payment_status: 'pending',
            metadata: JSON.stringify({})
          }]
        })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await paymentMonitoringService.triggerPaymentCheck('payment-123');

      expect(result).toBe(true);
      expect(mockNowPaymentsClient.getPaymentStatus).toHaveBeenCalledWith('payment-123');
    });

    it('should handle manual payment check failure', async () => {
      mockNowPaymentsClient.getPaymentStatus.mockRejectedValue(new Error('API Error'));

      const result = await paymentMonitoringService.triggerPaymentCheck('payment-123');

      expect(result).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      mockPool.connect.mockRejectedValue(new Error('Database connection failed'));

      const mockPaymentStatus = {
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
        updated_at: '2024-01-01T00:00:00Z'
      };

      // Should not throw error, but handle gracefully
      await expect(paymentMonitoringService.processPaymentUpdate(mockPaymentStatus))
        .resolves.not.toThrow();
    });

    it('should handle Redis connection errors gracefully', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));

      // Should not throw error, but return empty array
      const pendingPayments = await (paymentMonitoringService as any).getPendingPayments();
      expect(pendingPayments).toEqual([]);
    });
  });
});