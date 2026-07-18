import { GuestCheckoutService } from '../services/guestCheckoutService';
import { getDatabasePool } from '../config/database';
import { emailService } from '../services/emailService';
import { checkoutPricingService } from '../services/checkoutPricingService';
import { couponService } from '../services/couponService';

jest.mock('../config/database', () => ({
  getDatabasePool: jest.fn(),
}));

jest.mock('../services/emailService', () => ({
  emailService: {
    send: jest.fn(),
  },
}));

jest.mock('../services/checkoutPricingService', () => ({
  checkoutPricingService: {
    priceDraft: jest.fn(),
  },
}));

jest.mock('../services/couponService', () => ({
  couponService: {
    reserveCouponRedemption: jest.fn(),
    voidRedemptionForOrder: jest.fn(),
  },
}));

jest.mock('../utils/logger', () => ({
  Logger: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;
const mockEmailService = emailService as jest.Mocked<typeof emailService>;
const mockCheckoutPricingService = checkoutPricingService as jest.Mocked<
  typeof checkoutPricingService
>;
const mockCouponService = couponService as jest.Mocked<typeof couponService>;

describe('GuestCheckoutService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCouponService.voidRedemptionForOrder.mockResolvedValue(false);
  });

  it('updates draft orders by checkout_session_key', async () => {
    const guestIdentityId = '9e20b4b1-72a9-4a1b-9f24-2e8a0c7d7d22';
    const orderId = 'f0a2c3f6-0b5d-48a5-a6d3-9ea38b5f1c0f';
    const variantId = '4c9485a6-92c6-4e42-83cc-1b0c09fcb570';
    const checkoutSessionKey = 'checkout-session-key';

    const mockClient = {
      query: jest.fn(async (sql: string, _params?: any[]) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
          return { rows: [] };
        }
        if (sql.includes('FROM guest_identities')) {
          return {
            rows: [
              {
                id: guestIdentityId,
                email: 'user@example.com',
                user_id: 'guest-user-id',
              },
            ],
          };
        }
        if (
          sql.includes('FROM orders') &&
          sql.includes('checkout_session_key')
        ) {
          return {
            rows: [
              {
                id: orderId,
                status: 'cart',
                metadata: { guest_identity_id: guestIdentityId },
              },
            ],
          };
        }
        if (sql.includes('FROM product_variants')) {
          return { rows: [{ id: variantId }] };
        }
        return { rows: [] };
      }),
      release: jest.fn(),
    };

    const mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
    };

    mockGetDatabasePool.mockReturnValue(mockPool as any);
    mockCheckoutPricingService.priceDraft.mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            input: { variant_id: variantId, term_months: 3, auto_renew: true },
            product: {
              id: 'product-1',
              name: 'Test Product',
              slug: 'test-product',
              description: null,
              service_type: 'streaming',
              logo_key: null,
              category: null,
              default_currency: null,
              max_subscriptions: null,
              status: 'active',
              metadata: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
            variant: {
              id: variantId,
              product_id: 'product-1',
              name: 'Basic',
              variant_code: 'basic',
              description: null,
              service_plan: 'basic',
              is_active: true,
              sort_order: 1,
              metadata: null,
              created_at: new Date(),
              updated_at: new Date(),
            },
            termMonths: 3,
            currency: 'USD',
            basePriceCents: 1000,
            discountPercent: 0,
            termSubtotalCents: 3000,
            termDiscountCents: 0,
            termTotalCents: 3000,
            couponDiscountCents: 0,
            finalTotalCents: 3000,
          },
        ],
        orderSubtotalCents: 3000,
        orderDiscountCents: 0,
        orderCouponDiscountCents: 0,
        orderTotalCents: 3000,
        normalizedCouponCode: null,
      },
    });

    const service = new GuestCheckoutService();
    const result = await service.upsertDraftOrder({
      checkout_session_key: checkoutSessionKey,
      guest_identity_id: guestIdentityId,
      contact_email: 'user@example.com',
      currency: 'USD',
      items: [{ variant_id: variantId, term_months: 3, auto_renew: true }],
      coupon_code: 'SAVE10',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const insertOrderCalls = mockClient.query.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO orders')
    );
    expect(insertOrderCalls.length).toBe(0);

    const deleteOrderItemsCalls = mockClient.query.mock.calls.filter(([sql]) =>
      String(sql).includes('DELETE FROM order_items')
    );
    expect(deleteOrderItemsCalls.length).toBeGreaterThan(0);

    const checkoutKeyCalls = mockClient.query.mock.calls.filter(([sql]) =>
      String(sql).includes('checkout_session_key')
    );
    expect(checkoutKeyCalls.length).toBeGreaterThan(0);
    const checkoutKeyParams = checkoutKeyCalls[0]?.[1] as any[] | undefined;
    expect(checkoutKeyParams?.[0]).toBe(checkoutSessionKey);
  });

  it('issues claim tokens and enforces one-time use', async () => {
    const guestIdentityId = '9e20b4b1-72a9-4a1b-9f24-2e8a0c7d7d22';
    let consumed = false;

    const mockPool = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('INSERT INTO guest_claim_tokens')) {
          return { rows: [] };
        }
        if (sql.includes('UPDATE guest_claim_tokens')) {
          if (consumed) {
            return { rows: [] };
          }
          consumed = true;
          return { rows: [{ guest_identity_id: guestIdentityId }] };
        }
        return { rows: [] };
      }),
    };

    mockGetDatabasePool.mockReturnValue(mockPool as any);
    mockEmailService.send.mockResolvedValue({ success: true });

    const service = new GuestCheckoutService();
    const tokenResult = await service.issueClaimToken({
      guestIdentityId,
      email: 'user@example.com',
    });

    expect(tokenResult.success).toBe(true);
    if (!tokenResult.success) return;
    expect(mockEmailService.send).toHaveBeenCalled();

    const firstConsume = await service.consumeClaimToken(
      tokenResult.data.token
    );
    expect(firstConsume.success).toBe(true);

    const secondConsume = await service.consumeClaimToken(
      tokenResult.data.token
    );
    expect(secondConsume.success).toBe(false);
  });

  it('is idempotently successful when a used claim link belongs to the same real user', async () => {
    const guestIdentityId = '9e20b4b1-72a9-4a1b-9f24-2e8a0c7d7d22';
    const mockClient = {
      query: jest.fn(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') {
          return { rows: [] };
        }
        if (
          sql.includes('FROM guest_claim_tokens') &&
          sql.includes('FOR UPDATE')
        ) {
          return {
            rows: [
              {
                id: 'claim-token-id',
                guest_identity_id: guestIdentityId,
                used_at: new Date(),
                is_expired: false,
              },
            ],
          };
        }
        if (sql.includes('FROM guest_identities gi')) {
          return {
            rows: [
              {
                user_id: 'claimed-user-id',
                email: 'owner@example.com',
                is_guest: false,
              },
            ],
          };
        }
        return { rows: [] };
      }),
      release: jest.fn(),
    };

    mockGetDatabasePool.mockReturnValue({
      connect: jest.fn().mockResolvedValue(mockClient),
    } as any);

    const service = new GuestCheckoutService();
    const result = await service.claimGuestIdentity({
      token: 'used-token',
      userId: 'claimed-user-id',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.alreadyClaimed).toBe(true);
  });

  it('refuses a valid claim token when the signed-in email differs from the checkout email', async () => {
    const mockClient = {
      query: jest.fn(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
        if (
          sql.includes('FROM guest_claim_tokens') &&
          sql.includes('FOR UPDATE')
        ) {
          return {
            rows: [
              {
                id: 'claim-token-id',
                guest_identity_id: 'guest-identity-id',
                used_at: null,
                is_expired: false,
              },
            ],
          };
        }
        if (sql.includes('FROM guest_identities')) {
          return {
            rows: [
              {
                id: 'guest-identity-id',
                email: 'owner@example.com',
                user_id: 'guest-user-id',
              },
            ],
          };
        }
        if (sql.includes('FROM users') && sql.includes('FOR UPDATE')) {
          return {
            rows: [
              {
                id: 'other-user-id',
                is_guest: false,
                stripe_customer_id: null,
                email: 'other@example.com',
              },
            ],
          };
        }
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    mockGetDatabasePool.mockReturnValue({
      connect: jest.fn().mockResolvedValue(mockClient),
    } as any);

    const result = await new GuestCheckoutService().claimGuestIdentity({
      token: 'valid-token',
      userId: 'other-user-id',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('claim_email_mismatch');
  });

  it('reports expired when an unused claim link is past its expiry window', async () => {
    const guestIdentityId = '9e20b4b1-72a9-4a1b-9f24-2e8a0c7d7d22';
    const mockClient = {
      query: jest.fn(async (sql: string) => {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') {
          return { rows: [] };
        }
        if (
          sql.includes('FROM guest_claim_tokens') &&
          sql.includes('FOR UPDATE')
        ) {
          return {
            rows: [
              {
                id: 'claim-token-id',
                guest_identity_id: guestIdentityId,
                used_at: null,
                is_expired: true,
              },
            ],
          };
        }
        return { rows: [] };
      }),
      release: jest.fn(),
    };

    mockGetDatabasePool.mockReturnValue({
      connect: jest.fn().mockResolvedValue(mockClient),
    } as any);

    const service = new GuestCheckoutService();
    const result = await service.claimGuestIdentity({
      token: 'expired-token',
      userId: 'user-id',
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toBe('claim_link_expired');
  });
});
