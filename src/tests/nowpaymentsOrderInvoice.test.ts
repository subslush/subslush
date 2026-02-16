import { paymentService } from '../services/paymentService';
import { nowpaymentsClient } from '../utils/nowpaymentsClient';
import { paymentRepository } from '../services/paymentRepository';
import { orderService } from '../services/orderService';

jest.mock('../utils/nowpaymentsClient');
jest.mock('../services/paymentRepository');
jest.mock('../services/orderService');
jest.mock('../utils/logger');

const mockNowPaymentsClient = nowpaymentsClient as jest.Mocked<
  typeof nowpaymentsClient
>;
const mockPaymentRepository = paymentRepository as jest.Mocked<
  typeof paymentRepository
>;
const mockOrderService = orderService as jest.Mocked<typeof orderService>;

describe('NOWPayments order invoice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNowPaymentsClient.isCurrencySupported.mockResolvedValue(true);
    mockNowPaymentsClient.getMinAmount.mockResolvedValue({
      min_amount: 1,
      fiat_equivalent: 1,
    } as any);
  });

  it('creates invoice and stores payment record', async () => {
    const order = {
      id: 'order-1',
      user_id: 'user-1',
      status: 'cart',
      total_cents: 1500,
      currency: 'USD',
      payment_provider: null,
      checkout_mode: null,
      payment_reference: null,
      items: [
        {
          id: 'item-1',
          order_id: 'order-1',
          product_variant_id: 'variant-1',
          quantity: 1,
          unit_price_cents: 1500,
          base_price_cents: 1500,
          discount_percent: 0,
          term_months: 1,
          auto_renew: false,
          coupon_discount_cents: 0,
          currency: 'USD',
          total_price_cents: 1500,
          description: 'Test Subscription',
          metadata: {
            service_type: 'netflix',
            service_plan: 'basic',
            duration_months: 1,
          },
          created_at: new Date(),
        },
      ],
    };

    mockOrderService.getOrderWithItems.mockResolvedValue(order as any);
    mockOrderService.updateOrderPayment.mockResolvedValue({
      success: true,
      data: order,
    } as any);

    mockNowPaymentsClient.isCurrencySupported.mockResolvedValue(true);
    mockNowPaymentsClient.createInvoice.mockResolvedValue({
      id: 'inv_123',
      payment_status: 'waiting',
      pay_address: 'addr',
      price_amount: 15,
      price_currency: 'usd',
      pay_amount: 0.01,
      pay_currency: 'btc',
      order_id: 'order-1',
      order_description: 'Test Subscription',
      ipn_callback_url: 'https://api.example.com/webhook',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      invoice_url: 'https://nowpayments.io/invoice/123',
      success_url: undefined,
      cancel_url: undefined,
    } as any);

    mockPaymentRepository.findByProviderPaymentId.mockResolvedValue(null);
    mockPaymentRepository.create.mockResolvedValue({
      id: 'payment-1',
      providerPaymentId: 'inv_123',
    } as any);

    const result = await paymentService.createNowPaymentsOrderInvoice({
      orderId: 'order-1',
      payCurrency: 'btc',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.invoiceId).toBe('inv_123');
      expect(result.invoiceUrl).toBe('https://nowpayments.io/invoice/123');
    }

    expect(mockNowPaymentsClient.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        price_amount: 15,
        price_currency: 'usd',
        pay_currency: 'btc',
        order_id: 'order-1',
      })
    );
    expect(mockPaymentRepository.create).toHaveBeenCalled();
    expect(mockOrderService.updateOrderPayment).toHaveBeenCalledWith(
      'order-1',
      expect.objectContaining({
        payment_provider: 'nowpayments',
        payment_reference: 'inv_123',
        checkout_mode: 'invoice',
      })
    );
  });

  it('creates a new invoice when pay currency changes', async () => {
    const order = {
      id: 'order-1',
      user_id: 'user-1',
      status: 'pending_payment',
      total_cents: 1500,
      currency: 'USD',
      payment_provider: 'nowpayments',
      checkout_mode: 'invoice',
      payment_reference: 'inv_old',
      items: [
        {
          id: 'item-1',
          order_id: 'order-1',
          product_variant_id: 'variant-1',
          quantity: 1,
          unit_price_cents: 1500,
          base_price_cents: 1500,
          discount_percent: 0,
          term_months: 1,
          auto_renew: false,
          coupon_discount_cents: 0,
          currency: 'USD',
          total_price_cents: 1500,
          description: 'Test Subscription',
          metadata: {
            service_type: 'netflix',
            service_plan: 'basic',
            duration_months: 1,
          },
          created_at: new Date(),
        },
      ],
    };

    mockOrderService.getOrderWithItems.mockResolvedValue(order as any);
    mockOrderService.updateOrderPayment.mockResolvedValue({
      success: true,
      data: order,
    } as any);

    mockPaymentRepository.findByProviderPaymentId.mockResolvedValue({
      id: 'payment-old',
      providerPaymentId: 'inv_old',
      status: 'waiting',
      providerStatus: 'waiting',
      metadata: {
        invoice_url: 'https://nowpayments.io/invoice/old',
        pay_currency: 'btc',
      },
    } as any);

    mockNowPaymentsClient.isCurrencySupported.mockResolvedValue(true);
    mockNowPaymentsClient.createInvoice.mockResolvedValue({
      id: 'inv_new',
      payment_status: 'waiting',
      pay_address: 'addr-new',
      price_amount: 15,
      price_currency: 'usd',
      pay_amount: 0.02,
      pay_currency: 'eth',
      order_id: 'order-1',
      order_description: 'Test Subscription',
      ipn_callback_url: 'https://api.example.com/webhook',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      invoice_url: 'https://nowpayments.io/invoice/new',
      success_url: undefined,
      cancel_url: undefined,
    } as any);

    mockPaymentRepository.create.mockResolvedValue({
      id: 'payment-new',
      providerPaymentId: 'inv_new',
    } as any);

    const result = await paymentService.createNowPaymentsOrderInvoice({
      orderId: 'order-1',
      payCurrency: 'eth',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.invoiceId).toBe('inv_new');
    }
    expect(mockNowPaymentsClient.createInvoice).toHaveBeenCalled();
  });

  it('reuses existing invoice when pay currency is unchanged', async () => {
    const order = {
      id: 'order-1',
      user_id: 'user-1',
      status: 'pending_payment',
      total_cents: 1500,
      currency: 'USD',
      payment_provider: 'nowpayments',
      checkout_mode: 'invoice',
      payment_reference: 'inv_old',
      items: [
        {
          id: 'item-1',
          order_id: 'order-1',
          product_variant_id: 'variant-1',
          quantity: 1,
          unit_price_cents: 1500,
          base_price_cents: 1500,
          discount_percent: 0,
          term_months: 1,
          auto_renew: false,
          coupon_discount_cents: 0,
          currency: 'USD',
          total_price_cents: 1500,
          description: 'Test Subscription',
          metadata: {
            service_type: 'netflix',
            service_plan: 'basic',
            duration_months: 1,
          },
          created_at: new Date(),
        },
      ],
    };

    mockOrderService.getOrderWithItems.mockResolvedValue(order as any);
    mockNowPaymentsClient.isCurrencySupported.mockResolvedValue(true);
    mockPaymentRepository.findByProviderPaymentId.mockResolvedValue({
      id: 'payment-old',
      providerPaymentId: 'inv_old',
      status: 'waiting',
      providerStatus: 'waiting',
      metadata: {
        invoice_url: 'https://nowpayments.io/invoice/old',
        pay_currency: 'btc',
      },
    } as any);

    const result = await paymentService.createNowPaymentsOrderInvoice({
      orderId: 'order-1',
      payCurrency: 'btc',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.invoiceId).toBe('inv_old');
      expect(result.invoiceUrl).toBe('https://nowpayments.io/invoice/old');
    }
    expect(mockNowPaymentsClient.createInvoice).not.toHaveBeenCalled();
  });

  it('blocks invoice creation when order total is below NOWPayments minimum', async () => {
    const order = {
      id: 'order-1',
      user_id: 'user-1',
      status: 'cart',
      total_cents: 500,
      currency: 'USD',
      payment_provider: null,
      checkout_mode: null,
      payment_reference: null,
      items: [
        {
          id: 'item-1',
          order_id: 'order-1',
          product_variant_id: 'variant-1',
          quantity: 1,
          unit_price_cents: 500,
          base_price_cents: 500,
          discount_percent: 0,
          term_months: 1,
          auto_renew: false,
          coupon_discount_cents: 0,
          currency: 'USD',
          total_price_cents: 500,
          description: 'Test Subscription',
          metadata: {
            service_type: 'netflix',
            service_plan: 'basic',
            duration_months: 1,
          },
          created_at: new Date(),
        },
      ],
    };

    mockOrderService.getOrderWithItems.mockResolvedValue(order as any);
    mockNowPaymentsClient.isCurrencySupported.mockResolvedValue(true);
    mockNowPaymentsClient.getMinAmount.mockResolvedValue({
      min_amount: 10,
      fiat_equivalent: 10,
    } as any);

    const result = await paymentService.createNowPaymentsOrderInvoice({
      orderId: 'order-1',
      payCurrency: 'btc',
    });

    expect(result).toEqual({
      success: false,
      error: 'below_nowpayments_minimum',
    });
    expect(mockNowPaymentsClient.createInvoice).not.toHaveBeenCalled();
    expect(mockPaymentRepository.create).not.toHaveBeenCalled();
  });
});
