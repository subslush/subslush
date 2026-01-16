import type { PageServerLoad } from './$types';
import { createAdminService } from '$lib/api/admin.js';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  const cookieHeader = cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const adminService = createAdminService(fetch, { cookie: cookieHeader });

  try {
    const [balances, transactions] = await Promise.all([
      adminService.listCreditBalances({ limit: 50 }),
      adminService.listCreditTransactions({ limit: 50 })
    ]);
    return { balances, transactions };
  } catch {
    return { balances: [], transactions: [] };
  }
};
