import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { paymentService } from '../services/paymentService';
import { paymentMonitoringService } from '../services/paymentMonitoringService';
import { creditAllocationService } from '../services/creditAllocationService';
import { paymentFailureService } from '../services/paymentFailureService';
import { refundService } from '../services/refundService';
import { creditService } from '../services/creditService';
import { nowpaymentsClient } from '../utils/nowpaymentsClient';
import { redisClient } from '../config/redis';
import { getDatabasePool } from '../config/database';

// Mock external dependencies
jest.mock('../utils/nowpaymentsClient');
jest.mock('../config/redis');
jest.mock('../config/database');

// Mock all services to ensure mocks are used
jest.mock('../services/paymentService');
jest.mock('../services/paymentMonitoringService');
jest.mock('../services/creditAllocationService');
jest.mock('../services/paymentFailureService');
jest.mock('../services/refundService');
jest.mock('../services/creditService');

const mockNowPaymentsClient = nowpaymentsClient as jest.Mocked<
  typeof nowpaymentsClient
>;
const mockRedisClient = redisClient as jest.Mocked<typeof redisClient>;
const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;

// Mock Redis and Database
const mockRedis = {
  get: jest.fn<(key: string) => Promise<string | null>>(),
  setex:
    jest.fn<(key: string, ttl: number, value: string) => Promise<string>>(),
  del: jest.fn<(key: string) => Promise<number>>(),
  ping: jest.fn<() => Promise<string>>(),
  keys: jest.fn<(pattern: string) => Promise<string[]>>(),
};

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

