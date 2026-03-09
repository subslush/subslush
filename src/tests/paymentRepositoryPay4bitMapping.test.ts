import { paymentRepository } from '../services/paymentRepository';

describe('paymentRepository pay4bit mapping', () => {
  it('maps a pay4bit payment row correctly', async () => {
    const now = new Date();
    const row = {
      id: '1a0b83c9-e4e3-4b70-a6d1-7342f0f8d9fb',
      user_id: 'ed7f118a-f824-4817-a58f-2f936fef4b92',
      provider: 'pay4bit',
      provider_payment_id: 'p4b_localpay_123',
      status: 'pending',
      provider_status: 'created',
      purpose: 'one_time',
      amount: '19.99',
      currency: 'USD',
      amount_usd: '19.99',
      checkout_mode: 'session',
      stripe_session_id: null,
      payment_method_type: 'card',
      subscription_id: null,
      credit_transaction_id: null,
      order_id: '131f0014-b5ce-4ab8-91f6-69868a043ebd',
      product_variant_id: null,
      order_item_id: null,
      price_cents: 1999,
      base_price_cents: 1999,
      discount_percent: '0',
      term_months: 1,
      auto_renew: false,
      next_billing_at: null,
      renewal_method: null,
      status_reason: null,
      expires_at: null,
      metadata: { callback_version: 1 },
      created_at: now,
      updated_at: now,
    };

    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [row] }),
    };

    const created = await paymentRepository.create(
      {
        userId: row.user_id,
        provider: 'pay4bit',
        providerPaymentId: row.provider_payment_id,
        status: 'pending',
        providerStatus: 'created',
        purpose: 'one_time',
        amount: 19.99,
        currency: 'USD',
        checkoutMode: 'session',
        paymentMethodType: 'card',
        orderId: row.order_id,
        priceCents: row.price_cents,
        basePriceCents: row.base_price_cents,
        discountPercent: 0,
        termMonths: 1,
        autoRenew: false,
        metadata: { callback_version: 1 },
      },
      mockClient as any
    );

    expect(created.provider).toBe('pay4bit');
    expect(created.providerPaymentId).toBe('p4b_localpay_123');
    expect(created.orderId).toBe(row.order_id);
    expect(created.priceCents).toBe(1999);
    expect(created.metadata).toEqual({ callback_version: 1 });

    const params = (mockClient.query as jest.Mock).mock.calls[0]?.[1] as any[];
    expect(params[1]).toBe('pay4bit');
  });
});
