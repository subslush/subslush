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
  pricing_snapshot_id: string;
  term_months: number;
  currency: string;
  base_price_cents: number;
  discount_percent: number;
  term_subtotal_cents: number;
  term_discount_cents: number;
  term_total_cents: number;
  coupon_discount_cents: number;
  final_total_cents: number;
  settlement_currency: string;
  settlement_base_price_cents: number;
  settlement_term_subtotal_cents: number;
  settlement_term_discount_cents: number;
  settlement_term_total_cents: number;
  settlement_coupon_discount_cents: number;
  settlement_final_total_cents: number;
}

export interface CheckoutPricingSummary {
  items: CheckoutPricingSummaryItem[];
  pricing_snapshot_id: string;
  display_currency: string;
  settlement_currency: string;
  order_subtotal_cents: number;
  order_discount_cents: number;
  order_coupon_discount_cents: number;
  order_total_cents: number;
  order_settlement_total_cents: number;
  normalized_coupon_code?: string | null;
}

export interface CheckoutDraftResponse {
  checkout_session_key: string;
  order_id: string;
  pricing?: CheckoutPricingSummary;
}

export interface CheckoutCardSessionRequest {
  checkout_session_key?: string | null;
  order_id?: string | null;
  success_url?: string | null;
  cancel_url?: string | null;
  funding_preference?: 'paypal' | 'applepay' | 'googlepay' | 'card' | null;
  initiate_checkout_event_id?: string | null;
  add_payment_info_event_id?: string | null;
  legal_consent?: CheckoutLegalConsentInput | null;
}

export interface CheckoutCardSessionResponse {
  order_id: string;
  session_id: string;
  session_url: string;
  payment_id?: string | null;
  pricing_snapshot_id?: string | null;
  settlement_currency?: string | null;
  settlement_total_cents?: number | null;
  display_currency?: string | null;
  display_total_cents?: number | null;
}

export interface CheckoutCardConfirmRequest {
  order_id: string;
  session_id: string;
}

export interface CheckoutCardConfirmResponse {
  order_id: string;
  session_id: string;
  order_status: string | null;
  fulfilled: boolean;
}

export interface CheckoutPayPalSdkConfigResponse {
  enabled: boolean;
  client_id: string | null;
  mode: 'sandbox' | 'live';
  country_code?: string | null;
}

export type CheckoutStripeSessionRequest = CheckoutCardSessionRequest;
export type CheckoutStripeSessionResponse = CheckoutCardSessionResponse;
export type CheckoutStripeConfirmRequest = CheckoutCardConfirmRequest;
export type CheckoutStripeConfirmResponse = CheckoutCardConfirmResponse;

export interface CheckoutCreditsCompleteRequest {
  checkout_session_key?: string | null;
  order_id?: string | null;
  initiate_checkout_event_id?: string | null;
  add_payment_info_event_id?: string | null;
  purchase_event_id?: string | null;
  legal_consent?: CheckoutLegalConsentInput | null;
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
  legal_consent?: CheckoutLegalConsentInput | null;
}

