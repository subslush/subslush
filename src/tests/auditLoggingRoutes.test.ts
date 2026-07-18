import Fastify from 'fastify';
import { userRoutes } from '../routes/users';
import { subscriptionRoutes } from '../routes/subscriptions';
import { orderRoutes } from '../routes/orders';
import { getDatabasePool } from '../config/database';
import { orderEntitlementService } from '../services/orderEntitlementService';
import { subscriptionService } from '../services/subscriptionService';
import {
  logAdminAction,
  logCredentialRevealAttempt,
} from '../services/auditLogService';

jest.mock('../config/database');
jest.mock('../services/orderEntitlementService', () => ({
  orderEntitlementService: {
    listForOrder: jest.fn(),
    updateEntitlementCredentialsEncryptedValue: jest.fn(),
  },
}));
jest.mock('../services/subscriptionService', () => ({
  subscriptionService: {
    updateSubscriptionCredentialsEncryptedValue: jest.fn(),
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
  logAdminAction: jest.fn(),
  logCredentialRevealAttempt: jest.fn(),
}));
jest.mock('../services/orderComplianceEvidenceService', () => ({
  orderComplianceEvidenceService: {
    recordCredentialRevealEvidence: jest.fn(),
    recordGenericEvidence: jest.fn(),
  },
}));
jest.mock('../utils/logger');

const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;
const mockOrderEntitlementService = orderEntitlementService as jest.Mocked<
  typeof orderEntitlementService
>;
const mockSubscriptionService = subscriptionService as jest.Mocked<
  typeof subscriptionService
>;
const mockLogAdminAction = logAdminAction as jest.MockedFunction<
  typeof logAdminAction
>;
const mockLogCredentialRevealAttempt =
  logCredentialRevealAttempt as jest.MockedFunction<
    typeof logCredentialRevealAttempt
  >;

describe('Audit logging routes', () => {
  const subscriptionId = '123e4567-e89b-42d3-a456-426614174000';

  beforeEach(() => {
    jest.clearAllMocks();
    mockOrderEntitlementService.updateEntitlementCredentialsEncryptedValue.mockResolvedValue(
      true
    );
    mockSubscriptionService.updateSubscriptionCredentialsEncryptedValue.mockResolvedValue(
      true
    );
  });

  it('returns deprecation response for PIN set endpoint and does not emit PIN audit logs', async () => {
    const app = Fastify();
    await app.register(userRoutes, { prefix: '/users' });

    const response = await app.inject({
      method: 'POST',
      url: '/users/pin/set',
      payload: { pin: '1234' },
    });

    await app.close();

    expect(response.statusCode).toBe(410);
    expect(response.json().code).toBe('PIN_DEPRECATED');
    expect(mockLogAdminAction).not.toHaveBeenCalled();
  });

  it('returns deprecation response for subscription credentials reveal endpoint', async () => {
    const app = Fastify();
    await app.register(subscriptionRoutes, { prefix: '/subscriptions' });

    const response = await app.inject({
      method: 'POST',
      url: `/subscriptions/${subscriptionId}/credentials/reveal`,
      payload: { pin_token: 'token-token-12345' },
    });

    await app.close();

    expect(response.statusCode).toBe(410);
    expect(response.json().code).toBe('CREDENTIAL_REVEAL_MOVED_TO_ORDERS');
    expect(mockLogCredentialRevealAttempt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        subscriptionId,
        success: false,
        failureReason: 'moved_to_orders',
      })
    );
  });

  it('logs order credential reveal failures', async () => {
    const mockQuery = jest.fn();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'order-1', user_id: 'user-1' }] })
      .mockResolvedValueOnce({ rows: [] });
    mockGetDatabasePool.mockReturnValue({ query: mockQuery } as any);
    mockOrderEntitlementService.listForOrder.mockResolvedValue([]);

    const app = Fastify();
    await app.register(orderRoutes, { prefix: '/orders' });

    const response = await app.inject({
      method: 'POST',
      url: '/orders/order-1/credentials/reveal',
    });

    await app.close();

    expect(response.statusCode).toBe(404);
    expect(mockLogCredentialRevealAttempt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        success: false,
        failureReason: 'credentials_missing',
      })
    );
  });

  it('logs order credential reveal success', async () => {
    const mockQuery = jest.fn();
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: 'order-1', user_id: 'user-1' }],
      })
      .mockResolvedValueOnce({
        rows: [
          { id: subscriptionId, credentials_encrypted: 'credential-secret' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            order_id: 'order-1',
            user_id: 'user-1',
            contact_email: 'user@example.com',
            subscription_id: subscriptionId,
            order_item_id: 'item-1',
            credentials_encrypted: 'credential-secret',
            product_metadata: {},
          },
        ],
      });
    mockGetDatabasePool.mockReturnValue({ query: mockQuery } as any);

    const app = Fastify();
    await app.register(orderRoutes, { prefix: '/orders' });

    const response = await app.inject({
      method: 'POST',
      url: '/orders/order-1/credentials/reveal',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().data.credentials).toBe('credential-secret');
    expect(mockLogCredentialRevealAttempt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        subscriptionId,
        success: true,
      })
    );
  });

  it('reveals an owned order item without a PIN payload and audits the reveal', async () => {
    const mockQuery = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          order_id: 'order-1',
          user_id: 'user-1',
          contact_email: 'user@example.com',
          subscription_id: subscriptionId,
          order_item_id: 'item-1',
          credentials_encrypted: 'credential-secret',
          product_metadata: { upgrade_options: { strict_rules: false } },
        },
      ],
    });
    mockGetDatabasePool.mockReturnValue({ query: mockQuery } as any);

    const app = Fastify();
    await app.register(orderRoutes, { prefix: '/orders' });

    const response = await app.inject({
      method: 'POST',
      url: `/orders/order-1/items/${subscriptionId}/reveal`,
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().data.credentials).toBe('credential-secret');
    expect(mockLogCredentialRevealAttempt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ subscriptionId, success: true })
    );
  });
});
