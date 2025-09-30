// Manual mock for refundService
// Jest will automatically use this when the module is mocked

const mockRefundService = {
  initiateRefund: jest.fn().mockImplementation(() => {
    // Increment metrics when called
    mockRefundService._metrics.totalRequests++;
    return Promise.resolve({
      success: true,
      refund: {
        id: 'refund-123',
        paymentId: 'payment-refund',
        userId: 'user-123',
        amount: 50,
        reason: 'user_request',
        status: 'pending',
        description: 'Testing refund workflow',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
      },
    });
  }),

  approveRefund: jest.fn().mockResolvedValue({
    success: true,
    transactionId: 'refund-tx-123',
    refund: {
      id: 'refund-123',
      status: 'approved',
      approvedBy: 'admin-123',
      approvedAt: new Date(),
      processingNotes: 'Approved for testing',
    },
  }),

  rejectRefund: jest.fn().mockResolvedValue({
    success: true,
    refund: {
      id: 'refund-123',
      status: 'rejected',
      rejectedBy: 'admin-123',
      rejectedAt: new Date(),
      rejectionReason: 'Test rejection',
    },
  }),

  processRefund: jest.fn().mockResolvedValue({
    success: true,
    data: {
      refundId: 'refund-123',
      transactionId: 'refund-tx-123',
      amount: 50,
      processedAt: new Date(),
    },
  }),

  getRefundById: jest.fn().mockResolvedValue({
    id: 'refund-123',
    paymentId: 'payment-refund',
    userId: 'user-123',
    amount: 50,
    reason: 'user_request',
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {},
  }),

  getUserRefunds: jest.fn().mockResolvedValue([]),

  getAllRefunds: jest.fn().mockResolvedValue([]),

  getPendingRefunds: jest.fn().mockResolvedValue([]),

  cancelRefund: jest.fn().mockResolvedValue({
    success: true,
    refund: {
      id: 'refund-123',
      status: 'cancelled',
      cancelledAt: new Date(),
      cancellationReason: 'User request',
    },
  }),

  validateRefundEligibility: jest.fn().mockResolvedValue({
    eligible: true,
    maxRefundAmount: 100,
    reason: 'Payment eligible for refund',
  }),

  getRefundStats: jest.fn().mockReturnValue({
    totalRequests: 0,
    approvedRefunds: 0,
    rejectedRefunds: 0,
    pendingRefunds: 0,
    totalRefundAmount: 0,
    averageProcessingTime: 0,
  }),

  getMetrics: jest.fn().mockImplementation(() => mockRefundService._metrics),

  resetMetrics: jest.fn(),

  cleanupOldRefunds: jest.fn().mockResolvedValue(0),

  retryFailedRefunds: jest.fn().mockResolvedValue({
    success: true,
    data: {
      retriedCount: 0,
      successCount: 0,
      failedCount: 0,
    },
  }),

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

  // Internal metrics state
  _metrics: {
    totalRequests: 0,
    approvedRefunds: 0,
    rejectedRefunds: 0,
    pendingRefunds: 0,
    totalRefundAmount: 0,
    averageProcessingTime: 0,
    lastRefundTime: null,
  },
};

export const refundService = mockRefundService;