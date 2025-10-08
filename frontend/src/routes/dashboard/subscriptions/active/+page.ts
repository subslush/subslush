import type { PageLoad } from './$types';
import { subscriptionService } from '$lib/api/subscriptions.js';
import { error } from '@sveltejs/kit';

export const load: PageLoad = async ({ url }) => {
  try {
    // Get query parameters for filtering
    const serviceType = url.searchParams.get('service_type') || undefined;
    const status = url.searchParams.get('status') || 'active';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');

    // Load user's subscriptions
    const subscriptionsResponse = await subscriptionService.getMySubscriptions({
      service_type: serviceType as any,
      status: status as any,
      page,
      limit
    });

    return {
      subscriptions: subscriptionsResponse.subscriptions,
      pagination: subscriptionsResponse.pagination,
      filters: {
        serviceType,
        status,
        page,
        limit
      }
    };
  } catch (err) {
    console.error('Failed to load active subscriptions:', err);
    throw error(500, 'Failed to load your subscriptions. Please try again.');
  }
};