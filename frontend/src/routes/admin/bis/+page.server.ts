import type { PageServerLoad } from './$types';
import { createAdminService } from '$lib/api/admin.js';
import type { AdminBisInquiryStatus } from '$lib/types/admin.js';

const TAB_STATUSES: Record<string, AdminBisInquiryStatus> = {
  active: 'active',
  issue: 'issue',
  cancelled: 'cancelled',
  solved: 'solved',
};

export const load: PageServerLoad = async ({ fetch, cookies, url }) => {
  const cookieHeader = cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');
  const adminService = createAdminService(fetch, { cookie: cookieHeader });

  const requestedTab = url.searchParams.get('tab') || 'active';
  const status = TAB_STATUSES[requestedTab] || 'active';
  const tab = TAB_STATUSES[requestedTab] ? requestedTab : 'active';

  try {
    const { inquiries, pagination } = await adminService.listBisInquiries({
      status,
      limit: 100,
    });

    return {
      inquiries,
      pagination,
      initialTab: tab,
      initialStatus: status,
    };
  } catch {
    return {
      inquiries: [],
      pagination: { limit: 100, offset: 0, total: 0, hasMore: false },
      initialTab: tab,
      initialStatus: status,
    };
  }
};
