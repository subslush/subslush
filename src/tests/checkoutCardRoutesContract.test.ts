import Fastify from 'fastify';
import { checkoutRoutes } from '../routes/checkout';
import { env } from '../config/environment';
import { metaEventsService } from '../services/metaEventsService';
import { orderService } from '../services/orderService';
import { paymentService } from '../services/paymentService';

jest.mock('../middleware/authMiddleware', () => ({
  authPreHandler: jest.fn(async () => {}),
  optionalAuthPreHandler: jest.fn(async () => {}),
}));

jest.mock('../middleware/paymentMiddleware', () => ({
  paymentQuoteRateLimit: jest.fn(async () => {}),
  paymentRateLimit: jest.fn(async () => {}),
  paymentRefreshRateLimit: jest.fn(async () => {}),
}));

jest.mock('../services/guestCheckoutService');
jest.mock('../services/orderService');
jest.mock('../services/paymentService', () => ({
  paymentService: {
    createPayPalCheckoutSession: jest.fn(),
    confirmPayPalCheckoutSession: jest.fn(),
    createNowPaymentsOrderInvoice: jest.fn(),
    createNowPaymentsEstimate: jest.fn(),
    getSupportedCurrencies: jest.fn(),
  },
}));

jest.mock('../services/tiktokEventsService', () => ({
  buildTikTokRequestContext: jest.fn(() => ({})),
  tiktokEventsService: {
    trackInitiateCheckout: jest.fn(),
    trackAddPaymentInfo: jest.fn(),
    trackPurchase: jest.fn(),
  },
}));

jest.mock('../services/metaEventsService', () => ({
  buildMetaRequestContext: jest.fn(() => ({
    url: 'https://subslush.com/checkout',
    userAgent: 'checkout-contract-test',
  })),
  metaEventsService: {
    trackInitiateCheckout: jest.fn(),
    trackAddPaymentInfo: jest.fn(),
    trackPurchase: jest.fn(),
  },
}));

jest.mock('../utils/logger');

const mockOrderService = orderService as jest.Mocked<typeof orderService>;
const mockPaymentService = paymentService as unknown as {
  createPayPalCheckoutSession: jest.Mock;
  confirmPayPalCheckoutSession: jest.Mock;
};
const mockMetaEventsService = metaEventsService as jest.Mocked<
  typeof metaEventsService
>;

