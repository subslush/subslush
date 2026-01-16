import { apiClient } from './client.js';
import { API_ENDPOINTS } from '$lib/utils/constants.js';
import type { NotificationListResponse } from '$lib/types/notification.js';
import { unwrapApiData } from './response.js';

type QueryParamValue = string | number | boolean | null | undefined;

export interface NotificationListParams extends Record<string, QueryParamValue> {
  limit?: number;
  offset?: number;
  unread_only?: boolean;
}

class NotificationService {
  async listNotifications(
    params?: NotificationListParams
  ): Promise<NotificationListResponse> {
    const response = await apiClient.get(API_ENDPOINTS.NOTIFICATIONS.LIST, {
      params,
    });
    return unwrapApiData<NotificationListResponse>(response);
  }

  async markRead(ids?: string[]): Promise<{ updated: number }> {
    const response = await apiClient.post(API_ENDPOINTS.NOTIFICATIONS.READ, {
      ids,
    });
    return unwrapApiData<{ updated: number }>(response);
  }

  async clearAll(): Promise<{ deleted: number }> {
    const response = await apiClient.delete(API_ENDPOINTS.NOTIFICATIONS.CLEAR, {
      data: {},
    });
    return unwrapApiData<{ deleted: number }>(response);
  }
}

export const notificationService = new NotificationService();
