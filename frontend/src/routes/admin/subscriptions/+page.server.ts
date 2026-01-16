import type { PageServerLoad } from './$types';
import { createAdminService } from '$lib/api/admin.js';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  const cookieHeader = cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const adminService = createAdminService(fetch, { cookie: cookieHeader });

  try {
    const subscriptions = await adminService.listSubscriptions({ limit: 50 });
    return { subscriptions };
  } catch {
    return { subscriptions: [] };
  }
};
