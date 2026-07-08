import { createSign, createVerify } from 'crypto';
import { env } from '../../config/environment';

export type AntomAmount = {
  currency: string;
  value: string;
};

export type AntomApiResult = {
  resultCode?: string;
  resultStatus?: 'S' | 'F' | 'U' | string;
  resultMessage?: string;
};

export type AntomPaymentSessionResponse = {
  result?: AntomApiResult;
  normalUrl?: string;
  paymentSessionData?: string;
  paymentSessionExpiryTime?: string;
  paymentSessionId?: string;
};

export type AntomPaymentInquiryResponse = {
  result?: AntomApiResult;
  paymentRequestId?: string;
  paymentId?: string;
  paymentStatus?: string;
  paymentResultCode?: string;
  paymentResultMessage?: string;
  paymentAmount?: AntomAmount;
  actualPaymentAmount?: AntomAmount;
  paymentMethodType?: string;
  paymentResultInfo?: Record<string, unknown>;
  paymentTime?: string;
  transactions?: unknown[];
  [key: string]: unknown;
};

export type AntomCancelResponse = {
  result?: AntomApiResult;
  paymentRequestId?: string;
  paymentId?: string;
};

export type AntomRefundResponse = {
  result?: AntomApiResult;
  refundRequestId?: string;
  refundId?: string;
  paymentId?: string;
  refundAmount?: AntomAmount;
  refundStatus?: string;
};

type AntomOperation =
  | 'createPaymentSession'
  | 'inquiryPayment'
  | 'cancel'
  | 'refund';

