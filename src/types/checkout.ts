export interface GuestIdentityResult {
  guestIdentityId: string;
  email: string;
}

export interface GuestClaimTokenResult {
  guestIdentityId: string;
}

export interface GuestDraftItemInput {
  variant_id?: string | null | undefined;
  product_id?: string | null | undefined;
  pricing_snapshot_id?: string | null | undefined;
  term_months?: number | null | undefined;
  auto_renew?: boolean | null | undefined;
  selection_type?:
    | 'upgrade_new_account'
    | 'upgrade_own_account'
    | null
    | undefined;
  account_identifier?: string | null | undefined;
  credentials?: string | null | undefined;
  manual_monthly_acknowledged?: boolean | null | undefined;
}

export interface GuestDraftInput {
  checkout_session_key?: string | null | undefined;
  guest_identity_id: string;
  contact_email: string;
  currency: string;
  items: GuestDraftItemInput[];
  coupon_code?: string | null | undefined;
  initiate_checkout_event_id?: string | null | undefined;
}

export interface GuestDraftResult {
  orderId: string;
  checkoutSessionKey: string;
  pricing?: CheckoutPricingSummary;
}

export interface CheckoutPricingSummaryItem {
  variant_id: string;
  product_id: string;
  product_name: string;
  duration_months: number;
  unit_price_cents: number;
  total_price_cents: number;
  catalog_mode: 'fixed_product' | 'legacy_variant';
  service_type?: string | null;
  variant_name?: string | null;
  service_plan?: string | null;
  pricing_snapshot_id: string;
  catalog_pricing_snapshot_id: string;
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
  pricing_snapshot_id: string | null;
  display_currency: string;
  settlement_currency: string;
  order_subtotal_cents: number;
  order_discount_cents: number;
  order_coupon_discount_cents: number;
  order_total_cents: number;
  order_settlement_total_cents: number;
  normalized_coupon_code?: string | null;
}

export interface CheckoutPayPalSessionInput {
  checkout_session_key?: string | null | undefined;
  order_id?: string | null | undefined;
  success_url?: string | null | undefined;
  cancel_url?: string | null | undefined;
  funding_preference?:
    | 'paypal'
    | 'applepay'
    | 'googlepay'
    | 'card'
    | null
    | undefined;
  initiate_checkout_event_id?: string | null | undefined;
  add_payment_info_event_id?: string | null | undefined;
}

export interface CheckoutPayPalSessionResult {
  orderId: string;
  sessionId: string;
  sessionUrl: string;
  paymentId?: string | null;
}

export interface CheckoutPayPalConfirmInput {
  order_id: string;
  session_id: string;
}

export interface CheckoutPayPalConfirmResult {
  orderId: string;
  sessionId: string;
  orderStatus: string | null;
  fulfilled: boolean;
}

export type CheckoutStripeSessionInput = CheckoutPayPalSessionInput;
export type CheckoutStripeSessionResult = CheckoutPayPalSessionResult;
export type CheckoutStripeConfirmInput = CheckoutPayPalConfirmInput;
export type CheckoutStripeConfirmResult = CheckoutPayPalConfirmResult;

export interface CheckoutCreditsCompleteInput {
  checkout_session_key?: string | null | undefined;
  order_id?: string | null | undefined;
  initiate_checkout_event_id?: string | null | undefined;
  add_payment_info_event_id?: string | null | undefined;
  purchase_event_id?: string | null | undefined;
}

export interface CheckoutCreditsCompleteResult {
  orderId: string;
  transactionId: string | null;
  amountDebited: number;
  balanceAfter: number | null;
  fulfilledSubscriptions: number;
}

export interface CheckoutNowPaymentsInvoiceInput {
  checkout_session_key?: string | null | undefined;
  order_id?: string | null | undefined;
  pay_currency?: string | null | undefined;
  force_new_invoice?: boolean | null | undefined;
  success_url?: string | null | undefined;
  cancel_url?: string | null | undefined;
  initiate_checkout_event_id?: string | null | undefined;
  add_payment_info_event_id?: string | null | undefined;
}

export interface CheckoutNowPaymentsInvoiceResult {
  orderId: string;
  invoiceId: string;
  invoiceUrl: string;
  payAddress?: string | null;
  payAmount?: number | null;
  payCurrency?: string | null;
  status?: string | null;
}

export interface CheckoutNowPaymentsMinimumInput {
  checkout_session_key?: string | null | undefined;
  order_id?: string | null | undefined;
  pay_currency: string;
}

export interface CheckoutNowPaymentsMinimumResult {
  orderId: string;
  payCurrency: string;
  priceCurrency: string;
  orderTotalAmount: number;
  minPriceAmount: number;
  meetsMinimum: boolean;
  shortfallAmount: number;
  minFiatEquivalent?: number | null;
}

