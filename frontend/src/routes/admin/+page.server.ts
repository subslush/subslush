import type { PageServerLoad } from './$types';
import { createAdminService } from '$lib/api/admin.js';

const safeList = async <T>(fn: () => Promise<T[]>): Promise<T[]> => {
  try {
    return await fn();
  } catch {
    return [];
  }
};

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  const cookieHeader = cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const adminService = createAdminService(fetch, { cookie: cookieHeader });

  const [products, orders, payments, subscriptions, tasks] = await Promise.all([
    safeList(() => adminService.listProducts({ limit: 5 })),
    safeList(() => adminService.listOrders({ limit: 5 })),
    safeList(() => adminService.listPayments({ limit: 5 })),
    safeList(() => adminService.listSubscriptions({ limit: 5 })),
    safeList(() => adminService.listTasks({ limit: 5, status: 'pending' }))
  ]);

  return {
    metrics: {
      products: products.length,
      orders: orders.length,
      payments: payments.length,
      subscriptions: subscriptions.length,
      tasks: tasks.length
    },
    recentOrders: orders,
    recentPayments: payments,
    pendingTasks: tasks
  };
};