const OPERATION_ENDPOINTS: Record<AntomOperation, string> = {
  createPaymentSession: '/v1/payments/createPaymentSession',
  inquiryPayment: '/v1/payments/inquiryPayment',
  cancel: '/v1/payments/cancel',
  refund: '/v1/payments/refund',
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const normalizeKeyBody = (key: string): string =>
  key
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');

const wrapPem = (key: string, label: 'PRIVATE KEY' | 'PUBLIC KEY'): string => {
  const normalized = normalizeKeyBody(key);
  const chunks = normalized.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${chunks.join('\n')}\n-----END ${label}-----`;
};

const parseSignatureHeader = (value?: string | null): string | null => {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;

  const signaturePart = normalized
    .split(',')
    .map(part => part.trim())
    .find(part => part.toLowerCase().startsWith('signature='));
  const rawSignature = signaturePart
    ? signaturePart.slice(signaturePart.indexOf('=') + 1)
    : normalized;
  const unquoted = rawSignature.replace(/^"|"$/g, '').trim();
  if (!unquoted) return null;

  try {
    return decodeURIComponent(unquoted);
  } catch {
    return unquoted;
  }
};

const parseRequestTime = (value: string): number | null => {
  const normalized = value.trim();
  if (!normalized) return null;
  if (/^\d+$/.test(normalized)) {
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const parsedDate = Date.parse(normalized);
  return Number.isFinite(parsedDate) ? parsedDate : null;
};

const redactBody = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(redactBody);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const lowered = key.toLowerCase();
    if (
      lowered.includes('signature') ||
      lowered.includes('sessiondata') ||
      lowered.includes('cardno') ||
      lowered.includes('cvv') ||
      lowered.includes('privatekey') ||
      lowered.includes('authorization')
    ) {
      redacted[key] = '[redacted]';
      continue;
    }
    redacted[key] = redactBody(entry);
  }
  return redacted;
};

export class AntomProviderError extends Error {
  readonly statusCode: number;
  readonly responseBody: unknown;

  constructor(message: string, statusCode: number, responseBody?: unknown) {
    super(message);
    this.name = 'AntomProviderError';
    this.statusCode = statusCode;
    this.responseBody = responseBody ?? null;
  }
}

export class AntomProvider {
  private buildApiUri(operation: AntomOperation): string {
    const environmentPrefix =
      env.ANTOM_ENVIRONMENT === 'production' ? '/ams/api' : '/ams/sandbox/api';
    return `${environmentPrefix}${OPERATION_ENDPOINTS[operation]}`;
  }

  private buildSignContent(params: {
    uri: string;
    clientId: string;
    requestTime: string;
    body: string;
  }): string {
    return `POST ${params.uri}\n${params.clientId}.${params.requestTime}.${params.body}`;
  }

  private signRequest(params: {
    uri: string;
    requestTime: string;
    body: string;
  }): string {
    const signer = createSign('RSA-SHA256');
    signer.update(
      this.buildSignContent({
        uri: params.uri,
        clientId: env.ANTOM_CLIENT_ID,
        requestTime: params.requestTime,
        body: params.body,
      })
    );
    signer.end();
    const signature = signer.sign(
      wrapPem(env.ANTOM_PRIVATE_KEY, 'PRIVATE KEY'),
      'base64'
    );
    return encodeURIComponent(signature);
  }

  verifySignature(params: {
    uri: string;
    clientId?: string | null;
    requestTime: string;
    body: string;
    signatureHeader?: string | null;
    enforceFreshness?: boolean;
  }): boolean {
    const clientId = params.clientId?.trim() || env.ANTOM_CLIENT_ID;
    const signature = parseSignatureHeader(params.signatureHeader);
    if (!signature) {
      return false;
    }
    if (params.enforceFreshness) {
      const timestamp = parseRequestTime(params.requestTime);
      if (timestamp === null) {
        return false;
      }
      const skew = Math.abs(Date.now() - timestamp);
      if (skew > env.ANTOM_WEBHOOK_MAX_SKEW_MS) {
        return false;
      }
    }

    const verifier = createVerify('RSA-SHA256');
    verifier.update(
      this.buildSignContent({
        uri: params.uri,
        clientId,
        requestTime: params.requestTime,
        body: params.body,
      })
    );
    verifier.end();

    return verifier.verify(
      wrapPem(env.ANTOM_PUBLIC_KEY, 'PUBLIC KEY'),
      signature,
      'base64'
    );
  }

  buildReceiptAck(): {
    result: {
      resultCode: 'SUCCESS';
      resultStatus: 'S';
      resultMessage: 'success';
    };
  } {
    return {
      result: {
        resultCode: 'SUCCESS',
        resultStatus: 'S',
        resultMessage: 'success',
      },
    };
  }

  buildFailureAck(message: string): {
    result: {
      resultCode: 'FAIL';
      resultStatus: 'F';
      resultMessage: string;
    };
  } {
    return {
      result: {
        resultCode: 'FAIL',
        resultStatus: 'F',
        resultMessage: message,
      },
    };
  }

  private async post<T>(
    operation: AntomOperation,
    payload: Record<string, unknown>
  ): Promise<T> {
    const uri = this.buildApiUri(operation);
    const requestTime = Date.now().toString();
    const body = JSON.stringify(payload);
    const signature = this.signRequest({ uri, requestTime, body });
    const response = await fetch(
      `${trimTrailingSlash(env.ANTOM_API_DOMAIN)}${uri}`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=UTF-8',
          'Client-Id': env.ANTOM_CLIENT_ID,
          'Request-Time': requestTime,
          Signature: `algorithm=RSA256,keyVersion=${env.ANTOM_KEY_VERSION},signature=${signature}`,
        },
        body,
        signal: globalThis.AbortSignal.timeout(env.ANTOM_REQUEST_TIMEOUT_MS),
      }
    );

    const responseText = await response.text();
    const responseTime = response.headers.get('response-time');
    const responseSignature = response.headers.get('signature');
    if (!responseTime || !responseSignature) {
      throw new AntomProviderError(
        'Antom response signature headers missing',
        response.status,
        { body: responseText ? '[raw body redacted]' : null }
      );
    }

    const signatureValid = this.verifySignature({
      uri,
      requestTime: responseTime,
      body: responseText,
      signatureHeader: responseSignature,
    });
    if (!signatureValid) {
      throw new AntomProviderError(
        'Antom response signature verification failed',
        response.status,
        { body: responseText ? '[raw body redacted]' : null }
      );
    }

    let parsed: unknown = null;
    if (responseText) {
      try {
        parsed = JSON.parse(responseText) as unknown;
      } catch {
        throw new AntomProviderError(
          'Antom response JSON parsing failed',
          response.status,
          { body: '[raw body redacted]' }
        );
      }
    }

    if (!response.ok) {
      throw new AntomProviderError(
        'Antom API request failed',
        response.status,
        redactBody(parsed)
      );
    }

    return parsed as T;
  }

  createPaymentSession(
    payload: Record<string, unknown>
  ): Promise<AntomPaymentSessionResponse> {
    return this.post<AntomPaymentSessionResponse>(
      'createPaymentSession',
      payload
    );
  }

  inquiryPayment(params: {
    paymentRequestId?: string | null;
    paymentId?: string | null;
  }): Promise<AntomPaymentInquiryResponse> {
    const payload: Record<string, unknown> = {};
    if (params.paymentRequestId) {
      payload['paymentRequestId'] = params.paymentRequestId;
    }
    if (params.paymentId) {
      payload['paymentId'] = params.paymentId;
    }
    return this.post<AntomPaymentInquiryResponse>('inquiryPayment', payload);
  }

  cancelPayment(params: {
    paymentRequestId?: string | null;
    paymentId?: string | null;
  }): Promise<AntomCancelResponse> {
    const payload: Record<string, unknown> = {};
    if (params.paymentRequestId) {
      payload['paymentRequestId'] = params.paymentRequestId;
    }
    if (params.paymentId) {
      payload['paymentId'] = params.paymentId;
    }
    return this.post<AntomCancelResponse>('cancel', payload);
  }

  refundPayment(params: {
    refundRequestId: string;
    paymentId: string;
    refundAmount: AntomAmount;
    refundReason?: string | null;
  }): Promise<AntomRefundResponse> {
    return this.post<AntomRefundResponse>('refund', {
      refundRequestId: params.refundRequestId,
      paymentId: params.paymentId,
      refundAmount: params.refundAmount,
      ...(params.refundReason ? { refundReason: params.refundReason } : {}),
    });
  }
}

export const antomProvider = new AntomProvider();
