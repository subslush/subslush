import { getDatabasePool } from '../config/database';
import { userService } from '../services/userService';

jest.mock('../config/database');
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      admin: {
        getUserById: jest.fn().mockResolvedValue({
          data: { user: { user_metadata: {} } },
        }),
      },
    },
  })),
}));

const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;

describe('User status audit logging', () => {
  it('persists status changes when audit insert fails', async () => {
    const client = {
      query: jest.fn(),
      release: jest.fn(),
    };

    const pool = {
      connect: jest.fn().mockResolvedValue(client),
      query: jest.fn(),
    };

    mockGetDatabasePool.mockReturnValue(pool as any);

    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ status: 'suspended' }] }) // SELECT status
      .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE users
      .mockResolvedValueOnce({}) // SAVEPOINT
      .mockRejectedValueOnce(
        new Error('relation "user_status_audit" does not exist')
      ) // INSERT audit
      .mockResolvedValueOnce({}) // ROLLBACK TO SAVEPOINT
      .mockResolvedValueOnce({}) // RELEASE SAVEPOINT
      .mockResolvedValueOnce({}); // COMMIT

    pool.query.mockResolvedValueOnce({
      rows: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          email: 'user@example.com',
          created_at: new Date(),
          last_login: new Date(),
          status: 'active',
          display_name: null,
          user_timezone: null,
          language_preference: null,
          notification_preferences: {},
          profile_updated_at: new Date(),
        },
      ],
    });

    const result = await userService.updateUserStatus(
      '11111111-1111-1111-1111-111111111111',
      { status: 'active', reason: 'QA status update' },
      '00000000-0000-0000-0000-000000000001'
    );

    expect(result.success).toBe(true);
    expect(client.query).toHaveBeenCalledWith('SAVEPOINT user_status_audit');
    expect(client.query).toHaveBeenCalledWith(
      'ROLLBACK TO SAVEPOINT user_status_audit'
    );
    expect(client.query).toHaveBeenCalledWith(
      'RELEASE SAVEPOINT user_status_audit'
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
  });
});
