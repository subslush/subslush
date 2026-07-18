import type { PageServerLoad } from './$types';
import { createAdminNextService } from '$lib/api/adminNext.js';
import { createAdminService } from '$lib/api/admin.js';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  const cookieHeader = cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const admin = createAdminService(fetch, { cookie: cookieHeader });
  const adminNext = createAdminNextService(fetch, { cookie: cookieHeader });
  const results = await Promise.allSettled([
    // Load the complete bounded set once; the page keeps expired coupons
    // hidden until the administrator explicitly enables the local toggle.
    admin.listCoupons({ limit: 200, include_expired: true }),
    admin.listProducts({ limit: 200 }),
    adminNext.getNewsletterCoupons(),
  ]);
  const newsletterFallback = {
    stats: { issued: 0, redeemed: 0, conversion_percent: 0 },
    coupons: [],
  };

  return {
    coupons: results[0]?.status === 'fulfilled' ? results[0].value : [],
    products: results[1]?.status === 'fulfilled' ? results[1].value : [],
    newsletter:
      results[2]?.status === 'fulfilled'
        ? results[2].value
        : newsletterFallback,
    error: results.some(result => result.status === 'rejected')
      ? "Some coupon data couldn't load — retry."
      : '',
  };
};
