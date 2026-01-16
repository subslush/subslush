import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { ProductDetail } from '$lib/types/subscription';
import { unwrapApiData } from '$lib/api/response';
import { API_ENDPOINTS } from '$lib/utils/constants';

export const load: PageLoad = async ({ params, fetch, parent }) => {
  const { slug } = params;

  try {
    const { currency, user } = await parent();
    const headers = currency ? { 'X-Currency': currency } : undefined;

    const response = await fetch(
      `/api/v1${API_ENDPOINTS.SUBSCRIPTIONS.PRODUCT_DETAIL}/${slug}`,
      { headers }
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw error(404, 'Product not found');
      }
      if (response.status === 403) {
        throw error(403, 'Access denied to this product');
      }
      if (response.status >= 500) {
        throw error(500, 'Server error. Please try again later.');
      }
      throw error(response.status, 'Failed to load product details');
    }

    const raw = await response.json();
    const detail = unwrapApiData<ProductDetail>(raw);

    if (!detail?.product) {
      throw error(500, 'Invalid product data received from server');
    }

    let userCredits = 0;
    if (user?.id) {
      try {
        const creditResponse = await fetch(
          `/api/v1${API_ENDPOINTS.CREDITS.BALANCE}/${user.id}`,
          { headers }
        );
        if (creditResponse.ok) {
          const creditRaw = await creditResponse.json();
          const creditData = unwrapApiData<{ balance: number }>(creditRaw);
          userCredits = creditData?.balance ?? 0;
        }
      } catch (creditError) {
        console.warn('Failed to fetch user credits:', creditError);
      }
    }

    return {
      product: detail.product,
      variants: detail.variants || [],
      userCredits
    };
  } catch (err) {
    console.error('Error loading product details:', err);

    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }

    throw error(500, 'Failed to load product details. Please try again.');
  }
};