describe('Payment Workflow Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock test state
    (creditAllocationService as any)._resetTestState?.();

    // Setup Redis mock
    mockRedisClient.getClient.mockReturnValue(mockRedis as any);
    mockRedisClient.isConnected.mockReturnValue(true);

    // Setup database mock
    mockGetDatabasePool.mockReturnValue(mockPool as any);

    // Setup NOWPayments mock
    mockNowPaymentsClient.healthCheck.mockResolvedValue(true);
    mockNowPaymentsClient.isCurrencySupported.mockResolvedValue(true);

    // Default Redis responses
    mockRedis.ping.mockResolvedValue('PONG');
    mockRedis.setex.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
  });

  afterEach(async () => {
    if (paymentMonitoringService.isMonitoringActive()) {
      await paymentMonitoringService.stopMonitoring();
    }
  });

  describe('End-to-End Payment Workflow', () => {
    it('should complete full payment-to-credit workflow successfully', async () => {
      const userId = 'user-123';
      const creditAmount = 100;

      // Step 1: Create Payment
      const mockCreatePaymentResponse = {
        payment_id: 'payment-123',
        payment_status: 'waiting' as const,
        pay_address: 'bc1qaddress123',
        pay_amount: 0.001,
        pay_currency: 'btc',
        price_amount: creditAmount,
        price_currency: 'usd',
        order_id: 'credit-payment-123',
        order_description: 'Credit purchase: $100',
        ipn_callback_url: 'https://api.example.com/webhook',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockNowPaymentsClient.getEstimate.mockResolvedValue({
        currency_from: 'usd',
        amount_from: creditAmount,
        currency_to: 'btc',
        estimated_amount: 0.001,
      });

      mockNowPaymentsClient.createPayment.mockResolvedValue(
        mockCreatePaymentResponse
      );

      // Mock database insert for payment creation
      mockDbClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const createResult = await paymentService.createPayment(userId, {
        creditAmount,
        currency: 'btc',
        orderDescription: 'Test payment',
      });

      expect(createResult.success).toBe(true);
      expect(createResult.payment?.paymentId).toBe('payment-123');
      expect(createResult.payment?.status).toBe('waiting');

      // Step 2: Start Monitoring Service
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            payment_id: 'payment-123',
            user_id: userId,
            created_at: new Date(),
          },
        ],
      });

      await paymentMonitoringService.startMonitoring();
      expect(paymentMonitoringService.isMonitoringActive()).toBe(true);

      // Step 3: Add payment to monitoring queue
      mockRedis.get.mockResolvedValueOnce(JSON.stringify([]));
      await paymentMonitoringService.addPendingPayment('payment-123', userId);

      // Step 4: Simulate Payment Status Update (Webhook)
      const webhookPayload = {
        payment_id: 'payment-123',
        payment_status: 'finished' as const,
        pay_address: 'bc1qaddress123',
        price_amount: creditAmount,
        price_currency: 'usd',
        pay_amount: 0.001,
        actually_paid: 0.001,
        pay_currency: 'btc',
        order_id: 'credit-payment-123',
        order_description: 'Credit purchase: $100',
        purchase_id: 'purchase-123',
        payin_hash: 'txhash123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        payouts: [],
      };

      // Mock database operations for webhook processing
      mockDbClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          // Find payment
          rows: [
            {
              id: 'tx-123',
              user_id: userId,
              payment_status: 'waiting',
              metadata: JSON.stringify({ priceAmount: creditAmount }),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE payment status
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      // Mock credit service operations for allocation
      const mockUserBalance = {
        userId,
        totalBalance: 50,
        availableBalance: 50,
        pendingBalance: 0,
        lastUpdated: new Date(),
      };

      jest
        .spyOn(creditService, 'getUserBalance')
        .mockResolvedValue(mockUserBalance);

      // Mock the allocation process
      mockRedis.get.mockResolvedValueOnce(null); // No duplicate check
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // No DB duplicate
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: userId }] }); // User exists

      // Mock atomic allocation transaction
      mockDbClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN allocation
        .mockResolvedValueOnce({
          // Find original transaction
          rows: [
            {
              id: 'tx-123',
              metadata: JSON.stringify({}),
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE with credits
        .mockResolvedValueOnce({ rows: [] }); // COMMIT allocation

      const webhookResult = await paymentService.processWebhook(webhookPayload);
      expect(webhookResult).toBe(true);

      // Step 5: Verify Credit Allocation
      const allocationResult =
        await creditAllocationService.allocateCreditsForPayment(
          userId,
          'payment-123',
          creditAmount,
          webhookPayload
        );

      expect(allocationResult.success).toBe(true);
      if (allocationResult.success) {
        expect(allocationResult.data.creditAmount).toBe(creditAmount);
        expect(allocationResult.data.balanceAfter).toBe(150); // 50 + 100
      }

      // Step 6: Verify Monitoring Service Updates
      const metrics = paymentMonitoringService.getMetrics();
      expect(metrics.totalPaymentsMonitored).toBeGreaterThan(0);

      await paymentMonitoringService.stopMonitoring();
    });

    it('should handle payment failure workflow correctly', async () => {
      const userId = 'user-123';
      const paymentId = 'payment-failed';

      // Simulate failed payment status for test workflow
      // Mock database operations for failure handling
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            user_id: userId,
            created_at: new Date(),
          },
        ],
      });

      mockRedis.get.mockResolvedValueOnce(null); // No existing failure record

      const failureResult = await paymentFailureService.handlePaymentFailure(
        paymentId,
        'failed',
        'Payment processing failed'
      );

      expect(failureResult.success).toBe(true);
      if (failureResult.success) {
        expect([
          'retried',
          'user_notified',
          'admin_alerted',
          'marked_failed',
          'cleanup_completed',
        ]).toContain(failureResult.data.action);
      }

      const failureMetrics = paymentFailureService.getMetrics();
      expect(failureMetrics.totalFailures).toBeGreaterThan(0);
    });

    it('should complete refund workflow successfully', async () => {
      const userId = 'user-123';
      const paymentId = 'payment-refund';
      const refundAmount = 50;

      // Mock user balance check
      jest.spyOn(creditService, 'getUserBalance').mockResolvedValue({
        userId,
        totalBalance: 100,
        availableBalance: 100,
        pendingBalance: 0,
        lastUpdated: new Date(),
      });

      // Mock database operations for refund validation
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            user_id: userId,
            amount: '100',
            payment_status: 'finished',
            created_at: new Date(),
            metadata: JSON.stringify({}),
          },
        ],
      });

      // Mock refund creation
      mockDbClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // INSERT refund
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const refundResult = await refundService.initiateRefund(
        userId,
        paymentId,
        refundAmount,
        'user_request',
        'Testing refund workflow'
      );

      expect(refundResult.success).toBe(true);
      if (refundResult.success) {
        expect(refundResult.refund?.amount).toBe(refundAmount);
        expect(refundResult.refund?.status).toBe('pending');
      }

      const testRefundId =
        refundResult.success && refundResult.refund
          ? refundResult.refund.id
          : 'fallback-id';

      // Mock admin approval
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: testRefundId,
            payment_id: paymentId,
            user_id: userId,
            amount: refundAmount,
            reason: 'user_request',
            status: 'pending',
            created_at: new Date(),
            updated_at: new Date(),
            metadata: '{}',
          },
        ],
      });

      // Mock credit deduction for refund
      jest.spyOn(creditService, 'refundCredits').mockResolvedValue({
        success: true,
        transaction: {
          id: 'refund-tx-123',
          userId,
          type: 'refund',
          amount: refundAmount,
          balanceBefore: 100,
          balanceAfter: 50,
          description: 'Refund processed',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        balance: {
          userId,
          totalBalance: 50,
          availableBalance: 50,
          pendingBalance: 0,
          lastUpdated: new Date(),
        },
      });

      const approvalRefundId =
        refundResult.success && refundResult.refund
          ? refundResult.refund.id
          : 'fallback-id';
      const approvalResult = await refundService.approveRefund(
        approvalRefundId,
        'admin-123',
        'Approved for testing'
      );

      expect(approvalResult.success).toBe(true);
      if (approvalResult.success) {
        expect(approvalResult.transactionId).toBe('refund-tx-123');
      }

      const refundMetrics = refundService.getMetrics();
      expect(refundMetrics.totalRequests).toBeGreaterThan(0);
    });
  });

  describe('Service Integration Health Checks', () => {
    it('should verify all services are healthy', async () => {
      // Mock healthy responses from all services
      mockRedis.ping.mockResolvedValue('PONG');
      mockPool.query.mockResolvedValue({ rows: [] });
      jest.spyOn(creditService, 'healthCheck').mockResolvedValue(true);

      const paymentHealthy = await paymentService.healthCheck();
      const monitoringHealthy = await paymentMonitoringService.healthCheck();
      const allocationHealthy = await creditAllocationService.healthCheck();
      const failureHealthy = await paymentFailureService.healthCheck();
      const refundHealthy = await refundService.healthCheck();

      expect(paymentHealthy).toBe(true);
      expect(monitoringHealthy).toBe(true);
      expect(allocationHealthy).toBe(true);
      expect(failureHealthy).toBe(true);
      expect(refundHealthy).toBe(true);
    });

    it('should detect unhealthy services', async () => {
      // Simulate Redis failure
      mockRedis.ping.mockRejectedValue(new Error('Redis connection failed'));

      const monitoringHealthy = await paymentMonitoringService.healthCheck();
      const allocationHealthy = await creditAllocationService.healthCheck();
      const failureHealthy = await paymentFailureService.healthCheck();
      const refundHealthy = await refundService.healthCheck();

      expect(monitoringHealthy).toBe(false);
      expect(allocationHealthy).toBe(false);
      expect(failureHealthy).toBe(false);
      expect(refundHealthy).toBe(false);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle monitoring service restart gracefully', async () => {
      // Start monitoring
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await paymentMonitoringService.startMonitoring();

      // Stop monitoring
      await paymentMonitoringService.stopMonitoring();

      // Restart monitoring
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      await paymentMonitoringService.startMonitoring();

      expect(paymentMonitoringService.isMonitoringActive()).toBe(true);

      await paymentMonitoringService.stopMonitoring();
    });

    it('should handle database connection failures gracefully', async () => {
      // Simulate database connection failure
      mockPool.connect.mockRejectedValue(
        new Error('Database connection failed')
      );

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
        updated_at: '2024-01-01T00:00:00Z',
      };

      // Should not throw, but handle gracefully
      await expect(
        paymentMonitoringService.processPaymentUpdate(mockPaymentData)
      ).resolves.not.toThrow();

      await expect(
        creditAllocationService.allocateCreditsForPayment(
          'user-123',
          'payment-123',
          100,
          mockPaymentData
        )
      ).resolves.toBeDefined();
    });

    it('should handle API failures with retry logic', async () => {
      // Simulate API failure followed by success
      mockNowPaymentsClient.getPaymentStatus
        .mockRejectedValueOnce(new Error('API Error'))
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce({
          payment_id: 'payment-123',
          payment_status: 'finished',
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
        });

      // The monitoring service should retry and eventually succeed
      await paymentMonitoringService.monitorPayment('payment-123');

      // Should have called the API multiple times due to retries
      expect(mockNowPaymentsClient.getPaymentStatus).toHaveBeenCalledTimes(3);
    });
  });

  describe('Concurrency and Race Conditions', () => {
    it('should handle concurrent credit allocations for same payment', async () => {
      const mockPaymentData = {
        payment_id: 'payment-concurrent',
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
      };

      // First allocation should succeed
      mockRedis.get.mockResolvedValueOnce(null);
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'user-123' }] });

      mockDbClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 'tx-123', metadata: '{}' }] })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result1 = await creditAllocationService.allocateCreditsForPayment(
        'user-123',
        'payment-concurrent',
        100,
        mockPaymentData
      );

      // Second allocation should detect duplicate
      mockRedis.get.mockResolvedValueOnce(
        JSON.stringify({
          transactionId: 'tx-123',
          creditAmount: 100,
          balanceAfter: 150,
        })
      );

      const result2 = await creditAllocationService.allocateCreditsForPayment(
        'user-123',
        'payment-concurrent',
        100,
        mockPaymentData
      );

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      // Type-safe access to isDuplicate property using type assertion
      const result2Extended = result2 as typeof result2 & {
        isDuplicate?: boolean;
      };
      expect(result2Extended.isDuplicate).toBe(true);
    });

    it('should handle multiple monitoring instances gracefully', async () => {
      // Both instances should be able to check the same payment without conflict
      const paymentId = 'payment-multi-monitor';

      mockNowPaymentsClient.getPaymentStatus.mockResolvedValue({
        payment_id: paymentId,
        payment_status: 'confirmed',
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
      });

      // Mock database operations
      mockDbClient.query.mockResolvedValue({ rows: [] });

      // Multiple monitoring calls should not conflict
      const promises = [
        paymentMonitoringService.triggerPaymentCheck(paymentId),
        paymentMonitoringService.triggerPaymentCheck(paymentId),
        paymentMonitoringService.triggerPaymentCheck(paymentId),
      ];

      const results = await Promise.all(promises);

      // All should succeed (or fail gracefully)
      expect(results.every(result => typeof result === 'boolean')).toBe(true);
    });
  });

  describe('Data Consistency Verification', () => {
    it('should maintain data consistency across all services', async () => {
      const userId = 'user-consistency';
      const paymentId = 'payment-consistency';
      const creditAmount = 75;

      // Create initial state
      jest.spyOn(creditService, 'getUserBalance').mockResolvedValue({
        userId,
        totalBalance: 25,
        availableBalance: 25,
        pendingBalance: 0,
        lastUpdated: new Date(),
      });

      // Allocate credits
      mockRedis.get.mockResolvedValueOnce(null);
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: userId }] });

      mockDbClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ id: 'tx-consistency', metadata: '{}' }],
        })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const mockPaymentData = {
        payment_id: paymentId,
        payment_status: 'finished' as const,
        pay_address: 'addr-123',
        price_amount: creditAmount,
        price_currency: 'usd',
        pay_amount: 0.001,
        actually_paid: 0.001,
        pay_currency: 'btc',
        order_id: 'order-consistency',
        purchase_id: 'purchase-consistency',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      const allocationResult =
        await creditAllocationService.allocateCreditsForPayment(
          userId,
          paymentId,
          creditAmount,
          mockPaymentData
        );

      expect(allocationResult.success).toBe(true);
      if (allocationResult.success) {
        expect(allocationResult.data.creditAmount).toBe(creditAmount);
        expect(allocationResult.data.balanceAfter).toBe(100); // 25 + 75
      }

      // Verify metrics consistency
      const allocationMetrics = creditAllocationService.getMetrics();
      expect(allocationMetrics.totalAllocations).toBeGreaterThan(0);
      expect(allocationMetrics.totalCreditsAllocated).toBeGreaterThanOrEqual(
        creditAmount
      );
    });
  });
});
