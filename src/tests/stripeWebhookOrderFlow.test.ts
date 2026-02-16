import { paymentService } from '../services/paymentService';
import { paymentRepository } from '../services/paymentRepository';
import { subscriptionService } from '../services/subscriptionService';
import { orderService } from '../services/orderService';
import { orderItemUpgradeSelectionService } from '../services/orderItemUpgradeSelectionService';
import { couponService } from '../services/couponService';
import { upgradeSelectionService } from '../services/upgradeSelectionService';
import { paymentEventRepository } from '../services/paymentEventRepository';
import { getDatabasePool } from '../config/database';

const mockConstructEvent = jest.fn();

jest.mock('stripe', () =>
  jest.fn().mockImplementation(() => ({
    webhooks: { constructEvent: mockConstructEvent },
  }))
);
jest.mock('../services/payments/stripeProvider', () => ({
  stripeProvider: {},
}));
jest.mock('../services/payments/nowPaymentsProvider', () => ({
  nowPaymentsProvider: {},
}));
jest.mock('../utils/nowpaymentsClient', () => ({
  nowpaymentsClient: {},
}));
jest.mock('../services/paymentRepository');
jest.mock('../services/subscriptionService');
jest.mock('../services/orderService');
jest.mock('../services/orderItemUpgradeSelectionService');
jest.mock('../services/couponService');
jest.mock('../services/upgradeSelectionService');
jest.mock('../services/paymentEventRepository');
jest.mock('../utils/logger');
jest.mock('../config/database');

const mockPaymentRepository = paymentRepository as jest.Mocked<
  typeof paymentRepository
>;
const mockSubscriptionService = subscriptionService as jest.Mocked<
  typeof subscriptionService
>;
const mockOrderService = orderService as jest.Mocked<typeof orderService>;
const mockOrderItemUpgradeSelectionService =
  orderItemUpgradeSelectionService as jest.Mocked<
    typeof orderItemUpgradeSelectionService
  >;
const mockCouponService = couponService as jest.Mocked<typeof couponService>;
const mockUpgradeSelectionService = upgradeSelectionService as jest.Mocked<
  typeof upgradeSelectionService
>;
const mockPaymentEventRepository = paymentEventRepository as jest.Mocked<
  typeof paymentEventRepository
>;
const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;

const mockDbClient = {
  query: jest.fn<Promise<any>, [string, any[]?]>(),
  release: jest.fn<void, []>(),
};

const mockPool = {
  query: jest.fn<Promise<any>, [string, any[]?]>(),
  connect: jest.fn().mockResolvedValue(mockDbClient),
};

describe('Stripe webhook order flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockDbClient.query.mockResolvedValue({ rows: [] });
    mockPool.query.mockResolvedValue({ rows: [] });
    mockGetDatabasePool.mockReturnValue(mockPool as any);

    mockOrderItemUpgradeSelectionService.listSelectionsForOrder.mockResolvedValue(
      {}
    );
    mockOrderService.sendOrderPaymentConfirmationEmail.mockResolvedValue({
      success: true,
    } as any);
    mockCouponService.finalizeRedemptionForOrder.mockResolvedValue(true as any);
    mockCouponService.voidRedemptionForOrder.mockResolvedValue(true as any);
    mockUpgradeSelectionService.submitSelection.mockResolvedValue(null as any);
    mockUpgradeSelectionService.acknowledgeManualMonthly.mockResolvedValue(
      null as any
    );
    mockPaymentEventRepository.recordEvent.mockResolvedValue(true);
  });

  it('creates subscriptions on checkout.session.completed', async () => {
    const order = {
      id: 'order-1',
      user_id: 'user-1',
      status: 'pending_payment',
      total_cents: 1000,
      currency: 'USD',
      items: [
        {
          id: 'item-1',
          order_id: 'order-1',
          product_variant_id: 'variant-1',
          quantity: 1,
          unit_price_cents: 1000,
          base_price_cents: 1000,
          discount_percent: 0,
          term_months: 1,
          auto_renew: false,
          coupon_discount_cents: 0,
          currency: 'USD',
          total_price_cents: 1000,
          description: 'Netflix Basic',
          metadata: {
            service_type: 'netflix',
            service_plan: 'basic',
            duration_months: 1,
          },
          created_at: new Date(),
        },
      ],
    };

    mockPaymentRepository.findByProviderPaymentId.mockResolvedValue(null);
    mockPaymentRepository.create.mockResolvedValue({
      id: 'payment-1',
      providerPaymentId: 'pi_123',
      orderId: 'order-1',
      checkoutMode: 'session',
    } as any);
    mockOrderService.getOrderWithItems.mockResolvedValue(order as any);
    mockSubscriptionService.createSubscription.mockResolvedValue({
      success: true,
      data: { id: 'sub-1' },
    } as any);

    mockPool.query.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE orders') && sql.includes('RETURNING')) {
        return { rows: [{ id: 'order-1' }] };
      }
      return { rows: [] };
    });

    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_123',
          payment_intent: 'pi_123',
          amount_total: 1000,
          currency: 'usd',
          metadata: {
            order_id: 'order-1',
          },
        },
      },
    });

    const result = await paymentService.handleStripeWebhook(
      { rawBody: Buffer.from('') },
      'sig'
    );

    expect(result).toBe(true);
    expect(mockSubscriptionService.createSubscription).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        service_type: 'netflix',
        service_plan: 'basic',
        order_id: 'order-1',
        order_item_id: 'item-1',
      })
    );
    expect(
      mockOrderService.sendOrderPaymentConfirmationEmail
    ).toHaveBeenCalledWith('order-1');
  });

  it('ignores payment_intent.succeeded for session checkouts', async () => {
    const payment = {
      id: 'payment-1',
      provider: 'stripe',
      providerPaymentId: 'pi_123',
      status: 'processing',
      purpose: 'subscription',
      amount: 10,
      currency: 'usd',
      userId: 'user-1',
      orderId: 'order-1',
      checkoutMode: 'session',
      stripeSessionId: 'cs_123',
      metadata: {},
    };

    mockPaymentRepository.findByProviderPaymentId.mockResolvedValue(
      payment as any
    );
    mockPaymentRepository.updateStatusByProviderPaymentId.mockResolvedValue(
      payment as any
    );

    mockConstructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_123',
          status: 'succeeded',
        },
      },
    });

    const result = await paymentService.handleStripeWebhook(
      { rawBody: Buffer.from('') },
      'sig'
    );

    expect(result).toBe(true);
    expect(mockSubscriptionService.createSubscription).not.toHaveBeenCalled();
    expect(
      mockPaymentRepository.updateStatusByProviderPaymentId
    ).toHaveBeenCalled();
    expect(
      mockOrderService.sendOrderPaymentConfirmationEmail
    ).not.toHaveBeenCalled();
  });
});
