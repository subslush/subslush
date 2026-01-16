import { apiClient } from './client.js';
import { API_ENDPOINTS } from '$lib/utils/constants.js';
import { unwrapApiData } from './response.js';

export interface PinVerifyResponse {
  pin_token: string;
  expires_at: string;
  expires_in_seconds: number;
}

export interface PinSetResponse {
  pin_set_at: string;
}

export interface PinResetResponse {
  support_url: string;
}

export interface PinStatusResponse {
  has_pin: boolean;
  pin_set_at?: string | null;
}

class PinService {
  async getStatus(): Promise<PinStatusResponse> {
    const response = await apiClient.get(API_ENDPOINTS.USERS.PIN_STATUS, {
      params: { t: Date.now() }
    });
    return unwrapApiData<PinStatusResponse>(response);
  }

  async setPin(pin: string): Promise<PinSetResponse> {
    const response = await apiClient.post(API_ENDPOINTS.USERS.PIN_SET, { pin });
    return unwrapApiData<PinSetResponse>(response);
  }

  async verifyPin(pin: string): Promise<PinVerifyResponse> {
    const response = await apiClient.post(API_ENDPOINTS.USERS.PIN_VERIFY, { pin });
    return unwrapApiData<PinVerifyResponse>(response);
  }

  async requestReset(): Promise<PinResetResponse> {
    const response = await apiClient.post(API_ENDPOINTS.USERS.PIN_RESET);
    return unwrapApiData<PinResetResponse>(response);
  }
}

export const pinService = new PinService();
