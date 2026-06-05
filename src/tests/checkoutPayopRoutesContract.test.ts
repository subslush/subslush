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
    getPayopCheckoutOptions: jest.fn(),
    createPayopCheckoutSession: jest.fn(),
    getPayopCheckoutStatus: jest.fn(),
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
  getPayopCheckoutOptions: jest.Mock;
  createPayopCheckoutSession: jest.Mock;
  getPayopCheckoutStatus: jest.Mock;
};

describe('Checkout Payop route contract', () => {
  const orderId = '11111111-1111-4111-8111-111111111111';
  const checkoutSessionKey = 'checkout_abc12345';

  beforeEach(() => {
    jest.clearAllMocks();
    mockOrderService.appendOrderMetadata.mockResolvedValue(true);
    mockOrderService.getOrderByCheckoutSessionKey.mockResolvedValue({
      id: orderId,
      user_id: null,
    } as any);
  });

  it('returns mapped Payop methods from /checkout/payop/options', async () => {
    mockPaymentService.getPayopCheckoutOptions.mockResolvedValue({
      success: true,
      orderId,
      orderStatus: 'pending_payment',
      displayCurrency: 'SEK',
      displayTotalCents: 29900,
      detectedCountry: 'SE',
      selectedCountry: 'SE',
      countryOptions: ['CA', 'GB', 'SE'],
      selectedMethodId: 37000000,
      methods: [
        {
          methodId: 37000000,
          title: 'Revolut',
          type: 'bank_transfer',
          formType: 'redirect',
          logoUrl: null,
          supportedCountries: ['SE', 'GB'],
          supportedCurrencies: ['EUR'],
          processingCurrency: 'EUR',
          processingSubtotalCents: 2618,
          processingFeeCents: 93,
          processingTotalCents: 2711,
          convertedFromDisplayCurrency: true,
          requiredPayerFields: [],
          items: [
            {
              orderItemId: 'item-1',
              label: 'Netflix Premium',
              totalCents: 2618,
            },
          ],
        },
      ],
    });

    const app = Fastify();
    await app.register(checkoutRoutes, { prefix: '/checkout' });

    const response = await app.inject({
      method: 'POST',
      url: '/checkout/payop/options',
      payload: {
        checkout_session_key: checkoutSessionKey,
        country_code: 'se',
      },
      headers: {
        'cf-ipcountry': 'SE',
      },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toEqual({
      order_id: orderId,
      order_status: 'pending_payment',
      display_currency: 'SEK',
      display_total_cents: 29900,
      detected_country: 'SE',
      selected_country: 'SE',
      country_options: ['CA', 'GB', 'SE'],
      selected_method_id: 37000000,
      methods: [
        {
          method_id: 37000000,
          title: 'Revolut',
          type: 'bank_transfer',
          form_type: 'redirect',
          logo_url: null,
          supported_countries: ['SE', 'GB'],
          supported_currencies: ['EUR'],
          processing_currency: 'EUR',
          processing_subtotal_cents: 2618,
          processing_fee_cents: 93,
          processing_total_cents: 2711,
          converted_from_display_currency: true,
          required_payer_fields: [],
          items: [
            {
              order_item_id: 'item-1',
              label: 'Netflix Premium',
              total_cents: 2618,
            },
          ],
        },
      ],
    });
  });

  it('creates a Payop session from /checkout/payop/session', async () => {
    mockPaymentService.createPayopCheckoutSession.mockResolvedValue({
      success: true,
      orderId,
      sessionId: 'payop-invoice-1',
      sessionUrl:
        'https://checkout.payop.com/en/payment/invoice-preprocessing/payop-invoice-1',
      paymentId: 'payop-invoice-1',
      paymentProvider: 'payop',
      methodQuote: {
        methodId: 700001,
        title: 'PayDo',
        type: 'ewallet',
        formType: 'redirect',
        logoUrl: null,
        supportedCountries: [],
        supportedCurrencies: ['EUR', 'USD'],
        processingCurrency: 'EUR',
        processingSubtotalCents: 2618,
        processingFeeCents: 135,
        processingTotalCents: 2753,
        convertedFromDisplayCurrency: true,
        requiredPayerFields: ['email'],
        items: [],
      },
    });
    mockOrderService.getOrderWithItems.mockResolvedValue({
      id: orderId,
      user_id: null,
      contact_email: 'guest@example.com',
      currency: 'SEK',
      total_cents: 29900,
      items: [],
      metadata: {
        display_currency: 'SEK',
        display_total_cents: 29900,
      },
    } as any);

    const app = Fastify();
    await app.register(checkoutRoutes, { prefix: '/checkout' });

    const response = await app.inject({
      method: 'POST',
      url: '/checkout/payop/session',
      payload: {
        checkout_session_key: checkoutSessionKey,
        method_id: 700001,
        country_code: 'SE',
        legal_consent: {
          immediate_fulfillment_consent: true,
          terms_policy_consent: true,
          consent_timestamp: '2026-06-04T10:00:00.000Z',
        },
      },
      headers: {
        'cf-ipcountry': 'SE',
      },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toEqual({
      order_id: orderId,
      session_id: 'payop-invoice-1',
      session_url:
        'https://checkout.payop.com/en/payment/invoice-preprocessing/payop-invoice-1',
      payment_id: 'payop-invoice-1',
      payment_provider: 'payop',
      method_quote: {
        method_id: 700001,
        title: 'PayDo',
        type: 'ewallet',
        form_type: 'redirect',
        logo_url: null,
        supported_countries: [],
        supported_currencies: ['EUR', 'USD'],
        processing_currency: 'EUR',
        processing_subtotal_cents: 2618,
        processing_fee_cents: 135,
        processing_total_cents: 2753,
        converted_from_display_currency: true,
        required_payer_fields: ['email'],
        items: [],
      },
    });
    expect(mockOrderService.appendOrderMetadata).toHaveBeenCalledWith(
      orderId,
      expect.objectContaining({
        checkout_legal_consent: expect.objectContaining({
          immediate_fulfillment_consent: true,
          terms_policy_consent: true,
        }),
      })
    );
  });

  it('returns mapped Payop status from /checkout/payop/status', async () => {
    mockPaymentService.getPayopCheckoutStatus.mockResolvedValue({
      success: true,
      orderId,
      orderStatus: 'pending_payment',
      paymentStatus: 'processing',
      providerStatus: 'transaction_pending',
      invoiceId: 'payop-invoice-1',
      txid: 'tx-1',
      methodTitle: 'PayDo',
      processingCurrency: 'EUR',
      processingSubtotalCents: 2618,
      processingFeeCents: 135,
      processingTotalCents: 2753,
      canRetry: false,
    });

    const app = Fastify();
    await app.register(checkoutRoutes, { prefix: '/checkout' });

    const response = await app.inject({
      method: 'POST',
      url: '/checkout/payop/status',
      payload: {
        checkout_session_key: checkoutSessionKey,
      },
    });

    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data).toEqual({
      order_id: orderId,
      order_status: 'pending_payment',
      payment_status: 'processing',
      provider_status: 'transaction_pending',
      invoice_id: 'payop-invoice-1',
      txid: 'tx-1',
      method_title: 'PayDo',
      processing_currency: 'EUR',
      processing_subtotal_cents: 2618,
      processing_fee_cents: 135,
      processing_total_cents: 2753,
      can_retry: false,
    });
  });
});
