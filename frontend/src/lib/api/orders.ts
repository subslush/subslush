import { apiClient } from './client.js';
import { API_ENDPOINTS } from '$lib/utils/constants.js';
import type {
  OrdersListResponse,
  OrderSubscriptionResponse,
  OrderSubscriptionsResponse,
  OrderEntitlementsResponse,
  OrderCredentialRevealResponse
} from '$lib/types/order.js';
import { unwrapApiData } from './response.js';

type QueryParamValue = string | number | boolean | null | undefined;

export interface OrdersListParams extends Record<string, QueryParamValue> {
  status?: string;
  payment_provider?: string;
  limit?: number;
  offset?: number;
  include_items?: boolean;
  include_cart?: boolean;
}

class OrdersService {
  async listOrders(params?: OrdersListParams): Promise<OrdersListResponse> {
    const response = await apiClient.get(API_ENDPOINTS.ORDERS.LIST, { params });
    return unwrapApiData<OrdersListResponse>(response);
  }

  async getOrderSubscription(orderId: string): Promise<OrderSubscriptionResponse> {
    const response = await apiClient.get(
      `${API_ENDPOINTS.ORDERS.LIST}/${orderId}/subscription`
    );
    return unwrapApiData<OrderSubscriptionResponse>(response);
  }

  async getOrderSubscriptions(
    orderId: string
  ): Promise<OrderSubscriptionsResponse> {
    const response = await apiClient.get(
      `${API_ENDPOINTS.ORDERS.LIST}/${orderId}/subscriptions`
    );
    return unwrapApiData<OrderSubscriptionsResponse>(response);
  }

  async getOrderEntitlements(
    orderId: string
  ): Promise<OrderEntitlementsResponse> {
    const response = await apiClient.get(
      `${API_ENDPOINTS.ORDERS.LIST}/${orderId}/entitlements`
    );
    return unwrapApiData<OrderEntitlementsResponse>(response);
  }

  async revealOrderCredentials(
    orderId: string
  ): Promise<OrderCredentialRevealResponse> {
    const response = await apiClient.post(
      `${API_ENDPOINTS.ORDERS.LIST}/${orderId}/credentials/reveal`
    );
    return unwrapApiData<OrderCredentialRevealResponse>(response);
  }

  async revealOrderItemCredentials(
    orderId: string,
    subscriptionId: string
  ): Promise<OrderCredentialRevealResponse> {
    const response = await apiClient.post(
      `${API_ENDPOINTS.ORDERS.LIST}/${orderId}/items/${subscriptionId}/reveal`
    );
    return unwrapApiData<OrderCredentialRevealResponse>(response);
  }

  async acceptOrderItemRules(
    orderId: string,
    subscriptionId: string
  ): Promise<{ accepted: boolean; subscription_id: string; rules_version: number }> {
    const response = await apiClient.post(
      `${API_ENDPOINTS.ORDERS.LIST}/${orderId}/items/${subscriptionId}/accept-rules`,
      { confirmed: true }
    );
    return unwrapApiData(response);
  }

  async confirmActivationReady(
    orderId: string,
    subscriptionId: string,
    confirmed: boolean
  ): Promise<{
    subscription_id: string;
    activation_handshake_state: string;
  }> {
    const response = await apiClient.post(
      `${API_ENDPOINTS.ORDERS.LIST}/${orderId}/items/${subscriptionId}/activation-ready`,
      { confirmed }
    );
    return unwrapApiData(response);
  }
}

export const ordersService = new OrdersService();
