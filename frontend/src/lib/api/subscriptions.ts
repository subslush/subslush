import { apiClient } from './client.js';
import { API_ENDPOINTS } from '$lib/utils/constants.js';
import type {
  ServiceType,
  ValidatePurchaseRequest,
  PurchaseRequest,
  SubscriptionQuery,
  AvailablePlansResponse,
  AvailableProductsResponse,
  ProductDetail,
  ValidationResponse,
  PurchaseResponse,
  SubscriptionsResponse,
  SubscriptionResponse,
  AutoRenewEnableResponse,
  AutoRenewConfirmResponse,
  AutoRenewDisableResponse,
  RenewalCheckoutResponse,
  CreditsAutoRenewResponse,
  CreditsRenewalResponse
} from '$lib/types/subscription.js';
import type {
  UpgradeSelectionResponse,
  UpgradeSelectionSubmission
} from '$lib/types/upgradeSelection.js';
import { unwrapApiData } from './response.js';

export class SubscriptionService {
  async getAvailablePlans(serviceType?: ServiceType): Promise<AvailablePlansResponse> {
    const params = serviceType ? { service_type: serviceType } : {};
    const response = await apiClient.get(
      API_ENDPOINTS.SUBSCRIPTIONS.AVAILABLE,
      { params }
    );
    return unwrapApiData<AvailablePlansResponse>(response);
  }

  async getAvailableProducts(serviceType?: ServiceType): Promise<AvailableProductsResponse> {
    const params = serviceType ? { service_type: serviceType } : {};
    const response = await apiClient.get(
      API_ENDPOINTS.SUBSCRIPTIONS.PRODUCTS_AVAILABLE,
      { params }
    );
    return unwrapApiData<AvailableProductsResponse>(response);
  }

  async getProductDetail(slug: string): Promise<ProductDetail> {
    const response = await apiClient.get(
      `${API_ENDPOINTS.SUBSCRIPTIONS.PRODUCT_DETAIL}/${slug}`
    );
    return unwrapApiData<ProductDetail>(response);
  }

  async validatePurchase(data: ValidatePurchaseRequest): Promise<ValidationResponse> {
    const response = await apiClient.post(
      API_ENDPOINTS.SUBSCRIPTIONS.VALIDATE,
      data
    );
    return unwrapApiData<ValidationResponse>(response);
  }

  async purchaseSubscription(data: PurchaseRequest): Promise<PurchaseResponse> {
    const response = await apiClient.post(
      API_ENDPOINTS.SUBSCRIPTIONS.PURCHASE,
      data
    );
    return unwrapApiData<PurchaseResponse>(response);
  }

  async getUpgradeSelection(subscriptionId: string): Promise<UpgradeSelectionResponse> {
    const response = await apiClient.get(
      `${API_ENDPOINTS.SUBSCRIPTIONS.DETAILS}/${subscriptionId}/upgrade-selection`
    );
    return unwrapApiData<UpgradeSelectionResponse>(response);
  }

  async submitUpgradeSelection(
    subscriptionId: string,
    payload: UpgradeSelectionSubmission
  ): Promise<UpgradeSelectionResponse> {
    const response = await apiClient.post(
      `${API_ENDPOINTS.SUBSCRIPTIONS.DETAILS}/${subscriptionId}/upgrade-selection`,
      payload
    );
    return unwrapApiData<UpgradeSelectionResponse>(response);
  }

  async acknowledgeManualMonthly(
    subscriptionId: string
  ): Promise<UpgradeSelectionResponse> {
    const response = await apiClient.post(
      `${API_ENDPOINTS.SUBSCRIPTIONS.DETAILS}/${subscriptionId}/manual-monthly-acknowledge`
    );
    return unwrapApiData<UpgradeSelectionResponse>(response);
  }

  async getMySubscriptions(query?: SubscriptionQuery): Promise<SubscriptionsResponse> {
    const response = await apiClient.get(
      API_ENDPOINTS.SUBSCRIPTIONS.MY_SUBSCRIPTIONS,
      { params: query }
    );
    return unwrapApiData<SubscriptionsResponse>(response);
  }

