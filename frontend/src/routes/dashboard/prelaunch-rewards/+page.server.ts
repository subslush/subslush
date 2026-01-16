import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { API_CONFIG, API_ENDPOINTS } from '$lib/utils/constants';

export const load: PageServerLoad = async ({ fetch, parent, locals }) => {
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

  try {
    const rewardsStart = Date.now();
    const response = await fetch(
      `${API_CONFIG.BASE_URL}${API_ENDPOINTS.DASHBOARD.PRELAUNCH_REWARDS}`
    );
    recordTiming('prelaunch_rewards', rewardsStart);

    if (!response.ok) {
      return {
        rewards: [],
        vouchers: [],
        raffleEntries: [],
        error: 'Failed to load pre-launch rewards.'
      };
    }

    const payload = await response.json();
    const data = payload?.data || {};

    return {
      rewards: data.rewards || [],
      vouchers: data.vouchers || [],
      raffleEntries: data.raffleEntries || []
    };
  } catch {
    return {
      rewards: [],
      vouchers: [],
      raffleEntries: [],
      error: 'Failed to load pre-launch rewards.'
    };
  }
};
