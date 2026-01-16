import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { API_CONFIG, API_ENDPOINTS } from '$lib/utils/constants';

const emptyOverview = {
  counts: { active_subscriptions: 0, upcoming_renewals: 0 },
  credits: { available_balance: 0, pending_balance: 0, currency: 'USD' },
  alerts: [],
  upcoming_renewals: [],
  recent_orders: [],
};

export const load: PageServerLoad = async ({ fetch, parent, cookies, locals, url }) => {
  const parentData = await parent();
  if (!parentData.user) {
    throw redirect(303, '/auth/login');
  }

  const perfEnabled = url.searchParams.has('perf');
  const recordTiming = (name: string, start: number, desc?: string) => {
    if (!perfEnabled) return;
    locals.serverTimings?.push({
      name,
      dur: Date.now() - start,
      desc
    });
  };

  const cookieHeader = cookies
    .getAll()
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join('; ');

  try {
    const overviewStart = Date.now();
    const response = await fetch(
      `${API_CONFIG.BASE_URL}${API_ENDPOINTS.DASHBOARD.OVERVIEW}`,
      cookieHeader ? { headers: { cookie: cookieHeader } } : undefined
    );
    recordTiming('dashboard_overview', overviewStart);

    if (!response.ok) {
      return { overview: emptyOverview };
    }

    const payload = await response.json();
    return {
      overview: payload?.data ?? emptyOverview,
    };
  } catch {
    return { overview: emptyOverview };
  }
};
