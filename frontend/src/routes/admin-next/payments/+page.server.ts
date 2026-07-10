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
    provider: url.searchParams.get('provider') || undefined,
    status: url.searchParams.get('status') || undefined,
  };
  try {
    return {
      ...(await adminNext.listNextPayments(params)),
      selectedPayment: url.searchParams.get('payment') || '',
      filters: params,
      error: '',
    };
  } catch (error) {
    return {
      payments: [],
      selectedPayment: '',
      filters: params,
      error: error instanceof Error ? error.message : 'Unable to load payments.',
    };
  }
};
