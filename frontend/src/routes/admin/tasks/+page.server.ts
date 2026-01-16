import type { PageServerLoad } from './$types';
import { createAdminService } from '$lib/api/admin.js';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  const cookieHeader = cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const adminService = createAdminService(fetch, { cookie: cookieHeader });

  try {
    const tasks = await adminService.listTasks({ limit: 50, bucket: 'queue' });
    return { tasks };
  } catch {
    return { tasks: [] };
  }
};
