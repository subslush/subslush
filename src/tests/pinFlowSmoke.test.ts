import Fastify from 'fastify';
import { userRoutes } from '../routes/users';
import { subscriptionRoutes } from '../routes/subscriptions';
import { pinService } from '../services/pinService';
import { subscriptionService } from '../services/subscriptionService';

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
  logCredentialRevealAttempt: jest.fn(),
  logAdminAction: jest.fn(),
}));
jest.mock('../utils/logger');

const mockPinService = pinService as jest.Mocked<typeof pinService>;
const mockSubscriptionService = subscriptionService as jest.Mocked<
  typeof subscriptionService
>;

describe('PIN setup and reveal smoke flow', () => {
  let pinSet = false;
  let storedPin = '';
  const tokenStore = new Map<string, string>();

  beforeEach(() => {
    jest.clearAllMocks();
    pinSet = false;
    storedPin = '';
    tokenStore.clear();

    mockPinService.setPin.mockImplementation(async (_userId, pin) => {
      if (pinSet) {
        return { success: false, reason: 'pin_already_set' };
      }
      pinSet = true;
      storedPin = pin;
      return {
        success: true,
        pinSetAt: new Date('2025-01-01T00:00:00Z'),
      };
    });

    mockPinService.verifyPin.mockImplementation(async (_userId, pin) => {
      if (!pinSet) {
        return { success: false, reason: 'not_set' };
      }
      if (pin !== storedPin) {
        return { success: false, reason: 'invalid', attemptsRemaining: 4 };
      }
      return { success: true };
    });

    mockPinService.issuePinToken.mockImplementation(async userId => {
      const token = 'token-1234567890';
      tokenStore.set(token, userId);
      return {
        success: true,
        data: {
          token,
          expiresAt: new Date('2025-01-01T00:10:00Z'),
          expiresInSeconds: 600,
        },
      };
    });

    mockPinService.consumePinToken.mockImplementation(async token => {
      const tokenUserId = tokenStore.get(token);
      if (!tokenUserId) {
        return { success: false, error: 'PIN token not found' };
      }
      tokenStore.delete(token);
      return {
        success: true,
        data: {
          userId: tokenUserId,
          verifiedAt: new Date('2025-01-01T00:00:00Z').toISOString(),
        },
      };
    });
  });

  it('prompts PIN setup and reveals credentials after verification', async () => {
    const subscriptionId = '123e4567-e89b-12d3-a456-426614174000';
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
    await app.register(userRoutes, { prefix: '/users' });
    await app.register(subscriptionRoutes, { prefix: '/subscriptions' });

    const verifyFirst = await app.inject({
      method: 'POST',
      url: '/users/pin/verify',
      payload: { pin: '1234' },
    });
    expect(verifyFirst.statusCode).toBe(400);
    expect(verifyFirst.json().message).toContain('not been set');

    const setResponse = await app.inject({
      method: 'POST',
      url: '/users/pin/set',
      payload: { pin: '1234' },
    });
    expect(setResponse.statusCode).toBe(200);

    const verifyResponse = await app.inject({
      method: 'POST',
      url: '/users/pin/verify',
      payload: { pin: '1234' },
    });
    expect(verifyResponse.statusCode).toBe(200);
    const token = verifyResponse.json().data.pin_token;
    expect(token).toBeDefined();

    const revealResponse = await app.inject({
      method: 'POST',
      url: `/subscriptions/${subscriptionId}/credentials/reveal`,
      payload: { pin_token: token },
    });
    await app.close();

    expect(revealResponse.statusCode).toBe(200);
    expect(revealResponse.json().data.credentials).toBe('encrypted-value');
  });
});
