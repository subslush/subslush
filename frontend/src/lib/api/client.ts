import axios, { type AxiosInstance, type AxiosResponse, type AxiosError } from 'axios';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { API_CONFIG, ROUTES, ERROR_MESSAGES } from '$lib/utils/constants.js';
import { storage, STORAGE_KEYS } from '$lib/utils/storage.js';
import type { ApiError } from '$lib/types/api.js';

class ApiClient {
  private client: AxiosInstance;
  private isRefreshing = false;
  private failedQueue: Array<{
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];

  constructor() {
    this.client = axios.create({
      baseURL: API_CONFIG.BASE_URL,
      timeout: API_CONFIG.TIMEOUT,
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        const token = storage.get(STORAGE_KEYS.AUTH_TOKEN);
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor to handle token refresh and errors
    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        // CRITICAL FIX: Don't try to refresh on auth endpoints
        if (
          originalRequest.url?.includes('/auth/login') ||
          originalRequest.url?.includes('/auth/register') ||
          originalRequest.url?.includes('/auth/refresh')
        ) {
          console.log('🌐 [API CLIENT] Auth endpoint failed, not attempting refresh');
          return Promise.reject(this.handleError(error));
        }

        // Only try refresh for authenticated requests that failed with 401
        if (error.response?.status === 401 && !originalRequest._retry) {
          if (this.isRefreshing) {
            return new Promise((resolve, reject) => {
              this.failedQueue.push({ resolve, reject });
            }).then(token => {
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${token}`;
              }
              return this.client(originalRequest);
            }).catch(err => {
              return Promise.reject(err);
            });
          }

          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const refreshResponse = await this.refreshToken();
            const newToken = refreshResponse.data.accessToken;

            storage.set(STORAGE_KEYS.AUTH_TOKEN, newToken);

            this.processQueue(null, newToken);

            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
            }

            return this.client(originalRequest);
          } catch (refreshError) {
            this.processQueue(refreshError, null);
            this.clearAuthData();

            if (browser) {
              goto(ROUTES.AUTH.LOGIN);
            }

            return Promise.reject(refreshError);
          } finally {
            this.isRefreshing = false;
          }
        }

        return Promise.reject(this.handleError(error));
      }
    );
  }

  private async refreshToken() {
    const token = storage.get(STORAGE_KEYS.AUTH_TOKEN);
    return this.client.post('/api/v1/auth/refresh', {}, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  private processQueue(error: any, token: string | null) {
    this.failedQueue.forEach(({ resolve, reject }) => {
      if (error) {
        reject(error);
      } else {
        resolve(token);
      }
    });

    this.failedQueue = [];
  }

  private clearAuthData(): void {
    storage.remove(STORAGE_KEYS.AUTH_TOKEN);
    storage.remove(STORAGE_KEYS.SESSION_ID);
    storage.remove(STORAGE_KEYS.USER_DATA);
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

  // Set auth token manually
  setAuthToken(token: string): void {
    storage.set(STORAGE_KEYS.AUTH_TOKEN, token);
  }

  // Clear auth token manually
  clearAuthToken(): void {
    this.clearAuthData();
  }
}

export const apiClient = new ApiClient();