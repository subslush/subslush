import type { PageLoad } from './$types';
import { subscriptionService } from '$lib/api/subscriptions.js';
import { error } from '@sveltejs/kit';

export const load: PageLoad = async ({ params }) => {
  try {
    const { subscriptionId } = params;

    if (!subscriptionId) {
      throw error(400, 'Subscription ID is required');
    }

    // Load the specific subscription details
    const subscriptionResponse = await subscriptionService.getSubscriptionById(subscriptionId);

    return {
      subscription: subscriptionResponse.subscription
    };
  } catch (err: any) {
    console.error('Failed to load subscription details:', err);

    if (err.response?.status === 404) {
      throw error(404, 'Subscription not found');
    } else if (err.response?.status === 403) {
      throw error(403, 'You do not have access to this subscription');
    } else {
      throw error(500, 'Failed to load subscription details. Please try again.');
    }
  }
};