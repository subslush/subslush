import type { PageLoad } from './$types';
import { createApiClient } from '$lib/api/client';
import { API_ENDPOINTS } from '$lib/utils/constants';
import type { AvailableProductsResponse } from '$lib/types/subscription';
import { unwrapApiData } from '$lib/api/response';

export const load: PageLoad = async ({ fetch, parent }) => {
  try {
    const { currency } = await parent();
    const client = createApiClient(
      fetch,
      currency ? { 'X-Currency': currency } : undefined
    );
    const response = await client.get(API_ENDPOINTS.SUBSCRIPTIONS.PRODUCTS_AVAILABLE);
    const data = unwrapApiData<AvailableProductsResponse>(response);
    const products = Array.isArray(data?.products) ? data.products : [];

    return {
      products,
      totalProducts: data?.total_products ?? products.length,
      userBalance: 0, // Will be populated when user is authenticated
      error: null
    };
  } catch (error) {
    console.error('Error loading subscriptions:', error);
    return {
      products: [],
      totalProducts: 0,
      userBalance: 0,
      error: 'Failed to load subscription plans'
    };
  }
};
