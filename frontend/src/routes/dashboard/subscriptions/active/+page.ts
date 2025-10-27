import type { PageLoad } from './$types';
import { subscriptionService } from '$lib/api/subscriptions.js';
import { error } from '@sveltejs/kit';
import { browser } from '$app/environment';

export const load: PageLoad = async ({ url, parent }) => {
  try {
    // Wait for parent data to ensure authentication
    const parentData = await parent();

    // Get query parameters for filtering
    const serviceType = url.searchParams.get('service_type') || undefined;
    const status = url.searchParams.get('status') || 'active';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');

    // If running on server during SSR, return minimal data for hydration
    if (!browser) {
      console.log('🌐 [ACTIVE SUBSCRIPTIONS] SSR mode - returning minimal data for hydration');
      return {
        subscriptions: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalItems: 0,
          hasNext: false,
          hasPrev: false
        },
        filters: {
          serviceType,
          status,
          page,
          limit
        },
        user: parentData.user || null,
        ssrMode: true
      };
    }

    // Client-side data fetching
    if (!parentData.user) {
      console.error('❌ [ACTIVE SUBSCRIPTIONS] No authenticated user');
      throw error(401, 'Authentication required');
    }

    console.log('📦 [ACTIVE SUBSCRIPTIONS] Loading subscriptions for user:', parentData.user.email);

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
      },
      user: parentData.user,
      ssrMode: false
    };
  } catch (err: any) {
    console.error('❌ [ACTIVE SUBSCRIPTIONS] Failed to load subscriptions:', err);
    console.error('❌ [ACTIVE SUBSCRIPTIONS] Error details:', {
      message: err.message,
      statusCode: err.statusCode,
      error: err.error
    });

    // Get query parameters for the error response
    const serviceType = url.searchParams.get('service_type') || undefined;
    const status = url.searchParams.get('status') || 'active';
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');

    // On client-side or SSR, gracefully return empty data instead of throwing 500
    const errorResponse = {
      subscriptions: [],
      pagination: {
        currentPage: page,
        totalPages: 0,
        totalItems: 0,
        hasNext: false,
        hasPrev: false
      },
      filters: {
        serviceType,
        status,
        page,
        limit
      },
      user: null,
      ssrMode: !browser,
      error: 'Failed to load your subscriptions. Please try again.'
    };

    if (browser) {
      console.warn('⚠️ [ACTIVE SUBSCRIPTIONS] Client-side error - returning empty data');
    } else {
      console.warn('⚠️ [ACTIVE SUBSCRIPTIONS] SSR error - returning empty data');
    }

    return errorResponse;
  }
};