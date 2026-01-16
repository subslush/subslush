import { apiClient } from './client.js';
import { API_ENDPOINTS } from '$lib/utils/constants.js';
import type { DashboardOverview } from '$lib/types/dashboard.js';
import type { PrelaunchRewardsResponse } from '$lib/types/prelaunch.js';
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
}

export const dashboardService = new DashboardService();
