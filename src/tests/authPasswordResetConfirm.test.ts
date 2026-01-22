import { createClient } from '@supabase/supabase-js';
import { getDatabasePool } from '../config/database';
import { sessionService } from '../services/sessionService';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

jest.mock('../config/database', () => ({
  getDatabasePool: jest.fn(),
}));

jest.mock('../services/sessionService', () => ({
  sessionService: {
    deleteUserSessions: jest.fn(),
  },
}));

jest.mock('../utils/logger');

const mockCreateClient = createClient as jest.MockedFunction<
  typeof createClient
>;
const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;
const mockDeleteUserSessions =
  sessionService.deleteUserSessions as jest.MockedFunction<
    typeof sessionService.deleteUserSessions
  >;

const loadAuthService = () => {
  let authService: any;
  jest.isolateModules(() => {
    authService = require('../services/auth').authService;
  });
  return authService;
};

describe('AuthService password reset confirmation', () => {
  const mockGetUser = jest.fn();
  const mockUpdateUserById = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();

    mockCreateClient.mockImplementation(
      () =>
        ({
          auth: {
            getUser: mockGetUser,
            admin: {
              updateUserById: mockUpdateUserById,
              deleteUser: jest.fn(),
              getUserById: jest.fn(),
              generateLink: jest.fn(),
            },
          },
        }) as any
    );
  });

  it('rejects invalid reset links', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid token' },
    });

    const authService = loadAuthService();

    const result = await authService.confirmPasswordReset({
      accessToken: 'bad-token',
      password: 'ValidPass1!',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Password reset link is invalid or expired');
    expect(mockUpdateUserById).not.toHaveBeenCalled();
    expect(mockDeleteUserSessions).not.toHaveBeenCalled();
  });

  it('blocks non-active accounts', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-123',
          email: 'user@example.com',
          created_at: '2024-01-01T00:00:00Z',
          user_metadata: {},
        },
      },
      error: null,
    });

    mockGetDatabasePool.mockReturnValue({
      query: jest.fn().mockResolvedValueOnce({
        rows: [{ status: 'suspended' }],
      }),
    } as any);

    const authService = loadAuthService();

    const result = await authService.confirmPasswordReset({
      accessToken: 'token',
      password: 'ValidPass1!',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Account is suspended. Please contact support.');
    expect(mockUpdateUserById).not.toHaveBeenCalled();
    expect(mockDeleteUserSessions).not.toHaveBeenCalled();
  });

  it('updates password and clears sessions for active users', async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-123',
          email: 'user@example.com',
          created_at: '2024-01-01T00:00:00Z',
          user_metadata: {},
        },
      },
      error: null,
    });

    mockGetDatabasePool.mockReturnValue({
      query: jest.fn().mockResolvedValueOnce({
        rows: [{ status: 'active' }],
      }),
    } as any);

    mockUpdateUserById.mockResolvedValue({
      data: { user: { id: 'user-123' } },
      error: null,
    });
    mockDeleteUserSessions.mockResolvedValue(1);

    const authService = loadAuthService();

    const result = await authService.confirmPasswordReset({
      accessToken: 'token',
      password: 'ValidPass1!',
    });

    expect(result.success).toBe(true);
    expect(mockUpdateUserById).toHaveBeenCalledWith('user-123', {
      password: 'ValidPass1!',
    });
    expect(mockDeleteUserSessions).toHaveBeenCalledWith('user-123');
  });
});
