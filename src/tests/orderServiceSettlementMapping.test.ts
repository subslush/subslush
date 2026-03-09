import { orderService } from '../services/orderService';

describe('OrderService settlement/snapshot mapping', () => {
  it('maps new order and order_item settlement fields on create', async () => {
    const now = new Date();
    const orderRow = {
      id: '5c022d26-3329-4cc1-82fe-5d4b8f7e0c0a',
      user_id: 'f80a7064-21b8-478e-a541-632f3e256807',
      status: 'cart',
      status_reason: null,
      currency: 'EUR',
      subtotal_cents: 1899,
      discount_cents: 0,
      coupon_id: null,
      coupon_code: null,
      coupon_discount_cents: 0,
      total_cents: 1899,
      pricing_snapshot_id: 'fa6f4001-f956-4400-9a6f-7830d95c3b3d',
      settlement_currency: 'USD',
      settlement_total_cents: 1999,
      term_months: 1,
      paid_with_credits: false,
      auto_renew: false,
      contact_email: null,
      checkout_session_key: null,
      checkout_mode: null,
      stripe_session_id: null,
      payment_provider: 'stripe',
      payment_reference: null,
      metadata: {},
      created_at: now,
      updated_at: now,
    };

    const itemRow = {
      id: '6f940913-5ad6-4763-b31c-10b44f7f86f5',
      order_id: orderRow.id,
      product_variant_id: '753575b5-b8b7-4d84-95a1-c27ffefec3fc',
      product_name: 'Premium',
      variant_name: 'Monthly',
      quantity: 1,
      unit_price_cents: 1899,
      base_price_cents: 1899,
      discount_percent: 0,
      term_months: 1,
      auto_renew: false,
      coupon_discount_cents: 0,
      currency: 'EUR',
      total_price_cents: 1899,
      settlement_currency: 'USD',
      settlement_unit_price_cents: 1999,
      settlement_base_price_cents: 1999,
      settlement_coupon_discount_cents: 0,
      settlement_total_price_cents: 1999,
      description: 'Premium monthly',
      metadata: {},
      created_at: now,
    };

    const mockClient = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [orderRow] })
        .mockResolvedValueOnce({ rows: [itemRow] }),
    };

    const result = await orderService.createOrderWithItemsInTransaction(
      mockClient as any,
      {
        user_id: orderRow.user_id,
        status: 'cart',
        currency: 'EUR',
        subtotal_cents: 1899,
        total_cents: 1899,
        pricing_snapshot_id: orderRow.pricing_snapshot_id,
        settlement_currency: orderRow.settlement_currency,
        settlement_total_cents: orderRow.settlement_total_cents,
      },
      [
        {
          product_variant_id: itemRow.product_variant_id,
          quantity: 1,
          unit_price_cents: 1899,
          currency: 'EUR',
          total_price_cents: 1899,
          settlement_currency: itemRow.settlement_currency,
          settlement_unit_price_cents: itemRow.settlement_unit_price_cents,
          settlement_base_price_cents: itemRow.settlement_base_price_cents,
          settlement_coupon_discount_cents:
            itemRow.settlement_coupon_discount_cents,
          settlement_total_price_cents: itemRow.settlement_total_price_cents,
        },
      ]
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.pricing_snapshot_id).toBe(orderRow.pricing_snapshot_id);
    expect(result.data.settlement_currency).toBe(orderRow.settlement_currency);
    expect(result.data.settlement_total_cents).toBe(
      orderRow.settlement_total_cents
    );
    expect(result.data.items[0]?.settlement_currency).toBe(
      itemRow.settlement_currency
    );
    expect(result.data.items[0]?.settlement_total_price_cents).toBe(
      itemRow.settlement_total_price_cents
    );

    const sqlUsed = String((mockClient.query as jest.Mock).mock.calls[0]?.[0]);
    expect(sqlUsed).toContain('pricing_snapshot_id');
    expect(sqlUsed).toContain('settlement_total_cents');
  });
});
