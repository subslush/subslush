import type { LayoutServerLoad } from './$types';
import { API_CONFIG } from '$lib/utils/constants';
import { unwrapApiData } from '$lib/api/response';
import {
  normalizeCurrencyCode,
  resolveCurrencyFromHeaders,
} from '$lib/utils/currency.js';

const normalizeClientIp = (value?: string | null): string | null => {
  if (!value) return null;
  const first = value.split(',')[0]?.trim();
  return first || null;
};

const resolveClientIpFromRequest = (request: Request): string | null => {
  const headers = request.headers;
  return (
    normalizeClientIp(headers.get('cf-connecting-ip')) ||
    normalizeClientIp(headers.get('x-real-ip')) ||
    normalizeClientIp(headers.get('x-forwarded-for')) ||
    normalizeClientIp(headers.get('x-vercel-forwarded-for')) ||
    normalizeClientIp(headers.get('true-client-ip'))
  );
};

export const load: LayoutServerLoad = async ({ fetch, cookies, request }) => {
  const cookieCurrency = normalizeCurrencyCode(cookies.get('preferred_currency'));
  let preferredCurrency = cookieCurrency;

  if (!preferredCurrency) {
    const clientIp = resolveClientIpFromRequest(request);
    const localeHeaders: Record<string, string> = {};
    if (clientIp) {
      localeHeaders['X-Client-IP'] = clientIp;
    }

    try {
      const localeResponse = await fetch(`${API_CONFIG.BASE_URL}/locale`, {
        method: 'GET',
        headers:
          Object.keys(localeHeaders).length > 0 ? localeHeaders : undefined
      });

      if (localeResponse.ok) {
        const rawLocale = await localeResponse.json();
        const localeData = unwrapApiData<{ currency?: string }>(rawLocale);
        preferredCurrency = normalizeCurrencyCode(localeData?.currency || null);
      }
    } catch (error) {
      console.warn('Layout: failed to resolve locale via API:', error);
    }
  }

  if (!preferredCurrency) {
    const headerCurrency = resolveCurrencyFromHeaders(request.headers);
    preferredCurrency = headerCurrency || 'USD';
  }

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
