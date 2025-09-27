import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { creditAllocationService } from '../services/creditAllocationService';
import { creditService } from '../services/creditService';
import { redisClient } from '../config/redis';
import { getDatabasePool } from '../config/database';

// Mock external dependencies
jest.mock('../services/creditService');
jest.mock('../config/redis');
jest.mock('../config/database');

const mockCreditService = creditService as jest.Mocked<typeof creditService>;
const mockRedisClient = redisClient as jest.Mocked<typeof redisClient>;
const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<typeof getDatabasePool>;

// Mock Redis client
const mockRedis = {
  get: jest.fn<() => Promise<string | null>>(),
  setex: jest.fn<() => Promise<string>>(),
  del: jest.fn<() => Promise<number>>(),
  ping: jest.fn<() => Promise<string>>(),
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

describe('CreditAllocationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup Redis mock
    mockRedisClient.getClient.mockReturnValue(mockRedis as any);

    // Setup database mock
    mockGetDatabasePool.mockReturnValue(mockPool as any);

    // Setup credit service mock
    mockCreditService.getUserBalance.mockResolvedValue({
      userId: 'user-123',
      totalBalance: 50,
      availableBalance: 50,
      pendingBalance: 0,
      lastUpdated: new Date()
    });

    mockCreditService.healthCheck.mockResolvedValue(true);
  });

  describe('Credit Allocation', () => {
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
        updated_at: '2024-01-01T00:00:00Z',
        payin_hash: 'hash-123',
        payouts: []
      };

      // Mock no duplicate allocation
      mockRedis.get.mockResolvedValueOnce(null); // Check cache
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // Check database

      // Mock user validation
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'user-123' }]
      });

      // Mock database transaction
      mockDbClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ // Find original transaction
          rows: [{
            id: 'tx-123',
            metadata: JSON.stringify({})
          }]
        })
        .mockResolvedValueOnce({ rows: [] }) // UPDATE transaction
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.del.mockResolvedValue(1);

      const result = await creditAllocationService.allocateCreditsForPayment(
        'user-123',
        'payment-123',
        100,
        mockPaymentData
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.creditAmount).toBe(100);
        expect(result.data.transactionId).toBe('tx-123');
        expect(result.data.balanceAfter).toBe(150); // 50 + 100
      }
    });

    it('should prevent duplicate allocation', async () => {
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
        payin_hash: 'hash-123',
        payouts: []
      };

      // Mock existing allocation in cache
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        transactionId: 'tx-existing',
        creditAmount: 100,
        balanceAfter: 150
      }));

      const result = await creditAllocationService.allocateCreditsForPayment(
        'user-123',
        'payment-123',
        100,
        mockPaymentData
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.transactionId).toBe('tx-existing');
      }

      // Should not perform database operations for duplicates
      expect(mockDbClient.query).not.toHaveBeenCalled();
    });

    it('should detect duplicate allocation in database', async () => {
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
        payin_hash: 'hash-123',
        payouts: []
      };

      // Mock no cache hit but database hit
      mockRedis.get.mockResolvedValueOnce(null);
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'tx-existing',
          amount: '100',
          balance_after: '150'
        }]
      });

      mockRedis.setex.mockResolvedValue('OK');

      const result = await creditAllocationService.allocateCreditsForPayment(
        'user-123',
        'payment-123',
        100,
        mockPaymentData
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.transactionId).toBe('tx-existing');
      }
    });

    it('should fail validation for invalid payment status', async () => {
      const mockPaymentData = {
        payment_id: 'payment-123',
        payment_status: 'pending' as const, // Invalid for allocation
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
        payin_hash: 'hash-123',
        payouts: []
      };

      mockRedis.get.mockResolvedValueOnce(null);
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Mock user validation
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'user-123' }]
      });

      const result = await creditAllocationService.allocateCreditsForPayment(
        'user-123',
        'payment-123',
        100,
        mockPaymentData
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid payment status');
      }
    });

    it('should fail validation for non-existent user', async () => {
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
        payin_hash: 'hash-123',
        payouts: []
      };

      mockRedis.get.mockResolvedValueOnce(null);
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Mock user not found
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await creditAllocationService.allocateCreditsForPayment(
        'user-123',
        'payment-123',
        100,
        mockPaymentData
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('User not found');
      }
    });

    it('should fail validation for insufficient payment amount', async () => {
      const mockPaymentData = {
        payment_id: 'payment-123',
        payment_status: 'finished' as const,
        pay_address: 'addr-123',
        price_amount: 100,
        price_currency: 'usd',
        pay_amount: 0.001,
        actually_paid: 0.0005, // Less than 95% of required amount
        pay_currency: 'btc',
        order_id: 'order-123',
        purchase_id: 'purchase-123',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        payin_hash: 'hash-123',
        payouts: []
      };

      mockRedis.get.mockResolvedValueOnce(null);
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Mock user validation
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'user-123' }]
      });

      const result = await creditAllocationService.allocateCreditsForPayment(
        'user-123',
        'payment-123',
        100,
        mockPaymentData
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Insufficient payment amount received');
      }
    });
  });

  describe('Manual Credit Allocation', () => {
    it('should perform manual credit allocation successfully', async () => {
      mockRedis.get.mockResolvedValueOnce(null); // No duplicate

      mockCreditService.addCredits.mockResolvedValue({
        success: true,
        transaction: {
          id: 'tx-manual',
          userId: 'user-123',
          type: 'bonus',
          amount: 50,
          balanceBefore: 100,
          balanceAfter: 150,
          description: 'Manual allocation',
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date()
        },
        balance: {
          userId: 'user-123',
          totalBalance: 150,
          availableBalance: 150,
          pendingBalance: 0,
          lastUpdated: new Date()
        }
      });

      mockRedis.setex.mockResolvedValue('OK');

      const result = await creditAllocationService.manualCreditAllocation(
        'user-123',
        'payment-123',
        50,
        'admin-123',
        'Manual adjustment'
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.transactionId).toBe('tx-manual');
        expect(result.data.creditAmount).toBe(50);
        expect(result.data.balanceAfter).toBe(150);
      }

      expect(mockCreditService.addCredits).toHaveBeenCalledWith(
        'user-123',
        50,
        'bonus',
        expect.stringContaining('Manual allocation'),
        expect.objectContaining({
          paymentId: 'payment-123',
          manualAllocation: true,
          adminUserId: 'admin-123'
        })
      );
    });

    it('should prevent duplicate manual allocation', async () => {
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        transactionId: 'tx-existing',
        creditAmount: 50,
        balanceAfter: 150
      }));

      const result = await creditAllocationService.manualCreditAllocation(
        'user-123',
        'payment-123',
        50,
        'admin-123',
        'Manual adjustment'
      );

      expect(result.success).toBe(true);
      // Duplicate detected, but still returns success

      // Should not call credit service for duplicates
      expect(mockCreditService.addCredits).not.toHaveBeenCalled();
    });
  });

  describe('Credit Amount Calculation', () => {
    it('should calculate credit amount with default rate', () => {
      const creditAmount = (creditAllocationService as any).calculateCreditAmount(100);
      expect(creditAmount).toBe(100); // 1:1 default rate
    });

    it('should round credit amount to 2 decimal places', () => {
      const creditAmount = (creditAllocationService as any).calculateCreditAmount(99.999);
      expect(creditAmount).toBe(100);
    });
  });

  describe('Allocation History', () => {
    it('should return allocation history for user', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 'tx-1',
            payment_id: 'payment-1',
            amount: '100',
            created_at: new Date(),
            metadata: JSON.stringify({ paymentCompleted: true })
          },
          {
            id: 'tx-2',
            payment_id: 'payment-2',
            amount: '50',
            created_at: new Date(),
            metadata: JSON.stringify({ paymentCompleted: true })
          }
        ]
      });

      const history = await creditAllocationService.getAllocationHistory('user-123', 10, 0);

      expect(history).toHaveLength(2);
      expect(history[0]?.transactionId).toBe('tx-1');
      expect(history[0]?.creditAmount).toBe(100);
      expect(history[0]?.status).toBe('completed');
    });

    it('should return empty array on database error', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      const history = await creditAllocationService.getAllocationHistory('user-123', 10, 0);

      expect(history).toEqual([]);
    });
  });

  describe('Pending Allocations', () => {
    it('should return pending allocations', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            payment_id: 'payment-1',
            user_id: 'user-1',
            metadata: JSON.stringify({ priceAmount: 100 }),
            created_at: new Date()
          },
          {
            payment_id: 'payment-2',
            user_id: 'user-2',
            metadata: JSON.stringify({ priceAmount: 50 }),
            created_at: new Date()
          }
        ]
      });

      const pending = await creditAllocationService.getPendingAllocations();

      expect(pending).toHaveLength(2);
      expect(pending[0]?.paymentId).toBe('payment-1');
      expect(pending[0]?.usdAmount).toBe(100);
    });

    it('should handle pending allocations with corrupted metadata', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            payment_id: 'payment-1',
            user_id: 'user-1',
            metadata: 'invalid-json',
            created_at: new Date()
          }
        ]
      });

      const pending = await creditAllocationService.getPendingAllocations();

      expect(pending).toHaveLength(1);
      expect(pending[0]?.usdAmount).toBe(0); // Fallback value
    });
  });

  describe('Metrics', () => {
    it('should return current metrics', () => {
      const metrics = creditAllocationService.getMetrics();

      expect(metrics).toEqual({
        totalAllocations: expect.any(Number),
        totalCreditsAllocated: expect.any(Number),
        duplicatePrevented: expect.any(Number),
        failedAllocations: expect.any(Number),
        averageProcessingTime: expect.any(Number),
        lastAllocationTime: expect.any(Date)
      });
    });

    it('should reset metrics correctly', () => {
      creditAllocationService.resetMetrics();
      const metrics = creditAllocationService.getMetrics();

      expect(metrics.totalAllocations).toBe(0);
      expect(metrics.totalCreditsAllocated).toBe(0);
      expect(metrics.duplicatePrevented).toBe(0);
      expect(metrics.failedAllocations).toBe(0);
    });
  });

  describe('Health Check', () => {
    it('should pass health check when all dependencies are healthy', async () => {
      mockRedis.ping.mockResolvedValue('PONG');
      mockPool.query.mockResolvedValue({ rows: [] });
      mockCreditService.healthCheck.mockResolvedValue(true);

      const isHealthy = await creditAllocationService.healthCheck();

      expect(isHealthy).toBe(true);
    });

    it('should fail health check when Redis is unhealthy', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Redis error'));

      const isHealthy = await creditAllocationService.healthCheck();

      expect(isHealthy).toBe(false);
    });

    it('should fail health check when database is unhealthy', async () => {
      mockRedis.ping.mockResolvedValue('PONG');
      mockPool.query.mockRejectedValue(new Error('Database error'));

      const isHealthy = await creditAllocationService.healthCheck();

      expect(isHealthy).toBe(false);
    });

    it('should fail health check when credit service is unhealthy', async () => {
      mockRedis.ping.mockResolvedValue('PONG');
      mockPool.query.mockResolvedValue({ rows: [] });
      mockCreditService.healthCheck.mockResolvedValue(false);

      const isHealthy = await creditAllocationService.healthCheck();

      expect(isHealthy).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle database transaction rollback on error', async () => {
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
        payin_hash: 'hash-123',
        payouts: []
      };

      mockRedis.get.mockResolvedValueOnce(null);
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 'user-123' }] });

      // Mock database transaction failure
      mockDbClient.query
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ // Find original transaction
          rows: [{
            id: 'tx-123',
            metadata: JSON.stringify({})
          }]
        })
        .mockRejectedValueOnce(new Error('Database error')); // UPDATE fails

      const result = await creditAllocationService.allocateCreditsForPayment(
        'user-123',
        'payment-123',
        100,
        mockPaymentData
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Database transaction failed');
      }
      expect(mockDbClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should handle Redis errors gracefully', async () => {
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
        payin_hash: 'hash-123',
        payouts: []
      };

      mockRedis.get.mockRejectedValue(new Error('Redis error'));

      const result = await creditAllocationService.allocateCreditsForPayment(
        'user-123',
        'payment-123',
        100,
        mockPaymentData
      );

      // Should still check database for duplicates
      expect(result.success).toBe(false);
      // No duplicate found, just an error
    });
  });
});