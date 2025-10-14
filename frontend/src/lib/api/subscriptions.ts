import { apiClient } from './client.js';
import { API_ENDPOINTS } from '$lib/utils/constants.js';
import type {
  ServiceType,
  ValidatePurchaseRequest,
  PurchaseRequest,
  SubscriptionQuery,
  AvailablePlansResponse,
  ValidationResponse,
  PurchaseResponse,
  SubscriptionsResponse,
  SubscriptionResponse
} from '$lib/types/subscription.js';

export class SubscriptionService {
  async getAvailablePlans(serviceType?: ServiceType): Promise<AvailablePlansResponse> {
    const params = serviceType ? { service_type: serviceType } : {};
    const response = await apiClient.get(
      API_ENDPOINTS.SUBSCRIPTIONS.AVAILABLE,
      { params }
    );
    // Backend wraps response in a data property
    return response.data.data;
  }

  async validatePurchase(data: ValidatePurchaseRequest): Promise<ValidationResponse> {
    const response = await apiClient.post(
      API_ENDPOINTS.SUBSCRIPTIONS.VALIDATE,
      data
    );
    return response.data;
  }

  async purchaseSubscription(data: PurchaseRequest): Promise<PurchaseResponse> {
    const response = await apiClient.post(
      API_ENDPOINTS.SUBSCRIPTIONS.PURCHASE,
      data
    );
    return response.data;
  }

  async getMySubscriptions(query?: SubscriptionQuery): Promise<SubscriptionsResponse> {
    const response = await apiClient.get(
      API_ENDPOINTS.SUBSCRIPTIONS.MY_SUBSCRIPTIONS,
      { params: query }
    );
    // Backend wraps response in a data property - unwrap to match other API methods
    return response.data.data;
  }

  async getSubscriptionById(subscriptionId: string): Promise<SubscriptionResponse> {
    const response = await apiClient.get(
      `${API_ENDPOINTS.SUBSCRIPTIONS.DETAILS}/${subscriptionId}`
    );
    return response.data;
  }

  async getCreditBalance(userId: string): Promise<{ balance: number }> {
    const response = await apiClient.get(
      `${API_ENDPOINTS.CREDITS.BALANCE}/${userId}`
    );
    return response.data;
  }
}

export const subscriptionService = new SubscriptionService();