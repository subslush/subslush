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
});
