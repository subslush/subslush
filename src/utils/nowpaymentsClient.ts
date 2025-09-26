import { env } from '../config/environment';
import { Logger } from './logger';
import {
  NOWPaymentsCreateInvoiceRequest,
  NOWPaymentsCreateInvoiceResponse,
  NOWPaymentsCreatePaymentRequest,
  NOWPaymentsCreatePaymentResponse,
  NOWPaymentsPaymentStatus,
  NOWPaymentsCurrenciesResponse,
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

    // Enhanced logging for debugging
    Logger.info('NOWPayments client initialized', {
      baseURL: this.baseURL,
      sandboxMode: this.sandboxMode,
      apiKeyPrefix: this.apiKey.substring(0, 8) + '...',
    });

    if (this.sandboxMode) {
      Logger.warn(
        'NOWPayments client running in SANDBOX mode - not suitable for production!'
      );
    } else {
      Logger.info('NOWPayments client running in PRODUCTION mode');
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
      Logger.debug(
        `NOWPayments API request: ${options.method || 'GET'} ${url}`
      );

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

        const errorData = data as { message?: string };
        throw new NOWPaymentsError(
          errorData.message ||
            `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          data
        );
      }

      Logger.debug(`NOWPayments API response:`, {
        status: response.status,
        data,
      });
      return data as T;
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

  // Get available currencies (returns string array)
  async getCurrencies(): Promise<string[]> {
    try {
      const response =
        await this.makeRequest<NOWPaymentsCurrenciesResponse>('/currencies');

      Logger.debug('NOWPayments currencies API response:', response);

      // Handle both possible response formats for robustness
      if (Array.isArray(response)) {
        // Direct array response
        return response;
      } else if (response.currencies && Array.isArray(response.currencies)) {
        // Wrapped in currencies property
        return response.currencies;
      } else {
        Logger.error('Unexpected currencies API response format:', response);
        throw new NOWPaymentsError('Invalid currencies response format');
      }
    } catch (error) {
      Logger.error('Error fetching currencies:', error);
      throw error;
    }
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

  // Create direct payment
  async createPayment(
    request: NOWPaymentsCreatePaymentRequest
  ): Promise<NOWPaymentsCreatePaymentResponse> {
    Logger.info('Creating NOWPayments direct payment:', {
      orderId: request.order_id,
      amount: request.price_amount,
      currency: request.price_currency,
      payCurrency: request.pay_currency,
    });

    return this.makeRequest('/payment', {
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

  // Enhanced health check with detailed validation
  async healthCheck(): Promise<boolean> {
    try {
      Logger.info('Starting NOWPayments health check...');

      // Check API status
      const status = await this.getStatus();
      Logger.debug('NOWPayments API status:', status);

      // Validate we can fetch currencies
      const currencies = await this.getCurrencies();
      Logger.debug(
        `NOWPayments currencies check: received ${currencies.length} currencies`
      );

      if (currencies.length === 0) {
        Logger.error('NOWPayments health check failed: no currencies returned');
        return false;
      }

      // Check if common currencies are available
      const requiredCurrencies = ['btc', 'eth', 'usdt'];
      const availableCurrencies = currencies.map(c => c.toLowerCase());
      const missingCurrencies = requiredCurrencies.filter(
        c => !availableCurrencies.includes(c)
      );

      if (missingCurrencies.length > 0) {
        Logger.warn(
          `NOWPayments health check: missing required currencies: ${missingCurrencies.join(', ')}`
        );
      }

      Logger.info('NOWPayments health check passed successfully');
      return true;
    } catch (error) {
      Logger.error('NOWPayments health check failed:', error);
      return false;
    }
  }

  // Validate NOWPayments configuration and API connectivity
  async validateConfiguration(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Validate API key format
      if (!this.apiKey || this.apiKey.length < 10) {
        errors.push('Invalid API key format');
      }

      // Validate base URL
      if (!this.baseURL.startsWith('https://')) {
        errors.push('Base URL must use HTTPS');
      }

      // Test API connectivity
      try {
        const status = await this.getStatus();
        if (!status.message) {
          errors.push('API status endpoint returned unexpected format');
        }
      } catch (error) {
        errors.push(
          `API connectivity test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }

      // Log configuration summary
      Logger.info('NOWPayments configuration validation:', {
        valid: errors.length === 0,
        sandboxMode: this.sandboxMode,
        baseURL: this.baseURL,
        apiKeyProvided: !!this.apiKey,
        errors: errors.length > 0 ? errors : undefined,
      });

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      const errorMessage = `Configuration validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errorMessage);
      Logger.error(errorMessage, error);

      return {
        valid: false,
        errors,
      };
    }
  }

  // Get popular currencies (subset of all currencies)
  // Note: Since API only returns currency codes, we define popular ones
  async getPopularCurrencies(): Promise<string[]> {
    const currencies = await this.getCurrencies();
    const popularCurrencies = [
      'btc',
      'eth',
      'usdt',
      'usdc',
      'ltc',
      'bch',
      'xrp',
      'ada',
      'dot',
      'matic',
    ];
    return currencies.filter(currency =>
      popularCurrencies.includes(currency.toLowerCase())
    );
  }

  // Get stable currencies (USDT, USDC, etc.)
  async getStableCurrencies(): Promise<string[]> {
    const currencies = await this.getCurrencies();
    const stableCurrencies = [
      'usdt',
      'usdc',
      'usdp',
      'dai',
      'busd',
      'tusd',
      'usdcbsc',
      'usdttrc20',
    ];
    return currencies.filter(currency =>
      stableCurrencies.includes(currency.toLowerCase())
    );
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
      return currencies.some(c => c.toLowerCase() === currency.toLowerCase());
    } catch (error) {
      Logger.error('Error checking currency support:', error);
      return false;
    }
  }

  // Get currency info (basic info from ticker)
  async getCurrencyInfo(
    currency: string
  ): Promise<{ ticker: string; supported: boolean } | null> {
    try {
      const currencies = await this.getCurrencies();
      const isSupported = currencies.some(
        c => c.toLowerCase() === currency.toLowerCase()
      );
      return isSupported
        ? { ticker: currency.toLowerCase(), supported: true }
        : null;
    } catch (error) {
      Logger.error('Error getting currency info:', error);
      return null;
    }
  }
}

// Export singleton instance
export const nowpaymentsClient = new NOWPaymentsClient();
