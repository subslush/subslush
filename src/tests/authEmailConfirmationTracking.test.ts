import { createClient } from '@supabase/supabase-js';
import { getDatabasePool } from '../config/database';
import { sessionService } from '../services/sessionService';
import { jwtService } from '../services/jwtService';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

jest.mock('../config/database', () => ({
  getDatabasePool: jest.fn(),
}));

jest.mock('../services/sessionService', () => ({
  sessionService: { createSession: jest.fn() },
}));

jest.mock('../services/jwtService', () => ({
  jwtService: { generateTokens: jest.fn() },
}));

const mockCreateClient = createClient as jest.MockedFunction<
  typeof createClient
>;
const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;
const mockSessionService = sessionService as jest.Mocked<typeof sessionService>;
const mockJwtService = jwtService as jest.Mocked<typeof jwtService>;

describe('AuthService email confirmation transition', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('marks only the first successful confirmation as newly verified', async () => {
    const supabaseUser = {
      id: 'user-123',
      email: 'buyer@example.com',
      created_at: '2026-07-01T10:00:00.000Z',
      email_confirmed_at: '2026-07-01T10:05:00.000Z',
      user_metadata: {},
    };
    const getUser = jest.fn().mockResolvedValue({
      data: { user: supabaseUser },
      error: null,
    });

    mockCreateClient
      .mockImplementationOnce(() => ({ auth: { getUser } }) as any)
      .mockImplementationOnce(() => ({ auth: { admin: {} } }) as any);

    let verified = false;
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('SELECT first_name')) {
        return {
          rowCount: 1,
          rows: [
            {
              first_name: 'Test',
              last_name: 'Buyer',
              status: 'active',
              pin_set_at: null,
              email_verified_at: verified ? '2026-07-01T10:05:00.000Z' : null,
            },
          ],
        };
      }
      if (sql.includes('registration_conversion_recorded_at = NOW()')) {
        if (verified) return { rowCount: 0, rows: [] };
        verified = true;
        return { rowCount: 1, rows: [{ id: supabaseUser.id }] };
      }
      if (sql.includes('SET last_login = NOW()')) {
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`Unexpected SQL in test: ${sql}`);
    });
    mockGetDatabasePool.mockReturnValue({ query } as any);
    mockSessionService.createSession.mockResolvedValue('session-123');
    mockJwtService.generateTokens.mockReturnValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    } as any);

    let authService: any;
    jest.isolateModules(() => {
      authService = require('../services/auth').authService;
    });

    const first = await authService.confirmEmail(
      { accessToken: 'confirmation-token' },
      { ipAddress: '127.0.0.1', userAgent: 'jest' }
    );
    const repeat = await authService.confirmEmail(
      { accessToken: 'confirmation-token' },
      { ipAddress: '127.0.0.1', userAgent: 'jest' }
    );

    expect(first).toMatchObject({ success: true, isNewlyVerified: true });
    expect(repeat).toMatchObject({ success: true, isNewlyVerified: false });
    expect(
      query.mock.calls.filter(([sql]) =>
        String(sql).includes('registration_conversion_recorded_at = NOW()')
      )
    ).toHaveLength(2);
  });
});
