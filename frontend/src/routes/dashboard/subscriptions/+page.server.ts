import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { API_CONFIG, API_ENDPOINTS } from '$lib/utils/constants';

const DEFAULT_LIMIT = 10;

export const load: PageServerLoad = async ({ url, fetch, parent, cookies }) => {
  const parentData = await parent();
  if (!parentData.user) {
    throw redirect(303, '/auth/login');
  }

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

  let creditBalance: number | null = null;
  try {
    const balanceResponse = await fetch(
      `${API_CONFIG.BASE_URL}${API_ENDPOINTS.CREDITS.BALANCE}/${parentData.user.id}`,
      cookieHeader ? { headers: { cookie: cookieHeader } } : undefined
    );
    if (balanceResponse.ok) {
      const balancePayload = await balanceResponse.json();
      creditBalance =
        balancePayload?.balance ?? balancePayload?.data?.balance ?? null;
    }
  } catch {
    creditBalance = null;
  }

  try {
    const response = await fetch(
      `${API_CONFIG.BASE_URL}${API_ENDPOINTS.SUBSCRIPTIONS.MY_SUBSCRIPTIONS}?${params.toString()}`,
      cookieHeader ? { headers: { cookie: cookieHeader } } : undefined
    );

    if (!response.ok) {
      return {
        subscriptions: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrevious: false,
        },
        filters: { status, page, limit },
        error: 'Failed to load subscriptions.',
        creditBalance,
      };
    }

    const payload = await response.json();
    const data = payload?.data || {};

    return {
      subscriptions: data.subscriptions || [],
      pagination: data.pagination || {
        page,
        limit,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrevious: false,
      },
      filters: { status, page, limit },
      creditBalance,
    };
  } catch {
    return {
      subscriptions: [],
      pagination: {
        page,
        limit,
        total: 0,
        totalPages: 0,
        hasNext: false,
        hasPrevious: false,
      },
      filters: { status, page, limit },
      error: 'Failed to load subscriptions.',
      creditBalance,
    };
  }
};
