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
    sendEmailConfirmationEmail: jest.fn(),
  },
}));

jest.mock('../utils/logger', () => ({
  Logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockCreateClient = createClient as jest.MockedFunction<
  typeof createClient
>;
const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;
const mockEmailService = emailService as jest.Mocked<typeof emailService>;

const loadAuthService = () => {
  let authService: any;
  jest.isolateModules(() => {
    authService = require('../services/auth').authService;
  });
  return authService;
};

describe('AuthService registration confirmation email', () => {
  const mockGenerateLink = jest.fn();
  const mockDeleteUser = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();

    mockCreateClient
      .mockImplementationOnce(
        () =>
          ({
            auth: {},
          }) as any
      )
      .mockImplementationOnce(
        () =>
          ({
            auth: {
              admin: {
                generateLink: mockGenerateLink,
                deleteUser: mockDeleteUser,
              },
            },
          }) as any
      );

    mockGenerateLink.mockResolvedValue({
      data: {
        user: {
          id: 'user-123',
          email: 'customer@example.com',
          created_at: '2026-06-16T10:00:00.000Z',
        },
        properties: {
          action_link: 'https://supabase.example/auth/v1/verify?token=abc',
        },
      },
      error: null,
    });

    mockEmailService.sendEmailConfirmationEmail.mockResolvedValue({
      success: true,
    });
  });

  it('sends a branded claim-flow confirmation email with the claim redirect embedded', async () => {
    const mockPool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    };
    mockGetDatabasePool.mockReturnValue(mockPool as any);

    const authService = loadAuthService();

    const result = await authService.register(
      {
        email: 'customer@example.com',
        password: 'Password123!',
        firstName: 'Customer',
        redirect: '/checkout/claim?token=claim-token',
        flow: 'claim_order',
      },
      { ipAddress: '127.0.0.1', userAgent: 'jest' }
    );

    expect(result.success).toBe(true);
    expect(result.requiresEmailVerification).toBe(true);

    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: 'signup',
      email: 'customer@example.com',
      password: 'Password123!',
      options: {
        data: {
          first_name: 'Customer',
        },
        redirectTo: expect.any(String),
      },
    });

    const redirectTo = mockGenerateLink.mock.calls[0]?.[0]?.options?.redirectTo;
    expect(typeof redirectTo).toBe('string');
    const redirectUrl = new globalThis.URL(redirectTo as string);
    expect(redirectUrl.pathname).toBe('/auth/confirm');
    expect(redirectUrl.searchParams.get('redirect')).toBe(
      '/checkout/claim?token=claim-token'
    );
    expect(redirectUrl.searchParams.get('flow')).toBe('claim_order');

    expect(mockEmailService.sendEmailConfirmationEmail).toHaveBeenCalledWith({
      to: 'customer@example.com',
      confirmationLink: 'https://supabase.example/auth/v1/verify?token=abc',
      flow: 'claim_order',
    });
  });

  it('targets the application confirmation callback for a standard registration', async () => {
    const mockPool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    };
    mockGetDatabasePool.mockReturnValue(mockPool as any);

    const authService = loadAuthService();
    const result = await authService.register(
      {
        email: 'customer@example.com',
        password: 'Password123!',
      },
      { ipAddress: '127.0.0.1', userAgent: 'jest' }
    );

    expect(result.success).toBe(true);
    const redirectTo = mockGenerateLink.mock.calls[0]?.[0]?.options?.redirectTo;
    const redirectUrl = new globalThis.URL(redirectTo as string);
    expect(redirectUrl.pathname).toBe('/auth/confirm');
    expect(redirectUrl.search).toBe('');
  });

  it('cleans up the created auth and profile records when confirmation email sending fails', async () => {
    const mockPool = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    };
    mockGetDatabasePool.mockReturnValue(mockPool as any);
    mockEmailService.sendEmailConfirmationEmail.mockResolvedValue({
      success: false,
      error: 'send_failed',
    });

    const authService = loadAuthService();

    const result = await authService.register(
      {
        email: 'customer@example.com',
        password: 'Password123!',
      },
      { ipAddress: '127.0.0.1', userAgent: 'jest' }
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe('EMAIL_SEND_FAILED');
    expect(mockPool.query).toHaveBeenCalledWith(
      'DELETE FROM users WHERE id = $1 AND email_verified_at IS NULL',
      ['user-123']
    );
    expect(mockDeleteUser).toHaveBeenCalledWith('user-123');
  });
});