export interface CheckoutLegalConsentInput {
  immediate_fulfillment_consent: boolean;
  terms_policy_consent: boolean;
  consent_timestamp?: string | null;
  checkout_session_key_snapshot?: string | null;
  consent_source?: string | null;
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

export interface CheckoutPayopMethodQuoteItem {
  order_item_id: string;
  label: string;
  logo_key?: string | null;
  total_cents: number;
}

export interface CheckoutPayopMethodQuote {
  method_id: number;
  title: string;
  type: 'ewallet' | 'bank_transfer';
  form_type?: string | null;
  logo_url?: string | null;
  supported_countries: string[];
  supported_currencies: string[];
  display_subtotal_cents: number | null;
  display_fee_cents: number | null;
  display_total_cents: number | null;
  processing_currency: string;
  processing_subtotal_cents: number;
  processing_fee_cents: number;
  processing_total_cents: number;
  converted_from_display_currency: boolean;
  required_payer_fields: string[];
  items: CheckoutPayopMethodQuoteItem[];
}

export interface CheckoutPayopOptionsRequest {
  checkout_session_key?: string | null;
  order_id?: string | null;
  country_code?: string | null;
}

export interface CheckoutPayopOptionsResponse {
  order_id: string;
  order_status: string;
  display_currency: string;
  display_total_cents: number;
  detected_country?: string | null;
  selected_country?: string | null;
  country_options: string[];
  selected_method_id?: number | null;
  methods: CheckoutPayopMethodQuote[];
}

export interface CheckoutPayopSessionRequest {
  checkout_session_key?: string | null;
  order_id?: string | null;
  method_id: number;
  country_code?: string | null;
  add_payment_info_event_id?: string | null;
  legal_consent?: CheckoutLegalConsentInput | null;
}

export interface CheckoutPayopSessionResponse {
  order_id: string;
  session_id: string;
  session_url: string;
  payment_id: string;
  payment_provider: 'payop';
  method_quote: CheckoutPayopMethodQuote;
}

export interface CheckoutPayopStatusRequest {
  checkout_session_key?: string | null;
  order_id?: string | null;
  invoice_id?: string | null;
  txid?: string | null;
}

export interface CheckoutPayopStatusResponse {
  order_id: string;
  order_status: string;
  payment_status?: string | null;
  provider_status?: string | null;
  invoice_id?: string | null;
  txid?: string | null;
  method_title?: string | null;
  processing_currency?: string | null;
  processing_subtotal_cents?: number | null;
  processing_fee_cents?: number | null;
  processing_total_cents?: number | null;
  can_retry: boolean;
}

export interface CheckoutAntomResidence {
  id: string;
  label: string;
  rate_bps: number;
}

export interface CheckoutAntomOptionQuote {
  option_id: 'cards' | 'apple_pay' | 'google_pay';
  title: string;
  description: string;
  method_types: string[];
  brand_names: string[];
  currency: string;
  subtotal_cents: number;
  service_fee_cents: number;
  service_fee_percent_bps: number;
  service_fee_fixed_cents: number;
  tax_cents: number;
  tax_residence_id: string;
  tax_residence_label: string;
  tax_rate_bps: number;
  tax_base_cents: number;
  total_cents: number;
  items: CheckoutPayopMethodQuoteItem[];
}

export interface CheckoutAntomOptionsRequest {
  checkout_session_key?: string | null;
  order_id?: string | null;
  residence_id?: string | null;
}

export interface CheckoutAntomOptionsResponse {
  order_id: string;
  order_status: string;
  enabled: boolean;
  display_currency: string;
  display_total_cents: number;
  selected_residence_id: string;
  residences: CheckoutAntomResidence[];
  options: CheckoutAntomOptionQuote[];
}

export interface CheckoutAntomSessionRequest {
  checkout_session_key?: string | null;
  order_id?: string | null;
  option_id: 'cards' | 'apple_pay' | 'google_pay';
  residence_id?: string | null;
  add_payment_info_event_id?: string | null;
  legal_consent?: CheckoutLegalConsentInput | null;
}

export interface CheckoutAntomSessionResponse {
  order_id: string;
  session_id: string;
  session_url: string;
  payment_id: string;
  payment_provider: 'antom';
  option_quote: CheckoutAntomOptionQuote;
}

export interface CheckoutAntomStatusRequest {
  checkout_session_key?: string | null;
  order_id?: string | null;
  payment_request_id?: string | null;
  payment_id?: string | null;
}

export interface CheckoutAntomStatusResponse {
  order_id: string;
  order_created_at?: string | null;
  order_status: string;
  payment_status?: string | null;
  provider_status?: string | null;
  payment_request_id?: string | null;
  antom_payment_id?: string | null;
  method_title?: string | null;
  processing_currency?: string | null;
  processing_subtotal_cents?: number | null;
  processing_fee_cents?: number | null;
  processing_tax_cents?: number | null;
  processing_total_cents?: number | null;
  tax_residence_id?: string | null;
  tax_residence_label?: string | null;
  can_retry: boolean;
}

export interface CheckoutClaimResponse {
  guest_identity_id: string;
  reassigned: boolean;
}