  async getSubscriptionById(subscriptionId: string): Promise<SubscriptionResponse> {
    const response = await apiClient.get(
      `${API_ENDPOINTS.SUBSCRIPTIONS.DETAILS}/${subscriptionId}`
    );
    return unwrapApiData<SubscriptionResponse>(response);
  }

  async revealCredentials(subscriptionId: string, pinToken: string): Promise<{ credentials: string; subscription_id: string }> {
    const response = await apiClient.post(
      `${API_ENDPOINTS.SUBSCRIPTIONS.DETAILS}/${subscriptionId}/credentials/reveal`,
      { pin_token: pinToken }
    );
    return unwrapApiData<{ credentials: string; subscription_id: string }>(response);
  }

  async cancelSubscription(subscriptionId: string, reason: string): Promise<{ subscription_id: string; message?: string }> {
    const response = await apiClient.delete(
      `${API_ENDPOINTS.SUBSCRIPTIONS.DETAILS}/${subscriptionId}`,
      { data: { reason } }
    );
    return unwrapApiData<{ subscription_id: string; message?: string }>(response);
  }

  async enableStripeAutoRenew(subscriptionId: string): Promise<AutoRenewEnableResponse> {
    const response = await apiClient.post(
      `${API_ENDPOINTS.SUBSCRIPTIONS.AUTO_RENEW_ENABLE}/${subscriptionId}/auto-renew/enable`
    );
    return unwrapApiData<AutoRenewEnableResponse>(response);
  }

  async confirmStripeAutoRenew(
    subscriptionId: string,
    setupIntentId: string
  ): Promise<AutoRenewConfirmResponse> {
    const response = await apiClient.post(
      `${API_ENDPOINTS.SUBSCRIPTIONS.AUTO_RENEW_CONFIRM}/${subscriptionId}/auto-renew/confirm`,
      { setup_intent_id: setupIntentId }
    );
    return unwrapApiData<AutoRenewConfirmResponse>(response);
  }

  async disableStripeAutoRenew(subscriptionId: string): Promise<AutoRenewDisableResponse> {
    const response = await apiClient.post(
      `${API_ENDPOINTS.SUBSCRIPTIONS.AUTO_RENEW_DISABLE}/${subscriptionId}/auto-renew/disable`
    );
    return unwrapApiData<AutoRenewDisableResponse>(response);
  }

  async enableCreditsAutoRenew(subscriptionId: string): Promise<CreditsAutoRenewResponse> {
    const response = await apiClient.post(
      `${API_ENDPOINTS.SUBSCRIPTIONS.DETAILS}/${subscriptionId}/auto-renew/credits/enable`
    );
    return unwrapApiData<CreditsAutoRenewResponse>(response);
  }

  async renewCreditsSubscription(
    subscriptionId: string
  ): Promise<CreditsRenewalResponse> {
    const response = await apiClient.post(
      `${API_ENDPOINTS.SUBSCRIPTIONS.DETAILS}/${subscriptionId}/renewal/credits`
    );
    return unwrapApiData<CreditsRenewalResponse>(response);
  }

  async startStripeRenewalCheckout(
    subscriptionId: string
  ): Promise<RenewalCheckoutResponse> {
    const response = await apiClient.post(
      `${API_ENDPOINTS.SUBSCRIPTIONS.RENEWAL_CHECKOUT}/${subscriptionId}/renewal/checkout`
    );
    return unwrapApiData<RenewalCheckoutResponse>(response);
  }

  async getCreditBalance(userId: string): Promise<{ balance: number }> {
    const response = await apiClient.get(
      `${API_ENDPOINTS.CREDITS.BALANCE}/${userId}`
    );
    return unwrapApiData<{ balance: number }>(response);
  }
}

export const subscriptionService = new SubscriptionService();
