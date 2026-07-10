export type AdminNextQueueTab =
  | 'new_orders'
  | 'mmu'
  | 'awaiting_customer'
  | 'issues'
  | 'completed';

export type AdminNextRecord = Record<string, unknown>;

export interface AdminNextUpgradeOptionsSnapshot extends AdminNextRecord {
  manual_monthly_upgrade?: boolean;
  manual_monthly_upgrade_interval_months?: number | string | null;
  activation_link_handshake?: boolean;
  activation_instructions_template?: string | null;
  strict_rules?: boolean;
  strict_rules_text?: string | null;
  strict_rules_version?: number | string | null;
}

export interface AdminNextOverviewKpis {
  orders_needing_fulfillment?: number | string | null;
  open_mmu_overdue?: number | string | null;
  open_mmu_due_soon?: number | string | null;
  awaiting_customer?: number | string | null;
  customer_ready?: number | string | null;
  issue_tasks?: number | string | null;
  delivered_items_last_7d?: number | string | null;
  revenue_last_7d?: number | string | null;
  failed_payments_last_24h?: number | string | null;
}

export interface AdminNextPayment {
  id?: string;
  payment_id?: string | null;
  payment_ref?: string | null;
  provider?: string | null;
  payment_provider?: string | null;
  amount?: number | string | null;
  amount_cents?: number | string | null;
  currency?: string | null;
  status?: string | null;
  order_id?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

export interface AdminNextFulfillmentQueueItem {
  subscription_id: string;
  product_name?: string | null;
  variant_name?: string | null;
  term_months?: number | string | null;
  status?: string | null;
  delivery_method?: {
    manual_monthly_upgrade?: boolean;
    activation_link_handshake?: boolean;
    strict_rules?: boolean;
  } | null;
  task_id?: string | null;
  task_status?: string | null;
  task_type?: string | null;
  due_date?: string | null;
  overdue?: boolean | null;
  mmu_label?: string | null;
  mmu_covers_months_from?: number | null;
  mmu_covers_months_to?: number | null;
  mmu_term_months?: number | null;
}

export interface AdminNextFulfillmentOrder {
  id: string;
  short_id?: string | null;
  customer_email?: string | null;
  guest?: boolean | null;
  paid_at?: string | null;
  payment?: {
    provider?: string | null;
    reference?: string | null;
    total_cents?: number | string | null;
    currency?: string | null;
  } | null;
  delivered_count?: number | null;
  items?: AdminNextFulfillmentQueueItem[];
}

export interface AdminNextQueueResponse {
  orders: AdminNextFulfillmentOrder[];
}

export interface AdminNextCustomerDetail {
  account_email?: string | null;
  delivery_email?: string | null;
  status?: string | null;
  last_login?: string | null;
  guest?: boolean | null;
  guest_claimed_at?: string | null;
}

export interface AdminNextOrderDetail {
  id: string;
  total_cents?: number | string | null;
  currency?: string | null;
  coupon_id?: string | null;
  coupon_code?: string | null;
  provider?: string | null;
  payment_ref?: string | null;
  paid_at?: string | null;
  payment_status?: string | null;
}

export interface AdminNextFulfillmentDetailItem {
  subscription_id: string;
  order_item_id?: string | null;
  product_name?: string | null;
  variant_name?: string | null;
  term_months?: number | string | null;
  status?: string | null;
  credentials_on_file?: boolean | null;
  task_id?: string | null;
  task_status?: string | null;
  task_type?: string | null;
  selection_type?: 'new_account' | 'own_account' | 'none' | 'other' | string | null;
  submitted_account_identifier?: string | null;
  own_account_credentials_on_file?: boolean | null;
  handshake_state?: string | null;
  delivered_at?: string | null;
  delivered_by?: string | null;
  delivery_email_sent_at?: string | null;
  customer_revealed?: boolean | null;
  rulesAcknowledged?: {
    at?: string | null;
    ip?: string | null;
    version?: string | number | null;
  } | null;
  product_options?: {
    manual_monthly_upgrade?: boolean;
    manual_monthly_upgrade_interval_months?: number | null;
    activation_link_handshake?: boolean;
    activation_instructions_template?: string | null;
    strict_rules?: boolean;
    strict_rules_text?: string | null;
    strict_rules_version?: number | null;
  } | null;
}

export interface AdminNextOrderAggregate {
  customer: AdminNextCustomerDetail;
  order: AdminNextOrderDetail;
  items: AdminNextFulfillmentDetailItem[];
}

export interface AdminNextMmuTask {
  id: string;
  subscription_id: string;
  order_id?: string | null;
  task_type?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  is_issue?: boolean | null;
  notes?: string | null;
  mmu_cycle_index?: number | string | null;
  mmu_cycle_total?: number | string | null;
  mmu_label?: string | null;
  month_label?: string | null;
  mmu_covers_months_from?: number | null;
  covers_months_from?: number | null;
  mmu_covers_months_to?: number | null;
  covers_months_to?: number | null;
  mmu_term_months?: number | null;
  term_months?: number | string | null;
  term_start?: string | null;
  term_start_at?: string | null;
  service_type?: string | null;
  service_plan?: string | null;
  contact_email?: string | null;
  account_email?: string | null;
}

export interface AdminNextMmuHistoryItem {
  id: string;
  due_date?: string | null;
  completed_at?: string | null;
  mmu_cycle_index?: number | string | null;
  mmu_cycle_total?: number | string | null;
  mmu_label?: string | null;
  month_label?: string | null;
  mmu_covers_months_from?: number | null;
  covers_months_from?: number | null;
  mmu_covers_months_to?: number | null;
  covers_months_to?: number | null;
  mmu_term_months?: number | null;
  term_months?: number | string | null;
  term_start?: string | null;
  is_issue?: boolean | null;
  notes?: string | null;
}

export interface AdminNextMmuDetail {
  task: AdminNextMmuTask;
  cycle_history: AdminNextMmuHistoryItem[];
  order: {
    id?: string | null;
    customer_email?: string | null;
  };
}

export interface AdminNextActionResult {
  order_id?: string;
  subscription_id?: string;
  order_status?: string;
  activation_handshake_state?: string;
}

export interface AdminNextSearchResult {
  id: string;
  type: 'order' | 'payment' | 'user' | 'subscription' | string;
  label: string;
  description?: string | null;
  href: string;
}

export interface AdminNextOrderListItem {
  id: string;
  status?: string | null;
  contact_email?: string | null;
  account_email?: string | null;
  is_guest?: boolean | null;
  payment_provider?: string | null;
  payment_reference?: string | null;
  total_cents?: number | string | null;
  currency?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  item_count?: number | null;
  delivered_count?: number | null;
}

export interface AdminNextOrderFile {
  order: AdminNextOrderFileOrder;
  customer: AdminNextOrderFileCustomer;
  items: AdminNextOrderFileItem[];
  payments: AdminNextOrderFilePayment[];
  payment_events: AdminNextOrderFilePaymentEvent[];
  evidence: AdminNextOrderFileEvidence[];
  emails: AdminNextOrderFileEmails;
  guest_claim: AdminNextOrderFileGuestClaim;
  open_fulfillment: AdminNextRecord[];
}

export interface AdminNextOrderFileOrder extends AdminNextRecord {
  id: string;
  status?: string | null;
  payment_provider?: string | null;
  created_at?: string | null;
  subtotal_cents?: number | string | null;
  coupon_code?: string | null;
  coupon_discount_cents?: number | string | null;
  discount_cents?: number | string | null;
  total_cents?: number | string | null;
  currency?: string | null;
}

export interface AdminNextOrderFileCustomer extends AdminNextRecord {
  delivery_email?: string | null;
  account_email?: string | null;
}

export interface AdminNextOrderFileItem extends AdminNextRecord {
  product_name?: string | null;
  variant_name?: string | null;
  term_months?: number | string | null;
  status?: string | null;
  delivered_at?: string | null;
  product_metadata?: {
    upgrade_options?: AdminNextUpgradeOptionsSnapshot;
    upgradeOptions?: AdminNextUpgradeOptionsSnapshot;
  } | null;
}

export interface AdminNextOrderFilePayment extends AdminNextRecord {
  status?: string | null;
  provider?: string | null;
  payment_ref?: string | null;
  created_at?: string | null;
}

export interface AdminNextOrderFilePaymentEvent extends AdminNextRecord {
  event_type?: string | null;
  event_id?: string | null;
  created_at?: string | null;
}

export interface AdminNextOrderFileEvidence extends AdminNextRecord {
  event_type?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at?: string | null;
}

export interface AdminNextOrderFileEmails extends AdminNextRecord {
  item_delivery_sent?: Array<{
    product_name?: string | null;
    sent_at?: string | null;
  }>;
}

export interface AdminNextOrderFileGuestClaim extends AdminNextRecord {
  needed?: boolean | null;
  claimed_at?: string | null;
}

export interface AdminNextSubscriptionListItem {
  id: string;
  order_id?: string | null;
  status?: string | null;
  service_type?: string | null;
  service_plan?: string | null;
  product_name?: string | null;
  variant_name?: string | null;
  customer_email?: string | null;
  term_months?: number | string | null;
  start_date?: string | null;
  end_date?: string | null;
  renewal_date?: string | null;
  mmu_label?: string | null;
  task_id?: string | null;
}

export interface AdminNextPaymentLedgerItem {
  id: string;
  order_id?: string | null;
  provider?: string | null;
  provider_payment_id?: string | null;
  payment_ref?: string | null;
  status?: string | null;
  amount_cents?: number | string | null;
  currency?: string | null;
  created_at?: string | null;
  retryable?: boolean | null;
}

export interface AdminNextPaymentEvent extends AdminNextRecord {
  event_type?: string | null;
  event_id?: string | null;
  created_at?: string | null;
}

export interface AdminNextPaymentDetail {
  payment?: AdminNextPaymentLedgerItem;
  events?: AdminNextPaymentEvent[];
}

export interface AdminNextAnnouncement {
  title?: string | null;
  published_at?: string | null;
  recipient_count?: number | string | null;
}

export interface AdminNextNewsletterCouponStats {
  issued?: number | string | null;
  redeemed?: number | string | null;
  conversion_percent?: number | string | null;
}

export interface AdminNextNewsletterCoupon {
  coupon_code?: string | null;
  percent_off?: number | string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  redeemed?: boolean | null;
}

export interface AdminNextNewsletterCoupons {
  stats: AdminNextNewsletterCouponStats;
  coupons: AdminNextNewsletterCoupon[];
}

export interface AdminNextUserLookup {
  account: AdminNextUserAccount;
  orders: AdminNextUserOrder[];
  subscriptions: AdminNextUserSubscription[];
  evidence: AdminNextUserEvidence[];
}

export interface AdminNextUserAccount extends AdminNextRecord {
  id?: string;
  email?: string | null;
  status?: string | null;
  email_verified_at?: string | null;
  created_at?: string | null;
  last_login?: string | null;
  is_guest?: boolean | null;
  guest_claimed_at?: string | null;
}

export interface AdminNextUserOrder extends AdminNextRecord {
  id?: string;
  status?: string | null;
  total_cents?: number | string | null;
  currency?: string | null;
}

export interface AdminNextUserSubscription extends AdminNextRecord {
  id?: string;
  status?: string | null;
  product_name?: string | null;
  service_type?: string | null;
}

export interface AdminNextUserEvidence extends AdminNextRecord {
  event_type?: string | null;
  created_at?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
}

export interface AdminNextSubscriptionTask extends AdminNextRecord {
  id?: string;
  task_type?: string | null;
  completed_at?: string | null;
  due_date?: string | null;
  is_issue?: boolean | null;
  mmu_label?: string | null;
  month_label?: string | null;
  term_start?: string | null;
}

export interface AdminNextSubscriptionDetailRecord extends AdminNextRecord {
  id?: string;
  order_id?: string | null;
  status?: string | null;
  product_name?: string | null;
  variant_name?: string | null;
  service_type?: string | null;
  service_plan?: string | null;
  customer_email?: string | null;
  contact_email?: string | null;
  start_date?: string | null;
  term_start_at?: string | null;
  term_start?: string | null;
  delivered_at?: string | null;
  selection_type?: string | null;
  account_identifier?: string | null;
  own_account_credentials_on_file?: boolean | null;
}

export interface AdminNextSubscriptionDetail {
  subscription?: AdminNextSubscriptionDetailRecord;
  tasks?: AdminNextSubscriptionTask[];
}
