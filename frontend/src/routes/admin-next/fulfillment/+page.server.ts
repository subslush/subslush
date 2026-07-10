import type { PageServerLoad } from './$types';
import { createAdminNextService } from '$lib/api/adminNext.js';

export const load: PageServerLoad = async ({ fetch, cookies, url }) => {
  const cookieHeader = cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const adminNext = createAdminNextService(fetch, { cookie: cookieHeader });

  const results = await Promise.allSettled([
    adminNext.getQueue({ tab: 'new_orders', limit: 100 }),
    adminNext.getQueue({ tab: 'mmu', limit: 100 }),
    adminNext.getQueue({ tab: 'awaiting_customer', limit: 100 }),
    adminNext.getQueue({ tab: 'issues', limit: 100 }),
    adminNext.getQueue({ tab: 'completed', limit: 100 }),
  ]);
  const orders = (index: number) =>
    results[index]?.status === 'fulfilled'
      ? results[index].value.orders
      : [];

  return {
    activeTab: url.searchParams.get('tab') || 'new_orders',
    queues: {
      new_orders: orders(0),
      mmu: orders(1),
      awaiting_customer: orders(2),
      issues: orders(3),
      completed: orders(4),
    },
    error: results.some(result => result.status === 'rejected')
      ? "Some fulfillment data couldn't load — retry."
      : '',
  };
};
