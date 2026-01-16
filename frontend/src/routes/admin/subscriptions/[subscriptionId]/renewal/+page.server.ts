import type { PageServerLoad } from './$types';
import { createAdminService } from '$lib/api/admin.js';

export const load: PageServerLoad = async ({ params, fetch, cookies, url }) => {
  const cookieHeader = cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const adminService = createAdminService(fetch, { cookie: cookieHeader });

  try {
    const fulfillment = await adminService.getRenewalFulfillment(params.subscriptionId);
    return {
      fulfillment,
      taskId: url.searchParams.get('taskId')
    };
  } catch {
    return {
      fulfillment: null,
      taskId: url.searchParams.get('taskId')
    };
  }
};
