import fs from 'fs';
import path from 'path';

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(__dirname, '..', '..', relativePath), 'utf8');

describe('durable product lifecycle wiring', () => {
  it('dual-writes orders, payments, subscriptions, entitlements and renewals', () => {
    const guestCheckout = read('src/services/guestCheckoutService.ts');
    const order = read('src/services/orderService.ts');
    const payment = read('src/services/paymentService.ts');
    const subscription = read('src/services/subscriptionService.ts');
    const entitlement = read('src/services/orderEntitlementService.ts');
    const renewal = read('src/services/subscriptionRenewalService.ts');
    const credits = read('src/services/creditService.ts');
    const refunds = read('src/services/refundService.ts');
    const risk = read('src/services/orderRiskService.ts');

    expect(guestCheckout).toContain(
      '(order_id, product_id, product_variant_id'
    );
    expect(order).toContain('order_id, product_id, product_variant_id');
    expect(payment).toContain('(payment_id, order_item_id, product_id');
    expect(subscription).toContain(
      'order_item_id, product_id, product_variant_id'
    );
    expect(entitlement).toContain('product_name_snapshot');
    expect(renewal).toContain('(subscription_id, product_id, cycle_end_date');
    expect(credits).toContain('order_id, product_id, product_variant_id');
    expect(refunds).toContain('(id, payment_id, product_id, user_id');
    expect(refunds).toContain(
      '(subscription_id, product_id, user_id, order_id'
    );
    expect(risk).toContain(
      'COUNT(DISTINCT COALESCE(oi.product_id, pv.product_id))'
    );
  });

  it('keeps customer authorization rooted in ownership, not a supplied product id', () => {
    const orderRoutes = read('src/routes/orders.ts');
    const subscriptionService = read('src/services/subscriptionService.ts');
    const evidence = read('src/services/orderComplianceEvidenceService.ts');

    expect(orderRoutes).toContain('AND o.user_id = $2');
    expect(subscriptionService).toContain('WHERE s.id = $1 AND s.user_id = $2');
    expect(evidence).toContain('owned_item.order_id = o.id');
    expect(evidence).toContain('owned_item.product_id = $3::uuid');
  });

  it('uses snapshots before mutable catalog labels in lifecycle views', () => {
    const order = read('src/services/orderService.ts');
    const admin = read('src/routes/admin/fulfillment.ts');
    expect(order).toContain('row.product_name_snapshot ?? row.product_name');
    expect(admin).toContain(
      'COALESCE(s.product_name_snapshot, oi.product_name_snapshot, p.name'
    );
    expect(admin).toContain(
      'COALESCE(s.fulfillment_config_snapshot, oi.fulfillment_config_snapshot, p.metadata)'
    );
  });
});
