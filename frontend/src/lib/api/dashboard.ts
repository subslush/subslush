import { apiClient } from './client.js';
import { API_ENDPOINTS } from '$lib/utils/constants.js';
import type { DashboardOverview } from '$lib/types/dashboard.js';
import type {
  PrelaunchRewardsResponse,
  PrelaunchRewardClaimResponse
} from '$lib/types/prelaunch.js';
import { unwrapApiData } from './response.js';

class DashboardService {
  async getOverview(): Promise<DashboardOverview> {
    const response = await apiClient.get(API_ENDPOINTS.DASHBOARD.OVERVIEW);
    return unwrapApiData<DashboardOverview>(response);
  }

  async getPrelaunchRewards(): Promise<PrelaunchRewardsResponse> {
    const response = await apiClient.get(API_ENDPOINTS.DASHBOARD.PRELAUNCH_REWARDS);
    return unwrapApiData<PrelaunchRewardsResponse>(response);
  }

  async claimReferralReward(payload: {
    perkId: string;
    subscriptionId?: string;
  }): Promise<PrelaunchRewardClaimResponse> {
    const response = await apiClient.post(
      API_ENDPOINTS.DASHBOARD.PRELAUNCH_REWARDS_CLAIM,
      payload
    );
    return unwrapApiData<PrelaunchRewardClaimResponse>(response);
  }
}

export const dashboardService = new DashboardService();
