import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { API_CONFIG, API_ENDPOINTS } from '$lib/utils/constants';

const DEFAULT_LIMIT = 10;

export const load: PageServerLoad = async ({ url, fetch, parent, cookies, locals }) => {
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

  const status = url.searchParams.get('status') || 'all';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.max(
    1,
    parseInt(url.searchParams.get('limit') || `${DEFAULT_LIMIT}`, 10)
  );

  const params = new URLSearchParams();
  params.set('page', `${page}`);
  params.set('limit', `${limit}`);
  if (status !== 'all') {
    params.set('status', status);
  } else {
    params.set('include_expired', 'true');
  }

  const paginationFallback = {
    page,
    limit,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrevious: false,
  };
  const filters = { status, page, limit };

  const creditBalancePromise = (async () => {
    const balanceStart = Date.now();
    try {
      const balanceResponse = await fetch(
        `${API_CONFIG.BASE_URL}${API_ENDPOINTS.CREDITS.BALANCE}/${parentData.user.id}`,
        cookieHeader ? { headers: { cookie: cookieHeader } } : undefined
      );
      recordTiming('credits_balance', balanceStart);
      if (!balanceResponse.ok) return null;
      const balancePayload = await balanceResponse.json();
      return balancePayload?.balance ?? balancePayload?.data?.balance ?? null;
    } catch {
      recordTiming('credits_balance', balanceStart, 'failed');
      return null;
    }
  })();

  const subscriptionsPromise = (async () => {
    const subscriptionsStart = Date.now();
    try {
      const response = await fetch(
        `${API_CONFIG.BASE_URL}${API_ENDPOINTS.SUBSCRIPTIONS.MY_SUBSCRIPTIONS}?${params.toString()}`,
        cookieHeader ? { headers: { cookie: cookieHeader } } : undefined
      );
      recordTiming('subscriptions_list', subscriptionsStart);

      if (!response.ok) {
        return {
          subscriptions: [],
          pagination: paginationFallback,
          error: 'Failed to load subscriptions.',
        };
      }

      const payload = await response.json();
      const data = payload?.data || {};

      return {
        subscriptions: data.subscriptions || [],
        pagination: data.pagination || paginationFallback,
      };
    } catch {
      recordTiming('subscriptions_list', subscriptionsStart, 'failed');
      return {
        subscriptions: [],
        pagination: paginationFallback,
        error: 'Failed to load subscriptions.',
      };
    }
  })();

  const [creditBalance, subscriptionsResult] = await Promise.all([
    creditBalancePromise,
    subscriptionsPromise,
  ]);

  return {
    ...subscriptionsResult,
    filters,
    creditBalance,
  };
};
