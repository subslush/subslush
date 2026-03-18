import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createAdminService } from '$lib/api/admin.js';

const safeList = async <T>(fn: () => Promise<T[]>): Promise<T[]> => {
  try {
    return await fn();
  } catch {
    return [];
  }
};

export const load: PageServerLoad = async ({ fetch, params, cookies }) => {
  const cookieHeader = cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const adminService = createAdminService(fetch, { cookie: cookieHeader });

  const subCategorySlug = params.subCategory;

  let subCategory;
  try {
    subCategory = await adminService.getProductSubCategory(subCategorySlug);
  } catch (err) {
    const statusCode =
      typeof err === 'object' && err !== null && 'statusCode' in err
        ? (err as { statusCode: number }).statusCode
        : undefined;
    if (statusCode === 404) {
      throw error(404, 'Sub-category not found');
    }
    throw error(500, 'Failed to load sub-category');
  }

  const [products] = await Promise.all([
    safeList(() =>
      adminService.listProducts({
        limit: 200,
        category: subCategory.category,
        sub_category: subCategory.name
      })
    )
  ]);

  return {
    subCategory,
    products
  };
};
