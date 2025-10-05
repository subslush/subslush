import axios, { type AxiosInstance, type AxiosResponse, type AxiosError } from 'axios';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { API_CONFIG, ERROR_MESSAGES } from '$lib/utils/constants.js';
import type { ApiError } from '$lib/types/api.js';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_CONFIG.BASE_URL,
      timeout: API_CONFIG.TIMEOUT,
      withCredentials: true, // Send cookies automatically
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor - no need to add auth headers, cookies handle it
    this.client.interceptors.request.use(
      (config) => {
        // Cookies are automatically sent with withCredentials: true
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor to handle errors and auth failures
    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error: AxiosError) => {
        // On 401 errors, redirect to login (session expired/invalid)
        if (error.response?.status === 401) {
          // Don't redirect if this is an auth endpoint
          const originalRequest = error.config as any;
          if (
            originalRequest.url?.includes('/auth/login') ||
            originalRequest.url?.includes('/auth/register')
          ) {
            return Promise.reject(this.handleError(error));
          }

          // Session expired, redirect to login
          if (browser) {
            goto('/auth/login');
          }
        }

        return Promise.reject(this.handleError(error));
      }
    );
  }


  private handleError(error: AxiosError): ApiError {
    console.error('🌐 [API CLIENT] Handling error:', {
      status: error.response?.status,
      data: error.response?.data,
      code: error.code,
      message: error.message,
      config: error.config?.url
    });

    let apiError: ApiError;

    if (error.response?.data) {
      apiError = error.response.data as ApiError;
      console.log('🌐 [API CLIENT] Using response error data:', apiError);
      return apiError;
    }

    if (error.code === 'ECONNABORTED') {
      apiError = {
        message: 'Request timeout. Please try again.',
        error: 'TIMEOUT',
        statusCode: 408
      };
    } else if (error.code === 'ERR_NETWORK') {
      apiError = {
        message: ERROR_MESSAGES.NETWORK_ERROR,
        error: 'NETWORK_ERROR',
        statusCode: 0
      };
    } else {
      apiError = {
        message: ERROR_MESSAGES.GENERIC_ERROR,
        error: 'UNKNOWN_ERROR',
        statusCode: error.response?.status || 500
      };
    }

    console.error('🌐 [API CLIENT] Returning formatted error:', apiError);
    return apiError;
  }

  // HTTP methods
  async get<T = any>(url: string, config?: any): Promise<AxiosResponse<T>> {
    console.log('🌐 [API CLIENT] GET request:', url);
    return this.client.get<T>(url, config);
  }

  async post<T = any>(url: string, data?: any, config?: any): Promise<AxiosResponse<T>> {
    console.log('🌐 [API CLIENT] POST request:', url);
    return this.client.post<T>(url, data, config);
  }

  async put<T = any>(url: string, data?: any, config?: any): Promise<AxiosResponse<T>> {
    return this.client.put<T>(url, data, config);
  }

  async patch<T = any>(url: string, data?: any, config?: any): Promise<AxiosResponse<T>> {
    return this.client.patch<T>(url, data, config);
  }

  async delete<T = any>(url: string, config?: any): Promise<AxiosResponse<T>> {
    return this.client.delete<T>(url, config);
  }

  // Note: Auth token management is now handled by HTTP-only cookies
  // No need for manual token management
}

export const apiClient = new ApiClient();