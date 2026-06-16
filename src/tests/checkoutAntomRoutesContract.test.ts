import Fastify from 'fastify';
import { checkoutRoutes } from '../routes/checkout';
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
    getAntomCheckoutStatus: jest.fn(),
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
  getAntomCheckoutStatus: jest.Mock;
};

describe('Checkout Antom route contract', () => {
  const orderId = '11111111-1111-4111-8111-111111111111';
  const paymentRequestId = 'antom_request_123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts a null payment_id on /checkout/antom/status', async () => {
    mockOrderService.getOrderById.mockResolvedValue({
      id: orderId,
      payment_provider: 'antom',
      payment_reference: paymentRequestId,
      metadata: {},
    } as any);
    mockPaymentService.getAntomCheckoutStatus.mockResolvedValue({
      success: true,
      orderId,
      orderStatus: 'pending_payment',
      paymentStatus: 'failed',
      providerStatus: 'fail',
      paymentRequestId,
      antomPaymentId: 'antom_payment_123',
      methodTitle: 'Card',
      processingCurrency: 'USD',
      processingSubtotalCents: 699,
      processingFeeCents: 56,
      processingTaxCents: 0,
      processingTotalCents: 755,
      taxResidenceId: 'outside_eu',
      taxResidenceLabel: 'Outside the EU',
      canRetry: true,
    });

    const app = Fastify();
    await app.register(checkoutRoutes, { prefix: '/checkout' });

    const response = await app.inject({
      method: 'POST',
      url: '/checkout/antom/status',
      payload: {
        order_id: orderId,
        payment_request_id: paymentRequestId,
        payment_id: null,
      },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(mockPaymentService.getAntomCheckoutStatus).toHaveBeenCalledWith({
      orderId,
      paymentRequestId,
      paymentId: null,
    });
    expect(response.json().data).toMatchObject({
      order_id: orderId,
      payment_status: 'failed',
      provider_status: 'fail',
      can_retry: true,
    });
  });

  it('returns purchase tracking data on successful /checkout/antom/status', async () => {
    mockOrderService.getOrderById.mockResolvedValue({
      id: orderId,
      payment_provider: 'antom',
      payment_reference: paymentRequestId,
      metadata: {},
    } as any);
    mockPaymentService.getAntomCheckoutStatus.mockResolvedValue({
      success: true,
      orderId,
      orderStatus: 'in_process',
      paymentStatus: 'succeeded',
      providerStatus: 'capture_success',
      paymentRequestId,
      antomPaymentId: 'antom_payment_123',
      methodTitle: 'Card',
      processingCurrency: 'USD',
      processingSubtotalCents: 3091,
      processingFeeCents: 160,
      processingTaxCents: 276,
      processingTotalCents: 3527,
      taxResidenceId: 'se',
      taxResidenceLabel: 'Sweden',
      canRetry: false,
    });
    mockOrderService.getOrderWithItems.mockResolvedValue({
      id: orderId,
      user_id: null,
      contact_email: 'guest@example.com',
      display_currency: 'USD',
      total_cents: 3091,
      metadata: {
        display_total_cents: 3527,
      },
      items: [
        {
          id: 'item-1',
          product_variant_id: 'variant-1',
          product_name: 'Netflix Premium',
          variant_name: '12 Months',
          quantity: 1,
          unit_price_cents: 3091,
          total_price_cents: 3091,
          currency: 'USD',
          metadata: {
            service_type: 'streaming',
          },
        },
      ],
    } as any);

    const app = Fastify();
    await app.register(checkoutRoutes, { prefix: '/checkout' });

    const response = await app.inject({
      method: 'POST',
      url: '/checkout/antom/status',
      payload: {
        order_id: orderId,
        payment_request_id: paymentRequestId,
      },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    expect(mockOrderService.getOrderWithItems).toHaveBeenCalledWith(orderId);
    expect(response.json().data.purchase_tracking).toEqual({
      transaction_id: orderId,
      event_id: `order_${orderId}_purchase`,
      currency: 'USD',
      value: 35.27,
      items: [
        {
          item_id: 'variant-1',
          item_name: 'Netflix Premium',
          item_category: 'streaming',
          item_variant: '12 Months',
          price: 30.91,
          currency: 'USD',
          quantity: 1,
          index: 0,
        },
      ],
    });
  });
});
