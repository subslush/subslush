import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { scryptSync } from 'crypto';
import { pinResetService } from '../services/pinResetService';
import { getDatabasePool } from '../config/database';
import { emailService } from '../services/emailService';

jest.mock('../config/database');
jest.mock('../services/emailService', () => ({
  emailService: {
    send: jest.fn(),
  },
}));
jest.mock('../utils/logger');

const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;
const mockEmailService = emailService as jest.Mocked<typeof emailService>;

type QueryResultRow = Record<string, unknown>;
type QueryResultLike<T extends QueryResultRow = QueryResultRow> = { rows: T[] };
type MockQuery = jest.MockedFunction<
  (text: string, params?: unknown[]) => Promise<QueryResultLike>
>;
type MockPoolClient = {
  query: MockQuery;
  release: jest.MockedFunction<() => void>;
};
type MockPool = {
  connect: jest.MockedFunction<() => Promise<MockPoolClient>>;
  query: MockQuery;
};

describe('PinResetService', () => {
  const userId = '123e4567-e89b-12d3-a456-426614174000';
  const adminId = '123e4567-e89b-12d3-a456-426614174999';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a reset request and sends the email', async () => {
    const mockClient: MockPoolClient = {
      query:
        jest.fn<
          (text: string, params?: unknown[]) => Promise<QueryResultLike>
        >(),
      release: jest.fn(),
    };
    const mockPool: MockPool = {
      connect: jest
        .fn<() => Promise<MockPoolClient>>()
        .mockResolvedValue(mockClient),
      query:
        jest.fn<
          (text: string, params?: unknown[]) => Promise<QueryResultLike>
        >(),
    };

    mockGetDatabasePool.mockReturnValue(
      mockPool as unknown as ReturnType<typeof getDatabasePool>
    );
    mockEmailService.send.mockResolvedValue({ success: true });

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ email: 'user@example.com' }] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE expired
      .mockResolvedValueOnce({ rows: [] }) // UPDATE superseded
      .mockResolvedValueOnce({ rows: [{ id: 'req-id' }] })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await pinResetService.requestReset(userId, adminId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.requestId).toBe('req-id');
      expect(result.data.userId).toBe(userId);
      expect(result.data.emailMasked).toContain('@');
    }
    expect(mockEmailService.send).toHaveBeenCalledTimes(1);
  });

  it('returns user_not_found when the user does not exist', async () => {
    const mockClient: MockPoolClient = {
      query:
        jest.fn<
          (text: string, params?: unknown[]) => Promise<QueryResultLike>
        >(),
      release: jest.fn(),
    };
    const mockPool: MockPool = {
      connect: jest
        .fn<() => Promise<MockPoolClient>>()
        .mockResolvedValue(mockClient),
      query:
        jest.fn<
          (text: string, params?: unknown[]) => Promise<QueryResultLike>
        >(),
    };

    mockGetDatabasePool.mockReturnValue(
      mockPool as unknown as ReturnType<typeof getDatabasePool>
    );

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT email
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const result = await pinResetService.requestReset(userId, adminId);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('user_not_found');
    }
    expect(mockEmailService.send).not.toHaveBeenCalled();
  });

  it('confirms reset when verification code matches', async () => {
    const code = '123456789';
    const salt = 'testsalt';
    const codeHash = scryptSync(code, salt, 64).toString('hex');

    const mockClient: MockPoolClient = {
      query:
        jest.fn<
          (text: string, params?: unknown[]) => Promise<QueryResultLike>
        >(),
      release: jest.fn(),
    };
    const mockPool: MockPool = {
      connect: jest
        .fn<() => Promise<MockPoolClient>>()
        .mockResolvedValue(mockClient),
      query:
        jest.fn<
          (text: string, params?: unknown[]) => Promise<QueryResultLike>
        >(),
    };

    mockGetDatabasePool.mockReturnValue(
      mockPool as unknown as ReturnType<typeof getDatabasePool>
    );

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ pin_hash: 'hash' }] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE expired
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'req-id',
            code_hash: codeHash,
            code_salt: salt,
            expires_at: new Date().toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE request
      .mockResolvedValueOnce({ rows: [] }) // UPDATE users
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const result = await pinResetService.confirmReset(userId, code, adminId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.userId).toBe(userId);
      expect(result.data.hadPin).toBe(true);
    }
  });

  it('rejects invalid verification codes', async () => {
    const codeHash = scryptSync('123456789', 'testsalt', 64).toString('hex');

    const mockClient: MockPoolClient = {
      query:
        jest.fn<
          (text: string, params?: unknown[]) => Promise<QueryResultLike>
        >(),
      release: jest.fn(),
    };
    const mockPool: MockPool = {
      connect: jest
        .fn<() => Promise<MockPoolClient>>()
        .mockResolvedValue(mockClient),
      query:
        jest.fn<
          (text: string, params?: unknown[]) => Promise<QueryResultLike>
        >(),
    };

    mockGetDatabasePool.mockReturnValue(
      mockPool as unknown as ReturnType<typeof getDatabasePool>
    );

    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ pin_hash: 'hash' }] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE expired
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'req-id',
            code_hash: codeHash,
            code_salt: 'testsalt',
            expires_at: new Date().toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const result = await pinResetService.confirmReset(
      userId,
      '000000000',
      adminId
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('invalid_code');
    }
  });
});
