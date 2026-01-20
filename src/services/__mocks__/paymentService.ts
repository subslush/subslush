// Manual mock for paymentService
// Jest will automatically use this when the module is mocked

const mockPaymentService = {
  createPayment: jest.fn().mockResolvedValue({
    success: true,
    payment: {
      paymentId: 'payment-123',
      status: 'waiting',
      payAddress: 'bc1qaddress123',
      payAmount: 0.001,
      payCurrency: 'btc',
      priceAmount: 100,
      priceCurrency: 'usd',
      orderId: 'credit-payment-123',
      orderDescription: 'Credit purchase: $100',
      ipnCallbackUrl: 'https://api.example.com/webhook',
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    },
  }),

  processWebhook: jest.fn().mockResolvedValue(true),

  getPaymentStatus: jest.fn().mockResolvedValue({
    paymentId: 'payment-123',
    status: 'finished',
    payAddress: 'bc1qaddress123',
    priceAmount: 100,
    priceCurrency: 'usd',
    payAmount: 0.001,
    actuallyPaid: 0.001,
    payCurrency: 'btc',
    orderId: 'credit-payment-123',
    purchaseId: 'purchase-123',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
  }),

  getAllPayments: jest.fn().mockResolvedValue([]),

  getUserPayments: jest.fn().mockResolvedValue([]),

  cancelPayment: jest.fn().mockResolvedValue({
    success: true,
    data: {
      paymentId: 'payment-123',
      status: 'cancelled',
      cancelledAt: new Date(),
    },
  }),

  cancelStripeCheckout: jest.fn().mockResolvedValue({
    cancelled: true,
    status: 'cancelled',
  }),

  sweepStaleStripeCheckouts: jest.fn().mockResolvedValue({
    scanned: 0,
    cancelled: 0,
    reconciled: 0,
    skipped: 0,
    errors: 0,
  }),

  retryPayment: jest.fn().mockResolvedValue({
    success: true,
    payment: {
      paymentId: 'payment-retry-123',
      status: 'waiting',
      createdAt: new Date(),
    },
  }),

  validateWebhookSignature: jest.fn().mockReturnValue(true),

  getPaymentMetrics: jest.fn().mockReturnValue({
    totalPayments: 0,
    completedPayments: 0,
    failedPayments: 0,
    totalVolume: 0,
    averageProcessingTime: 0,
    lastPaymentTime: null,
  }),

  resetMetrics: jest.fn(),

  healthCheck: jest.fn().mockResolvedValue(true),
};

export const paymentService = mockPaymentService;