export interface CheckoutPayopMethodQuoteItemResult {
  orderItemId: string;
  label: string;
  totalCents: number;
}

export interface CheckoutPayopMethodQuoteResult {
  methodId: number;
  title: string;
  type: 'ewallet' | 'bank_transfer';
  formType?: string | null;
  logoUrl?: string | null;
  supportedCountries: string[];
  supportedCurrencies: string[];
  displaySubtotalCents: number | null;
  displayFeeCents: number | null;
  displayTotalCents: number | null;
  processingCurrency: string;
  processingSubtotalCents: number;
  processingFeeCents: number;
  processingTotalCents: number;
  convertedFromDisplayCurrency: boolean;
  requiredPayerFields: string[];
  items: CheckoutPayopMethodQuoteItemResult[];
}

export interface CheckoutPayopOptionsInput {
  checkout_session_key?: string | null | undefined;
  order_id?: string | null | undefined;
  country_code?: string | null | undefined;
}

export interface CheckoutPayopOptionsResult {
  orderId: string;
  orderStatus: string;
  displayCurrency: string;
  displayTotalCents: number;
  detectedCountry?: string | null;
  selectedCountry?: string | null;
  countryOptions: string[];
  selectedMethodId?: number | null;
  methods: CheckoutPayopMethodQuoteResult[];
}

export interface CheckoutPayopSessionInput {
  checkout_session_key?: string | null | undefined;
  order_id?: string | null | undefined;
  method_id: number;
  country_code?: string | null | undefined;
  add_payment_info_event_id?: string | null | undefined;
}

export interface CheckoutPayopSessionResult {
  orderId: string;
  sessionId: string;
  sessionUrl: string;
  paymentId: string;
  paymentProvider: 'payop';
  methodQuote: CheckoutPayopMethodQuoteResult;
}

export interface CheckoutPayopStatusInput {
  checkout_session_key?: string | null | undefined;
  order_id?: string | null | undefined;
}

export interface CheckoutPayopStatusResult {
  orderId: string;
  orderStatus: string;
  paymentStatus?: string | null;
  providerStatus?: string | null;
  invoiceId?: string | null;
  txid?: string | null;
  methodTitle?: string | null;
  processingCurrency?: string | null;
  processingSubtotalCents?: number | null;
  processingFeeCents?: number | null;
  processingTotalCents?: number | null;
  canRetry: boolean;
}

export interface CheckoutAntomResidenceResult {
  id: string;
  label: string;
  rateBps: number;
}

export interface CheckoutAntomOptionResult {
  optionId: 'cards' | 'apple_pay' | 'google_pay';
  title: string;
  description: string;
  methodTypes: string[];
  brandNames: string[];
  currency: string;
  subtotalCents: number;
  serviceFeeCents: number;
  taxCents: number;
  totalCents: number;
  taxResidenceId: string;
  taxResidenceLabel: string;
  taxRateBps: number;
}

export interface CheckoutAntomOptionsInput {
  checkout_session_key?: string | null | undefined;
  order_id?: string | null | undefined;
  residence_id?: string | null | undefined;
}

export interface CheckoutAntomOptionsResult {
  orderId: string;
  orderStatus: string;
  enabled: boolean;
  displayCurrency: string;
  displayTotalCents: number;
  selectedResidenceId: string;
  residences: CheckoutAntomResidenceResult[];
  options: CheckoutAntomOptionResult[];
}

export interface CheckoutAntomSessionInput {
  checkout_session_key?: string | null | undefined;
  order_id?: string | null | undefined;
  option_id: 'cards' | 'apple_pay' | 'google_pay';
  residence_id?: string | null | undefined;
  add_payment_info_event_id?: string | null | undefined;
}

export interface CheckoutAntomSessionResult {
  orderId: string;
  sessionId: string;
  sessionUrl: string;
  paymentId: string;
  paymentProvider: 'antom';
  optionQuote: CheckoutAntomOptionResult;
}

export interface CheckoutAntomStatusInput {
  checkout_session_key?: string | null | undefined;
  order_id?: string | null | undefined;
  payment_request_id?: string | null | undefined;
  payment_id?: string | null | undefined;
}

export interface CheckoutAntomStatusResult {
  orderId: string;
  orderStatus: string;
  paymentStatus?: string | null;
  providerStatus?: string | null;
  paymentRequestId?: string | null;
  antomPaymentId?: string | null;
  methodTitle?: string | null;
  processingCurrency?: string | null;
  processingSubtotalCents?: number | null;
  processingFeeCents?: number | null;
  processingTaxCents?: number | null;
  processingTotalCents?: number | null;
  taxResidenceId?: string | null;
  taxResidenceLabel?: string | null;
  canRetry: boolean;
}
