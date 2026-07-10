import type { PageServerLoad } from './$types';
import { createAdminNextService } from '$lib/api/adminNext.js';

export const load: PageServerLoad = async ({ params, fetch, cookies }) => {
  const cookieHeader = cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const adminNext = createAdminNextService(fetch, { cookie: cookieHeader });

  try {
    return {
      aggregate: await adminNext.getOrder(params.orderId),
      error: '',
    };
  } catch (error) {
    return {
      aggregate: null,
      error: error instanceof Error ? error.message : 'Unable to load fulfillment detail.',
    };
  }
};
