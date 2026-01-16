import { paymentService } from '../services/paymentService';
import { paymentRepository } from '../services/paymentRepository';
import { subscriptionService } from '../services/subscriptionService';
import { orderService } from '../services/orderService';
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
jest.mock('../utils/logger');
jest.mock('../config/database');

const mockPaymentRepository = paymentRepository as jest.Mocked<
  typeof paymentRepository
>;
const mockSubscriptionService = subscriptionService as jest.Mocked<
  typeof subscriptionService
>;
const mockOrderService = orderService as jest.Mocked<typeof orderService>;
const mockGetDatabasePool = getDatabasePool as jest.MockedFunction<
  typeof getDatabasePool
>;

const mockDbClient = {
  query: jest.fn<Promise<any>, [string, any[]?]>(),
  release: jest.fn<void, []>(),
};

describe('Stripe webhook order flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockDbClient.query.mockResolvedValue({ rows: [] });
    mockGetDatabasePool.mockReturnValue({
      connect: jest.fn().mockResolvedValue(mockDbClient),
    } as any);
  });

  it('creates subscription and updates order on Stripe success', async () => {
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
      productVariantId: 'variant-1',
      priceCents: 1000,
      metadata: {
        service_type: 'netflix',
        service_plan: 'basic',
        duration_months: 2,
        auto_renew: true,
      },
    };

    mockPaymentRepository.findByProviderPaymentId.mockResolvedValue(
      payment as any
    );
    mockPaymentRepository.updateStatusByProviderPaymentId.mockResolvedValue(
      payment as any
    );
    mockSubscriptionService.createSubscription.mockResolvedValue({
      success: true,
      data: { id: 'sub-1' },
    } as any);
    mockPaymentRepository.linkSubscription.mockResolvedValue();
    mockOrderService.updateOrderPayment.mockResolvedValue({
      success: true,
      data: { id: 'order-1' },
    } as any);

    mockConstructEvent.mockReturnValue({
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_123',
          metadata: {
            service_type: 'netflix',
            service_plan: 'basic',
            duration_months: 2,
            auto_renew: true,
          },
          status: 'succeeded',
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
        auto_renew: true,
        order_id: 'order-1',
        product_variant_id: 'variant-1',
        renewal_method: 'stripe',
      })
    );
    expect(mockPaymentRepository.linkSubscription).toHaveBeenCalledWith(
      'stripe',
      'pi_123',
      'sub-1'
    );
    expect(mockOrderService.updateOrderPayment).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({
        payment_provider: 'stripe',
        payment_reference: 'pi_123',
        status: 'in_process',
      })
    );
  });
});
