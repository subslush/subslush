import { createHash, timingSafeEqual } from 'crypto';
import { env } from '../../config/environment';

export type Pay4bitHostedCheckoutRequest = {
  account: string;
  description: string;
  amount: string;
  currency: string;
};

export type Pay4bitHostedCheckoutPayload = {
  publicKey: string;
  account: string;
  description: string;
  sum: string;
  currency: string;
  checkSign: string;
  checkoutUrl: string;
};

const normalizeHex = (value: string): Buffer | null => {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]+$/i.test(normalized)) {
    return null;
  }
  if (normalized.length % 2 !== 0) {
    return null;
  }
  return Buffer.from(normalized, 'hex');
};

const secureHexEqual = (left: string, right: string): boolean => {
  const leftBuffer = normalizeHex(left);
  const rightBuffer = normalizeHex(right);
  if (!leftBuffer || !rightBuffer) {
    return false;
  }
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
};

const normalizeAmountString = (value: string): string => {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error('Pay4bit amount must be a positive number');
  }
  return numeric.toFixed(2);
};

const buildPayEndpoint = (): string => {
  const base = env.PAY4BIT_BASE_URL.replace(/\/+$/, '');
  return base.endsWith('/pay') ? base : `${base}/pay`;
};

export class Pay4bitProvider {
  formatAmountFromCents(amountCents: number): string {
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      throw new Error('Pay4bit amount cents must be a positive integer');
    }
    return (amountCents / 100).toFixed(2);
  }

  generateCheckSign(params: {
    description: string;
    account: string;
    amount: string;
  }): string {
    return createHash('sha256')
      .update(
        `${params.description}${params.account}${params.amount}${env.PAY4BIT_SECRET_KEY}`
      )
      .digest('hex');
  }

  generateSign(params: {
    localpayId: string;
    account: string;
    sum: string;
  }): string {
    return createHash('md5')
      .update(
        `${params.localpayId}${params.account}${params.sum}${env.PAY4BIT_SECRET_KEY}`
      )
      .digest('hex');
  }

  verifyCheckSign(params: {
    provided: string;
    description: string;
    account: string;
    amount: string;
  }): boolean {
    const expected = this.generateCheckSign({
      description: params.description,
      account: params.account,
      amount: params.amount,
    });
    return secureHexEqual(params.provided, expected);
  }

  verifySign(params: {
    provided: string;
    localpayId: string;
    account: string;
    sum: string;
  }): boolean {
    const expected = this.generateSign({
      localpayId: params.localpayId,
      account: params.account,
      sum: params.sum,
    });
    return secureHexEqual(params.provided, expected);
  }

  buildHostedCheckoutUrl(
    request: Pay4bitHostedCheckoutRequest
  ): Pay4bitHostedCheckoutPayload {
    const amount = normalizeAmountString(request.amount);
    const currency = request.currency.trim().toUpperCase();
    if (!currency) {
      throw new Error('Pay4bit currency is required');
    }

    const account = request.account.trim();
    const description = request.description.trim();
    if (!account) {
      throw new Error('Pay4bit account is required');
    }
    if (!description) {
      throw new Error('Pay4bit description is required');
    }

    const checkSign = this.generateCheckSign({
      description,
      account,
      amount,
    });

    const url = new globalThis.URL(buildPayEndpoint());
    url.searchParams.set('public_key', env.PAY4BIT_PUBLIC_KEY);
    url.searchParams.set('sum', amount);
    url.searchParams.set('account', account);
    url.searchParams.set('desc', description);
    url.searchParams.set('currency', currency);
    // The docs use the sign field for the SHA256 check_sign payload.
    url.searchParams.set('sign', checkSign);
    // Also send an explicit check_sign field for clarity.
    url.searchParams.set('check_sign', checkSign);

    return {
      publicKey: env.PAY4BIT_PUBLIC_KEY,
      account,
      description,
      sum: amount,
      currency,
      checkSign,
      checkoutUrl: url.toString(),
    };
  }
}

export const pay4bitProvider = new Pay4bitProvider();
