import { createClient } from '@supabase/supabase-js';
import { getDatabasePool } from '../config/database';
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

jest.mock('../config/database', () => ({
  getDatabasePool: jest.fn(),
}));

const mockCreateClient = createClient as jest.MockedFunction<
  typeof createClient
>;
const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;

const loadAuthService = () => {
  let authService: any;
  jest.isolateModules(() => {
    authService = require('../services/auth').authService;
  });
  return authService;
};

describe('AuthService password reset verification gate', () => {
  const mockResetPasswordForEmail = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();

    mockCreateClient.mockImplementation(
      () =>
        ({
          auth: {
            resetPasswordForEmail: mockResetPasswordForEmail,
            admin: {
              deleteUser: jest.fn(),
            },
          },
        }) as any
    );
    mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  });

  it('rejects password reset for unverified users', async () => {
    const mockPool = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [
          {
            id: 'user-123',
            status: 'active',
            email_verified_at: null,
          },
        ],
      }),
    };
    mockGetDatabasePool.mockReturnValue(mockPool as any);

    const authService = loadAuthService();

    const result = await authService.requestPasswordReset('user@example.com');

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'Please verify your email before requesting a password reset'
    );
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('allows password reset for verified users', async () => {
    const mockPool = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [
          {
            id: 'user-123',
            status: 'active',
            email_verified_at: '2024-01-01T00:00:00Z',
          },
        ],
      }),
    };
    mockGetDatabasePool.mockReturnValue(mockPool as any);

    const authService = loadAuthService();

    const result = await authService.requestPasswordReset('user@example.com');

    expect(result.success).toBe(true);
    const redirectTo = process.env['PASSWORD_RESET_REDIRECT_URL'];
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
      'user@example.com',
      redirectTo ? { redirectTo } : undefined
    );
  });
});
