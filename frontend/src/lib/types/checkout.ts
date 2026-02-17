import type { UpgradeSelectionType } from './upgradeSelection.js';

export interface CheckoutIdentityResponse {
  guest_identity_id: string;
}

export interface CheckoutDraftItemInput {
  variant_id: string;
  term_months?: number | null;
  auto_renew?: boolean | null;
  selection_type?: UpgradeSelectionType | null;
  account_identifier?: string | null;
  credentials?: string | null;
  manual_monthly_acknowledged?: boolean | null;
}

export interface CheckoutDraftRequest {
  checkout_session_key?: string | null;
  guest_identity_id: string;
  contact_email: string;
  currency: string;
  items: CheckoutDraftItemInput[];
  coupon_code?: string | null;
  initiate_checkout_event_id?: string | null;
}

export interface CheckoutPricingSummaryItem {
  variant_id: string;
  product_id: string;
  product_name: string;
  service_type?: string | null;
  variant_name?: string | null;
  service_plan?: string | null;
  term_months: number;
  currency: string;
  base_price_cents: number;
  discount_percent: number;
  term_subtotal_cents: number;
  term_discount_cents: number;
  term_total_cents: number;
  coupon_discount_cents: number;
  final_total_cents: number;
}

export interface CheckoutPricingSummary {
  items: CheckoutPricingSummaryItem[];
  order_subtotal_cents: number;
  order_discount_cents: number;
  order_coupon_discount_cents: number;
  order_total_cents: number;
  normalized_coupon_code?: string | null;
}

export interface CheckoutDraftResponse {
  checkout_session_key: string;
  order_id: string;
  pricing?: CheckoutPricingSummary;
}

export interface CheckoutStripeSessionRequest {
  checkout_session_key?: string | null;
  order_id?: string | null;
  success_url?: string | null;
  cancel_url?: string | null;
  initiate_checkout_event_id?: string | null;
  add_payment_info_event_id?: string | null;
}

export interface CheckoutStripeSessionResponse {
  order_id: string;
  session_id: string;
  session_url: string;
  payment_id?: string | null;
}

export interface CheckoutStripeConfirmRequest {
  order_id: string;
  session_id: string;
}

export interface CheckoutStripeConfirmResponse {
  order_id: string;
  session_id: string;
  order_status: string | null;
  fulfilled: boolean;
}

export interface CheckoutCreditsCompleteRequest {
  checkout_session_key?: string | null;
  order_id?: string | null;
  initiate_checkout_event_id?: string | null;
  add_payment_info_event_id?: string | null;
  purchase_event_id?: string | null;
}

export interface CheckoutCreditsCompleteResponse {
  order_id: string;
  payment_method: 'credits';
  transaction_id?: string | null;
  amount_debited?: number | null;
  balance_after?: number | null;
  fulfilled_subscriptions?: number | null;
}

export interface CheckoutNowPaymentsInvoiceRequest {
  checkout_session_key?: string | null;
  order_id?: string | null;
  pay_currency?: string | null;
  force_new_invoice?: boolean | null;
  success_url?: string | null;
  cancel_url?: string | null;
  initiate_checkout_event_id?: string | null;
  add_payment_info_event_id?: string | null;
}

export interface CheckoutNowPaymentsInvoiceResponse {
  order_id: string;
  invoice_id: string;
  invoice_url: string;
  pay_address?: string | null;
  pay_amount?: number | null;
  pay_currency?: string | null;
  status?: string | null;
}

export interface CheckoutNowPaymentsMinimumRequest {
  checkout_session_key?: string | null;
  order_id?: string | null;
  pay_currency: string;
}

export interface CheckoutNowPaymentsMinimumResponse {
  order_id: string;
  pay_currency: string;
  price_currency: string;
  order_total_amount: number;
  min_price_amount: number;
  meets_minimum: boolean;
  shortfall_amount: number;
  min_fiat_equivalent?: number | null;
}

export interface CheckoutClaimResponse {
  guest_identity_id: string;
  reassigned: boolean;
}
