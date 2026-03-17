import Fastify from 'fastify';
import { userRoutes } from '../routes/users';
import { adminPinResetRoutes } from '../routes/admin/pinReset';

jest.mock('../middleware/rateLimitMiddleware', () => ({
  createRateLimitHandler: jest.fn(() => async () => {}),
  rateLimitMiddleware: jest.fn(() => async () => {}),
}));

jest.mock('../middleware/authMiddleware', () => ({
  authPreHandler: jest.fn(async (request: any) => {
    request.user = {
      userId: 'admin-1',
      email: 'admin@example.com',
      role: 'admin',
      sessionId: 'session-1',
      isAdmin: true,
    };
  }),
}));

jest.mock('../middleware/adminMiddleware', () => ({
  adminPreHandler: jest.fn(async () => {}),
}));

jest.mock('../utils/logger');

describe('PIN deprecation routes', () => {
  it.each([
    { method: 'GET' as const, url: '/users/pin/status' },
    { method: 'POST' as const, url: '/users/pin/set', payload: { pin: '1234' } },
    {
      method: 'POST' as const,
      url: '/users/pin/verify',
      payload: { pin: '1234' },
    },
    { method: 'POST' as const, url: '/users/pin/reset-request' },
  ])('returns 410 for deprecated user endpoint $url', async testCase => {
    const app = Fastify();
    await app.register(userRoutes, { prefix: '/users' });

    const response = await app.inject({
      method: testCase.method,
      url: testCase.url,
      payload: testCase.payload,
    });

    await app.close();

    expect(response.statusCode).toBe(410);
    const body = response.json();
    expect(body.error).toBe('Gone');
    expect(body.code).toBe('PIN_DEPRECATED');
    expect(body.message).toContain('PIN is deprecated');
  });

  it.each([
    { method: 'POST' as const, url: '/admin/pin-reset/request', payload: { user_id: 'u1' } },
    {
      method: 'POST' as const,
      url: '/admin/pin-reset/confirm',
      payload: { user_id: 'u1', code: '123456789' },
    },
  ])('returns 410 for deprecated admin endpoint $url', async testCase => {
    const app = Fastify();
    await app.register(adminPinResetRoutes, { prefix: '/admin/pin-reset' });

    const response = await app.inject({
      method: testCase.method,
      url: testCase.url,
      payload: testCase.payload,
    });

    await app.close();

    expect(response.statusCode).toBe(410);
    const body = response.json();
    expect(body.error).toBe('Gone');
    expect(body.code).toBe('PIN_DEPRECATED');
    expect(body.message).toContain('PIN reset is deprecated');
  });
});
