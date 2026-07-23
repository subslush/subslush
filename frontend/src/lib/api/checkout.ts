import { apiClient } from './client.js';
import { API_ENDPOINTS } from '$lib/utils/constants.js';
import { unwrapApiData } from './response.js';
import type {
  CheckoutIdentityResponse,
  CheckoutDraftRequest,
  CheckoutDraftResponse,
  CheckoutInitiateRequest,
  CheckoutInitiateResponse,
  CheckoutCardSessionRequest,
  CheckoutCardSessionResponse,
  CheckoutCardConfirmRequest,
  CheckoutCardConfirmResponse,
  CheckoutPayPalSdkConfigResponse,
  CheckoutCreditsCompleteRequest,
  CheckoutCreditsCompleteResponse,
  CheckoutQaCompleteRequest,
  CheckoutQaCompleteResponse,
  CheckoutQaPaymentConfigResponse,
  CheckoutPaymentCapabilitiesResponse,
  CheckoutNowPaymentsInvoiceRequest,
  CheckoutNowPaymentsInvoiceResponse,
  CheckoutNowPaymentsMinimumRequest,
  CheckoutNowPaymentsMinimumResponse,
  CheckoutPayopOptionsRequest,
  CheckoutPayopOptionsResponse,
  CheckoutPayopSessionRequest,
  CheckoutPayopSessionResponse,
  CheckoutPayopStatusRequest,
  CheckoutPayopStatusResponse,
  CheckoutAntomOptionsRequest,
  CheckoutAntomOptionsResponse,
  CheckoutAntomSessionRequest,
  CheckoutAntomSessionResponse,
  CheckoutAntomStatusRequest,
  CheckoutAntomStatusResponse,
  CheckoutClaimResponse,
} from '$lib/types/checkout.js';

export class CheckoutService {
  async createIdentity(email: string): Promise<CheckoutIdentityResponse> {
    const response = await apiClient.post(API_ENDPOINTS.CHECKOUT.IDENTITY, {
      email,
    });
    return unwrapApiData<CheckoutIdentityResponse>(response);
  }

  async upsertDraft(input: CheckoutDraftRequest): Promise<CheckoutDraftResponse> {
    const response = await apiClient.post(API_ENDPOINTS.CHECKOUT.DRAFT, input);
    return unwrapApiData<CheckoutDraftResponse>(response);
  }

  async trackInitiateCheckout(
    input: CheckoutInitiateRequest
  ): Promise<CheckoutInitiateResponse> {
    const response = await apiClient.post(
      API_ENDPOINTS.CHECKOUT.INITIATE_CHECKOUT,
      input
    );
    return unwrapApiData<CheckoutInitiateResponse>(response);
  }

  async createCardSession(
    input: CheckoutCardSessionRequest
  ): Promise<CheckoutCardSessionResponse> {
    const response = await apiClient.post(
      API_ENDPOINTS.CHECKOUT.PAYPAL_SESSION,
      input
    );
    return unwrapApiData<CheckoutCardSessionResponse>(response);
  }

  async confirmCardSession(
    input: CheckoutCardConfirmRequest
  ): Promise<CheckoutCardConfirmResponse> {
    const response = await apiClient.post(
      API_ENDPOINTS.CHECKOUT.PAYPAL_CONFIRM,
      input
    );
    return unwrapApiData<CheckoutCardConfirmResponse>(response);
  }

  async getPayPalSdkConfig(): Promise<CheckoutPayPalSdkConfigResponse> {
    const response = await apiClient.get(API_ENDPOINTS.CHECKOUT.PAYPAL_SDK_CONFIG);
    return unwrapApiData<CheckoutPayPalSdkConfigResponse>(response);
  }

  async createStripeSession(
    input: CheckoutCardSessionRequest
  ): Promise<CheckoutCardSessionResponse> {
    return this.createCardSession(input);
  }

  async confirmStripeSession(
    input: CheckoutCardConfirmRequest
  ): Promise<CheckoutCardConfirmResponse> {
    return this.confirmCardSession(input);
  }

  async completeCreditsCheckout(
    input: CheckoutCreditsCompleteRequest
  ): Promise<CheckoutCreditsCompleteResponse> {
    const response = await apiClient.post(
      API_ENDPOINTS.CHECKOUT.CREDITS_COMPLETE,
      input
    );
    return unwrapApiData<CheckoutCreditsCompleteResponse>(response);
  }

