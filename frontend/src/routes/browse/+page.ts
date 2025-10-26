import type { PageLoad } from './$types';
import { API_CONFIG } from '$lib/utils/constants';

export const load: PageLoad = async ({ fetch }) => {
  try {
    const response = await fetch(`${API_CONFIG.BASE_URL}/subscriptions`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    return {
      plans: data.plans || [],
      totalPlans: data.totalPlans || 0,
      userBalance: 0, // Will be populated when user is authenticated
      error: null
    };
  } catch (error) {
    console.error('Error loading subscriptions:', error);
    return {
      plans: [],
      totalPlans: 0,
      userBalance: 0,
      error: 'Failed to load subscription plans'
    };
  }
};