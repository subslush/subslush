import type { PageServerLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';
import type { CreditBalance, CreditHistoryResponse } from '$lib/types/credits.js';
import { createApiClient } from '$lib/api/client.js';
import { API_ENDPOINTS } from '$lib/utils/constants.js';
import { unwrapApiData } from '$lib/api/response.js';

export const load: PageServerLoad = async ({ parent, fetch, cookies, locals }) => {
  try {
    const parentData = await parent();
    const user = parentData.user || locals.user;

    if (!user?.id) {
      throw redirect(303, '/auth/login');
    }

    const cookieHeader = cookies
      .getAll()
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');

    const api = createApiClient(fetch, {
      Cookie: cookieHeader,
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache'
    });

    const [balanceResponse, historyResponse] = await Promise.all([
      api.get(`${API_ENDPOINTS.CREDITS.BALANCE}/${user.id}`),
      api.get(`${API_ENDPOINTS.CREDITS.HISTORY}/${user.id}`, {
        params: { limit: 10, offset: 0 }
      })
    ]);

    const balance = unwrapApiData<CreditBalance>(balanceResponse);
    const history = unwrapApiData<CreditHistoryResponse>(historyResponse);

    return {
      balance,
      transactions: history.transactions || []
    };
  } catch (err) {
    console.error('Failed to load credits data:', err);

    const statusCode =
      typeof err === 'object' && err !== null && 'statusCode' in err
        ? (err as { statusCode: number }).statusCode
        : typeof err === 'object' && err !== null && 'status' in err
          ? (err as { status: number }).status
          : undefined;

    if (statusCode === 401) {
      throw redirect(303, '/auth/login');
    }

    throw error(500, 'Failed to load credit data. Please try again.');
  }
};
