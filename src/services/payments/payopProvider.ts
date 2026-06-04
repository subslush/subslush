import { createHash } from 'crypto';
import { env } from '../../config/environment';

type PayopApiEnvelope<T> = {
  data?: T;
  status?: number;
  message?: string;
};

type PayopInvoiceCreateResponse = {
  data?: string;
  status?: number;
  message?: string;
};

export type PayopInvoicePayload = {
  publicKey: string;
  order: {
    id: string;
    amount: string;
    currency: string;
    description?: string;
    items?: Array<{
      id: string;
      name: string;
      price: string;
    }>;
  };
  payer: {
    email: string;
    name?: string;
    phone?: string;
    extraFields?: Record<string, string>;
  };
  signature: string;
  language?: string;
  resultUrl?: string;
  failPath?: string;
  paymentMethod?: number;
  metadata?: Record<string, unknown>;
};

export type PayopInvoiceInfo = {
  identifier: string;
  status: number;
  type?: number | null;
  amount: number;
  currency: string;
  orderIdentifier: string;
  createdAt?: number | null;
  resultUrl?: string | null;
  failUrl?: string | null;
  payer?: {
    email?: string | null;
    name?: string | null;
    phone?: string | null;
  } | null;
  paymentMethod?: {
    identifier?: number | string | null;
    formType?: string | null;
  } | null;
  metadata?: Record<string, unknown> | null;
};

export type PayopAvailableMethod = {
  identifier: number;
  type: string;
  formType?: string | null;
  title: string;
  logo?: string | null;
  parentIdentifier?: number | null;
  pmIdentifier?: string | null;
  currencies: string[];
  countries: string[];
  config?: {
    fields?: Array<{
      name?: string | null;
      type?: string | null;
      title?: string | null;
      required?: boolean | null;
    }>;
  } | null;
};

export type PayopTransactionInfo = {
  identifier: string;
  amount: number;
  currency: string;
  state: number;
  error?: string | null;
  createdAt?: number | null;
  orderId?: string | null;
  resultUrl?: string | null;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const normalizeCurrency = (value: string): string => value.trim().toUpperCase();

const normalizeLanguage = (value?: string | null): string => {
  if (typeof value !== 'string') {
    return 'en';
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : 'en';
};

const safeParseJson = async <T>(response: Response): Promise<T | null> => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

export class PayopProviderError extends Error {
  readonly statusCode: number;
  readonly responseBody: unknown;

  constructor(message: string, statusCode: number, responseBody?: unknown) {
    super(message);
    this.name = 'PayopProviderError';
    this.statusCode = statusCode;
    this.responseBody = responseBody ?? null;
  }
}

export class PayopProvider {
  formatAmountFromCents(amountCents: number): string {
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new Error('Payop amount cents must be a positive integer');
    }
    return (Math.round(amountCents) / 100).toFixed(2);
  }

  generateInvoiceSignature(params: {
    amount: string;
    currency: string;
    orderId: string;
  }): string {
    const currency = normalizeCurrency(params.currency);
    return createHash('sha256')
      .update(
        `${params.amount}:${currency}:${params.orderId.trim()}:${env.PAYOP_SECRET_KEY}`
      )
      .digest('hex');
  }

  buildInvoicePreprocessingUrl(params: {
    invoiceId: string;
    language?: string | null;
  }): string {
    const invoiceId = params.invoiceId.trim();
    if (!invoiceId) {
      throw new Error('Payop invoice ID is required');
    }

    return `${trimTrailingSlash(env.PAYOP_CHECKOUT_BASE_URL)}/${normalizeLanguage(params.language)}/payment/invoice-preprocessing/${invoiceId}`;
  }

  async createInvoice(
    payload: PayopInvoicePayload
  ): Promise<{ invoiceId: string; payloadStatus: number | null }> {
    const response = await fetch(
      `${trimTrailingSlash(env.PAYOP_INVOICE_BASE_URL)}/v1/invoices/create`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const body = await safeParseJson<PayopInvoiceCreateResponse>(response);
    if (!response.ok) {
      throw new PayopProviderError(
        body?.message || 'Payop invoice creation failed',
        response.status,
        body
      );
    }

    const identifierHeader = response.headers.get('identifier');
    const invoiceId = identifierHeader?.trim() || '';
    if (!invoiceId) {
      throw new PayopProviderError(
        'Payop invoice identifier header missing',
        response.status,
        body
      );
    }

    return {
      invoiceId,
      payloadStatus:
        typeof body?.status === 'number' ? Math.round(body.status) : null,
    };
  }

  async getInvoice(invoiceId: string): Promise<PayopInvoiceInfo> {
    const normalizedInvoiceId = invoiceId.trim();
    const response = await fetch(
      `${trimTrailingSlash(env.PAYOP_INVOICE_BASE_URL)}/v1/invoices/${encodeURIComponent(normalizedInvoiceId)}`,
      {
        headers: {
          Accept: 'application/json',
        },
      }
    );

    const body =
      await safeParseJson<PayopApiEnvelope<PayopInvoiceInfo>>(response);
    if (!response.ok || !body?.data) {
      throw new PayopProviderError(
        body?.message || 'Payop invoice lookup failed',
        response.status,
        body
      );
    }

    return body.data;
  }

  async listAvailablePaymentMethods(
    projectId: string
  ): Promise<PayopAvailableMethod[]> {
    const response = await fetch(
      `${trimTrailingSlash(env.PAYOP_API_BASE_URL)}/v1/instrument-settings/payment-methods/available-for-application/${encodeURIComponent(projectId.trim())}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${env.PAYOP_JWT_TOKEN}`,
        },
      }
    );

    const body =
      await safeParseJson<PayopApiEnvelope<PayopAvailableMethod[]>>(response);
    if (!response.ok || !Array.isArray(body?.data)) {
      throw new PayopProviderError(
        body?.message || 'Payop method lookup failed',
        response.status,
        body
      );
    }

    return body.data.map(method => ({
      ...method,
      identifier: Number(method.identifier),
      currencies: Array.isArray(method.currencies)
        ? method.currencies
            .map(currency => normalizeCurrency(currency))
            .filter(currency => currency.length > 0)
        : [],
      countries: Array.isArray(method.countries)
        ? method.countries
            .map(country => country.trim().toUpperCase())
            .filter(country => country.length > 0)
        : [],
    }));
  }

  async getTransactionDetails(
    transactionId: string
  ): Promise<PayopTransactionInfo> {
    const normalizedTransactionId = transactionId.trim();
    const response = await fetch(
      `${trimTrailingSlash(env.PAYOP_API_BASE_URL)}/v2/transactions/${encodeURIComponent(normalizedTransactionId)}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${env.PAYOP_JWT_TOKEN}`,
        },
      }
    );

    const body =
      await safeParseJson<PayopApiEnvelope<PayopTransactionInfo>>(response);
    if (!response.ok || !body?.data) {
      throw new PayopProviderError(
        body?.message || 'Payop transaction lookup failed',
        response.status,
        body
      );
    }

    return body.data;
  }
}

export const payopProvider = new PayopProvider();
