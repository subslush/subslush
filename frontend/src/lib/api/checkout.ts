import { apiClient } from './client.js';
import { API_ENDPOINTS } from '$lib/utils/constants.js';
import { unwrapApiData } from './response.js';
import type {
  CheckoutIdentityResponse,
  CheckoutDraftRequest,
  CheckoutDraftResponse,
  CheckoutCardSessionRequest,
  CheckoutCardSessionResponse,
  CheckoutCardConfirmRequest,
  CheckoutCardConfirmResponse,
  CheckoutCreditsCompleteRequest,
  CheckoutCreditsCompleteResponse,
  CheckoutNowPaymentsInvoiceRequest,
  CheckoutNowPaymentsInvoiceResponse,
  CheckoutNowPaymentsMinimumRequest,
  CheckoutNowPaymentsMinimumResponse,
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

  async createCardSession(
    input: CheckoutCardSessionRequest
  ): Promise<CheckoutCardSessionResponse> {
    const response = await apiClient.post(
      API_ENDPOINTS.CHECKOUT.CARD_SESSION,
      input
    );
    return unwrapApiData<CheckoutCardSessionResponse>(response);
  }

  async confirmCardSession(
    input: CheckoutCardConfirmRequest
  ): Promise<CheckoutCardConfirmResponse> {
    const response = await apiClient.post(
      API_ENDPOINTS.CHECKOUT.CARD_CONFIRM,
      input
    );
    return unwrapApiData<CheckoutCardConfirmResponse>(response);
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

  async claimCheckout(token: string): Promise<CheckoutClaimResponse> {
    const response = await apiClient.post(API_ENDPOINTS.CHECKOUT.CLAIM, {
      token,
    });
    return unwrapApiData<CheckoutClaimResponse>(response);
  }
}

export const checkoutService = new CheckoutService();
