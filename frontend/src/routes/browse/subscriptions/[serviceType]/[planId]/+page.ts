import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { SubscriptionDetail } from '$lib/types/subscription';
import { subscriptionService } from '$lib/api/subscriptions.js';
import { get } from 'svelte/store';
import { user } from '$lib/stores/auth.js';

export const load: PageLoad = async ({ params, fetch }) => {
  const { serviceType, planId } = params;

  try {
    // Use the dedicated backend endpoint
    const subscriptionResponse = await fetch(
      `/api/v1/subscriptions/${serviceType}/${planId}`
    );

    if (!subscriptionResponse.ok) {
      if (subscriptionResponse.status === 404) {
        throw error(404, 'Subscription plan not found');
      } else if (subscriptionResponse.status === 403) {
        throw error(403, 'Access denied to this subscription');
      } else if (subscriptionResponse.status >= 500) {
        throw error(500, 'Server error. Please try again later.');
      }
      throw error(subscriptionResponse.status, 'Failed to load subscription details');
    }

    const data = await subscriptionResponse.json();
    const subscription: SubscriptionDetail = data.subscriptionDetail;

    // Fetch user credit balance if user is authenticated
    let userCredits = 0;
    const currentUser = get(user);
    if (currentUser?.id) {
      try {
        const creditBalance = await subscriptionService.getCreditBalance(currentUser.id);
        userCredits = creditBalance.balance;
      } catch (creditError) {
        console.warn('Failed to fetch user credits:', creditError);
        // Graceful degradation to 0 if credits fetch fails
      }
    }

    return {
      subscription,
      relatedPlans: subscription.relatedPlans || [],
      userCredits
    };

  } catch (err) {
    console.error('Error loading subscription details:', err);

    // Re-throw SvelteKit errors
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }

    // Handle network errors
    throw error(500, 'Failed to load subscription details. Please check your connection and try again.');
  }
};

