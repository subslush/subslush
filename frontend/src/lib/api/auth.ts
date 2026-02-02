import { apiClient } from './client.js';
import { API_ENDPOINTS } from '$lib/utils/constants.js';
import type {
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  LogoutRequest,
  RefreshResponse,
  ConfirmEmailRequest,
  SessionsResponse,
  PasswordResetRequest,
  PasswordResetResponse,
  PasswordResetConfirmRequest,
  PasswordResetConfirmResponse,
  VerifiedTrackResponse
} from '$lib/types/auth.js';
import { unwrapApiData } from './response.js';

export class AuthService {
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.REGISTER, data);
    return unwrapApiData<AuthResponse>(response);
  }

  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.LOGIN, data);
    return unwrapApiData<AuthResponse>(response);
  }

  async logout(data?: LogoutRequest): Promise<{ message: string }> {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.LOGOUT, data);
    return unwrapApiData<{ message: string }>(response);
  }

  async refreshSession(): Promise<RefreshResponse> {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.REFRESH);
    return unwrapApiData<RefreshResponse>(response);
  }

  async confirmEmail(data: ConfirmEmailRequest): Promise<AuthResponse> {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.CONFIRM_EMAIL, data);
    return unwrapApiData<AuthResponse>(response);
  }

  async getSessions(): Promise<SessionsResponse> {
    const response = await apiClient.get(API_ENDPOINTS.AUTH.SESSIONS);
    return unwrapApiData<SessionsResponse>(response);
  }

  async revokeSession(sessionId: string): Promise<{ message: string }> {
    const response = await apiClient.delete(`${API_ENDPOINTS.AUTH.SESSIONS}/${sessionId}`);
    return unwrapApiData<{ message: string }>(response);
  }

  async requestPasswordReset(payload: PasswordResetRequest): Promise<PasswordResetResponse> {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.PASSWORD_RESET, payload);
    return unwrapApiData<PasswordResetResponse>(response);
  }

  async confirmPasswordReset(
    payload: PasswordResetConfirmRequest
  ): Promise<PasswordResetConfirmResponse> {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.PASSWORD_RESET_CONFIRM, payload);
    return unwrapApiData<PasswordResetConfirmResponse>(response);
  }

  async trackVerifiedRegistration(): Promise<VerifiedTrackResponse> {
    const response = await apiClient.post(API_ENDPOINTS.AUTH.VERIFIED_TRACK);
    return unwrapApiData<VerifiedTrackResponse>(response);
  }

  async logoutAllDevices(): Promise<{ message: string }> {
    return this.logout({ allDevices: true });
  }
}

export const authService = new AuthService();
