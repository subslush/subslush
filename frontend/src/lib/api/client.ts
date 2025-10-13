import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { API_CONFIG, ERROR_MESSAGES } from '$lib/utils/constants.js';
import type { ApiError } from '$lib/types/api.js';

interface RequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  data?: any;
  params?: Record<string, any>;
  headers?: Record<string, string>;
}

interface ApiResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
}

class ApiClient {
  private baseURL: string;
  private fetchFn: typeof fetch;

  constructor(customFetch?: typeof fetch) {
    // Use custom fetch if provided (from SvelteKit load), otherwise use global
    this.fetchFn = customFetch || fetch;

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

  private buildURL(url: string, params?: Record<string, any>): string {
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

  private async request<T>(config: RequestConfig): Promise<ApiResponse<T>> {
    const url = this.buildURL(config.url, config.params);

    console.log('🌐 [API CLIENT] Request:', {
      method: config.method || 'GET',
      url,
      isSSR: typeof window === 'undefined'
    });

    try {
      const response = await this.fetchFn(url, {
        method: config.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: config.data ? JSON.stringify(config.data) : undefined,
        credentials: 'include', // Important: include cookies for auth
      });

      let data: T;
      const contentType = response.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text() as unknown as T;
      }

      if (!response.ok) {
        // Handle HTTP errors
        const apiError: ApiError = {
          message: data ? (data as any).message || response.statusText : response.statusText,
          error: data ? (data as any).error || 'HTTP_ERROR' : 'HTTP_ERROR',
          statusCode: response.status
        };

        // Handle 401 errors (unauthorized)
        if (response.status === 401 && browser) {
          // Don't redirect if this is an auth endpoint
          if (!url.includes('/auth/login') && !url.includes('/auth/register')) {
            console.warn('🌐 [API CLIENT] Session expired, redirecting to login');
            goto('/auth/login');
          }
        }

        throw apiError;
      }

      console.log('🌐 [API CLIENT] Response success:', { status: response.status, url });

      return {
        data,
        status: response.status,
        statusText: response.statusText,
      };
    } catch (error: any) {
      console.error('🌐 [API CLIENT] Request failed:', {
        url,
        error: error.message,
        code: error.code
      });

      if (error.statusCode) {
        // Already an ApiError
        throw error;
      }

      // Network or other errors
      const apiError: ApiError = {
        message: error.name === 'TypeError' ? ERROR_MESSAGES.NETWORK_ERROR : ERROR_MESSAGES.GENERIC_ERROR,
        error: error.code || 'NETWORK_ERROR',
        statusCode: 0
      };

      throw apiError;
    }
  }

  // HTTP methods
  async get<T = any>(url: string, config?: { params?: Record<string, any> }): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'GET',
      url,
      params: config?.params,
    });
  }

  async post<T = any>(url: string, data?: any, config?: { params?: Record<string, any> }): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'POST',
      url,
      data,
      params: config?.params,
    });
  }

  async put<T = any>(url: string, data?: any, config?: { params?: Record<string, any> }): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'PUT',
      url,
      data,
      params: config?.params,
    });
  }

  async patch<T = any>(url: string, data?: any, config?: { params?: Record<string, any> }): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'PATCH',
      url,
      data,
      params: config?.params,
    });
  }

  async delete<T = any>(url: string, config?: { params?: Record<string, any> }): Promise<ApiResponse<T>> {
    return this.request<T>({
      method: 'DELETE',
      url,
      params: config?.params,
    });
  }
}

// Export factory function that accepts custom fetch for SSR
export const createApiClient = (customFetch?: typeof fetch) => {
  return new ApiClient(customFetch);
};

// Default client for browser usage
export const apiClient = createApiClient();