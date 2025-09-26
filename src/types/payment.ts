export type PaymentStatus =
  | 'pending'
  | 'confirming'
  | 'confirmed'
  | 'sending'
  | 'partially_paid'
  | 'finished'
  | 'failed'
  | 'refunded'
  | 'expired';

export type PaymentProvider = 'nowpayments' | 'manual' | 'admin';

export interface Payment {
  id: string;
  userId: string;
  paymentId: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  currency: string;
  amount: number;
  creditAmount: number;
  payAddress?: string;
  blockchainHash?: string;
  actuallyPaid?: number;
  orderDescription?: string;
  orderNote?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

export interface NOWPaymentsCreateInvoiceRequest {
  price_amount: number;
  price_currency: string;
  pay_currency?: string;
  ipn_callback_url: string;
  order_id: string;
  order_description?: string;
  success_url?: string;
  cancel_url?: string;
}

export interface NOWPaymentsCreateInvoiceResponse {
  id: string; // NOWPayments invoice ID (actual API response field)
  payment_status: PaymentStatus;
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  pay_currency: string;
  order_id: string;
  order_description?: string;
  ipn_callback_url: string;
  created_at: string;
  updated_at: string;
  invoice_url: string;
  success_url?: string;
  cancel_url?: string;
}

export interface NOWPaymentsPaymentStatus {
  payment_id: string;
  payment_status: PaymentStatus;
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  actually_paid: number;
  pay_currency: string;
  order_id: string;
  order_description?: string;
  purchase_id: string;
  created_at: string;
  updated_at: string;
  outcome_amount?: number;
  outcome_currency?: string;
  payin_hash?: string;
  payout_hash?: string;
}

// Actual API response format from NOWPayments /currencies endpoint
export interface NOWPaymentsCurrenciesResponse {
  currencies: string[];
}

// Full currency details from /currencies-full endpoint (if available)
export interface NOWPaymentsCurrency {
  ticker: string;
  name: string;
  image: string;
  has_extra_id: boolean;
  extra_id_name?: string;
  validation_regex?: string;
  is_popular: boolean;
  is_stable: boolean;
  is_fiat: boolean;
  confirmations_required: number;
}

export interface PaymentEstimate {
  currency_from: string;
  amount_from: number;
  currency_to: string;
  estimated_amount: number;
  min_amount?: number;
  max_amount?: number;
}

export interface CreatePaymentRequest {
  creditAmount: number;
  currency?: string;
  orderDescription?: string;
}

export interface CreatePaymentResponse {
  paymentId: string;
  invoiceUrl: string;
  payAddress: string;
  payAmount: number;
  payCurrency: string;
  expiresAt: Date;
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
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

export interface PaymentHistoryQuery {
  userId?: string;
  status?: PaymentStatus;
  provider?: PaymentProvider;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface PaymentHistoryItem {
  id: string;
  paymentId: string;
  status: PaymentStatus;
  provider: PaymentProvider;
  currency: string;
  amount: number;
  creditAmount: number;
  blockchainHash?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookPayload {
  payment_id: string;
  payment_status: PaymentStatus;
  pay_address: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  actually_paid?: number;
  pay_currency: string;
  order_id: string;
  order_description?: string;
  purchase_id: string;
  outcome_amount?: number;
  outcome_currency?: string;
  payin_hash?: string;
  payout_hash?: string;
}

export interface PaymentOperationResult {
  success: boolean;
  payment?: Payment;
  error?: string;
}

export interface CurrencyInfo {
  ticker: string;
  name: string;
  image: string;
  isPopular: boolean;
  isStable: boolean;
  minAmount?: number;
  maxAmount?: number;
}
