import { apiClient } from './client.js';
import { API_ENDPOINTS } from '$lib/utils/constants.js';
import type { CreditBalance, CreditHistoryResponse } from '$lib/types/credits.js';
import { unwrapApiData } from './response.js';

type QueryParamValue = string | number | boolean | null | undefined;

export interface CreditHistoryParams extends Record<string, QueryParamValue> {
  limit?: number;
  offset?: number;
  type?: string;
  startDate?: string;
  endDate?: string;
}

class CreditsService {
  async getBalance(userId: string): Promise<CreditBalance> {
    const response = await apiClient.get(
      `${API_ENDPOINTS.CREDITS.BALANCE}/${userId}`
    );
    return unwrapApiData<CreditBalance>(response);
  }

  async getHistory(
    userId: string,
    params?: CreditHistoryParams
  ): Promise<CreditHistoryResponse> {
    const response = await apiClient.get(
      `${API_ENDPOINTS.CREDITS.HISTORY}/${userId}`,
      { params }
    );
    return unwrapApiData<CreditHistoryResponse>(response);
  }
}

export const creditsService = new CreditsService();
