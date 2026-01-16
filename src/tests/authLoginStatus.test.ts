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
  sessionService: {
    createSession: jest.fn(),
    deleteSession: jest.fn(),
  },
}));

jest.mock('../services/jwtService', () => ({
  jwtService: {
    generateTokens: jest.fn(),
  },
}));

const mockCreateClient = createClient as jest.MockedFunction<
  typeof createClient
>;
const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;
const mockSessionService = sessionService as jest.Mocked<typeof sessionService>;
const mockJwtService = jwtService as jest.Mocked<typeof jwtService>;

const loadAuthService = () => {
  let authService: any;
  jest.isolateModules(() => {
    authService = require('../services/auth').authService;
  });
  return authService;
};

describe('AuthService login status enforcement', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects login for suspended accounts', async () => {
    const mockSignIn = jest.fn().mockResolvedValue({
      data: {
        user: {
          id: 'user-123',
          email: 'user@example.com',
          created_at: new Date().toISOString(),
          user_metadata: {},
        },
      },
      error: null,
    });

    mockCreateClient
      .mockImplementationOnce(
        () =>
          ({
            auth: {
              signInWithPassword: mockSignIn,
            },
          }) as any
      )
      .mockImplementationOnce(
        () =>
          ({
            auth: {
              admin: {},
            },
          }) as any
      );

    const mockPool = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [{ first_name: 'Test', last_name: 'User', status: 'suspended' }],
      }),
    };
    mockGetDatabasePool.mockReturnValue(mockPool as any);

    const authService = loadAuthService();

    const result = await authService.login(
      { email: 'user@example.com', password: 'password' },
      { ipAddress: '127.0.0.1', userAgent: 'jest' }
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Account is suspended. Please contact support.');
    expect(mockSessionService.createSession).not.toHaveBeenCalled();
    expect(mockJwtService.generateTokens).not.toHaveBeenCalled();
  });
});
