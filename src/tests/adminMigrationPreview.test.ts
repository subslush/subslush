import Fastify from 'fastify';
import { adminMigrationRoutes } from '../routes/admin/migration';
import { getDatabasePool } from '../config/database';

jest.mock('../config/database');
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

describe('Admin migration preview', () => {
  const mockPool = {
    query: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetDatabasePool.mockReturnValue(mockPool as any);
  });

  it('returns aggregated migration counts', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: 2 }] }) // duplicates users
      .mockResolvedValueOnce({ rows: [{ count: 1 }] }) // duplicates prereg
      .mockResolvedValueOnce({ rows: [{ count: 10 }] }) // eligible matches
      .mockResolvedValueOnce({ rows: [{ count: 3 }] }) // unmatched prereg
      .mockResolvedValueOnce({ rows: [{ count: 4 }] }) // prelaunch mappable
      .mockResolvedValueOnce({ rows: [{ count: 6 }] }) // referral mappable
      .mockResolvedValueOnce({ rows: [{ table_name: 'calendar_vouchers' }] }) // table exists
      .mockResolvedValueOnce({ rows: [{ count: 2 }] }) // calendar vouchers
      .mockResolvedValueOnce({
        rows: [{ table_name: 'calendar_raffle_entries' }],
      }) // table exists
      .mockResolvedValueOnce({ rows: [{ count: 5 }] }); // raffle entries

    const fastify = Fastify();
    await fastify.register(adminMigrationRoutes, {
      prefix: '/admin/migration',
    });

    const response = await fastify.inject({
      method: 'POST',
      url: '/admin/migration/preview',
    });

    await fastify.close();

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.data.mappedUsers).toBe(10);
    expect(body.data.unmatchedPreRegistrations).toBe(3);
    expect(body.data.duplicateEmails).toBe(3);
    expect(body.data.rewardsMigrated).toBe(10);
    expect(body.data.vouchersMigrated).toBe(2);
    expect(body.data.raffleEntriesMigrated).toBe(5);
  });

  it('returns zero counts when calendar tables are missing', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // duplicates users
      .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // duplicates prereg
      .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // eligible matches
      .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // unmatched prereg
      .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // prelaunch mappable
      .mockResolvedValueOnce({ rows: [{ count: 0 }] }) // referral mappable
      .mockResolvedValueOnce({ rows: [{ table_name: null }] }) // vouchers missing
      .mockResolvedValueOnce({ rows: [{ table_name: null }] }); // raffle missing

    const fastify = Fastify();
    await fastify.register(adminMigrationRoutes, {
      prefix: '/admin/migration',
    });

    const response = await fastify.inject({
      method: 'POST',
      url: '/admin/migration/preview',
    });

    await fastify.close();

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.data.vouchersMigrated).toBe(0);
    expect(body.data.raffleEntriesMigrated).toBe(0);
  });
});
