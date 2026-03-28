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
  const { productId } = params;

  let detail;
  try {
    detail = await adminService.getProductDetail(productId);
  } catch (err) {
    const statusCode =
      typeof err === 'object' && err !== null && 'statusCode' in err
        ? (err as { statusCode: number }).statusCode
        : undefined;
    if (statusCode === 404) {
      throw error(404, 'Product not found');
    }
    throw error(500, 'Failed to load product');
  }

  const [labels, platformProducts] = await Promise.all([
    safeList(() => adminService.listLabels({ limit: 200 })),
    safeList(() => adminService.listProducts())
  ]);

  let subCategoriesLoadError = false;
  let subCategories = [] as Awaited<
    ReturnType<typeof adminService.listProductSubCategories>
  >;
  try {
    subCategories = await adminService.listProductSubCategories({ limit: 500 });
  } catch {
    subCategoriesLoadError = true;
  }

  return {
    product: detail.product,
    variants: detail.variants,
    assignedLabels: detail.labels,
    media: detail.media,
    priceHistory: detail.priceHistory,
    variantTerms: detail.variantTerms || [],
    labels,
    platformProducts,
    subCategories,
    subCategoriesLoadError
  };
};
