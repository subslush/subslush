import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { API_CONFIG, API_ENDPOINTS } from '$lib/utils/constants';

export const load: PageServerLoad = async ({
  params,
  fetch,
  parent,
  cookies,
  locals
}) => {
  const parentData = await parent();
  if (!parentData.user) {
    throw redirect(303, '/auth/login');
  }

  const perfEnabled = Boolean(locals.perfEnabled);
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
  const headers = { Cookie: cookieHeader };

  const { subscriptionId } = params;
  let subscription: Record<string, unknown> | null = null;
  let selection: Record<string, unknown> | null = null;
  let selectionLocked = false;
  let error = '';

  try {
    const detailStart = Date.now();
    const response = await fetch(
      `${API_CONFIG.BASE_URL}${API_ENDPOINTS.SUBSCRIPTIONS.DETAILS}/${subscriptionId}`,
      { headers }
    );
    recordTiming('subscription_detail', detailStart);
    if (!response.ok) {
      error = 'Subscription not found.';
    } else {
      const payload = await response.json();
      subscription =
        payload?.data?.subscription ||
        payload?.subscription ||
        payload?.data ||
        null;
    }
  } catch {
    error = 'Failed to load subscription.';
  }

  if (!error) {
    try {
      const selectionStart = Date.now();
      const selectionResponse = await fetch(
        `${API_CONFIG.BASE_URL}${API_ENDPOINTS.SUBSCRIPTIONS.DETAILS}/${subscriptionId}/upgrade-selection`,
        { headers }
      );
      recordTiming('subscription_selection', selectionStart);
      if (selectionResponse.ok) {
        const payload = await selectionResponse.json();
        const data = payload?.data || payload || {};
        selection = data.selection || null;
        selectionLocked = Boolean(data.locked);
      }
    } catch {
      selection = null;
      selectionLocked = false;
    }
  }

  return {
    subscription,
    selection,
    selectionLocked,
    error
  };
};
