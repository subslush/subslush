import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { API_CONFIG, ERROR_MESSAGES } from '$lib/utils/constants.js';
import { normalizeCurrencyCode } from '$lib/utils/currency.js';
import type { ApiError } from '$lib/types/api.js';

type QueryParams = Record<string, string | number | boolean | null | undefined>;

interface RequestConfig<TBody = unknown> {
  method?: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  data?: TBody;
  params?: QueryParams;
  headers?: Record<string, string>;
}

interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const extractErrorDetails = (value: unknown): Partial<ApiError> => {
  if (!isRecord(value)) {
    return {};
  }
  return {
    message: typeof value.message === 'string' ? value.message : undefined,
    error: typeof value.error === 'string' ? value.error : undefined,
    code: typeof value.code === 'string' ? value.code : undefined,
    details: value.details
  };
};

const isApiError = (value: unknown): value is ApiError =>
  isRecord(value) &&
  typeof value.statusCode === 'number' &&
  typeof value.message === 'string';

const AUTH_REDIRECT_CODES = new Set([
  'AUTH_REQUIRED',
  'MISSING_TOKEN',
  'INVALID_TOKEN',
  'INVALID_PAYLOAD',
  'SESSION_EXPIRED',
]);

const resolveAuthRedirectReason = (apiError: ApiError): string | null => {
  if (apiError.code === 'SESSION_EXPIRED') {
    return 'session-expired';
  }
  if (apiError.code === 'INVALID_TOKEN') {
    const message = apiError.message?.toLowerCase() || '';
    if (message.includes('expired')) {
      return 'session-expired';
    }
  }
  return null;
};

const buildAuthRedirectUrl = (reason: string | null): string => {
  if (!browser) {
    return '/auth/login';
  }

  const params = new URLSearchParams();
  if (reason) {
    params.set('reason', reason);
  }

  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (!currentPath.startsWith('/auth/')) {
    params.set('redirect', currentPath);
  }

  const queryString = params.toString();
  return queryString ? `/auth/login?${queryString}` : '/auth/login';
};

const resolveClientCurrency = (): string | null => {
  if (!browser) return null;

  let stored: string | null = null;
  try {
    stored = localStorage.getItem('preferred_currency');
  } catch {
    stored = null;
  }

  const storedCurrency = normalizeCurrencyCode(stored);
  if (storedCurrency) return storedCurrency;

  const match = document.cookie.match(/(?:^|; )preferred_currency=([^;]+)/);
  const cookieValue = match ? decodeURIComponent(match[1]) : null;
  return normalizeCurrencyCode(cookieValue);
};

class ApiClient {
  private baseURL: string;
  private fetchFn: typeof fetch;
  private defaultHeaders: Record<string, string>;

  constructor(customFetch?: typeof fetch, defaultHeaders: Record<string, string> = {}) {
    // Use custom fetch if provided (from SvelteKit load), otherwise use global
    this.fetchFn = customFetch || fetch;
    this.defaultHeaders = defaultHeaders;

    // Detect SSR context
    const isSSR = typeof window === 'undefined';

    if (isSSR) {
      // During SSR, use absolute URL to backend
      this.baseURL = 'http://localhost:3001/api/v1';
      console.log('🌐 [API CLIENT] SSR mode - using absolute URL:', this.baseURL);
    } else {
      // In browser, use relative URL (works with proxy)
      this.baseURL = API_CONFIG.BASE_URL;
      console.log('🌐 [API CLIENT] Browser mode - using relative URL:', this.baseURL);
    }
  }

