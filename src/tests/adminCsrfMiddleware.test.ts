import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { adminRoutes } from '../routes/admin';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../utils/csrf';

jest.mock('../middleware/rateLimitMiddleware', () => ({
  createRateLimitHandler: () => async () => {},
}));

jest.mock('../routes/admin/catalog', () => ({
  adminCatalogRoutes: async (fastify: any) => {
    fastify.post('/product-variants', async () => ({ ok: true }));
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

describe('Admin CSRF enforcement', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(cookie);
    await app.register(adminRoutes, { prefix: '/admin' });
    await app.ready();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('blocks cookie-authenticated admin POST without CSRF header', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/admin/product-variants',
      headers: {
        cookie: 'auth_token=test-token',
      },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Forbidden');
  });

  it('allows admin POST when CSRF header matches cookie', async () => {
    const csrfToken = 'csrf-token-123';
    const response = await app.inject({
      method: 'POST',
      url: '/admin/product-variants',
      headers: {
        cookie: `auth_token=test-token; ${CSRF_COOKIE_NAME}=${csrfToken}`,
        [CSRF_HEADER_NAME]: csrfToken,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.ok).toBe(true);
  });
});
