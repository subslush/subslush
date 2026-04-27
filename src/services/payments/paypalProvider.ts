import { env } from '../../config/environment';
import { Logger } from '../../utils/logger';

export class PayPalProviderError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public debugId?: string | null,
    public response?: unknown
  ) {
    super(message);
    this.name = 'PayPalProviderError';
  }
}

type PayPalTokenCache = {
  accessToken: string;
  expiresAtMs: number;
} | null;

type PayPalLink = {
  href?: string;
  rel?: string;
  method?: string;
};

type PayPalApiErrorResponse = {
  name?: string;
  message?: string;
  details?: Array<{ issue?: string; description?: string }>;
  debug_id?: string;
};

export type PayPalCreateOrderInput = {
  orderId: string;
  amountCents: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  requestId: string;
  description?: string | null;
  customerEmail?: string | null;
};

export type PayPalCreateOrderResult = {
  id: string;
  status?: string;
  links?: PayPalLink[];
  approvalUrl: string;
  debugId: string | null;
};

export type PayPalCaptureOrderInput = {
  paypalOrderId: string;
  requestId: string;
};

export type PayPalCaptureOrderResult = {
  id: string;
  status?: string;
  purchase_units?: Array<{
    reference_id?: string;
    amount?: {
      currency_code?: string;
      value?: string;
    };
    payments?: {
      captures?: Array<{
        id?: string;
        status?: string;
        amount?: {
          currency_code?: string;
          value?: string;
        };
      }>;
    };
  }>;
  payer?: {
    payer_id?: string;
    email_address?: string;
  };
  debugId: string | null;
};

export type PayPalGetOrderResult = {
  id: string;
  status?: string;
  links?: PayPalLink[];
  purchase_units?: Array<{
    reference_id?: string;
    amount?: {
      currency_code?: string;
      value?: string;
    };
  }>;
  payer?: {
    payer_id?: string;
    email_address?: string;
  };
  debugId: string | null;
};

export type PayPalWebhookVerificationInput = {
  transmissionId: string;
  transmissionTime: string;
  certUrl: string;
  authAlgo: string;
  transmissionSig: string;
  webhookEvent: Record<string, unknown>;
  webhookId?: string;
};

type PayPalRequestOptions = {
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  idempotencyKey?: string;
  accessToken?: string;
};

const PAYPAL_API_SANDBOX_BASE = 'https://api-m.sandbox.paypal.com';
const PAYPAL_API_LIVE_BASE = 'https://api-m.paypal.com';
const TOKEN_EXPIRY_SKEW_MS = 60_000;

export class PayPalProvider {
  private tokenCache: PayPalTokenCache = null;

  private getBaseUrl(): string {
    return env.PAYPAL_MODE === 'live'
      ? PAYPAL_API_LIVE_BASE
      : PAYPAL_API_SANDBOX_BASE;
  }

