import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { dashboardService } from '../services/dashboardService';
import { getDatabasePool } from '../config/database';
import { creditService } from '../services/creditService';
import { orderService } from '../services/orderService';
import { subscriptionService } from '../services/subscriptionService';

jest.mock('../config/database');
jest.mock('../services/creditService');
jest.mock('../services/orderService');
jest.mock('../services/subscriptionService');
jest.mock('../utils/logger');

const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;
const mockCreditService = creditService as jest.Mocked<typeof creditService>;
const mockOrderService = orderService as jest.Mocked<typeof orderService>;
const mockSubscriptionService = subscriptionService as jest.Mocked<
  typeof subscriptionService
>;

type QueryResultRow = Record<string, unknown>;
type QueryResultLike<T extends QueryResultRow = QueryResultRow> = { rows: T[] };
type MockQuery = jest.MockedFunction<
  (text: string, params?: unknown[]) => Promise<QueryResultLike>
>;
type DatabasePool = ReturnType<typeof getDatabasePool>;

describe('DashboardService alerts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns no alerts when there are no important events', async () => {
    const mockPool: { query: MockQuery } = {
      query:
        jest.fn<
          (text: string, params?: unknown[]) => Promise<QueryResultLike>
        >(),
    };

    mockGetDatabasePool.mockReturnValue(mockPool as unknown as DatabasePool);
    mockSubscriptionService.getActiveSubscriptionsCount.mockResolvedValue(0);
    mockOrderService.listOrdersForUser.mockResolvedValue({
      orders: [],
      total: 0,
    } as any);
    mockCreditService.getUserBalance.mockResolvedValue({
      userId: 'user-1',
      totalBalance: 10,
      availableBalance: 10,
      pendingBalance: 0,
      lastUpdated: new Date('2025-01-01T00:00:00Z'),
    });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // upcomingCount
      .mockResolvedValueOnce({ rows: [] }) // upcoming list
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // due soon
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // overdue
      .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // failures
      .mockResolvedValueOnce({ rows: [{ total_cents: '0' }] }); // credit due

    const result = await dashboardService.getOverview('user-1', 'USD');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.alerts).toHaveLength(0);
    }
  });

  it('returns alerts for important renewal and credit events', async () => {
    const mockPool: { query: MockQuery } = {
      query:
        jest.fn<
          (text: string, params?: unknown[]) => Promise<QueryResultLike>
        >(),
    };

    mockGetDatabasePool.mockReturnValue(mockPool as unknown as DatabasePool);
    mockSubscriptionService.getActiveSubscriptionsCount.mockResolvedValue(3);
    mockOrderService.listOrdersForUser.mockResolvedValue({
      orders: [],
      total: 0,
    } as any);
    mockCreditService.getUserBalance.mockResolvedValue({
      userId: 'user-1',
      totalBalance: 5,
      availableBalance: 5,
      pendingBalance: 0,
      lastUpdated: new Date('2025-01-01T00:00:00Z'),
    });

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // upcomingCount
      .mockResolvedValueOnce({ rows: [] }) // upcoming list
      .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // due soon
      .mockResolvedValueOnce({ rows: [{ count: '1' }] }) // overdue
      .mockResolvedValueOnce({ rows: [{ count: '3' }] }) // failures
      .mockResolvedValueOnce({ rows: [{ total_cents: '1500' }] }); // credit due

    const result = await dashboardService.getOverview('user-1', 'USD');

    expect(result.success).toBe(true);
    if (result.success) {
      const alertTypes = result.data.alerts.map(alert => alert.type);
      expect(alertTypes).toEqual([
        'renewal_overdue',
        'renewal_due_soon',
        'renewal_payment_failed',
        'low_credits',
      ]);
      expect(result.data.alerts[0]?.count).toBe(1);
      expect(result.data.alerts[1]?.count).toBe(2);
      expect(result.data.alerts[2]?.count).toBe(3);
    }
  });
});
