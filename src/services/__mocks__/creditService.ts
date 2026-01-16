// Manual mock for creditService
// Jest will automatically use this when the module is mocked

const mockCreditService = {
  getUserBalance: jest.fn().mockResolvedValue({
    userId: 'user-123',
    totalBalance: 50, // Starting balance of 50 credits
    lastTransactionId: 'tx-122',
    lastUpdated: new Date().toISOString(),
  }),
  addCredits: jest.fn().mockResolvedValue({
    success: true,
    transaction: {
      id: 'tx-123',
      userId: 'user-123',
      type: 'bonus',
      amount: 100,
      balanceBefore: 50,
      balanceAfter: 150,
      description: 'Test credit allocation',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    balance: {
      userId: 'user-123',
      totalBalance: 150,
      availableBalance: 150,
      pendingBalance: 0,
      lastUpdated: new Date(),
    },
  }),
  deductCredits: jest.fn().mockResolvedValue({
    success: true,
    data: {
      transactionId: 'tx-124',
      amount: 25,
      balanceAfter: 125,
    },
  }),
  refundCredits: jest.fn().mockResolvedValue({
    success: true,
    transaction: {
      id: 'refund-tx-123',
      userId: 'user-123',
      type: 'refund',
      amount: 50,
      balanceBefore: 100,
      balanceAfter: 50,
      description: 'Refund processed',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    balance: {
      userId: 'user-123',
      totalBalance: 50,
      availableBalance: 50,
      pendingBalance: 0,
      lastUpdated: new Date(),
    },
  }),
  reverseCredits: jest.fn().mockResolvedValue({
    success: true,
    transaction: {
      id: 'refund-reversal-tx-123',
      userId: 'user-123',
      type: 'refund_reversal',
      amount: 50,
      balanceBefore: 100,
      balanceAfter: 50,
      description: 'Refund reversal processed',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    balance: {
      userId: 'user-123',
      totalBalance: 50,
      availableBalance: 50,
      pendingBalance: 0,
      lastUpdated: new Date(),
    },
  }),
  getTransactionHistory: jest.fn().mockResolvedValue([]),
  healthCheck: jest.fn().mockResolvedValue(true),
};

export const creditService = mockCreditService;
