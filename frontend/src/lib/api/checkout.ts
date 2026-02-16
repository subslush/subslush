import { apiClient } from './client.js';
import { API_ENDPOINTS } from '$lib/utils/constants.js';
import { unwrapApiData } from './response.js';
import type {
  CheckoutIdentityResponse,
  CheckoutDraftRequest,
  CheckoutDraftResponse,
  CheckoutStripeSessionRequest,
  CheckoutStripeSessionResponse,
  CheckoutStripeConfirmRequest,
  CheckoutStripeConfirmResponse,
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

  async createStripeSession(
    input: CheckoutStripeSessionRequest
  ): Promise<CheckoutStripeSessionResponse> {
    const response = await apiClient.post(
      API_ENDPOINTS.CHECKOUT.STRIPE_SESSION,
      input
    );
    return unwrapApiData<CheckoutStripeSessionResponse>(response);
  }

  async confirmStripeSession(
    input: CheckoutStripeConfirmRequest
  ): Promise<CheckoutStripeConfirmResponse> {
    const response = await apiClient.post(
      API_ENDPOINTS.CHECKOUT.STRIPE_CONFIRM,
      input
    );
    return unwrapApiData<CheckoutStripeConfirmResponse>(response);
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
