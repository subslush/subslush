import type { PageLoad } from './$types';
import { createApiClient } from '$lib/api/client';
import { API_ENDPOINTS } from '$lib/utils/constants';
import { unwrapApiData } from '$lib/api/response';
import type { AvailableProductsResponse } from '$lib/types/subscription';
import { browser } from '$app/environment';
import { getCurrencyCookie, normalizeCurrencyCode } from '$lib/utils/currency';

export const load: PageLoad = async ({ fetch, parent }) => {
  try {
    const { currency } = await parent();
    const serverCurrency = normalizeCurrencyCode(currency);
    const clientCookieCurrency = browser
      ? normalizeCurrencyCode(getCurrencyCookie(document.cookie))
      : null;
    const preferredCurrency = clientCookieCurrency || serverCurrency;
    const client = createApiClient(
      fetch,
      preferredCurrency ? { 'X-Currency': preferredCurrency } : undefined
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
