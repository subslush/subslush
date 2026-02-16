import Fastify from 'fastify';
import { checkoutRoutes } from '../routes/checkout';
import { guestCheckoutService } from '../services/guestCheckoutService';

jest.mock('../services/guestCheckoutService');
jest.mock('../utils/logger');

const mockGuestCheckoutService = guestCheckoutService as jest.Mocked<
  typeof guestCheckoutService
>;

describe('Guest checkout routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a consistent identity response shape', async () => {
    mockGuestCheckoutService.ensureGuestIdentity.mockResolvedValue({
      success: true,
      data: {
        guestIdentityId: '9e20b4b1-72a9-4a1b-9f24-2e8a0c7d7d22',
        email: 'user@example.com',
      },
    });

    mockGuestCheckoutService.issueClaimToken.mockResolvedValue({
      success: true,
      data: {
        token: 'token',
        expiresAt: new Date(),
        emailSent: true,
      },
    });

    const app = Fastify();
    await app.register(checkoutRoutes, { prefix: '/checkout' });

    const response = await app.inject({
      method: 'POST',
      url: '/checkout/identity',
      payload: { email: 'user@example.com' },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toEqual({
      guest_identity_id: '9e20b4b1-72a9-4a1b-9f24-2e8a0c7d7d22',
    });
  });
});
