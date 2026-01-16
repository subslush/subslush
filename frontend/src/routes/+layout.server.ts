import type { LayoutServerLoad } from './$types';
import { API_CONFIG } from '$lib/utils/constants';
import { normalizeCurrencyCode, resolveCurrencyFromHeaders } from '$lib/utils/currency.js';

export const load: LayoutServerLoad = async ({ fetch, cookies, request }) => {
  const cookieCurrency = normalizeCurrencyCode(cookies.get('preferred_currency'));
  const headerCurrency = resolveCurrencyFromHeaders(request.headers);
  const preferredCurrency = cookieCurrency || headerCurrency || 'USD';

  if (!cookieCurrency) {
    cookies.set('preferred_currency', preferredCurrency, {
      path: '/',
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 365
    });
  }

  try {
    const authToken = cookies.get('auth_token');

    if (!authToken) {
      return { user: null, currency: preferredCurrency };
    }

    const cookieHeader = cookies
      .getAll()
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');

    const response = await fetch(`${API_CONFIG.BASE_URL}/auth/profile`, {
      method: 'GET',
      headers: cookieHeader ? { Cookie: cookieHeader } : undefined
    });

    if (!response.ok) {
      return { user: null, currency: preferredCurrency };
    }

    const data = await response.json();

    return {
      user: data.user || null,
      currency: preferredCurrency
    };
  } catch (error) {
    console.error('Layout: failed to load session:', error);
    return { user: null, currency: preferredCurrency };
  }
};
