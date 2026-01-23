import type { PageServerLoad } from './$types';
import { createAdminService } from '$lib/api/admin.js';
import type { AdminOverviewMetrics } from '$lib/types/admin.js';

const safeList = async <T>(fn: () => Promise<T[]>): Promise<T[]> => {
  try {
    return await fn();
  } catch {
    return [];
  }
};

const safeMetrics = async (
  fn: () => Promise<AdminOverviewMetrics>
): Promise<AdminOverviewMetrics> => {
  try {
    return await fn();
  } catch {
    return {
      products: 0,
      orders: 0,
      payments: 0,
      subscriptions: 0,
      tasks: 0,
    };
  }
};

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  const cookieHeader = cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const adminService = createAdminService(fetch, { cookie: cookieHeader });

  const [metrics, orders, payments, tasks] = await Promise.all([
    safeMetrics(() => adminService.getOverviewMetrics()),
    safeList(() => adminService.listOrders({ limit: 5 })),
    safeList(() => adminService.listPayments({ limit: 5 })),
    safeList(() => adminService.listTasks({ limit: 5, status: 'pending' }))
  ]);

  return {
    metrics,
    recentOrders: orders,
    recentPayments: payments,
    pendingTasks: tasks
  };
};
