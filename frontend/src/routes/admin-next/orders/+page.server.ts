import type { PageServerLoad } from './$types';
import { createAdminNextService } from '$lib/api/adminNext.js';

export const load: PageServerLoad = async ({ fetch, cookies, url }) => {
  const cookieHeader = cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const adminNext = createAdminNextService(fetch, { cookie: cookieHeader });

  const params = {
    search: url.searchParams.get('search') || undefined,
    status: url.searchParams.get('status') || undefined,
    provider: url.searchParams.get('provider') || undefined,
    date_from: url.searchParams.get('date_from') || undefined,
    date_to: url.searchParams.get('date_to') || undefined,
  };

  try {
    return {
      ...(await adminNext.listNextOrders(params)),
      filters: params,
      error: '',
    };
  } catch (error) {
    return {
      orders: [],
      filters: params,
      error: error instanceof Error ? error.message : 'Unable to load orders.',
    };
  }
};
