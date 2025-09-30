// Manual mock for creditAllocationService
// Jest will automatically use this when the module is mocked

const mockCreditAllocationService = {
  allocateCreditsForPayment: jest.fn().mockImplementation((userId, paymentId, creditAmount, paymentData) => {
    // Handle database connection failures gracefully only for specific failure test case
    if (paymentData && paymentData.payment_id === 'payment-123' &&
        paymentData.pay_currency === 'btc' &&
        paymentData.price_amount === 100 &&
        mockCreditAllocationService._simulateDbFailure) {
      return Promise.resolve({
        success: false,
        error: 'Database connection failed',
      });
    }

    // Handle duplicate detection for concurrency tests
    if (paymentId === 'payment-concurrent') {
      // First call succeeds, subsequent calls detect duplicate
      if (!mockCreditAllocationService._firstCallMade) {
        mockCreditAllocationService._firstCallMade = true;
        return Promise.resolve({
          success: true,
          data: {
            creditAmount,
            transactionId: 'tx-123',
            balanceAfter: 150,
            userId,
            paymentId,
          },
        });
      } else {
        return Promise.resolve({
          success: true,
          data: {
            creditAmount,
            transactionId: 'tx-123',
            balanceAfter: 150,
            userId,
            paymentId,
          },
          isDuplicate: true,
        });
      }
    }

    // Default successful allocation
    const baseBalance = userId === 'user-consistency' ? 25 : 50;
    return Promise.resolve({
      success: true,
      data: {
        creditAmount,
        transactionId: 'tx-123',
        balanceAfter: baseBalance + creditAmount,
        userId,
        paymentId,
      },
    });
  }),
  manualCreditAllocation: jest.fn().mockResolvedValue({
    success: true,
    data: {
      creditAmount: 100,
      transactionId: 'tx-123',
      balanceAfter: 150,
      userId: 'user-123',
      paymentId: 'payment-123',
    },
  }),
  getPendingAllocations: jest.fn().mockResolvedValue([]),
  getMetrics: jest.fn().mockReturnValue({
    totalAllocations: 1,
    totalCreditsAllocated: 100,
    duplicatePrevented: 0,
    failedAllocations: 0,
    averageProcessingTime: 0,
    lastAllocationTime: new Date(),
  }),
  resetMetrics: jest.fn(),
  getAllocationHistory: jest.fn().mockResolvedValue([]),
  healthCheck: jest.fn().mockImplementation(async () => {
    // Check if Redis is failing (for unhealthy service detection test)
    try {
      const redis = require('../../config/redis').redisClient;
      const pingMock = redis.getClient().ping;
      // Try calling ping to see if it throws
      await pingMock();
      return true;
    } catch (error) {
      // If ping throws an error (like 'Redis connection failed'), return false
      return false;
    }
  }),

  // Test helper properties
  _firstCallMade: false,
  _simulateDbFailure: false,
  _resetTestState: jest.fn().mockImplementation(() => {
    mockCreditAllocationService._firstCallMade = false;
    mockCreditAllocationService._simulateDbFailure = false;
  }),
};

export const creditAllocationService = mockCreditAllocationService;