import type { PageServerLoad } from './$types';
import { createAdminService } from '$lib/api/admin.js';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  const cookieHeader = cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const adminService = createAdminService(fetch, { cookie: cookieHeader });

  const [tasksResult, prelaunchResult] = await Promise.allSettled([
    adminService.listTasks({ limit: 50, bucket: 'queue' }),
    adminService.listPrelaunchRewardTasks({ limit: 50, status: 'pending' })
  ]);

  return {
    tasks: tasksResult.status === 'fulfilled' ? tasksResult.value : [],
    prelaunchTasks: prelaunchResult.status === 'fulfilled' ? prelaunchResult.value : []
  };
};
