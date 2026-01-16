import Fastify from 'fastify';
import { dashboardRoutes } from '../routes/dashboard';
import { orderRoutes } from '../routes/orders';
import { subscriptionRoutes } from '../routes/subscriptions';
import { dashboardService } from '../services/dashboardService';
import { orderService } from '../services/orderService';
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
jest.mock('../services/dashboardService');
jest.mock('../services/orderService');
jest.mock('../services/subscriptionService');
jest.mock('../services/auditLogService', () => ({
  logCredentialRevealAttempt: jest.fn(),
  logAdminAction: jest.fn(),
}));
jest.mock('../utils/logger');

const mockDashboardService = dashboardService as jest.Mocked<
  typeof dashboardService
>;
const mockOrderService = orderService as jest.Mocked<typeof orderService>;
const mockSubscriptionService = subscriptionService as jest.Mocked<
  typeof subscriptionService
>;

describe('Dashboard, orders, and subscriptions routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns dashboard overview data', async () => {
    mockDashboardService.getOverview.mockResolvedValue({
      success: true,
      data: {
        counts: {
          active_subscriptions: 2,
          upcoming_renewals: 1,
        },
        credits: {
          available_balance: 10,
          pending_balance: 0,
          currency: 'USD',
        },
        alerts: [],
        upcoming_renewals: [],
        recent_orders: [],
      },
    });

    const app = Fastify();
    await app.register(dashboardRoutes, { prefix: '/dashboard' });

    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/overview',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.counts.active_subscriptions).toBe(2);
    expect(mockDashboardService.getOverview).toHaveBeenCalledWith(
      'user-1',
      'USD'
    );
  });

  it('returns orders with payment method badges', async () => {
    const order = {
      id: 'order-1',
      user_id: 'user-1',
      status: 'in_process' as const,
      paid_with_credits: false,
      auto_renew: false,
      payment_provider: 'stripe',
      created_at: new Date('2025-01-01T00:00:00Z'),
      updated_at: new Date('2025-01-01T00:00:00Z'),
    };

    mockOrderService.listOrdersForUser.mockResolvedValue({
      orders: [order],
      total: 1,
    } as any);

    const app = Fastify();
    await app.register(orderRoutes, { prefix: '/orders' });

    const response = await app.inject({
      method: 'GET',
      url: '/orders',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.orders).toHaveLength(1);
    expect(body.data.orders[0].payment_method_badge).toEqual({
      type: 'stripe',
      label: 'Stripe',
    });
    expect(body.data.pagination.total).toBe(1);
    expect(body.data.pagination.hasMore).toBe(false);
  });

  it('adds renewal state and days to subscription list responses', async () => {
    const now = Date.now();
    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

    const subscription = {
      id: 'sub-1',
      user_id: 'user-1',
      service_type: 'netflix' as const,
      service_plan: 'basic' as const,
      start_date: new Date(now - 30 * 24 * 60 * 60 * 1000),
      end_date: new Date(now + 60 * 24 * 60 * 60 * 1000),
      renewal_date: new Date(now + 25 * 24 * 60 * 60 * 1000),
      status: 'active' as const,
      auto_renew: true,
      next_billing_at: new Date(now + threeDaysMs),
      credentials_encrypted: 'encrypted-value',
      created_at: new Date(now - 30 * 24 * 60 * 60 * 1000),
    };

    mockSubscriptionService.getUserSubscriptionsWithCount.mockResolvedValue({
      success: true,
      data: {
        subscriptions: [subscription],
        total: 1,
      },
    } as any);

    const app = Fastify();
    await app.register(subscriptionRoutes, { prefix: '/subscriptions' });

    const response = await app.inject({
      method: 'GET',
      url: '/subscriptions/my-subscriptions',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const returned = body.data.subscriptions[0];

    expect(returned.renewal_state).toBe('due_soon');
    expect(returned.days_until_renewal).toBe(3);
    expect(returned.credentials_encrypted).toBeUndefined();
    expect(body.data.pagination.total).toBe(1);
  });
});
