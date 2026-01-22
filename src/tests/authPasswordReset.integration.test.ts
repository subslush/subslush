import Fastify from 'fastify';
import { randomUUID } from 'crypto';
import { authRoutes } from '../routes/auth';
import { getDatabasePool } from '../config/database';

var mockResetPasswordForEmail: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      resetPasswordForEmail: (mockResetPasswordForEmail = jest.fn()),
      admin: {
        deleteUser: jest.fn(),
        getUserById: jest.fn(),
      },
    },
  })),
}));

jest.mock('../config/database', () => ({
  getDatabasePool: jest.fn(),
}));

jest.mock('../middleware/rateLimitMiddleware', () => ({
  createRateLimitHandler: jest.fn(() => async () => {}),
}));

jest.mock('../utils/logger');

describe('Auth password reset integration', () => {
  beforeEach(() => {
    mockResetPasswordForEmail.mockReset();
    mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  });

  it('blocks unverified users without calling reset provider', async () => {
    const userId = randomUUID();
    const email = `unverified-${Date.now()}@example.com`;

    const mockPool = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [
          {
            id: userId,
            status: 'active',
            email_verified_at: null,
          },
        ],
      }),
    };
    (getDatabasePool as jest.Mock).mockReturnValue(mockPool as any);

    const app = Fastify();
    await app.register(authRoutes, { prefix: '/auth' });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/password-reset',
        payload: { email },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.message).toBe(
        'Please verify your email before requesting a password reset'
      );
      expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