describe('Checkout card route contract', () => {
  const orderId = '11111111-1111-4111-8111-111111111111';
  const snapshotId = '22222222-2222-4222-8222-222222222222';
  const sessionId = 'paypal-order-12345';
  const originalPayPalEnabled = env.PAYPAL_ENABLED;
  const originalPayPalCheckoutEnabled = env.PAYPAL_CHECKOUT_ENABLED;
  const originalPay4bitEnabled = env.PAY4BIT_ENABLED;
  const originalStripeEnabled = env.STRIPE_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    env.PAYPAL_ENABLED = true;
    env.PAYPAL_CHECKOUT_ENABLED = true;
    env.PAY4BIT_ENABLED = false;
    env.STRIPE_ENABLED = false;
    mockOrderService.appendOrderMetadata.mockResolvedValue(true);
  });

  afterAll(() => {
    env.PAYPAL_ENABLED = originalPayPalEnabled;
    env.PAYPAL_CHECKOUT_ENABLED = originalPayPalCheckoutEnabled;
    env.PAY4BIT_ENABLED = originalPay4bitEnabled;
    env.STRIPE_ENABLED = originalStripeEnabled;
  });

  it('returns locked pricing fields from /checkout/card/session', async () => {
    mockOrderService.getOrderByCheckoutSessionKey.mockResolvedValue({
      id: orderId,
    } as any);

    mockPaymentService.createPayPalCheckoutSession.mockResolvedValue({
      success: true,
      orderId,
      sessionId,
      sessionUrl: `https://www.paypal.com/checkoutnow?token=${sessionId}`,
      paymentId: 'payment-1',
    } as any);

    mockOrderService.getOrderWithItems.mockResolvedValue({
      id: orderId,
      user_id: null,
      contact_email: 'guest@example.com',
      currency: 'EUR',
      total_cents: 1299,
      pricing_snapshot_id: snapshotId,
      settlement_currency: 'USD',
      settlement_total_cents: 1499,
      metadata: {
        display_currency: 'EUR',
        display_total_cents: 1299,
      },
      items: [],
    } as any);

    const app = Fastify();
    await app.register(checkoutRoutes, { prefix: '/checkout' });

    const response = await app.inject({
      method: 'POST',
      url: '/checkout/card/session',
      payload: {
        checkout_session_key: 'checkout_abc123',
        initiate_checkout_event_id: `order_${orderId}_initiate_checkout_card`,
        add_payment_info_event_id: `order_${orderId}_add_payment_info_card`,
        legal_consent: {
          immediate_fulfillment_consent: true,
          terms_policy_consent: true,
          consent_timestamp: '2026-06-01T00:00:00.000Z',
        },
      },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toMatchObject({
      order_id: orderId,
      session_id: sessionId,
      payment_id: 'payment-1',
      payment_provider: 'paypal',
      pricing_snapshot_id: snapshotId,
      display_currency: 'EUR',
      display_total_cents: 1299,
      settlement_currency: 'USD',
      settlement_total_cents: 1499,
    });
    expect(mockPaymentService.createPayPalCheckoutSession).toHaveBeenCalledWith(
      {
        orderId,
        successUrl: null,
        cancelUrl: null,
        buyerEmail: null,
        fundingPreference: null,
      }
    );
    expect(mockMetaEventsService.trackInitiateCheckout).not.toHaveBeenCalled();
    expect(mockMetaEventsService.trackAddPaymentInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: `order_${orderId}_add_payment_info_card`,
      })
    );
  });

  it('fires only Meta InitiateCheckout on the checkout transition endpoint', async () => {
    const eventId = `order_${orderId}_initiate_checkout`;
    mockOrderService.getOrderByCheckoutSessionKey.mockResolvedValue({
      id: orderId,
    } as any);
    mockOrderService.getOrderWithItems.mockResolvedValue({
      id: orderId,
      user_id: null,
      contact_email: 'guest@example.com',
      currency: 'USD',
      total_cents: 1299,
      metadata: {},
      items: [
        {
          id: 'item-1',
          product_variant_id: 'variant-1',
          product_name: 'Example product',
          variant_name: 'Monthly',
          quantity: 1,
          unit_price_cents: 1299,
          total_price_cents: 1299,
          currency: 'USD',
          metadata: {},
        },
      ],
    } as any);

    const app = Fastify();
    await app.register(checkoutRoutes, { prefix: '/checkout' });

    const response = await app.inject({
      method: 'POST',
      url: '/checkout/initiate-checkout',
      payload: {
        checkout_session_key: 'checkout_abc123',
        event_id: eventId,
      },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      order_id: orderId,
      event_id: eventId,
    });
    expect(mockMetaEventsService.trackInitiateCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'guest@example.com',
        eventId,
        customData: expect.objectContaining({
          currency: 'USD',
          value: 12.99,
        }),
      })
    );
    expect(mockMetaEventsService.trackAddPaymentInfo).not.toHaveBeenCalled();
  });

  it('keeps /checkout/stripe/session as compatibility alias', async () => {
    mockOrderService.getOrderByCheckoutSessionKey.mockResolvedValue({
      id: orderId,
    } as any);

    mockPaymentService.createPayPalCheckoutSession.mockResolvedValue({
      success: true,
      orderId,
      sessionId,
      sessionUrl: `https://www.paypal.com/checkoutnow?token=${sessionId}`,
      paymentId: 'payment-1',
    } as any);

    mockOrderService.getOrderWithItems.mockResolvedValue({
      id: orderId,
      user_id: null,
      contact_email: 'guest@example.com',
      currency: 'EUR',
      total_cents: 1299,
      pricing_snapshot_id: snapshotId,
      settlement_currency: 'USD',
      settlement_total_cents: 1499,
      metadata: {
        display_currency: 'EUR',
        display_total_cents: 1299,
      },
      items: [],
    } as any);

    const app = Fastify();
    await app.register(checkoutRoutes, { prefix: '/checkout' });

    const response = await app.inject({
      method: 'POST',
      url: '/checkout/stripe/session',
      payload: {
        checkout_session_key: 'checkout_abc123',
        legal_consent: {
          immediate_fulfillment_consent: true,
          terms_policy_consent: true,
          consent_timestamp: '2026-06-01T00:00:00.000Z',
        },
      },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data.payment_provider).toBe('paypal');
    expect(body.data.session_id).toBe(sessionId);
  });

  it('confirms hosted card checkout through /checkout/card/confirm', async () => {
    mockOrderService.getOrderById.mockResolvedValue({ id: orderId } as any);

    mockPaymentService.confirmPayPalCheckoutSession.mockResolvedValue({
      success: true,
      orderId,
      sessionId,
      orderStatus: 'in_process',
      fulfilled: true,
    } as any);

    const app = Fastify();
    await app.register(checkoutRoutes, { prefix: '/checkout' });

    const response = await app.inject({
      method: 'POST',
      url: '/checkout/card/confirm',
      payload: {
        order_id: orderId,
        session_id: sessionId,
      },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toEqual({
      order_id: orderId,
      session_id: sessionId,
      order_status: 'in_process',
      fulfilled: true,
      payment_provider: 'paypal',
    });
    expect(
      mockPaymentService.confirmPayPalCheckoutSession
    ).toHaveBeenCalledWith({
      orderId,
      sessionId,
      ipAddress: expect.any(String),
    });
  });
});
