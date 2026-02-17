export interface GuestIdentityResult {
  guestIdentityId: string;
  email: string;
}

export interface GuestClaimTokenResult {
  guestIdentityId: string;
}

export interface GuestDraftItemInput {
  variant_id: string;
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

export interface CheckoutStripeSessionInput {
  checkout_session_key?: string | null | undefined;
  order_id?: string | null | undefined;
  success_url?: string | null | undefined;
  cancel_url?: string | null | undefined;
  initiate_checkout_event_id?: string | null | undefined;
  add_payment_info_event_id?: string | null | undefined;
}

export interface CheckoutStripeSessionResult {
  orderId: string;
  sessionId: string;
  sessionUrl: string;
  paymentId?: string | null;
}

export interface CheckoutStripeConfirmInput {
  order_id: string;
  session_id: string;
}

export interface CheckoutStripeConfirmResult {
  orderId: string;
  sessionId: string;
  orderStatus: string | null;
  fulfilled: boolean;
}

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
