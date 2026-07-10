import type { PageServerLoad } from './$types';
import { createAdminNextService } from '$lib/api/adminNext.js';

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  const cookieHeader = cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const adminNext = createAdminNextService(fetch, { cookie: cookieHeader });
  try {
    return {
      ...(await adminNext.getAnnouncements()),
      error: '',
    };
  } catch (error) {
    return {
      announcements: [],
      error: error instanceof Error ? error.message : 'Unable to load announcements.',
    };
  }
};
