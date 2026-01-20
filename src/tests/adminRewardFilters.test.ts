import Fastify from 'fastify';
import { adminRewardRoutes } from '../routes/admin/rewards';
import { getDatabasePool } from '../config/database';

jest.mock('../config/database');
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

const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;

describe('Admin reward list filters', () => {
  const mockPool = {
    query: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDatabasePool.mockReturnValue(mockPool as any);
  });

  it('supports redeemed and search filters for referral rewards', async () => {
    const rewardRow = {
      id: 'reward-1',
      user_id: 'pre-1',
      linked_user_id: 'user-1',
      redeemed_at: new Date('2025-01-01T00:00:00Z'),
      redeemed_by_user_id: 'user-1',
    };

    mockPool.query.mockResolvedValueOnce({ rows: [rewardRow] });

    const app = Fastify();
    await app.register(adminRewardRoutes, { prefix: '/admin/rewards' });

    const response = await app.inject({
      method: 'GET',
      url: '/admin/rewards/referral?redeemed=true&search=test@example.com',
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.rewards[0].status).toBe('redeemed');

    const sql = mockPool.query.mock.calls[0][0];
    expect(sql).toContain('redeemed_at');
    expect(sql).toContain('ILIKE');
  });
});
