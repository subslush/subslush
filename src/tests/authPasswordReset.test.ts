import { createClient } from '@supabase/supabase-js';
import { getDatabasePool } from '../config/database';
import { emailService } from '../services/emailService';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

jest.mock('../config/database', () => ({
  getDatabasePool: jest.fn(),
}));

jest.mock('../services/emailService', () => ({
  emailService: {
    sendPasswordResetEmail: jest.fn(),
  },
}));

const mockCreateClient = createClient as jest.MockedFunction<
  typeof createClient
>;
const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;
const mockSendPasswordResetEmail =
  emailService.sendPasswordResetEmail as jest.MockedFunction<
    typeof emailService.sendPasswordResetEmail
  >;

const loadAuthService = () => {
  let authService: any;
  jest.isolateModules(() => {
    authService = require('../services/auth').authService;
  });
  return authService;
};

describe('AuthService password reset verification gate', () => {
  const mockGenerateLink = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();

    mockCreateClient.mockImplementation(
      () =>
        ({
          auth: {
            admin: {
              generateLink: mockGenerateLink,
              deleteUser: jest.fn(),
            },
          },
        }) as any
    );

    mockSendPasswordResetEmail.mockResolvedValue({ success: true });
  });

  it('rejects password reset for unverified users', async () => {
    mockGenerateLink.mockResolvedValue({
      data: { properties: { action_link: 'https://reset.example' } },
      error: null,
    });

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
    expect(mockGenerateLink).not.toHaveBeenCalled();
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('allows password reset for verified users', async () => {
    mockGenerateLink.mockResolvedValue({
      data: { properties: { action_link: 'https://reset.example' } },
      error: null,
    });

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
    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: 'recovery',
      email: 'user@example.com',
      ...(redirectTo ? { options: { redirectTo } } : {}),
    });
    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith({
      to: 'user@example.com',
      resetLink: 'https://reset.example',
    });
  });
});
