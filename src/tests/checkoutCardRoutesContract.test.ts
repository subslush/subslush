import Fastify from 'fastify';
import { checkoutRoutes } from '../routes/checkout';
import { env } from '../config/environment';
import { orderService } from '../services/orderService';
import { paymentService } from '../services/paymentService';

jest.mock('../middleware/authMiddleware', () => ({
  authPreHandler: jest.fn(async () => {}),
  optionalAuthPreHandler: jest.fn(async () => {}),
}));

jest.mock('../middleware/paymentMiddleware', () => ({
  paymentQuoteRateLimit: jest.fn(async () => {}),
  paymentRateLimit: jest.fn(async () => {}),
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

jest.mock('../utils/logger');

const mockOrderService = orderService as jest.Mocked<typeof orderService>;
const mockPaymentService = paymentService as unknown as {
  createPayPalCheckoutSession: jest.Mock;
  confirmPayPalCheckoutSession: jest.Mock;
};

describe('Checkout card route contract', () => {
  const orderId = '11111111-1111-4111-8111-111111111111';
  const snapshotId = '22222222-2222-4222-8222-222222222222';
  const sessionId = 'paypal-order-12345';
  const originalPayPalEnabled = env.PAYPAL_ENABLED;
  const originalPay4bitEnabled = env.PAY4BIT_ENABLED;
  const originalStripeEnabled = env.STRIPE_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    env.PAYPAL_ENABLED = true;
    env.PAY4BIT_ENABLED = false;
    env.STRIPE_ENABLED = false;
  });

  afterAll(() => {
    env.PAYPAL_ENABLED = originalPayPalEnabled;
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
