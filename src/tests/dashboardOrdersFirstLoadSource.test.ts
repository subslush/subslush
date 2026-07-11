import fs from 'node:fs';
import path from 'node:path';

const pageServer = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../frontend/src/routes/dashboard/orders/+page.server.ts'
  ),
  'utf8'
);
const page = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../frontend/src/routes/dashboard/orders/+page.svelte'
  ),
  'utf8'
);

describe('Dashboard orders first-load data flow', () => {
  it('loads each order subscriptions during the server page load', () => {
    expect(pageServer).toContain(
      'const subscriptionsByOrder = Object.fromEntries('
    );
    expect(pageServer).toContain(
      'API_ENDPOINTS.ORDERS.LIST}/${order.id}/subscriptions'
    );
    expect(pageServer).toContain('subscriptionsByOrder,');
  });

  it('renders server-loaded subscriptions without an on-mount order refresh race', () => {
    expect(page).toContain(
      'let subscriptionsByOrder: Record<string, Subscription[]> = data.subscriptionsByOrder || {};'
    );
    expect(page).not.toContain('onMount(');
    expect(page).not.toContain('ordersService.listOrders(');
  });

  it('keeps every subscription field consumed by dashboard item UI and gates in the typed SSR route payload', () => {
    const ordersRoute = fs.readFileSync(
      path.resolve(__dirname, '../routes/orders.ts'),
      'utf8'
    );
    const renderedConsumerFields = [
      'id',
      'order_item_id',
      'service_type',
      'status',
      'term_months',
      'activation_handshake_state',
    ];
    const renderedProductOptionFields = [
      'strict_rules',
      'strict_rules_text',
      'strict_rules_version',
      'activation_instructions_template',
    ];

    for (const field of renderedConsumerFields) {
      expect(page).toContain(`subscription.${field}`);
      expect(ordersRoute).toMatch(new RegExp(`\\b${field}\\??:`));
    }
    for (const field of renderedProductOptionFields) {
      expect(page).toContain(`product_options?.${field}`);
      expect(ordersRoute).toContain('product_options: productOptions ?? null');
    }

    // Lifecycle fields are contractually retained even when a particular state
    // is not painted in the current card branch.
    for (const field of [
      'delivered_at',
      'activation_instructions_delivered_at',
      'activation_customer_ready_at',
      'activation_link_delivered_at',
      'mmu_cycle_index',
      'mmu_cycle_total',
    ]) {
      expect(ordersRoute).toMatch(new RegExp(`\\b${field}\\??:`));
    }
    expect(ordersRoute).toContain('DashboardOrderSubscriptionPayload');
  });
});
