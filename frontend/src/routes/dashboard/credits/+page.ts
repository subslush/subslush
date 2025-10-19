import type { PageLoad } from './$types';
import { subscriptionService } from '$lib/api/subscriptions.js';
import { user } from '$lib/stores/auth.js';
import { get } from 'svelte/store';
import { error } from '@sveltejs/kit';

export const load: PageLoad = async () => {
  try {
    const currentUser = get(user);

    if (!currentUser?.id) {
      throw error(401, 'You must be logged in to view your credits');
    }

    // Load user's credit balance
    const balanceResponse = await subscriptionService.getCreditBalance(currentUser.id);

    return {
      balance: balanceResponse.balance,
      userId: currentUser.id
    };
  } catch (err: any) {
    console.error('Failed to load credit balance:', err);

    if (err.response?.status === 401) {
      throw error(401, 'You must be logged in to view your credits');
    } else if (err.response?.status === 403) {
      throw error(403, 'You do not have access to this credit information');
    } else {
      throw error(500, 'Failed to load credit balance. Please try again.');
    }
  }
};