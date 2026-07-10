import type { PageServerLoad } from './$types';
import { createAdminNextService } from '$lib/api/adminNext.js';

export const load: PageServerLoad = async ({ fetch, cookies, url }) => {
  const cookieHeader = cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const adminNext = createAdminNextService(fetch, { cookie: cookieHeader });
  const search = url.searchParams.get('search') || '';
  try {
    return {
      users: search ? (await adminNext.searchSlimUsers({ search })).users : [],
      search,
      error: '',
    };
  } catch (error) {
    return {
      users: [],
      search,
      error: error instanceof Error ? error.message : 'Unable to search users.',
    };
  }
};
