import Fastify from 'fastify';
import { userRoutes } from '../routes/users';
import { subscriptionRoutes } from '../routes/subscriptions';
import { pinService } from '../services/pinService';
import { subscriptionService } from '../services/subscriptionService';
import {
  logAdminAction,
  logCredentialRevealAttempt,
} from '../services/auditLogService';

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
jest.mock('../services/pinService', () => ({
  pinService: {
    setPin: jest.fn(),
    verifyPin: jest.fn(),
    issuePinToken: jest.fn(),
    consumePinToken: jest.fn(),
  },
}));
jest.mock('../services/subscriptionService');
jest.mock('../services/auditLogService', () => ({
  logAdminAction: jest.fn(),
  logCredentialRevealAttempt: jest.fn(),
}));
jest.mock('../utils/logger');

const mockPinService = pinService as jest.Mocked<typeof pinService>;
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
  const subscriptionId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs PIN set events', async () => {
    mockPinService.setPin.mockResolvedValue({
      success: true,
      pinSetAt: new Date('2025-01-01T00:00:00Z'),
    });

    const app = Fastify();
    await app.register(userRoutes, { prefix: '/users' });

    const response = await app.inject({
      method: 'POST',
      url: '/users/pin/set',
      payload: { pin: '1234' },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'pin_set',
        entityType: 'user',
        entityId: 'user-1',
      })
    );
  });

  it('logs PIN lockout triggers', async () => {
    mockPinService.verifyPin.mockResolvedValue({
      success: false,
      reason: 'locked',
      lockoutTriggered: true,
      failedAttempts: 5,
      lockedUntil: new Date('2025-01-01T00:10:00Z'),
    });

    const app = Fastify();
    await app.register(userRoutes, { prefix: '/users' });

    const response = await app.inject({
      method: 'POST',
      url: '/users/pin/verify',
      payload: { pin: '1234' },
    });

    await app.close();

    expect(response.statusCode).toBe(429);
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'pin_lockout',
        entityType: 'user',
        entityId: 'user-1',
      })
    );
  });

  it('logs credential reveal failures', async () => {
    mockPinService.consumePinToken.mockResolvedValue({
      success: false,
      error: 'PIN token not found',
    });

    const app = Fastify();
    await app.register(subscriptionRoutes, { prefix: '/subscriptions' });

    const response = await app.inject({
      method: 'POST',
      url: `/subscriptions/${subscriptionId}/credentials/reveal`,
      payload: { pin_token: 'token-token-12345' },
    });

    await app.close();

    expect(response.statusCode).toBe(401);
    expect(mockLogCredentialRevealAttempt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        subscriptionId,
        success: false,
        failureReason: 'pin_token_invalid',
      })
    );
  });

  it('logs credential reveal success', async () => {
    mockPinService.consumePinToken.mockResolvedValue({
      success: true,
      data: {
        userId: 'user-1',
        verifiedAt: new Date('2025-01-01T00:00:00Z').toISOString(),
      },
    });
    mockSubscriptionService.getSubscriptionById.mockResolvedValue({
      success: true,
      data: {
        id: subscriptionId,
        user_id: 'user-1',
        service_type: 'netflix',
        service_plan: 'basic',
        start_date: new Date('2024-12-01T00:00:00Z'),
        end_date: new Date('2025-02-01T00:00:00Z'),
        renewal_date: new Date('2025-01-25T00:00:00Z'),
        status: 'active',
        credentials_encrypted: 'encrypted-value',
        created_at: new Date('2024-12-01T00:00:00Z'),
      },
    } as any);

    const app = Fastify();
    await app.register(subscriptionRoutes, { prefix: '/subscriptions' });

    const response = await app.inject({
      method: 'POST',
      url: `/subscriptions/${subscriptionId}/credentials/reveal`,
      payload: { pin_token: 'token-token-12345' },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(mockLogCredentialRevealAttempt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        subscriptionId,
        success: true,
      })
    );
  });
});
