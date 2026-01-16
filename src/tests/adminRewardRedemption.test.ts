import Fastify from 'fastify';
import { adminRewardRoutes } from '../routes/admin/rewards';
import { getDatabasePool } from '../config/database';
import { creditService } from '../services/creditService';
import { logAdminAction } from '../services/auditLogService';

jest.mock('../config/database');
jest.mock('../services/creditService');
jest.mock('../services/auditLogService');
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
const mockCreditService = creditService as jest.Mocked<typeof creditService>;
const mockLogAdminAction = logAdminAction as jest.MockedFunction<
  typeof logAdminAction
>;

describe('Admin reward redemption', () => {
  const mockPool = {
    query: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDatabasePool.mockReturnValue(mockPool as any);
  });

  it('redeems a referral reward to credits', async () => {
    const rewardRow = {
      id: 'reward-1',
      reward_type: 'credit',
      free_months: 0,
      redeemed_at: null,
      redeemed_by_user_id: null,
      is_redeemed: false,
      applied_value_cents: null,
      linked_user_id: 'user-1',
    };

    mockPool.query
      .mockResolvedValueOnce({ rows: [rewardRow] })
      .mockResolvedValueOnce({ rows: [] });

    mockCreditService.addCredits.mockResolvedValue({
      success: true,
      transaction: {
        id: 'tx-1',
        balanceBefore: 0,
        balanceAfter: 5,
      },
      balance: {
        userId: 'user-1',
        totalBalance: 5,
        availableBalance: 5,
        pendingBalance: 0,
        lastUpdated: new Date(),
      },
    } as any);

    const fastify = Fastify();
    await fastify.register(adminRewardRoutes, { prefix: '/admin/rewards' });

    const response = await fastify.inject({
      method: 'POST',
      url: '/admin/rewards/referral/reward-1/redeem',
      payload: {
        userId: 'user-1',
        appliedValueCents: 500,
      },
    });

    await fastify.close();

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.data.rewardId).toBe('reward-1');

    expect(mockCreditService.addCredits).toHaveBeenCalledWith(
      'user-1',
      5,
      'bonus',
      'Referral reward redemption',
      {
        rewardId: 'reward-1',
        rewardType: rewardRow.reward_type,
      },
      expect.objectContaining({
        referralRewardId: 'reward-1',
        priceCents: 500,
        statusReason: 'reward_redemption',
      })
    );

    expect(mockLogAdminAction).toHaveBeenCalled();
  });
});
