// Manual mock for paymentFailureService
// Jest will automatically use this when the module is mocked

const mockPaymentFailureService = {
  handlePaymentFailure: jest.fn().mockImplementation(() => {
    // Increment metrics when called
    mockPaymentFailureService._metrics.totalFailures++;
    return Promise.resolve({
      success: true,
      data: {
        action: 'user_notified',
        notificationSent: true,
      },
    });
  }),
  handleMonitoringFailure: jest.fn().mockResolvedValue(undefined),
  getFailedPayments: jest.fn().mockResolvedValue([]),
  manualRetryPayment: jest.fn().mockResolvedValue({
    success: true,
    data: {
      retryAttempt: 1,
      status: 'retry_initiated',
    },
  }),
  cleanupOldFailures: jest.fn().mockResolvedValue(0),
  getMetrics: jest.fn().mockImplementation(() => mockPaymentFailureService._metrics),
  resetMetrics: jest.fn().mockImplementation(() => {
    mockPaymentFailureService._metrics = {
      totalFailures: 0,
      pendingRetries: 0,
      manualInterventions: 0,
      resolvedFailures: 0,
      averageResolutionTime: 0,
      lastFailureTime: null,
    };
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
    totalFailures: 0,
    pendingRetries: 0,
    manualInterventions: 0,
    resolvedFailures: 0,
    averageResolutionTime: 0,
    lastFailureTime: null,
  },
};

export const paymentFailureService = mockPaymentFailureService;