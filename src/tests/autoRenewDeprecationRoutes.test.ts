import Fastify from 'fastify';
import { subscriptionRoutes } from '../routes/subscriptions';

jest.mock('../middleware/rateLimitMiddleware', () => ({
  createRateLimitHandler: jest.fn(() => async () => {}),
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

jest.mock('../utils/logger');

describe('Renewal deprecation routes', () => {
  const subscriptionId = '3d1eeb94-9f94-4bdf-8a9a-8b50f1cd8974';

  it.each([
    {
      name: 'stripe enable',
      method: 'POST' as const,
      url: `/subscriptions/${subscriptionId}/auto-renew/enable`,
      payload: undefined,
      expectedCode: 'AUTO_RENEW_DEPRECATED',
      expectedMessage: 'Auto-renew has been deprecated',
    },
    {
      name: 'stripe confirm',
      method: 'POST' as const,
      url: `/subscriptions/${subscriptionId}/auto-renew/confirm`,
      payload: { setup_intent_id: 'seti_test_123' },
      expectedCode: 'AUTO_RENEW_DEPRECATED',
      expectedMessage: 'Auto-renew has been deprecated',
    },
    {
      name: 'credits enable',
      method: 'POST' as const,
      url: `/subscriptions/${subscriptionId}/auto-renew/credits/enable`,
      payload: undefined,
      expectedCode: 'AUTO_RENEW_DEPRECATED',
      expectedMessage: 'Auto-renew has been deprecated',
    },
    {
      name: 'stripe disable',
      method: 'POST' as const,
      url: `/subscriptions/${subscriptionId}/auto-renew/disable`,
      payload: undefined,
      expectedCode: 'AUTO_RENEW_DEPRECATED',
      expectedMessage: 'Auto-renew has been deprecated',
    },
    {
      name: 'manual credits renewal',
      method: 'POST' as const,
      url: `/subscriptions/${subscriptionId}/renewal/credits`,
      payload: undefined,
      expectedCode: 'MANUAL_RENEWAL_DEPRECATED',
      expectedMessage: 'Manual renewal has been deprecated',
    },
    {
      name: 'manual checkout renewal',
      method: 'POST' as const,
      url: `/subscriptions/${subscriptionId}/renewal/checkout`,
      payload: undefined,
      expectedCode: 'MANUAL_RENEWAL_DEPRECATED',
      expectedMessage: 'Manual renewal has been deprecated',
    },
  ])('returns 410 Gone for $name endpoint', async testCase => {
    const app = Fastify();
    await app.register(subscriptionRoutes, { prefix: '/subscriptions' });

    const response = await app.inject({
      method: testCase.method,
      url: testCase.url,
      payload: testCase.payload,
    });

    await app.close();

    expect(response.statusCode).toBe(410);
    const body = response.json();
    expect(body.error).toBe('Gone');
    expect(body.code).toBe(testCase.expectedCode);
    expect(body.message).toContain(testCase.expectedMessage);
  });
});
