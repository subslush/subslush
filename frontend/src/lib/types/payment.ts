import type { Subscription, UpgradeOptions } from './subscription.js';

export type PaymentStatus =
  | 'waiting'
  | 'confirming'
  | 'confirmed'
  | 'sending'
  | 'partially_paid'
  | 'finished'
  | 'failed'
  | 'refunded'
  | 'expired';

export interface ResumablePayment {
  paymentId: string;
  payAddress: string;
  payAmount: number;
  payCurrency: string;
  expiresAt?: string | Date | null;
  status?: PaymentStatus | null;
}
export type UnifiedPaymentStatus =
  | 'pending'
  | 'requires_payment_method'
  | 'requires_action'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'expired';

export interface CreatePaymentRequest {
  creditAmount: number;
  price_currency: string;
  pay_currency: string;
  orderDescription?: string;
}

export interface CreatePaymentResponse {
  paymentId: string;
  payAddress: string;
  payAmount: number;
  payCurrency: string;
  expiresAt: string;
  status: PaymentStatus;
}

export interface PaymentStatusResponse {
  paymentId: string;
  status: PaymentStatus;
  creditAmount: number;
  payAmount: number;
  payCurrency: string;
  actuallyPaid?: number;
  blockchainHash?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Currency {
  code: string;
  name: string;
  baseCode?: string;
  networkCode?: string;
  network?: string;
  fullName?: string;
  image?: string;
  isPopular?: boolean;
  isStable?: boolean;
}

export interface PaymentEstimate {
  estimatedAmount: number;
  currency: string;
}

export interface MinDepositResponse {
  currency: string;
  minAmount: number;
  fiatEquivalent?: number;
  minUsd: number;
  internalMinUsd: number;
}

export type CheckoutPaymentMethod = 'stripe' | 'credits';

export interface CheckoutRequest {
  variant_id: string;
  duration_months?: number;
  payment_method?: CheckoutPaymentMethod;
  auto_renew?: boolean;
  currency?: string;
  coupon_code?: string;
}

export interface CheckoutResponseStripe {
  payment_method: 'stripe';
  order_id: string;
  paymentId?: string | null;
  sessionId: string;
  sessionUrl: string;
  amount: number;
  currency: string;
  checkoutKey?: string;
  status?: UnifiedPaymentStatus;
  upgrade_options?: UpgradeOptions | null;
}

export interface CheckoutResponseCredits {
  payment_method: 'credits';
  order_id: string;
  subscription: Subscription;
  transaction: {
    transaction_id: string;
    amount_debited: number;
    balance_after: number;
  };
  upgrade_options?: UpgradeOptions | null;
}

export type CheckoutResponse = CheckoutResponseStripe | CheckoutResponseCredits;

export interface CheckoutCancelRequest {
  order_id: string;
  payment_id?: string;
  reason?: string;
  checkout_key?: string;
}

export interface CheckoutCancelResponse {
  cancelled: boolean;
  status: string;
}

export interface PaymentQuoteRequest {
  variant_id: string;
  duration_months?: number;
  currency?: string;
  coupon_code?: string;
}

export interface PaymentQuoteResponse {
  subtotal_cents: number;
  term_discount_cents: number;
  coupon_discount_cents: number;
  total_cents: number;
  currency: string;
}
