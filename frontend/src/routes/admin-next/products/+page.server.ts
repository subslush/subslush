import type { PageServerLoad } from './$types';
import { createAdminService } from '$lib/api/admin.js';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  const cookieHeader = cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const admin = createAdminService(fetch, { cookie: cookieHeader });
  const [productsResult] = await Promise.allSettled([
    admin.listProducts({ limit: 200 }),
  ]);
  const products =
    productsResult.status === 'fulfilled' ? productsResult.value : [];
  const errors = [productsResult]
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map(result =>
      result.reason instanceof Error ? result.reason.message : 'Unable to load catalog data.'
    );

  if (errors.length === 0 || productsResult.status === 'fulfilled') {
    return {
      products,
      error: '',
    };
  }

  return {
    products: [],
    error: errors[0] || 'Unable to load products.',
  };
};
