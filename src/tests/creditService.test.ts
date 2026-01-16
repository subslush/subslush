import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { creditService } from '../services/creditService';
import { redisClient } from '../config/redis';
import { getDatabasePool } from '../config/database';

jest.mock('../config/redis');
jest.mock('../config/database');

const mockRedisClient = redisClient as jest.Mocked<typeof redisClient>;
const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;

const mockRedis = {
  get: jest.fn<() => Promise<string | null>>(),
  setex: jest.fn<() => Promise<string>>(),
  del: jest.fn<() => Promise<number>>(),
};

const mockDbClient = {
  query: jest.fn<(sql: string, params?: any[]) => Promise<any>>(),
  release: jest.fn<() => void>(),
};

const mockPool = {
  connect: jest
    .fn<() => Promise<typeof mockDbClient>>()
    .mockResolvedValue(mockDbClient),
};

describe('CreditService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisClient.getClient.mockReturnValue(mockRedis as any);
    mockGetDatabasePool.mockReturnValue(mockPool as any);
  });

  it('stores debit transactions as negative amounts', async () => {
    mockDbClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [{ total_balance: '100' }] }) // balance
      .mockResolvedValueOnce({ rows: [] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    jest.spyOn(creditService, 'getUserBalance').mockResolvedValue({
      userId: 'user-123',
      totalBalance: 75,
      availableBalance: 75,
      pendingBalance: 0,
      lastUpdated: new Date(),
    });

    const result = await creditService.spendCredits(
      'user-123',
      25,
      'Test debit'
    );

    expect(result.success).toBe(true);
    const insertCall = mockDbClient.query.mock.calls[3]!;
    const params = insertCall[1] as any[];
    expect(params[3]).toBe(-25);
  });

  it('records refund reversals with negative amounts', async () => {
    mockDbClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [{ total_balance: '200' }] }) // balance
      .mockResolvedValueOnce({ rows: [] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    jest.spyOn(creditService, 'getUserBalance').mockResolvedValue({
      userId: 'user-456',
      totalBalance: 150,
      availableBalance: 150,
      pendingBalance: 0,
      lastUpdated: new Date(),
    });

    const result = await creditService.reverseCredits(
      'user-456',
      50,
      'Refund reversal'
    );

    expect(result.success).toBe(true);
    const insertCall = mockDbClient.query.mock.calls[3]!;
    const params = insertCall[1] as any[];
    expect(params[2]).toBe('refund_reversal');
    expect(params[3]).toBe(-50);
  });
});