  private ensureEnabled(): void {
    if (!env.PAYPAL_ENABLED) {
      throw new PayPalProviderError('PayPal is disabled by configuration');
    }
    if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
      throw new PayPalProviderError(
        'PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET are required when PayPal is enabled'
      );
    }
  }

  private buildBasicAuth(): string {
    const raw = `${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`;
    return Buffer.from(raw, 'utf8').toString('base64');
  }

  private extractDebugId(
    headers: Headers,
    body: unknown
  ): string | null | undefined {
    const headerDebugId = headers.get('paypal-debug-id');
    if (headerDebugId) {
      return headerDebugId;
    }
    if (
      body &&
      typeof body === 'object' &&
      typeof (body as { debug_id?: unknown }).debug_id === 'string'
    ) {
      return (body as { debug_id: string }).debug_id;
    }
    return null;
  }

  private async parseResponse(response: Response): Promise<{
    data: unknown;
    debugId: string | null | undefined;
  }> {
    const contentType = response.headers.get('content-type') || '';
    let data: unknown = null;

    if (contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = text.length > 0 ? text : null;
    }

    return {
      data,
      debugId: this.extractDebugId(response.headers, data),
    };
  }

  private mapErrorMessage(
    fallback: string,
    data: unknown
  ): {
    message: string;
    details: unknown;
    debugId: string | null;
  } {
    if (!data || typeof data !== 'object') {
      return { message: fallback, details: data, debugId: null };
    }

    const payload = data as PayPalApiErrorResponse;
    const details =
      Array.isArray(payload.details) && payload.details.length > 0
        ? payload.details
            .map(detail => detail.description || detail.issue)
            .filter(Boolean)
            .join('; ')
        : null;

    const message =
      payload.message ||
      [payload.name, details].filter(Boolean).join(': ') ||
      fallback;

    return {
      message,
      details: payload,
      debugId: typeof payload.debug_id === 'string' ? payload.debug_id : null,
    };
  }

  private async fetchWithTimeout(
    url: string,
    init: NonNullable<Parameters<typeof globalThis.fetch>[1]>
  ): Promise<Response> {
    const signal = globalThis.AbortSignal.timeout(env.PAYPAL_HTTP_TIMEOUT_MS);
    return globalThis.fetch(url, { ...init, signal });
  }

  private async fetchAccessToken(): Promise<string> {
    this.ensureEnabled();

    const now = Date.now();
    if (
      this.tokenCache &&
      this.tokenCache.expiresAtMs - TOKEN_EXPIRY_SKEW_MS > now
    ) {
      return this.tokenCache.accessToken;
    }

    const tokenUrl = `${this.getBaseUrl()}/v1/oauth2/token`;
    const headers = {
      Authorization: `Basic ${this.buildBasicAuth()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };

    try {
      const response = await this.fetchWithTimeout(tokenUrl, {
        method: 'POST',
        headers,
        body: 'grant_type=client_credentials',
      });
      const parsed = await this.parseResponse(response);

      if (!response.ok) {
        const mapped = this.mapErrorMessage(
          'Failed to fetch PayPal OAuth token',
          parsed.data
        );
        throw new PayPalProviderError(
          mapped.message,
          response.status,
          mapped.debugId ?? parsed.debugId ?? null,
          mapped.details
        );
      }

      if (
        !parsed.data ||
        typeof parsed.data !== 'object' ||
        typeof (parsed.data as { access_token?: unknown }).access_token !==
          'string' ||
        typeof (parsed.data as { expires_in?: unknown }).expires_in !== 'number'
      ) {
        throw new PayPalProviderError(
          'Invalid PayPal OAuth response payload',
          response.status,
          parsed.debugId ?? null,
          parsed.data
        );
      }

      const accessToken = (parsed.data as { access_token: string })
        .access_token;
      const expiresInSeconds = (parsed.data as { expires_in: number })
        .expires_in;

      this.tokenCache = {
        accessToken,
        expiresAtMs: Date.now() + Math.max(60, expiresInSeconds) * 1000,
      };

      return accessToken;
    } catch (error) {
      if (error instanceof PayPalProviderError) {
        throw error;
      }
      throw new PayPalProviderError(
        `Failed to fetch PayPal OAuth token: ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }

  private async request<T>(
    path: string,
    options: PayPalRequestOptions = {}
  ): Promise<{
    data: T;
    debugId: string | null;
    statusCode: number;
  }> {
    const token = options.accessToken || (await this.fetchAccessToken());
    const url = `${this.getBaseUrl()}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };

    if (options.idempotencyKey) {
      headers['PayPal-Request-Id'] = options.idempotencyKey;
    }

    try {
      const response = await this.fetchWithTimeout(url, {
        method: options.method || 'GET',
        headers,
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      });
      const parsed = await this.parseResponse(response);
      const debugId = parsed.debugId ?? null;

      if (!response.ok) {
        const mapped = this.mapErrorMessage(
          `PayPal request failed (${path})`,
          parsed.data
        );
        throw new PayPalProviderError(
          mapped.message,
          response.status,
          mapped.debugId ?? debugId,
          mapped.details
        );
      }

      return {
        data: parsed.data as T,
        debugId,
        statusCode: response.status,
      };
    } catch (error) {
      if (error instanceof PayPalProviderError) {
        if (error.statusCode === 401) {
          this.tokenCache = null;
        }
        throw error;
      }
      throw new PayPalProviderError(
        `PayPal request failed (${path}): ${error instanceof Error ? error.message : 'unknown error'}`
      );
    }
  }

  private amountValueFromCents(amountCents: number): string {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new PayPalProviderError(
        `PayPal amount must be a positive integer in cents, got: ${amountCents}`
      );
    }
    return (amountCents / 100).toFixed(2);
  }

  private resolveApprovalUrl(links: PayPalLink[] | undefined): string | null {
    if (!Array.isArray(links)) {
      return null;
    }
    for (const rel of ['approve', 'payer-action']) {
      const link = links.find(
        entry =>
          typeof entry?.rel === 'string' &&
          entry.rel.toLowerCase() === rel &&
          typeof entry?.href === 'string'
      );
      if (link?.href) {
        return link.href;
      }
    }
    return null;
  }

  async createOrder(
    input: PayPalCreateOrderInput
  ): Promise<PayPalCreateOrderResult> {
    const currency = input.currency.trim().toUpperCase();
    const description =
      typeof input.description === 'string' &&
      input.description.trim().length > 0
        ? input.description.trim().slice(0, 127)
        : `Order ${input.orderId}`;
    const customerEmail =
      typeof input.customerEmail === 'string' &&
      input.customerEmail.trim().length > 0
        ? input.customerEmail.trim().toLowerCase()
        : null;

    const payload = {
      intent: 'CAPTURE',
      ...(customerEmail ? { payer: { email_address: customerEmail } } : {}),
      purchase_units: [
        {
          reference_id: input.orderId,
          custom_id: input.orderId,
          description,
          amount: {
            currency_code: currency,
            value: this.amountValueFromCents(input.amountCents),
          },
        },
      ],
      application_context: {
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
        return_url: input.successUrl,
        cancel_url: input.cancelUrl,
      },
    };

    const result = await this.request<{
      id: string;
      status?: string;
      links?: PayPalLink[];
    }>('/v2/checkout/orders', {
      method: 'POST',
      idempotencyKey: input.requestId,
      body: payload,
    });

    const approvalUrl = this.resolveApprovalUrl(result.data.links);
    if (!approvalUrl) {
      throw new PayPalProviderError(
        'PayPal order response missing approval link',
        result.statusCode,
        result.debugId,
        result.data
      );
    }

    return {
      id: result.data.id,
      ...(typeof result.data.status === 'string'
        ? { status: result.data.status }
        : {}),
      ...(Array.isArray(result.data.links) ? { links: result.data.links } : {}),
      approvalUrl,
      debugId: result.debugId,
    };
  }

  async captureOrder(
    input: PayPalCaptureOrderInput
  ): Promise<PayPalCaptureOrderResult> {
    const result = await this.request<PayPalCaptureOrderResult>(
      `/v2/checkout/orders/${encodeURIComponent(input.paypalOrderId)}/capture`,
      {
        method: 'POST',
        idempotencyKey: input.requestId,
        body: {},
      }
    );

    return {
      ...result.data,
      debugId: result.debugId,
    };
  }

  async getOrder(paypalOrderId: string): Promise<PayPalGetOrderResult> {
    const result = await this.request<PayPalGetOrderResult>(
      `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`
    );

    return {
      ...result.data,
      debugId: result.debugId,
    };
  }

  async verifyWebhookSignature(
    input: PayPalWebhookVerificationInput
  ): Promise<boolean> {
    const webhookId = (input.webhookId || env.PAYPAL_WEBHOOK_ID || '').trim();
    if (!webhookId) {
      Logger.warn('PayPal webhook verification skipped: missing webhook ID');
      return false;
    }

    const result = await this.request<{ verification_status?: string }>(
      '/v1/notifications/verify-webhook-signature',
      {
        method: 'POST',
        body: {
          transmission_id: input.transmissionId,
          transmission_time: input.transmissionTime,
          cert_url: input.certUrl,
          auth_algo: input.authAlgo,
          transmission_sig: input.transmissionSig,
          webhook_id: webhookId,
          webhook_event: input.webhookEvent,
        },
      }
    );

    const verified =
      typeof result.data.verification_status === 'string' &&
      result.data.verification_status.toUpperCase() === 'SUCCESS';

    if (!verified) {
      Logger.warn('PayPal webhook signature verification failed', {
        verificationStatus:
          typeof result.data.verification_status === 'string'
            ? result.data.verification_status
            : null,
        transmissionId: input.transmissionId,
      });
    }

    return verified;
  }
}

export const paypalProvider = new PayPalProvider();
