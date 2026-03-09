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
    handlePay4bitCallback: jest.fn(),
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
  subscriptionService: {
    getSubscriptionById: jest.fn(),
  },
}));

jest.mock('../services/creditService', () => ({
  creditService: {},
}));

jest.mock('../services/orderService', () => ({
  orderService: {},
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
  computeTermPricing: jest.fn(),
}));

jest.mock('../utils/logger');

const mockPaymentService = paymentService as unknown as {
  handlePay4bitCallback: jest.Mock;
};

describe('Pay4bit callback route transport handling', () => {
  const originalPay4bitEnabled = env.PAY4BIT_ENABLED;

  beforeEach(() => {
    jest.clearAllMocks();
    env.PAY4BIT_ENABLED = true;
    mockPaymentService.handlePay4bitCallback.mockResolvedValue({
      statusCode: 200,
      body: {
        result: {
          message: 'Request successfully processed',
        },
      },
    });
  });

  afterAll(() => {
    env.PAY4BIT_ENABLED = originalPay4bitEnabled;
  });

  it('accepts application/x-www-form-urlencoded POST payloads', async () => {
    const app = Fastify();
    await app.register(paymentRoutes, { prefix: '/payments' });

    const payload = new globalThis.URLSearchParams({
      method: 'check',
      'params[localpayId]': '364080',
      'params[account]': 'order-123',
      'params[sum]': '54.99',
      'params[amount]': '54.99',
      'params[currency]': 'USD',
      'params[desc]': 'Subscription: test',
      'params[sign]': 'md5signature',
      'params[check_sign]': 'sha256signature',
    }).toString();

    const response = await app.inject({
      method: 'POST',
      url: '/payments/pay4bit/callback',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload,
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(mockPaymentService.handlePay4bitCallback).toHaveBeenCalledTimes(1);
    expect(mockPaymentService.handlePay4bitCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'check',
        localpayId: '364080',
        account: 'order-123',
        sum: '54.99',
        amount: '54.99',
        currency: 'USD',
        description: 'Subscription: test',
        sign: 'md5signature',
        checkSign: 'sha256signature',
      })
    );
  });

  it('keeps GET callback handling unchanged', async () => {
    const app = Fastify();
    await app.register(paymentRoutes, { prefix: '/payments' });

    const response = await app.inject({
      method: 'GET',
      url: '/payments/pay4bit/callback',
      query: {
        method: 'check',
        localpayId: '777777',
        account: 'order-777',
        sum: '10.00',
        amount: '10.00',
        currency: 'USD',
        desc: 'Subscription: get',
        sign: 'sig-md5',
        check_sign: 'sig-sha',
      },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(mockPaymentService.handlePay4bitCallback).toHaveBeenCalledTimes(1);
    expect(mockPaymentService.handlePay4bitCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'check',
        localpayId: '777777',
        account: 'order-777',
        sum: '10.00',
        amount: '10.00',
        currency: 'USD',
        description: 'Subscription: get',
        sign: 'sig-md5',
        checkSign: 'sig-sha',
      })
    );
  });
});
