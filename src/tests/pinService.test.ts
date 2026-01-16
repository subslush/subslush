import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { pinService } from '../services/pinService';
import { getDatabasePool } from '../config/database';
import { redisClient } from '../config/redis';
import { orderService } from '../services/orderService';
import { hashPin } from '../utils/pin';

jest.mock('../config/database');
jest.mock('../config/redis', () => ({
  redisClient: {
    isConnected: jest.fn(),
    getClient: jest.fn(),
  },
  rateLimitRedisClient: {
    isConnected: jest.fn(),
    getClient: jest.fn(),
  },
}));
jest.mock('../services/orderService');
jest.mock('../utils/logger');

const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;
const mockRedisClient = redisClient as jest.Mocked<typeof redisClient>;
const mockOrderService = orderService as jest.Mocked<typeof orderService>;
const redisStore = new Map<string, string>();
const mockRedis = {
  setex: jest.fn(async (key: string, _ttl: number, value: string) => {
    redisStore.set(key, value);
    return 'OK';
  }),
  get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
  del: jest.fn(async (key: string) => (redisStore.delete(key) ? 1 : 0)),
};

type QueryResultRow = Record<string, unknown>;
type QueryResultLike<T extends QueryResultRow = QueryResultRow> = { rows: T[] };
type MockQuery = jest.MockedFunction<
  (text: string, params?: unknown[]) => Promise<QueryResultLike>
>;
type MockPoolClient = {
  query: MockQuery;
  release: jest.MockedFunction<() => void>;
};
type DatabasePool = ReturnType<typeof getDatabasePool>;

describe('PinService', () => {
  const userId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => {
    jest.clearAllMocks();
    redisStore.clear();
    mockRedisClient.isConnected.mockReturnValue(true);
    mockRedisClient.getClient.mockReturnValue(mockRedis as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sets PIN when the user has a paid order', async () => {
    const pinSetAt = new Date('2025-01-01T00:00:00Z');
    const mockPool: { query: MockQuery } = {
      query:
        jest.fn<
          (text: string, params?: unknown[]) => Promise<QueryResultLike>
        >(),
    };

    mockGetDatabasePool.mockReturnValue(mockPool as unknown as DatabasePool);
    mockOrderService.hasPaidOrder.mockResolvedValue(true);

    mockPool.query
      .mockResolvedValueOnce({ rows: [{ pin_hash: null }] })
      .mockResolvedValueOnce({ rows: [{ pin_set_at: pinSetAt }] });

    const result = await pinService.setPin(userId, '1234');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.pinSetAt).toEqual(pinSetAt);
    }
    expect(mockOrderService.hasPaidOrder).toHaveBeenCalledWith(userId);
  });

  it('rejects PIN setup when no paid order exists', async () => {
    const mockPool: { query: MockQuery } = {
      query:
        jest.fn<
          (text: string, params?: unknown[]) => Promise<QueryResultLike>
        >(),
    };

    mockGetDatabasePool.mockReturnValue(mockPool as unknown as DatabasePool);
    mockOrderService.hasPaidOrder.mockResolvedValue(false);
    mockPool.query.mockResolvedValueOnce({ rows: [{ pin_hash: null }] });

    const result = await pinService.setPin(userId, '1234');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('no_paid_order');
    }
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });

  it('verifies PIN and clears failed attempts', async () => {
    const pinHash = hashPin('1234');
    const mockClient: MockPoolClient = {
      query:
        jest.fn<
          (text: string, params?: unknown[]) => Promise<QueryResultLike>
        >(),
      release: jest.fn(),
    };
    const mockPool: {
      connect: jest.MockedFunction<() => Promise<MockPoolClient>>;
    } = {
      connect: jest
        .fn<() => Promise<MockPoolClient>>()
        .mockResolvedValue(mockClient),
    };

    mockGetDatabasePool.mockReturnValue(mockPool as unknown as DatabasePool);

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            pin_hash: pinHash,
            pin_failed_attempts: 2,
            pin_locked_until: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE reset
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await pinService.verifyPin(userId, '1234');

    expect(result.success).toBe(true);
    const updateCall = mockClient.query.mock.calls.find(call =>
      String(call[0]).includes('pin_failed_attempts = 0')
    );
    expect(updateCall).toBeDefined();
  });

  it('locks the user out after the fifth failed attempt', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T00:00:00Z'));
    const pinHash = hashPin('1234');
    const mockClient: MockPoolClient = {
      query:
        jest.fn<
          (text: string, params?: unknown[]) => Promise<QueryResultLike>
        >(),
      release: jest.fn(),
    };
    const mockPool: {
      connect: jest.MockedFunction<() => Promise<MockPoolClient>>;
    } = {
      connect: jest
        .fn<() => Promise<MockPoolClient>>()
        .mockResolvedValue(mockClient),
    };

    mockGetDatabasePool.mockReturnValue(mockPool as unknown as DatabasePool);

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            pin_hash: pinHash,
            pin_failed_attempts: 4,
            pin_locked_until: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE lockout
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await pinService.verifyPin(userId, '9999');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('locked');
      expect(result.lockoutTriggered).toBe(true);
      expect(result.failedAttempts).toBe(5);
      expect(result.lockedUntil?.toISOString()).toBe(
        '2025-01-01T00:10:00.000Z'
      );
    }

    const updateCall = mockClient.query.mock.calls.find(call =>
      String(call[0]).includes('pin_failed_attempts = $1')
    );
    expect(updateCall).toBeDefined();
    expect(updateCall?.[1]?.[0]).toBe(5);
  });

  it('allows verification after lockout cooldown has elapsed', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T00:00:00Z'));
    const pinHash = hashPin('1234');
    const mockClient: MockPoolClient = {
      query:
        jest.fn<
          (text: string, params?: unknown[]) => Promise<QueryResultLike>
        >(),
      release: jest.fn(),
    };
    const mockPool: {
      connect: jest.MockedFunction<() => Promise<MockPoolClient>>;
    } = {
      connect: jest
        .fn<() => Promise<MockPoolClient>>()
        .mockResolvedValue(mockClient),
    };

    mockGetDatabasePool.mockReturnValue(mockPool as unknown as DatabasePool);

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            pin_hash: pinHash,
            pin_failed_attempts: 5,
            pin_locked_until: new Date('2024-12-31T23:59:00Z'),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE reset
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await pinService.verifyPin(userId, '1234');

    expect(result.success).toBe(true);
    const resetCall = mockClient.query.mock.calls.find(call =>
      String(call[0]).includes('pin_failed_attempts = 0')
    );
    expect(resetCall).toBeDefined();
  });

  it('consumes PIN tokens only once', async () => {
    const issueResult = await pinService.issuePinToken(userId);
    expect(issueResult.success).toBe(true);
    if (!issueResult.success) {
      return;
    }

    const firstConsume = await pinService.consumePinToken(
      issueResult.data.token
    );
    expect(firstConsume.success).toBe(true);
    if (firstConsume.success) {
      expect(firstConsume.data.userId).toBe(userId);
    }

    const secondConsume = await pinService.consumePinToken(
      issueResult.data.token
    );
    expect(secondConsume.success).toBe(false);
    if (!secondConsume.success) {
      expect(secondConsume.error).toBe('PIN token not found');
    }
  });
});
