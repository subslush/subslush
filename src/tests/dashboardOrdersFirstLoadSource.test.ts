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

  it('keeps every subscription field consumed by dashboard gates in the SSR route payload', () => {
    const ordersRoute = fs.readFileSync(
      path.resolve(__dirname, '../routes/orders.ts'),
      'utf8'
    );
    expect(ordersRoute).toContain('product_options: productOptions ?? null');
    expect(ordersRoute).toContain('activation_handshake_state:');
    expect(ordersRoute).toContain('mmu_cycle_index');
    expect(page).toContain('subscription.product_options?.strict_rules');
    expect(page).toContain('subscription.activation_handshake_state');
    expect(page).toContain('subscription.status');
  });
});
