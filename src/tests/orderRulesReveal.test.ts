import Fastify from 'fastify';
import { orderRoutes } from '../routes/orders';
import { getDatabasePool } from '../config/database';
import { logCredentialRevealAttempt } from '../services/auditLogService';
import { orderComplianceEvidenceService } from '../services/orderComplianceEvidenceService';
import { subscriptionService } from '../services/subscriptionService';

jest.mock('../config/database');
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
}));
jest.mock('../services/auditLogService', () => ({
  logCredentialRevealAttempt: jest.fn(),
}));
jest.mock('../services/orderComplianceEvidenceService', () => ({
  orderComplianceEvidenceService: {
    recordCredentialRevealEvidence: jest.fn(),
    recordGenericEvidence: jest.fn(),
  },
}));
jest.mock('../services/subscriptionService', () => ({
  subscriptionService: {
    updateSubscriptionCredentialsEncryptedValue: jest.fn(),
  },
}));
jest.mock('../utils/logger');

const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;
const mockLogCredentialRevealAttempt =
  logCredentialRevealAttempt as jest.MockedFunction<
    typeof logCredentialRevealAttempt
  >;
const mockEvidenceService = orderComplianceEvidenceService as jest.Mocked<
  typeof orderComplianceEvidenceService
>;
const mockSubscriptionService = subscriptionService as jest.Mocked<
  typeof subscriptionService
>;

const strictMetadata = {
  upgrade_options: {
    strict_rules: true,
    strict_rules_text: 'Do not change profile',
    strict_rules_version: 3,
  },
};

describe('Order strict-rules acceptance and reveal', () => {
  const subscriptionId = '123e4567-e89b-42d3-a456-426614174000';

  beforeEach(() => {
    jest.clearAllMocks();
    mockSubscriptionService.updateSubscriptionCredentialsEncryptedValue.mockResolvedValue(
      true
    );
  });

  const register = async () => {
    const app = Fastify();
    await app.register(orderRoutes, { prefix: '/orders' });
    return app;
  };

  it('rejects missing and false rules confirmation without evidence writes', async () => {
    const mockQuery = jest.fn();
    mockGetDatabasePool.mockReturnValue({ query: mockQuery } as any);
    const app = await register();

    const missing = await app.inject({
      method: 'POST',
      url: `/orders/order-1/items/${subscriptionId}/accept-rules`,
    });
    const falseConfirm = await app.inject({
      method: 'POST',
      url: `/orders/order-1/items/${subscriptionId}/accept-rules`,
      payload: { confirmed: false },
    });

    await app.close();

    expect(missing.statusCode).toBe(400);
    expect(falseConfirm.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockEvidenceService.recordGenericEvidence).not.toHaveBeenCalled();
  });

  it('rejects non-strict products without evidence writes', async () => {
    const mockQuery = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          contact_email: 'user@example.com',
          order_item_id: 'item-1',
          product_metadata: {},
        },
      ],
    });
    mockGetDatabasePool.mockReturnValue({ query: mockQuery } as any);
    const app = await register();

    const response = await app.inject({
      method: 'POST',
      url: `/orders/order-1/items/${subscriptionId}/accept-rules`,
      payload: { confirmed: true },
    });

    await app.close();

    expect(response.statusCode).toBe(400);
    expect(mockEvidenceService.recordGenericEvidence).not.toHaveBeenCalled();
  });

  it('records exactly one versioned acceptance and repeats idempotently', async () => {
    const itemRow = {
      contact_email: 'user@example.com',
      order_item_id: 'item-1',
      product_metadata: strictMetadata,
    };
    const mockQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [itemRow] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [itemRow] })
      .mockResolvedValueOnce({ rows: [{ created_at: new Date() }] });
    mockGetDatabasePool.mockReturnValue({ query: mockQuery } as any);
    const app = await register();

    const first = await app.inject({
      method: 'POST',
      url: `/orders/order-1/items/${subscriptionId}/accept-rules`,
      payload: { confirmed: true },
    });
    const second = await app.inject({
      method: 'POST',
      url: `/orders/order-1/items/${subscriptionId}/accept-rules`,
      payload: { confirmed: true },
    });

    await app.close();

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(mockEvidenceService.recordGenericEvidence).toHaveBeenCalledTimes(1);
    expect(mockEvidenceService.recordGenericEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          rules_version: 3,
          subscription_id: subscriptionId,
        }),
      })
    );
  });

  it('refuses legacy order-level reveal for strict items until acceptance exists', async () => {
    const mockQuery = jest
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'order-1',
            user_id: 'user-1',
            contact_email: 'user@example.com',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: subscriptionId, credentials_encrypted: 'secret' }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            order_id: 'order-1',
            user_id: 'user-1',
            contact_email: 'user@example.com',
            subscription_id: subscriptionId,
            order_item_id: 'item-1',
            credentials_encrypted: 'secret',
            product_metadata: strictMetadata,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    mockGetDatabasePool.mockReturnValue({ query: mockQuery } as any);
    const app = await register();

    const response = await app.inject({
      method: 'POST',
      url: '/orders/order-1/credentials/reveal',
    });

    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain('secret');
    expect(mockLogCredentialRevealAttempt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        success: false,
        failureReason: 'strict_rules_not_accepted',
      })
    );
    expect(
      mockEvidenceService.recordCredentialRevealEvidence
    ).not.toHaveBeenCalled();
  });
});
