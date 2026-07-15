import Fastify from 'fastify';

jest.mock('../config/environment', () => {
  const actual = jest.requireActual('../config/environment');
  return {
    ...actual,
    env: {
      ...actual.env,
      NODE_ENV: 'test',
      QA_PAYMENT_ENABLED: true,
    },
  };
});

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
    confirmManualOrderPayment: jest.fn(),
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

import { env } from '../config/environment';
import { checkoutRoutes } from '../routes/checkout';
import { orderService } from '../services/orderService';
import { paymentService } from '../services/paymentService';

const mockOrderService = orderService as jest.Mocked<typeof orderService>;
const mockPaymentService = paymentService as unknown as {
  confirmManualOrderPayment: jest.Mock;
};
const mockEnv = env as unknown as {
  NODE_ENV: 'test' | 'production';
  QA_PAYMENT_ENABLED: boolean;
};

describe('Checkout QA payment route', () => {
  const orderId = '11111111-1111-4111-8111-111111111111';
  const checkoutSessionKey = 'checkout_abc12345';
  const userId = '22222222-2222-4222-8222-222222222222';

  beforeEach(() => {
    jest.clearAllMocks();
    mockEnv.NODE_ENV = 'test';
    mockEnv.QA_PAYMENT_ENABLED = true;
    mockOrderService.getOrderByCheckoutSessionKey.mockResolvedValue({
      id: orderId,
      user_id: userId,
    } as any);
    mockOrderService.getOrderWithItems.mockResolvedValue({
      id: orderId,
      user_id: userId,
      items: [{ id: 'item-1' }],
    } as any);
    mockOrderService.appendOrderMetadata.mockResolvedValue(true);
    mockPaymentService.confirmManualOrderPayment.mockResolvedValue({
      success: true,
      orderStatus: 'in_process',
      subscriptionsCreated: 1,
      tasksOpen: 1,
    });
  });

  it('completes a pending checkout through the local QA payment flow', async () => {
    const app = Fastify();
    await app.register(checkoutRoutes, { prefix: '/checkout' });

    const response = await app.inject({
      method: 'POST',
      url: '/checkout/qa/complete',
      payload: {
        checkout_session_key: checkoutSessionKey,
        legal_consent: {
          immediate_fulfillment_consent: true,
          terms_policy_consent: true,
          consent_timestamp: '2026-07-13T10:00:00.000Z',
        },
      },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      order_id: orderId,
      payment_method: 'qa_payment',
      status: 'in_process',
      subscriptions_created: 1,
      open_tasks: 1,
    });
    expect(mockPaymentService.confirmManualOrderPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId,
        adminUserId: userId,
        source: 'qa_checkout',
        note: 'QA checkout payment (local test environment)',
      })
    );
    expect(mockOrderService.appendOrderMetadata).toHaveBeenCalledWith(
      orderId,
      expect.objectContaining({
        checkout_legal_consent: expect.objectContaining({
          consent_source: 'checkout_qa',
        }),
      })
    );
  });

  it('is hidden when the local QA flag is disabled', async () => {
    mockEnv.QA_PAYMENT_ENABLED = false;
    const app = Fastify();
    await app.register(checkoutRoutes, { prefix: '/checkout' });

    const response = await app.inject({
      method: 'POST',
      url: '/checkout/qa/complete',
      payload: { checkout_session_key: checkoutSessionKey },
    });

    await app.close();

    expect(response.statusCode).toBe(404);
    expect(mockPaymentService.confirmManualOrderPayment).not.toHaveBeenCalled();
  });

  it('exposes the QA option only while the local flag is enabled', async () => {
    const app = Fastify();
    await app.register(checkoutRoutes, { prefix: '/checkout' });

    const enabledResponse = await app.inject({
      method: 'GET',
      url: '/checkout/qa/config',
    });
    mockEnv.QA_PAYMENT_ENABLED = false;
    const disabledResponse = await app.inject({
      method: 'GET',
      url: '/checkout/qa/config',
    });

    await app.close();

    expect(enabledResponse.statusCode).toBe(200);
    expect(enabledResponse.json().data).toEqual({ enabled: true });
    expect(disabledResponse.statusCode).toBe(404);
  });
});
