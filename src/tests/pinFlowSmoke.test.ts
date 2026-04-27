import Fastify from 'fastify';
import { userRoutes } from '../routes/users';
import { orderRoutes } from '../routes/orders';
import { getDatabasePool } from '../config/database';
import { orderEntitlementService } from '../services/orderEntitlementService';

jest.mock('../config/database');
jest.mock('../services/orderEntitlementService', () => ({
  orderEntitlementService: {
    listForOrder: jest.fn(),
    updateEntitlementCredentialsEncryptedValue: jest.fn(),
  },
}));
jest.mock('../middleware/authMiddleware', () => ({
  authPreHandler: jest.fn(async (request: any) => {
    request.user = {
      userId: 'user-1',
      email: 'user@example.com',
      role: 'user',
      sessionId: 'session-1',
      isAdmin: false,
    };
  }),
}));
jest.mock('../middleware/rateLimitMiddleware', () => ({
  createRateLimitHandler: jest.fn(() => async () => {}),
  rateLimitMiddleware: jest.fn(() => async () => {}),
}));
jest.mock('../services/auditLogService', () => ({
  logCredentialRevealAttempt: jest.fn(),
  logAdminAction: jest.fn(),
}));
jest.mock('../services/orderComplianceEvidenceService', () => ({
  orderComplianceEvidenceService: {
    recordCredentialRevealEvidence: jest.fn(),
  },
}));
jest.mock('../utils/logger');

const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;
const mockOrderEntitlementService = orderEntitlementService as jest.Mocked<
  typeof orderEntitlementService
>;

describe('Credential reveal smoke flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOrderEntitlementService.updateEntitlementCredentialsEncryptedValue.mockResolvedValue(
      true
    );
  });

  it('deprecates PIN verification and reveals credentials directly from orders', async () => {
    const mockQuery = jest.fn();
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'order-1', user_id: 'user-1' }],
    });

    mockGetDatabasePool.mockReturnValue({ query: mockQuery } as any);
    mockOrderEntitlementService.listForOrder.mockResolvedValue([
      {
        id: 'ent-1',
        order_id: 'order-1',
        order_item_id: null,
        user_id: 'user-1',
        status: 'active',
        starts_at: new Date('2025-01-01T00:00:00Z'),
        ends_at: new Date('2025-02-01T00:00:00Z'),
        duration_months_snapshot: 1,
        credentials_encrypted: 'credential-secret',
        mmu_cycle_index: 1,
        mmu_cycle_total: 1,
        source_subscription_id: 'sub-1',
        metadata: null,
        created_at: new Date('2025-01-01T00:00:00Z'),
        updated_at: new Date('2025-01-01T00:00:00Z'),
      },
    ] as any);

    const app = Fastify();
    await app.register(userRoutes, { prefix: '/users' });
    await app.register(orderRoutes, { prefix: '/orders' });

    const pinVerifyResponse = await app.inject({
      method: 'POST',
      url: '/users/pin/verify',
      payload: { pin: '1234' },
    });
    expect(pinVerifyResponse.statusCode).toBe(410);
    expect(pinVerifyResponse.json().code).toBe('PIN_DEPRECATED');

    const revealResponse = await app.inject({
      method: 'POST',
      url: '/orders/order-1/credentials/reveal',
    });

    await app.close();

    expect(revealResponse.statusCode).toBe(200);
    expect(revealResponse.json().data.credentials).toBe('credential-secret');
  });
});