  private buildURL(url: string, params?: QueryParams): string {
    const fullUrl = `${this.baseURL}${url}`;

    if (!params) return fullUrl;

    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    });

    const queryString = searchParams.toString();
    return queryString ? `${fullUrl}?${queryString}` : fullUrl;
  }

  private getCsrfToken(): string | undefined {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const match = document.cookie.match(/(?:^|; )csrf_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : undefined;
  }

  private getCsrfTokenFromHeaders(headers: Record<string, string>): string | undefined {
    const cookieHeader = headers.Cookie || headers.cookie;
    if (!cookieHeader) {
      return undefined;
    }
    const match = cookieHeader.match(/(?:^|; )csrf_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : undefined;
  }

  private async request<T>(config: RequestConfig): Promise<ApiResponse<T>> {
    const url = this.buildURL(config.url, config.params);
    const method = config.method || 'GET';
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...config.headers,
    };

    if (config.data !== undefined && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    if (browser && !('X-Currency' in headers) && !('x-currency' in headers)) {
      const preferredCurrency = resolveClientCurrency();
      if (preferredCurrency) {
        headers['X-Currency'] = preferredCurrency;
      }
    }

    if (method !== 'GET' && method !== 'HEAD') {
      const csrfToken = this.getCsrfToken();
      if (csrfToken && !headers['X-CSRF-Token']) {
        headers['X-CSRF-Token'] = csrfToken;
      }
      if (!headers['X-CSRF-Token']) {
        const headerToken = this.getCsrfTokenFromHeaders(headers);
        if (headerToken) {
          headers['X-CSRF-Token'] = headerToken;
        }
      }
    }

    console.log('🌐 [API CLIENT] Request:', {
      method,
      url,
      isSSR: typeof window === 'undefined'
    });

    try {
      const response = await this.fetchFn(url, {
        method,
        headers,
        body: config.data ? JSON.stringify(config.data) : undefined,
        credentials: 'include', // Important: include cookies for auth
      });

      let data: unknown;
      const contentType = response.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        // Handle HTTP errors
        const extracted = extractErrorDetails(data);
        const apiError: ApiError = {
          message: extracted.message || response.statusText,
          error: extracted.error || 'HTTP_ERROR',
          code: extracted.code,
          details: extracted.details,
          statusCode: response.status
        };

        // Handle 401 errors (unauthorized)
        if (response.status === 401 && browser) {
          const isAuthEndpoint =
            url.includes('/auth/login') || url.includes('/auth/register');
          const shouldRedirect =
            !isAuthEndpoint &&
            (!apiError.code || AUTH_REDIRECT_CODES.has(apiError.code));
          if (shouldRedirect) {
            const reason = resolveAuthRedirectReason(apiError);
            const loginUrl = buildAuthRedirectUrl(reason);
            console.warn('🌐 [API CLIENT] Auth redirect to login', {
              reason: reason || 'auth-required',
            });
            goto(loginUrl, { replaceState: true });
          }
        }

        const requestError = new Error(apiError.message);
        Object.assign(requestError, apiError);
        throw requestError;
      }

      console.log('🌐 [API CLIENT] Response success:', { status: response.status, url });

      return {
        data: data as T,
        status: response.status,
        statusText: response.statusText,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorCode =
        isRecord(error) && typeof error.code === 'string'
          ? error.code
          : 'NETWORK_ERROR';

      console.error('🌐 [API CLIENT] Request failed:', {
        url,
        error: errorMessage,
        code: errorCode
      });

      if (isApiError(error)) {
        if (error instanceof Error) {
          throw error;
        }
        const wrappedError = new Error(error.message);
        Object.assign(wrappedError, error);
        throw wrappedError;
      }

      // Network or other errors
      const apiError: ApiError = {
        message:
          error instanceof Error && error.name === 'TypeError'
            ? ERROR_MESSAGES.NETWORK_ERROR
            : ERROR_MESSAGES.GENERIC_ERROR,
        error: errorCode,
        statusCode: 0
      };

      const networkError = new Error(apiError.message);
      Object.assign(networkError, apiError);
      throw networkError;
    }
  }

  // HTTP methods
  async get<T = unknown>(
    url: string,
    config?: { params?: QueryParams }
  ): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'GET',
      url,
      params: config?.params,
    });
  }

  async post<T = unknown>(
    url: string,
    data?: unknown,
    config?: { params?: QueryParams }
  ): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'POST',
      url,
      data,
      params: config?.params,
    });
  }

  async put<T = unknown>(
    url: string,
    data?: unknown,
    config?: { params?: QueryParams }
  ): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'PUT',
      url,
      data,
      params: config?.params,
    });
  }

  async patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: { params?: QueryParams }
  ): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'PATCH',
      url,
      data,
      params: config?.params,
    });
  }

  async delete<T = unknown>(
    url: string,
    config?: { params?: QueryParams; data?: unknown }
  ): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'DELETE',
      url,
      params: config?.params,
      data: config?.data,
    });
  }
}

// Export factory function that accepts custom fetch for SSR
export const createApiClient = (
  customFetch?: typeof fetch,
  defaultHeaders?: Record<string, string>
) => {
  return new ApiClient(customFetch, defaultHeaders);
};

// Default client for browser usage
export const apiClient = createApiClient();
