import { apiClient } from './client.js';
import { API_ENDPOINTS } from '$lib/utils/constants.js';
import type {
  CreatePaymentRequest,
  CreatePaymentResponse,
  PaymentStatusResponse,
  PaymentEstimate,
  Currency
} from '$lib/types/payment.js';

export class PaymentService {
  async debugCurrenciesResponse(): Promise<any> {
    try {
      const response = await apiClient.get(API_ENDPOINTS.PAYMENTS.CURRENCIES);
      return {
        rawResponse: response,
        dataType: typeof response.data,
        isArray: Array.isArray(response.data),
        hasDataProperty: 'data' in response,
        hasCurrenciesProperty: response.data && 'currencies' in response.data,
        keys: response.data ? Object.keys(response.data) : []
      };
    } catch (error) {
      console.error('[DEBUG] Error in debugCurrenciesResponse:', error);
      throw error;
    }
  }
  async getSupportedCurrencies(): Promise<Currency[]> {
    try {
      const response = await apiClient.get(API_ENDPOINTS.PAYMENTS.CURRENCIES);

      console.log('[PAYMENTS API] Raw response:', response);
      console.log('[PAYMENTS API] response.data:', response.data);
      console.log('[PAYMENTS API] response.data type:', typeof response.data);
      console.log('[PAYMENTS API] response.data is array:', Array.isArray(response.data));

      // Handle multiple possible response structures
      let currencyArray: any[] = [];

      // Case 1: Direct array in response.data
      if (Array.isArray(response.data)) {
        currencyArray = response.data;
        console.log('[PAYMENTS API] Case 1: Direct array in response.data');
      }
      // Case 2: Wrapped in data.data.currencies (double wrapping)
      else if (response.data?.data?.currencies && Array.isArray(response.data.data.currencies)) {
        currencyArray = response.data.data.currencies;
        console.log('[PAYMENTS API] Case 2: Double wrapped in data.data.currencies');
      }
      // Case 3: Wrapped in data.currencies
      else if (response.data?.currencies && Array.isArray(response.data.currencies)) {
        currencyArray = response.data.currencies;
        console.log('[PAYMENTS API] Case 3: Wrapped in data.currencies');
      }
      // Case 4: Just data.data (single array)
      else if (Array.isArray(response.data?.data)) {
        currencyArray = response.data.data;
        console.log('[PAYMENTS API] Case 4: Single array in data.data');
      }
      // Case 5: Response structure inspection
      else {
        console.log('[PAYMENTS API] Unknown structure, inspecting...');
        console.log('[PAYMENTS API] response keys:', Object.keys(response));
        console.log('[PAYMENTS API] response.data keys:', response.data ? Object.keys(response.data) : 'No data');

        // Try to find any array in the response
        const findArrayInObject = (obj: any, path = ''): any[] | null => {
          if (Array.isArray(obj)) {
            console.log(`[PAYMENTS API] Found array at path: ${path}`);
            return obj;
          }
          if (obj && typeof obj === 'object') {
            for (const [key, value] of Object.entries(obj)) {
              const result = findArrayInObject(value, path ? `${path}.${key}` : key);
              if (result) return result;
            }
          }
          return null;
        };

        const foundArray = findArrayInObject(response);
        if (foundArray) {
          currencyArray = foundArray;
          console.log('[PAYMENTS API] Case 5: Found array via deep search');
        }
      }

      console.log('[PAYMENTS API] Extracted currencies count:', currencyArray.length);
      console.log('[PAYMENTS API] First 10 raw currencies:', currencyArray.slice(0, 10));

      if (currencyArray.length === 0) {
        throw new Error('No currencies returned from API');
      }

      // Normalize currencies to Currency objects
      const normalizedCurrencies: Currency[] = currencyArray.map((currency: any, index: number) => {
        // If it's already a string, convert to object
        if (typeof currency === 'string') {
          return {
            code: currency.toLowerCase(),
            name: currency.toUpperCase(),
            network: undefined,
            fullName: currency.toUpperCase()
          };
        }

        // If it's an object, extract the relevant fields
        if (typeof currency === 'object' && currency !== null) {
          return {
            code: currency.code || currency.ticker || currency.symbol || `currency-${index}`,
            name: currency.name || currency.displayName || currency.code || currency.ticker || currency.symbol || `Currency ${index}`,
            network: currency.network || currency.blockchain || undefined,
            fullName: currency.fullName || currency.displayName || currency.name || currency.code || `Currency ${index}`
          };
        }

        // Fallback for unexpected types
        console.warn('[PAYMENTS API] Unexpected currency type:', typeof currency, currency);
        return {
          code: `currency-${index}`,
          name: `Currency ${index}`,
          network: undefined,
          fullName: `Currency ${index}`
        };
      });

      console.log('[PAYMENTS API] Normalized currencies count:', normalizedCurrencies.length);
      console.log('[PAYMENTS API] First 10 normalized currencies:', normalizedCurrencies.slice(0, 10));

      return normalizedCurrencies;
    } catch (error) {
      console.error('[PAYMENTS API] Error fetching currencies:', error);
      throw new Error('Failed to load supported currencies');
    }
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
    return response.data.data || response.data;
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatusResponse> {
    const response = await apiClient.get(`${API_ENDPOINTS.PAYMENTS.STATUS}/${paymentId}`);
    return response.data.data || response.data;
  }
}

export const paymentService = new PaymentService();