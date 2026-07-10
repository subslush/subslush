import type { PageServerLoad } from './$types';
import { createAdminService } from '$lib/api/admin.js';

const VARIANT_PAGE_SIZE = 200;

const listAllVariants = async (
  admin: ReturnType<typeof createAdminService>
) => {
  const variants = [] as Awaited<ReturnType<typeof admin.listVariants>>;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const page = await admin.listVariants({
      limit: VARIANT_PAGE_SIZE,
      offset,
    });
    variants.push(...page);
    hasMore = page.length === VARIANT_PAGE_SIZE;
    offset += page.length;
  }

  return variants;
};

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  const cookieHeader = cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const admin = createAdminService(fetch, { cookie: cookieHeader });
  const [productsResult, variantsResult] = await Promise.allSettled([
    admin.listProducts({ limit: 200 }),
    listAllVariants(admin),
  ]);
  const products =
    productsResult.status === 'fulfilled' ? productsResult.value : [];
  const variants =
    variantsResult.status === 'fulfilled' ? variantsResult.value : [];
  const errors = [productsResult, variantsResult]
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map(result =>
      result.reason instanceof Error ? result.reason.message : 'Unable to load catalog data.'
    );

  if (errors.length === 0 || productsResult.status === 'fulfilled') {
    const variantCounts = variants.reduce<Record<string, number>>((counts, variant) => {
      const productId = variant.product_id || variant.productId;
      if (productId) counts[productId] = (counts[productId] || 0) + 1;
      return counts;
    }, {});
    return {
      products,
      variantCounts,
      error:
        variantsResult.status === 'rejected'
          ? "Couldn't load variant data — retry."
          : '',
    };
  }

  return {
    products: [],
    variantCounts: {},
    error: errors[0] || 'Unable to load products.',
  };
};
