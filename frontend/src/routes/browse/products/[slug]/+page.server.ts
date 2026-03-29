import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { ProductDetail } from '$lib/types/subscription';
import { unwrapApiData } from '$lib/api/response';
import { API_ENDPOINTS } from '$lib/utils/constants';
import { resolveCountryFromHeaders } from '$lib/utils/currency.js';

export const load: PageServerLoad = async ({
  params,
  fetch,
  parent,
  request,
}) => {
  const { slug } = params;

  try {
    const { currency, user } = await parent();
    const requestCountryCode = resolveCountryFromHeaders(request.headers);
    const requestHeaders: Record<string, string> = {};
    if (currency) {
      requestHeaders['X-Currency'] = currency;
    }
    if (requestCountryCode) {
      requestHeaders['X-Country-Code'] = requestCountryCode;
    }
    const headers =
      Object.keys(requestHeaders).length > 0 ? requestHeaders : undefined;

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

    const usersOnPage =
      typeof detail.users_on_page === 'number'
        ? detail.users_on_page
        : typeof detail.usersOnPage === 'number'
          ? detail.usersOnPage
          : 12;
    const unitsLeft =
      typeof detail.units_left === 'number'
        ? detail.units_left
        : typeof detail.unitsLeft === 'number'
          ? detail.unitsLeft
          : 6;

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
      userCredits,
      requestCountryCode: requestCountryCode || null,
      usersOnPage,
      unitsLeft
    };
  } catch (err) {
    console.error('Error loading product details:', err);

    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }

    throw error(500, 'Failed to load product details. Please try again.');
  }
};
