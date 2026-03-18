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

  const [subCategories] = await Promise.all([
    safeList(() => adminService.listProductSubCategories({ limit: 200 }))
  ]);

  return {
    subCategories
  };
};
