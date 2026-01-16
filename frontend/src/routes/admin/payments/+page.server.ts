import type { PageServerLoad } from './$types';
import { createAdminService } from '$lib/api/admin.js';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  const cookieHeader = cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const adminService = createAdminService(fetch, { cookie: cookieHeader });

  const [payments, monitoring, pending, refunds, pendingRefunds, refundStats] = await Promise.all([
    adminService.listPayments({ limit: 50 }).catch(() => []),
    adminService.getPaymentMonitoring().catch(() => ({})),
    adminService.getPendingPayments().catch(() => ({})),
    adminService.listRefunds({ limit: 50 }).catch(() => []),
    adminService.listPendingRefunds().catch(() => []),
    adminService.getRefundStatistics({ days: 30 }).catch(() => ({}))
  ]);

  return {
    payments,
    monitoring,
    pending,
    refunds,
    pendingRefunds,
    refundStats
  };
};
