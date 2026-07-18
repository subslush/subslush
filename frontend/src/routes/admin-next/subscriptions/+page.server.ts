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
  };
  try {
    return {
      ...(await adminNext.listNextSubscriptions(params)),
      selectedId: url.searchParams.get('subscription') || '',
      filters: params,
      error: '',
    };
  } catch (error) {
    return {
      subscriptions: [],
      selectedId: '',
      filters: params,
      error: error instanceof Error ? error.message : 'Unable to load subscriptions.',
    };
  }
};
