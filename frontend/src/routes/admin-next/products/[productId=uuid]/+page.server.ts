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
    labels: detail.labels,
    media: detail.media,
    fixedPriceHistory: detail.fixedPriceHistory || [],
    legacyCompatibility: detail.legacyCompatibility || {
      variant_count: 0,
      active_variant_count: 0,
      term_count: 0,
      price_history_count: 0,
      subscription_count: 0,
      order_item_count: 0,
      payment_count: 0,
      credit_transaction_count: 0,
      fixed_catalog_preferred: false,
    },
    allLabels: await safe(() => admin.listLabels({ limit: 200 }), []),
    subCategories: await safe(() => admin.listProductSubCategories({ limit: 500 }), []),
  };
};
