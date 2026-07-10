import Fastify from 'fastify';
import { adminTaskRoutes } from '../routes/admin/tasks';
import { getDatabasePool } from '../config/database';
import { subscriptionService } from '../services/subscriptionService';
import { notificationService } from '../services/notificationService';

jest.mock('../config/database');
jest.mock('../services/auditLogService', () => ({
  logAdminAction: jest.fn(),
}));
jest.mock('../services/subscriptionService', () => ({
  subscriptionService: {
    updateSubscriptionForAdmin: jest.fn(),
    getSubscriptionById: jest.fn(),
  },
}));
jest.mock('../services/notificationService', () => ({
  notificationService: {
    createNotification: jest.fn(),
  },
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

const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;
const mockSubscriptionService = subscriptionService as jest.Mocked<
  typeof subscriptionService
>;
const mockNotificationService = notificationService as jest.Mocked<
  typeof notificationService
>;

describe('Admin task completion', () => {
  const mockPool = {
    query: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDatabasePool.mockReturnValue(mockPool as any);
    mockSubscriptionService.updateSubscriptionForAdmin.mockResolvedValue({
      success: true,
    } as any);
    mockNotificationService.createNotification.mockResolvedValue({} as any);
  });

  it('returns 400 for invalid task id format without hitting the database', async () => {
    const app = Fastify();
    await app.register(adminTaskRoutes, { prefix: '/admin/tasks' });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/tasks/invalid-uuid/complete',
      payload: { note: 'done' },
    });

    await app.close();

    expect(response.statusCode).toBe(400);
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('returns 404 when the task does not exist', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const app = Fastify();
    await app.register(adminTaskRoutes, { prefix: '/admin/tasks' });

    const response = await app.inject({
      method: 'POST',
      url: '/admin/tasks/11111111-1111-1111-1111-111111111111/complete',
      payload: { note: 'done' },
    });

    await app.close();

    expect(response.statusCode).toBe(404);
    expect(mockPool.query).toHaveBeenCalledTimes(2);
  });

  it('completes an MMU renewal task when the parent order is paid with a succeeded payment', async () => {
    const taskId = '11111111-1111-4111-8111-111111111111';
    mockPool.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: taskId,
            task_type: 'manual_monthly_upgrade',
            subscription_id: '22222222-2222-4222-8222-222222222222',
            order_id: '33333333-3333-4333-8333-333333333333',
            completed_at: null,
            payment_confirmed_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            status: 'paid',
            has_succeeded_payment: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: taskId,
            subscription_id: '22222222-2222-4222-8222-222222222222',
            completed_at: new Date('2026-02-01T00:00:00Z'),
            notes: '[2026-02-01T00:00:00.000Z] renewed',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            user_id: '44444444-4444-4444-8444-444444444444',
            service_type: 'Netflix',
            service_plan: 'Premium',
            term_start_at: new Date('2026-01-01T00:00:00Z'),
            term_months: 6,
            auto_renew: false,
            product_name: 'Netflix',
            variant_name: 'Premium',
          },
        ],
      });

    const app = Fastify();
    await app.register(adminTaskRoutes, { prefix: '/admin/tasks' });

    const response = await app.inject({
      method: 'POST',
      url: `/admin/tasks/${taskId}/renewal/confirm`,
      payload: { note: 'Renewed from admin-next' },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(mockPool.query.mock.calls[2][0]).toContain(
      'SET completed_at = NOW()'
    );
    expect(
      mockPool.query.mock.calls.map(call => call[0]).join('\n')
    ).not.toContain('payment_confirmed_at');
  });

  it('rejects an MMU renewal task when the parent order is not paid', async () => {
    const taskId = '11111111-1111-4111-8111-111111111112';
    mockPool.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: taskId,
            task_type: 'manual_monthly_upgrade',
            subscription_id: '22222222-2222-4222-8222-222222222222',
            order_id: '33333333-3333-4333-8333-333333333333',
            completed_at: null,
            payment_confirmed_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            status: 'pending_payment',
            has_succeeded_payment: false,
          },
        ],
      });

    const app = Fastify();
    await app.register(adminTaskRoutes, { prefix: '/admin/tasks' });

    const response = await app.inject({
      method: 'POST',
      url: `/admin/tasks/${taskId}/renewal/confirm`,
      payload: { note: 'Renewed from admin-next' },
    });

    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe(
      'Parent order payment must be verified before completing MMU renewal'
    );
    expect(mockPool.query).toHaveBeenCalledTimes(2);
  });

  it('still rejects non-MMU renewal completion without task payment confirmation', async () => {
    const taskId = '11111111-1111-4111-8111-111111111113';
    mockPool.query.mockResolvedValueOnce({
      rows: [
        {
          id: taskId,
          task_type: 'renewal',
          subscription_id: '22222222-2222-4222-8222-222222222222',
          order_id: '33333333-3333-4333-8333-333333333333',
          completed_at: null,
          payment_confirmed_at: null,
        },
      ],
    });

    const app = Fastify();
    await app.register(adminTaskRoutes, { prefix: '/admin/tasks' });

    const response = await app.inject({
      method: 'POST',
      url: `/admin/tasks/${taskId}/renewal/confirm`,
      payload: { note: 'Renewed' },
    });

    await app.close();

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBe(
      'Confirm payment before completing renewal'
    );
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });
});
