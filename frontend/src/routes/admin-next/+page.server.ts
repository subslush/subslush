import type { PageServerLoad } from './$types';
import { createAdminNextService } from '$lib/api/adminNext.js';
import type {
  AdminNextOverviewKpis,
  AdminNextQueueResponse,
} from '$lib/types/adminNext.js';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  const cookieHeader = cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const adminNext = createAdminNextService(fetch, { cookie: cookieHeader });

  const results = await Promise.allSettled([
    adminNext.getOverview(),
    adminNext.getQueue({ tab: 'new_orders', limit: 8, sort: 'recent' }),
    adminNext.getQueue({ tab: 'mmu', limit: 8 }),
    adminNext.getQueue({ tab: 'awaiting_customer', limit: 8 }),
    adminNext.getQueue({ tab: 'issues', limit: 8 }),
    adminNext.getQueue({ tab: 'completed', limit: 8 }),
    adminNext.listPayments({ limit: 12 }),
  ]);
  const value = <T>(index: number, fallback: T): T =>
    results[index]?.status === 'fulfilled'
      ? (results[index] as PromiseFulfilledResult<T>).value
      : fallback;

  return {
    kpis: value<AdminNextOverviewKpis>(0, {}),
    queues: {
      newOrders: value<AdminNextQueueResponse>(1, { orders: [] }).orders,
      mmu: value<AdminNextQueueResponse>(2, { orders: [] }).orders,
      awaitingCustomer: value<AdminNextQueueResponse>(3, { orders: [] }).orders,
      issues: value<AdminNextQueueResponse>(4, { orders: [] }).orders,
      completed: value<AdminNextQueueResponse>(5, { orders: [] }).orders,
    },
    payments: value(6, { payments: [] }).payments,
    error: results.some(result => result.status === 'rejected')
      ? "Some overview data couldn't load — retry."
      : '',
  };
};
