import Fastify from 'fastify';
import { adminSubscriptionRoutes } from '../routes/admin/subscriptions';
import { subscriptionService } from '../services/subscriptionService';

jest.mock('../middleware/authMiddleware', () => ({
  authPreHandler: jest.fn(async (request: any) => {
    request.user = {
      userId: 'admin-user',
      email: 'admin@example.com',
      role: 'admin',
      isAdmin: true,
    };
  }),
}));

jest.mock('../middleware/adminMiddleware', () => ({
  adminPreHandler: jest.fn(async () => {}),
}));

jest.mock('../services/subscriptionService', () => ({
  subscriptionService: {
    getSubscriptionById: jest.fn(),
    updateSubscriptionCredentialsForAdmin: jest.fn(),
    updateSubscriptionStatus: jest.fn(),
  },
}));

jest.mock('../services/auditLogService', () => ({
  logAdminAction: jest.fn(),
}));

const mockSubscriptionService = subscriptionService as jest.Mocked<
  typeof subscriptionService
>;

describe('Admin subscription credentials endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects empty credentials', async () => {
    const app = Fastify();
    await app.register(adminSubscriptionRoutes, {
      prefix: '/admin/subscriptions',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/subscriptions/sub-123/credentials',
      payload: { credentials: '   ' },
    });

    await app.close();

    expect(response.statusCode).toBe(400);
  });

  it('updates credentials without returning sensitive data', async () => {
    mockSubscriptionService.getSubscriptionById.mockResolvedValueOnce({
      success: true,
      data: {
        id: 'sub-123',
        user_id: 'user-123',
        credentials_encrypted: 'old-creds',
      },
    } as any);
    mockSubscriptionService.updateSubscriptionCredentialsForAdmin.mockResolvedValueOnce(
      {
        success: true,
        data: {
          id: 'sub-123',
          user_id: 'user-123',
          credentials_encrypted: 'new-creds',
        },
      } as any
    );

    const app = Fastify();
    await app.register(adminSubscriptionRoutes, {
      prefix: '/admin/subscriptions',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/subscriptions/sub-123/credentials',
      payload: { credentials: 'new-creds' },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.credentials_encrypted).toBeUndefined();
  });

  it('updates subscription status via dedicated endpoint', async () => {
    mockSubscriptionService.getSubscriptionById.mockResolvedValueOnce({
      success: true,
      data: {
        id: 'sub-123',
        user_id: 'user-123',
        status: 'active',
        credentials_encrypted: 'secret',
      },
    } as any);
    mockSubscriptionService.updateSubscriptionStatus.mockResolvedValueOnce({
      success: true,
      data: {
        id: 'sub-123',
        user_id: 'user-123',
        status: 'cancelled',
        credentials_encrypted: 'secret',
      },
    } as any);

    const app = Fastify();
    await app.register(adminSubscriptionRoutes, {
      prefix: '/admin/subscriptions',
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/admin/subscriptions/sub-123/status',
      payload: { status: 'cancelled', reason: 'Admin update' },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.status).toBe('cancelled');
    expect(body.data.credentials_encrypted).toBeUndefined();
  });
});
