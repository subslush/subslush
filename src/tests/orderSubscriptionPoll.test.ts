import Fastify from 'fastify';
import { orderRoutes } from '../routes/orders';
import { getDatabasePool } from '../config/database';
import { subscriptionService } from '../services/subscriptionService';

jest.mock('../config/database');
jest.mock('../services/subscriptionService');
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

const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;
const mockSubscriptionService = subscriptionService as jest.Mocked<
  typeof subscriptionService
>;

describe('Order subscription polling endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns subscription data when linked subscription exists', async () => {
    const mockQuery = jest.fn();
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'order-1', user_id: 'user-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'sub-1' }] });

    mockGetDatabasePool.mockReturnValue({ query: mockQuery } as any);
    mockSubscriptionService.getSubscriptionById.mockResolvedValue({
      success: true,
      data: {
        id: 'sub-1',
        user_id: 'user-1',
        credentials_encrypted: 'secret',
      },
    } as any);

    const app = Fastify();
    await app.register(orderRoutes, { prefix: '/orders' });

    const response = await app.inject({
      method: 'GET',
      url: '/orders/order-1/subscription',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.subscription.id).toBe('sub-1');
    expect(body.data.subscription.credentials_encrypted).toBeUndefined();
  });
});