  async completeQaCheckout(
    input: CheckoutQaCompleteRequest
  ): Promise<CheckoutQaCompleteResponse> {
    const response = await apiClient.post(API_ENDPOINTS.CHECKOUT.QA_COMPLETE, input);
    return unwrapApiData<CheckoutQaCompleteResponse>(response);
  }

  async getQaPaymentConfig(): Promise<CheckoutQaPaymentConfigResponse> {
    const response = await apiClient.get(API_ENDPOINTS.CHECKOUT.QA_CONFIG);
    return unwrapApiData<CheckoutQaPaymentConfigResponse>(response);
  }

  async getPaymentCapabilities(): Promise<CheckoutPaymentCapabilitiesResponse> {
    const response = await apiClient.get(
      API_ENDPOINTS.CHECKOUT.PAYMENT_CAPABILITIES
    );
    return unwrapApiData<CheckoutPaymentCapabilitiesResponse>(response);
  }

  async createNowPaymentsInvoice(
    input: CheckoutNowPaymentsInvoiceRequest
  ): Promise<CheckoutNowPaymentsInvoiceResponse> {
    const response = await apiClient.post(
      API_ENDPOINTS.CHECKOUT.NOWPAYMENTS_INVOICE,
      input
    );
    return unwrapApiData<CheckoutNowPaymentsInvoiceResponse>(response);
  }

  async getNowPaymentsMinimum(
    input: CheckoutNowPaymentsMinimumRequest
  ): Promise<CheckoutNowPaymentsMinimumResponse> {
    const response = await apiClient.post(
      API_ENDPOINTS.CHECKOUT.NOWPAYMENTS_MINIMUM,
      input
    );
    return unwrapApiData<CheckoutNowPaymentsMinimumResponse>(response);
  }

  async getPayopOptions(
    input: CheckoutPayopOptionsRequest
  ): Promise<CheckoutPayopOptionsResponse> {
    const response = await apiClient.post(API_ENDPOINTS.CHECKOUT.PAYOP_OPTIONS, input);
    return unwrapApiData<CheckoutPayopOptionsResponse>(response);
  }

  async createPayopSession(
    input: CheckoutPayopSessionRequest
  ): Promise<CheckoutPayopSessionResponse> {
    const response = await apiClient.post(API_ENDPOINTS.CHECKOUT.PAYOP_SESSION, input);
    return unwrapApiData<CheckoutPayopSessionResponse>(response);
  }

  async getPayopStatus(
    input: CheckoutPayopStatusRequest
  ): Promise<CheckoutPayopStatusResponse> {
    const response = await apiClient.post(API_ENDPOINTS.CHECKOUT.PAYOP_STATUS, input);
    return unwrapApiData<CheckoutPayopStatusResponse>(response);
  }

  async getAntomOptions(
    input: CheckoutAntomOptionsRequest
  ): Promise<CheckoutAntomOptionsResponse> {
    const response = await apiClient.post(API_ENDPOINTS.CHECKOUT.ANTOM_OPTIONS, input);
    return unwrapApiData<CheckoutAntomOptionsResponse>(response);
  }

  async createAntomSession(
    input: CheckoutAntomSessionRequest
  ): Promise<CheckoutAntomSessionResponse> {
    const response = await apiClient.post(API_ENDPOINTS.CHECKOUT.ANTOM_SESSION, input);
    return unwrapApiData<CheckoutAntomSessionResponse>(response);
  }

  async getAntomStatus(
    input: CheckoutAntomStatusRequest
  ): Promise<CheckoutAntomStatusResponse> {
    const response = await apiClient.post(API_ENDPOINTS.CHECKOUT.ANTOM_STATUS, input);
    return unwrapApiData<CheckoutAntomStatusResponse>(response);
  }

  async claimCheckout(token: string): Promise<CheckoutClaimResponse> {
    const response = await apiClient.post(API_ENDPOINTS.CHECKOUT.CLAIM, {
      token,
    });
    return unwrapApiData<CheckoutClaimResponse>(response);
  }
}

export const checkoutService = new CheckoutService();
