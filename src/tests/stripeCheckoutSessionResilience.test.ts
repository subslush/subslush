import { paymentService } from '../services/paymentService';
import { stripeProvider } from '../services/payments/stripeProvider';
import { orderService } from '../services/orderService';
import { paymentRepository } from '../services/paymentRepository';

jest.mock('../services/payments/stripeProvider');
jest.mock('../services/orderService');
jest.mock('../services/paymentRepository');
jest.mock('../utils/logger');

const mockStripeProvider = stripeProvider as jest.Mocked<typeof stripeProvider>;
const mockOrderService = orderService as jest.Mocked<typeof orderService>;
const mockPaymentRepository = paymentRepository as jest.Mocked<
  typeof paymentRepository
>;

describe('Stripe checkout session resilience', () => {
  const buildOrder = () => ({
    id: 'order-1',
    user_id: 'user-1',
    status: 'cart',
    currency: 'USD',
    total_cents: 1599,
    payment_provider: null,
    checkout_mode: null,
    stripe_session_id: null,
    status_reason: 'guest_draft',
    contact_email: 'guest@example.com',
    items: [
      {
        id: 'item-1',
        order_id: 'order-1',
        product_variant_id: 'variant-1',
        quantity: 1,
        unit_price_cents: 1599,
        total_price_cents: 1599,
        description: 'Netflix Basic',
        product_name: 'Netflix',
        variant_name: 'Basic',
        auto_renew: false,
      },
    ],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockOrderService.getOrderWithItems.mockResolvedValue(buildOrder() as any);
    mockStripeProvider.supportsCurrency.mockResolvedValue(true);
    mockPaymentRepository.findByProviderPaymentId.mockResolvedValue(null);
    mockOrderService.updateOrderPayment.mockResolvedValue({
      success: true,
    } as any);
  });

  it('retries transient Stripe connection errors and returns provider unavailable', async () => {
    mockStripeProvider.createCheckoutSession.mockRejectedValue({
      type: 'StripeConnectionError',
      detail: { code: 'ENOTFOUND' },
    } as any);

    const result = await paymentService.createStripeCheckoutSession({
      orderId: 'order-1',
    });

    expect(result).toEqual({
      success: false,
      error: 'payment_provider_unavailable',
    });
    expect(mockStripeProvider.createCheckoutSession).toHaveBeenCalledTimes(3);
  });

  it('succeeds when Stripe recovers during retry attempts', async () => {
    mockStripeProvider.createCheckoutSession
      .mockRejectedValueOnce({
        type: 'StripeConnectionError',
        detail: { code: 'ENOTFOUND' },
      } as any)
      .mockResolvedValueOnce({
        id: 'cs_123',
        url: 'https://checkout.stripe.com/c/pay/cs_123',
        payment_intent: 'pi_123',
      } as any);

    const result = await paymentService.createStripeCheckoutSession({
      orderId: 'order-1',
    });

    expect(result).toEqual({
      success: true,
      sessionId: 'cs_123',
      sessionUrl: 'https://checkout.stripe.com/c/pay/cs_123',
      paymentId: 'pi_123',
      orderId: 'order-1',
    });
    expect(mockStripeProvider.createCheckoutSession).toHaveBeenCalledTimes(2);
  });
});
