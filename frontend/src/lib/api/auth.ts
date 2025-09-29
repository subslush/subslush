import { apiClient } from './client.js';
import { API_ENDPOINTS } from '$lib/utils/constants.js';
import type {
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  LogoutRequest,
  RefreshResponse,
  SessionsResponse
} from '$lib/types/auth.js';

export class AuthService {
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>(API_ENDPOINTS.AUTH.REGISTER, data);
    return response.data;
  }

  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await apiClient.post<AuthResponse>(API_ENDPOINTS.AUTH.LOGIN, data);
    return response.data;
  }

  async logout(data?: LogoutRequest): Promise<{ message: string }> {
    const response = await apiClient.post<{ message: string }>(API_ENDPOINTS.AUTH.LOGOUT, data);
    return response.data;
  }

  async refreshSession(): Promise<RefreshResponse> {
    const response = await apiClient.post<RefreshResponse>(API_ENDPOINTS.AUTH.REFRESH);
    return response.data;
  }

  async getSessions(): Promise<SessionsResponse> {
    const response = await apiClient.get<SessionsResponse>(API_ENDPOINTS.AUTH.SESSIONS);
    return response.data;
  }

  async revokeSession(sessionId: string): Promise<{ message: string }> {
    const response = await apiClient.delete<{ message: string }>(`${API_ENDPOINTS.AUTH.SESSIONS}/${sessionId}`);
    return response.data;
  }

  async logoutAllDevices(): Promise<{ message: string }> {
    return this.logout({ allDevices: true });
  }
}

export const authService = new AuthService();