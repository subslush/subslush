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
      file: await adminNext.getOrderFile(params.orderId),
      error: '',
    };
  } catch (error) {
    return {
      file: null,
      error: error instanceof Error ? error.message : 'Unable to load order file.',
    };
  }
};
