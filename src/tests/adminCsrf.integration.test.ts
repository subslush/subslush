import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { authRoutes } from '../routes/auth';
import { adminRoutes } from '../routes/admin';
import { CSRF_COOKIE_NAME } from '../utils/csrf';
import { jwtService } from '../services/jwtService';

var mockLogin: jest.Mock;

jest.mock('../services/auth', () => ({
  authService: {
    login: (mockLogin = jest.fn()),
  },
}));

jest.mock('../middleware/rateLimitMiddleware', () => ({
  createRateLimitHandler: () => async () => {},
}));

jest.mock('../routes/admin/catalog', () => ({
  adminCatalogRoutes: async (fastify: any) => {
    fastify.post('/products', async () => ({ ok: true }));
  },
}));

jest.mock('../routes/admin/orders', () => ({
  adminOrderRoutes: async () => {},
}));

jest.mock('../routes/admin/payments', () => ({
  adminPaymentRoutes: async () => {},
}));

jest.mock('../routes/admin/subscriptions', () => ({
  adminSubscriptionRoutes: async () => {},
}));

jest.mock('../routes/admin/credits', () => ({
  adminCreditRoutes: async () => {},
}));

jest.mock('../routes/admin/rewards', () => ({
  adminRewardRoutes: async () => {},
}));

jest.mock('../routes/admin/tasks', () => ({
  adminTaskRoutes: async () => {},
}));

jest.mock('../routes/admin/migration', () => ({
  adminMigrationRoutes: async () => {},
}));

const parseSetCookie = (
  setCookie: string[] | string | undefined
): Record<string, string> => {
  const cookieHeaders = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];

  return cookieHeaders.reduce<Record<string, string>>((cookies, header) => {
    const [cookiePair] = header.split(';');
    if (!cookiePair) {
      return cookies;
    }
    const separatorIndex = cookiePair.indexOf('=');
    if (separatorIndex < 0) {
      return cookies;
    }
    const name = cookiePair.slice(0, separatorIndex).trim();
    const value = cookiePair.slice(separatorIndex + 1).trim();
    if (name) {
      cookies[name] = value;
    }
    return cookies;
  }, {});
};

describe('Admin CSRF integration', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(cookie);
    await app.register(authRoutes, { prefix: '/auth' });
    await app.register(adminRoutes, { prefix: '/admin' });
    await app.ready();
  });

  afterEach(async () => {
    mockLogin.mockReset();
    if (app) {
      await app.close();
    }
  });

  it('blocks admin POST without CSRF header after login', async () => {
    const accessToken = jwtService.generateTokens({
      userId: 'admin-1',
      email: 'admin@example.com',
      role: 'admin',
      sessionId: 'session-1',
    }).accessToken;

    mockLogin.mockResolvedValue({
      success: true,
      user: {
        id: 'admin-1',
        email: 'admin@example.com',
        role: 'admin',
        createdAt: new Date().toISOString(),
      },
      tokens: { accessToken },
      sessionId: 'session-1',
    });

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@example.com', password: 'password' },
    });

    expect(loginResponse.statusCode).toBe(200);

    const cookies = parseSetCookie(loginResponse.headers['set-cookie']);
    expect(cookies['auth_token']).toBeDefined();
    expect(cookies[CSRF_COOKIE_NAME]).toBeDefined();

    const response = await app.inject({
      method: 'POST',
      url: '/admin/products',
      headers: {
        cookie: `auth_token=${cookies['auth_token']}; ${CSRF_COOKIE_NAME}=${cookies[CSRF_COOKIE_NAME]}`,
      },
      payload: { name: 'Test product', slug: 'test-product' },
    });

    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.error).toBe('Forbidden');
  });
});
