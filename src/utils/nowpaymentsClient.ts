import { env } from '../config/environment';
import { Logger } from './logger';
import {
  NOWPaymentsCreateInvoiceRequest,
  NOWPaymentsCreateInvoiceResponse,
  NOWPaymentsPaymentStatus,
  NOWPaymentsCurrency,
  PaymentEstimate,
} from '../types/payment';

export class NOWPaymentsError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'NOWPaymentsError';
  }
}

export class NOWPaymentsClient {
  private readonly baseURL: string;
  private readonly apiKey: string;
  private readonly sandboxMode: boolean;

  constructor() {
    this.baseURL = env.NOWPAYMENTS_BASE_URL;
    this.apiKey = env.NOWPAYMENTS_API_KEY;
    this.sandboxMode = env.NOWPAYMENTS_SANDBOX_MODE;

    if (this.sandboxMode) {
      Logger.info('NOWPayments client initialized in SANDBOX mode');
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    options: any = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;

    const headers = {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.sandboxMode) {
      headers['x-sandbox'] = 'true';
    }

    try {
      Logger.debug(`NOWPayments API request: ${options.method || 'GET'} ${url}`);

      const response = await globalThis.fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        Logger.error(`NOWPayments API error:`, {
          status: response.status,
          statusText: response.statusText,
          data,
          url,
        });

        throw new NOWPaymentsError(
          data.message || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          data
        );
      }

      Logger.debug(`NOWPayments API response:`, { status: response.status, data });
      return data;
    } catch (error) {
      if (error instanceof NOWPaymentsError) {
        throw error;
      }

      Logger.error(`NOWPayments API request failed:`, error);
      throw new NOWPaymentsError(
        `Network error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Get API status
  async getStatus(): Promise<{ message: string }> {
    return this.makeRequest('/status');
  }

  // Get available currencies
  async getCurrencies(): Promise<NOWPaymentsCurrency[]> {
    return this.makeRequest('/currencies');
  }

  // Get estimate for cryptocurrency conversion
  async getEstimate(params: {
    amount: number;
    currency_from: string;
    currency_to: string;
  }): Promise<PaymentEstimate> {
    const query = new globalThis.URLSearchParams({
      amount: params.amount.toString(),
      currency_from: params.currency_from,
      currency_to: params.currency_to,
    });

    return this.makeRequest(`/estimate?${query}`);
  }

  // Get minimum payment amount
  async getMinAmount(params: {
    currency_from: string;
    currency_to: string;
  }): Promise<{ min_amount: number }> {
    const query = new globalThis.URLSearchParams({
      currency_from: params.currency_from,
      currency_to: params.currency_to,
    });

    return this.makeRequest(`/min-amount?${query}`);
  }

  // Create payment invoice
  async createInvoice(
    request: NOWPaymentsCreateInvoiceRequest
  ): Promise<NOWPaymentsCreateInvoiceResponse> {
    Logger.info('Creating NOWPayments invoice:', {
      orderId: request.order_id,
      amount: request.price_amount,
      currency: request.price_currency,
      payCurrency: request.pay_currency,
    });

    return this.makeRequest('/invoice', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // Get payment status
  async getPaymentStatus(paymentId: string): Promise<NOWPaymentsPaymentStatus> {
    return this.makeRequest(`/payment/${paymentId}`);
  }

  // List payments (for admin/debugging)
  async listPayments(params?: {
    limit?: number;
    offset?: number;
    sortBy?: string;
    orderBy?: 'asc' | 'desc';
    dateFrom?: string;
    dateTo?: string;
  }): Promise<{ data: NOWPaymentsPaymentStatus[]; total: number }> {
    let query = '';
    if (params) {
      const searchParams = new globalThis.URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, value.toString());
        }
      });
      query = `?${searchParams}`;
    }

    return this.makeRequest(`/payments${query}`);
  }

  // Verify IPN signature
  verifyIPNSignature(payload: string, signature: string): boolean {
    try {
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha512', env.NOWPAYMENTS_IPN_SECRET)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      Logger.error('Error verifying IPN signature:', error);
      return false;
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      await this.getStatus();
      return true;
    } catch (error) {
      Logger.error('NOWPayments health check failed:', error);
      return false;
    }
  }

  // Get popular currencies (subset of all currencies)
  async getPopularCurrencies(): Promise<NOWPaymentsCurrency[]> {
    const currencies = await this.getCurrencies();
    return currencies.filter(currency => currency.is_popular);
  }

  // Get stable currencies (USDT, USDC, etc.)
  async getStableCurrencies(): Promise<NOWPaymentsCurrency[]> {
    const currencies = await this.getCurrencies();
    return currencies.filter(currency => currency.is_stable);
  }

  // Format amount for display
  formatAmount(amount: number, currency: string): string {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: currency.toLowerCase() === 'btc' ? 8 : 2,
      maximumFractionDigits: currency.toLowerCase() === 'btc' ? 8 : 8,
    });

    return `${formatter.format(amount)} ${currency.toUpperCase()}`;
  }

  // Check if currency is supported
  async isCurrencySupported(currency: string): Promise<boolean> {
    try {
      const currencies = await this.getCurrencies();
      return currencies.some(c => c.ticker.toLowerCase() === currency.toLowerCase());
    } catch (error) {
      Logger.error('Error checking currency support:', error);
      return false;
    }
  }

  // Get currency info
  async getCurrencyInfo(currency: string): Promise<NOWPaymentsCurrency | null> {
    try {
      const currencies = await this.getCurrencies();
      return currencies.find(c => c.ticker.toLowerCase() === currency.toLowerCase()) || null;
    } catch (error) {
      Logger.error('Error getting currency info:', error);
      return null;
    }
  }
}

// Export singleton instance
export const nowpaymentsClient = new NOWPaymentsClient();