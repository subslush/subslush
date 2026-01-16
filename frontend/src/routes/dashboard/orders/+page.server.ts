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

  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const limit = Math.max(
    1,
    parseInt(url.searchParams.get('limit') || `${DEFAULT_LIMIT}`, 10)
  );
  const offset = (page - 1) * limit;

  const params = new URLSearchParams();
  params.set('limit', `${limit}`);
  params.set('offset', `${offset}`);
  params.set('include_items', 'true');

  const status = url.searchParams.get('status');
  const paymentProvider = url.searchParams.get('payment_provider');
  if (status) params.set('status', status);
  if (paymentProvider) params.set('payment_provider', paymentProvider);

  try {
    const ordersStart = Date.now();
    const response = await fetch(
      `${API_CONFIG.BASE_URL}${API_ENDPOINTS.ORDERS.LIST}?${params.toString()}`,
      cookieHeader ? { headers: { cookie: cookieHeader } } : undefined
    );
    recordTiming('orders_list', ordersStart);

    if (!response.ok) {
      return {
        orders: [],
        pagination: { limit, offset, total: 0, hasMore: false },
        page,
        filters: { status, paymentProvider },
        error: 'Failed to load orders.',
      };
    }

    const payload = await response.json();
    const data = payload?.data || {};

    return {
      orders: data.orders || [],
      pagination: data.pagination || { limit, offset, total: 0, hasMore: false },
      page,
      filters: { status, paymentProvider },
    };
  } catch {
    return {
      orders: [],
      pagination: { limit, offset, total: 0, hasMore: false },
      page,
      filters: { status, paymentProvider },
      error: 'Failed to load orders.',
    };
  }
};
