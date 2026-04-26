import Fastify from 'fastify';
import { paymentRoutes } from '../routes/payments';
import { env } from '../config/environment';
import { paymentService } from '../services/paymentService';

jest.mock('../middleware/authMiddleware', () => ({
  authPreHandler: jest.fn(async () => {}),
}));

jest.mock('../middleware/paymentMiddleware', () => ({
  paymentQuoteRateLimit: jest.fn(async () => {}),
  paymentRateLimit: jest.fn(async () => {}),
  paymentRefreshRateLimit: jest.fn(async () => {}),
  paymentRetryRateLimit: jest.fn(async () => {}),
  webhookRateLimit: jest.fn(async () => {}),
}));

jest.mock('../services/paymentService', () => ({
  paymentService: {
    handlePayPalWebhook: jest.fn(),
  },
}));

jest.mock('../services/paymentMonitoringService', () => ({
  paymentMonitoringService: {
    getPaymentMetrics: jest.fn(),
    getPaymentFailures: jest.fn(),
    healthCheck: jest.fn(async () => true),
  },
}));

jest.mock('../services/creditAllocationService', () => ({
  creditAllocationService: {
    healthCheck: jest.fn(async () => true),
  },
}));

jest.mock('../services/paymentFailureService', () => ({
  paymentFailureService: {
    healthCheck: jest.fn(async () => true),
  },
}));

jest.mock('../services/refundService', () => ({
  refundService: {
    healthCheck: jest.fn(async () => true),
  },
}));

jest.mock('../services/subscriptionService', () => ({
  subscriptionService: {},
}));

jest.mock('../services/creditService', () => ({
  creditService: {},
}));

jest.mock('../services/orderService', () => ({
  orderService: {},
}));

jest.mock('../services/orderEntitlementService', () => ({
  orderEntitlementService: {},
}));

jest.mock('../services/variantPricingService', () => ({
  resolveVariantPricing: jest.fn(),
}));

jest.mock('../services/pricingLockService', () => ({
  resolvePricingLockContext: jest.fn(),
}));

jest.mock('../services/couponService', () => ({
  couponService: {},
  normalizeCouponCode: jest.fn(),
}));

jest.mock('../services/tiktokEventsService', () => ({
  buildTikTokProductProperties: jest.fn(),
  buildTikTokRequestContext: jest.fn(),
  tiktokEventsService: {},
}));

jest.mock('../utils/nowpaymentsClient', () => ({
  NOWPaymentsError: class NOWPaymentsError extends Error {},
  nowpaymentsClient: {},
}));

jest.mock('../config/database', () => ({
  getDatabasePool: jest.fn(),
}));

jest.mock('../utils/upgradeOptions', () => ({
  normalizeUpgradeOptions: jest.fn(),
  validateUpgradeOptions: jest.fn(),
}));

jest.mock('../utils/currency', () => ({
  resolveCountryFromHeaders: jest.fn(),
  resolvePreferredCurrency: jest.fn(() => 'USD'),
}));

jest.mock('../utils/termPricing', () => ({
  computeFixedTermPricing: jest.fn(),
  computeTermPricing: jest.fn(),
}));

jest.mock('../utils/logger');

const mockPaymentService = paymentService as unknown as {
  handlePayPalWebhook: jest.Mock;
};

