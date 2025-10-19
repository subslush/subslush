import { apiClient } from './client.js';
import { API_ENDPOINTS } from '$lib/utils/constants.js';
import type {
  CreatePaymentRequest,
  CreatePaymentResponse,
  PaymentStatusResponse,
  PaymentEstimate
} from '$lib/types/payment.js';

export class PaymentService {
  async getSupportedCurrencies(): Promise<string[]> {
    const response = await apiClient.get(API_ENDPOINTS.PAYMENTS.CURRENCIES);
    return response.data.currencies || response.data;
  }

  async getEstimate(creditAmount: number, currency: string): Promise<PaymentEstimate> {
    const response = await apiClient.get(API_ENDPOINTS.PAYMENTS.ESTIMATE, {
      params: {
        amount: creditAmount,
        currency_from: 'usd',
        currency_to: currency
      }
    });
    return {
      estimatedAmount: response.data.estimated_amount,
      currency: currency.toUpperCase()
    };
  }

  async createPayment(request: CreatePaymentRequest): Promise<CreatePaymentResponse> {
    const response = await apiClient.post(API_ENDPOINTS.PAYMENTS.CREATE, request);
    return response.data;
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatusResponse> {
    const response = await apiClient.get(`${API_ENDPOINTS.PAYMENTS.STATUS}/${paymentId}`);
    return response.data;
  }
}

export const paymentService = new PaymentService();