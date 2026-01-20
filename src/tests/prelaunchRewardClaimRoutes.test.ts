import Fastify from 'fastify';
import { dashboardRoutes } from '../routes/dashboard';
import { getDatabasePool } from '../config/database';
import { perkService } from '../services/perkService';

jest.mock('../config/database');
jest.mock('../services/perkService', () => ({
  perkService: {
    applyPerkToSubscription: jest.fn(),
  },
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
jest.mock('../middleware/rateLimitMiddleware', () => ({
  createRateLimitHandler: jest.fn(() => async () => {}),
}));
jest.mock('../utils/logger');

const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;
const mockPerkService = perkService as jest.Mocked<typeof perkService>;

describe('Dashboard prelaunch reward claim route', () => {
  const mockPool = {
    query: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDatabasePool.mockReturnValue(mockPool as any);
  });

  it('applies a referral reward to an eligible subscription', async () => {
    const perkRow = {
      id: 'perk-1',
      user_id: 'user-1',
      source_type: 'referral_reward',
      source_id: 'reward-1',
      reward_type: 'email_reward',
      applies_to: 'min_1_year',
      free_months: 3,
      metadata: null,
    };
    const subscriptionRow = {
      id: 'sub-1',
      status: 'active',
      term_months: 12,
      start_date: new Date('2025-01-01T00:00:00Z'),
      end_date: new Date('2026-01-01T00:00:00Z'),
    };

    mockPool.query
      .mockResolvedValueOnce({ rows: [perkRow] })
      .mockResolvedValueOnce({ rows: [subscriptionRow] });

    mockPerkService.applyPerkToSubscription.mockResolvedValue({
      success: true,
      data: {
        perk: perkRow,
        subscription_id: 'sub-1',
        new_end_date: new Date('2026-04-01T00:00:00Z'),
        new_renewal_date: new Date('2026-03-01T00:00:00Z'),
      },
    } as any);

    const app = Fastify();
    await app.register(dashboardRoutes, { prefix: '/dashboard' });

    const response = await app.inject({
      method: 'POST',
      url: '/dashboard/prelaunch-rewards/claim',
      payload: {
        perkId: 'perk-1',
        subscriptionId: 'sub-1',
      },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.rewardId).toBe('perk-1');
    expect(body.data.subscriptionId).toBe('sub-1');
    expect(mockPerkService.applyPerkToSubscription).toHaveBeenCalledWith(
      'perk-1',
      'sub-1',
      'user-1'
    );
  });

  it('rejects reward claims when subscription term is too short', async () => {
    const perkRow = {
      id: 'perk-2',
      user_id: 'user-1',
      source_type: 'referral_reward',
      source_id: 'reward-2',
      reward_type: 'purchase_reward',
      applies_to: 'min_1_year',
      free_months: 3,
      metadata: null,
    };
    const subscriptionRow = {
      id: 'sub-2',
      status: 'active',
      term_months: 6,
      start_date: new Date('2025-01-01T00:00:00Z'),
      end_date: new Date('2025-07-01T00:00:00Z'),
    };

    mockPool.query
      .mockResolvedValueOnce({ rows: [perkRow] })
      .mockResolvedValueOnce({ rows: [subscriptionRow] });

    const app = Fastify();
    await app.register(dashboardRoutes, { prefix: '/dashboard' });

    const response = await app.inject({
      method: 'POST',
      url: '/dashboard/prelaunch-rewards/claim',
      payload: {
        perkId: 'perk-2',
        subscriptionId: 'sub-2',
      },
    });

    await app.close();

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.message).toContain('minimum 12-month subscription');
    expect(mockPerkService.applyPerkToSubscription).not.toHaveBeenCalled();
  });
});