describe('PayPal webhook route', () => {
  const originalPayPalEnabled = env.PAYPAL_ENABLED;
  const originalPayPalWebhookId = env.PAYPAL_WEBHOOK_ID;

  beforeEach(() => {
    jest.clearAllMocks();
    env.PAYPAL_ENABLED = true;
    env.PAYPAL_WEBHOOK_ID = 'webhook-id-test';
    mockPaymentService.handlePayPalWebhook.mockResolvedValue(true);
  });

  afterAll(() => {
    env.PAYPAL_ENABLED = originalPayPalEnabled;
    env.PAYPAL_WEBHOOK_ID = originalPayPalWebhookId;
  });

  it('accepts verified-style webhook requests', async () => {
    const app = Fastify();
    await app.register(paymentRoutes, { prefix: '/payments' });

    const payload = {
      id: 'WH-TEST-1',
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: '9AB12345CD6789012',
        supplementary_data: {
          related_ids: {
            order_id: '5AB12345CD6789012',
          },
        },
      },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/payments/paypal/webhook',
      headers: {
        'content-type': 'application/json',
        'paypal-transmission-id': 'transmission-id-1',
        'paypal-transmission-time': '2026-04-22T12:00:00Z',
        'paypal-transmission-sig': 'signature-abc',
        'paypal-cert-url': 'https://api-m.sandbox.paypal.com/certs/cert.pem',
        'paypal-auth-algo': 'SHA256withRSA',
      },
      payload,
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(mockPaymentService.handlePayPalWebhook).toHaveBeenCalledTimes(1);
    expect(mockPaymentService.handlePayPalWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        transmissionId: 'transmission-id-1',
        transmissionTime: '2026-04-22T12:00:00Z',
        transmissionSig: 'signature-abc',
        certUrl: 'https://api-m.sandbox.paypal.com/certs/cert.pem',
        authAlgo: 'SHA256withRSA',
        event: payload,
      })
    );
  });

  it('rejects webhook requests missing signature headers', async () => {
    const app = Fastify();
    await app.register(paymentRoutes, { prefix: '/payments' });

    const response = await app.inject({
      method: 'POST',
      url: '/payments/paypal/webhook',
      headers: {
        'content-type': 'application/json',
        'paypal-transmission-id': 'transmission-id-1',
      },
      payload: { event_type: 'PAYMENT.CAPTURE.COMPLETED' },
    });

    await app.close();

    expect(response.statusCode).toBe(401);
    expect(mockPaymentService.handlePayPalWebhook).not.toHaveBeenCalled();
  });

  it('returns 404 when PayPal webhook is disabled', async () => {
    env.PAYPAL_ENABLED = false;

    const app = Fastify();
    await app.register(paymentRoutes, { prefix: '/payments' });

    const response = await app.inject({
      method: 'POST',
      url: '/payments/paypal/webhook',
      headers: {
        'content-type': 'application/json',
      },
      payload: { event_type: 'PAYMENT.CAPTURE.COMPLETED' },
    });

    await app.close();

    expect(response.statusCode).toBe(404);
    expect(mockPaymentService.handlePayPalWebhook).not.toHaveBeenCalled();
  });

  it('returns 503 when webhook id is not configured', async () => {
    env.PAYPAL_WEBHOOK_ID = '';

    const app = Fastify();
    await app.register(paymentRoutes, { prefix: '/payments' });

    const response = await app.inject({
      method: 'POST',
      url: '/payments/paypal/webhook',
      headers: {
        'content-type': 'application/json',
      },
      payload: { event_type: 'PAYMENT.CAPTURE.COMPLETED' },
    });

    await app.close();

    expect(response.statusCode).toBe(503);
    expect(mockPaymentService.handlePayPalWebhook).not.toHaveBeenCalled();
  });

  it('returns 400 when webhook processing fails', async () => {
    mockPaymentService.handlePayPalWebhook.mockResolvedValue(false);

    const app = Fastify();
    await app.register(paymentRoutes, { prefix: '/payments' });

    const response = await app.inject({
      method: 'POST',
      url: '/payments/paypal/webhook',
      headers: {
        'content-type': 'application/json',
        'paypal-transmission-id': 'transmission-id-1',
        'paypal-transmission-time': '2026-04-22T12:00:00Z',
        'paypal-transmission-sig': 'signature-abc',
        'paypal-cert-url': 'https://api-m.sandbox.paypal.com/certs/cert.pem',
        'paypal-auth-algo': 'SHA256withRSA',
      },
      payload: { event_type: 'PAYMENT.CAPTURE.COMPLETED' },
    });

    await app.close();

    expect(response.statusCode).toBe(400);
    expect(mockPaymentService.handlePayPalWebhook).toHaveBeenCalledTimes(1);
  });
});
