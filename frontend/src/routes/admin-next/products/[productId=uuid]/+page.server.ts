import type { PageServerLoad } from './$types';
import { createAdminService } from '$lib/api/admin.js';

const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await fn();
  } catch {
    return fallback;
  }
};

export const load: PageServerLoad = async ({ fetch, cookies, params }) => {
  const cookieHeader = cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const admin = createAdminService(fetch, { cookie: cookieHeader });
  const detail = await admin.getProductDetail(params.productId);
  return {
    product: detail.product,
    variants: detail.variants,
    labels: detail.labels,
    media: detail.media,
    priceHistory: detail.priceHistory || [],
    variantTerms: detail.variantTerms || [],
    allLabels: await safe(() => admin.listLabels({ limit: 200 }), []),
    subCategories: await safe(() => admin.listProductSubCategories({ limit: 500 }), []),
  };
};
