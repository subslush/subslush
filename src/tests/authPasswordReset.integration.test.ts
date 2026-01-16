import Fastify from 'fastify';
import { randomUUID } from 'crypto';
import { authRoutes } from '../routes/auth';
import { getDatabasePool } from '../config/database';
import { emailService } from '../services/emailService';

var mockGenerateLink: jest.Mock;

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      admin: {
        deleteUser: jest.fn(),
        getUserById: jest.fn(),
        generateLink: (mockGenerateLink = jest.fn()),
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
jest.mock('../services/emailService', () => ({
  emailService: {
    sendPasswordResetEmail: jest.fn(),
  },
}));

describe('Auth password reset integration', () => {
  beforeEach(() => {
    mockGenerateLink.mockReset();
    mockGenerateLink.mockResolvedValue({
      data: { properties: { action_link: 'https://reset.example' } },
      error: null,
    });
    (emailService.sendPasswordResetEmail as jest.Mock).mockReset();
    (emailService.sendPasswordResetEmail as jest.Mock).mockResolvedValue({
      success: true,
    });
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
      expect(mockGenerateLink).not.toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
