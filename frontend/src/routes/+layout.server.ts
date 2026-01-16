import type { LayoutServerLoad } from './$types';
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
    console.log('🔐 [LAYOUT SERVER] Loading user session...');

    // Get the auth token from cookies
    const authToken = cookies.get('auth_token');

    if (!authToken) {
      console.log('⚠️ [LAYOUT SERVER] No auth token in cookies');
      return { user: null, currency: preferredCurrency };
    }

    console.log('🍪 [LAYOUT SERVER] Auth token found:', authToken.substring(0, 20) + '...');

    // Make request to backend with cookie in header
    // Use the auth profile endpoint which correctly returns user data
    const response = await fetch('http://localhost:3001/api/v1/auth/profile', {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Cookie': `auth_token=${authToken}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('🔐 [LAYOUT SERVER] Session response status:', response.status);

    if (!response.ok) {
      console.warn('⚠️ [LAYOUT SERVER] No active session:', response.status);
      return { user: null, currency: preferredCurrency };
    }

    const data = await response.json();
    console.log('✅ [LAYOUT SERVER] User profile loaded:', data.user?.email);
    console.log('🔍 [LAYOUT SERVER] Full response:', JSON.stringify(data, null, 2));

    return {
      user: data.user || null,
      currency: preferredCurrency
    };
  } catch (error) {
    console.error('❌ [LAYOUT SERVER] Failed to load session:', error);
    return { user: null, currency: preferredCurrency };
  }
};
