import type { PageLoad } from './$types';
import { createApiClient } from '$lib/api/client';
import { API_ENDPOINTS } from '$lib/utils/constants';
import { unwrapApiData } from '$lib/api/response';
import type { AvailableProductsResponse } from '$lib/types/subscription';

export const load: PageLoad = async ({ fetch, parent }) => {
  try {
    const { currency } = await parent();
    const client = createApiClient(
      fetch,
      currency ? { 'X-Currency': currency } : undefined
    );
    const response = await client.get(API_ENDPOINTS.SUBSCRIPTIONS.PRODUCTS_AVAILABLE);
    const productsResponse = unwrapApiData<AvailableProductsResponse>(response);
    const products = Array.isArray(productsResponse?.products)
      ? productsResponse.products
      : [];

    return {
      products,
      totalProducts: products.length
    };
  } catch (error) {
    console.error('Failed to load home page data:', error);
    return {
      products: [],
      totalProducts: 0,
      error: 'Failed to load subscriptions'
    };
  }
};
