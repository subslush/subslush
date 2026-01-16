export type AdminStatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface AdminListPagination {
  limit?: number;
  offset?: number;
  total?: number;
  hasMore?: boolean;
}

export interface AdminListResponse<T> {
  items: T[];
  pagination?: AdminListPagination;
}

export interface AdminAnnouncementResult {
  created: number;
  targetCount?: number;
  announcementId?: string;
}

export interface AdminPinResetRequest {
  request_id: string;
  user_id: string;
  email_masked?: string;
  expires_at: string;
  requestId?: string;
  userId?: string;
  emailMasked?: string;
  expiresAt?: string;
}

export interface AdminPinResetConfirm {
  reset: boolean;
  user_id: string;
  had_pin?: boolean;
  reset_at?: string;
  userId?: string;
  hadPin?: boolean;
  resetAt?: string;
}

export type AdminBisInquiryStatus = 'active' | 'issue' | 'cancelled' | 'solved';
export type AdminBisInquiryTopic = 'bug' | 'issue' | 'suggestion';

export interface AdminBisInquiry {
  id: string;
  email: string;
  topic: AdminBisInquiryTopic;
  message: string;
  status: AdminBisInquiryStatus;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
}

export interface AdminProduct {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  service_type?: string | null;
  serviceType?: string | null;
  logo_key?: string | null;
  logoKey?: string | null;
  category?: string | null;
  default_currency?: string | null;
  defaultCurrency?: string | null;
  max_subscriptions?: number | null;
  maxSubscriptions?: number | null;
  status?: 'active' | 'inactive';
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
}

export interface AdminProductVariant {
  id: string;
  product_id?: string | null;
  productId?: string | null;
  name: string;
  variant_code?: string | null;
  variantCode?: string | null;
  description?: string | null;
  service_plan?: string | null;
  servicePlan?: string | null;
  is_active?: boolean;
  isActive?: boolean;
  sort_order?: number;
  sortOrder?: number;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
}

export interface AdminProductVariantTerm {
  id: string;
  product_variant_id?: string | null;
  productVariantId?: string | null;
  months: number;
  discount_percent?: number | null;
  discountPercent?: number | null;
  is_active?: boolean;
  isActive?: boolean;
  is_recommended?: boolean;
  isRecommended?: boolean;
  sort_order?: number;
  sortOrder?: number;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
}

export interface AdminProductLabel {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  color?: string | null;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
}

export interface AdminProductMedia {
  id: string;
  product_id?: string | null;
  productId?: string | null;
  media_type?: 'image' | 'video';
  mediaType?: 'image' | 'video';
  url: string;
  alt_text?: string | null;
  altText?: string | null;
  sort_order?: number;
  sortOrder?: number;
  is_primary?: boolean;
  isPrimary?: boolean;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
}

export interface AdminPriceHistory {
  id: string;
  product_variant_id?: string | null;
  productVariantId?: string | null;
  price_cents?: number | null;
  priceCents?: number | null;
  currency?: string | null;
  starts_at?: string | null;
  startsAt?: string | null;
  ends_at?: string | null;
  endsAt?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  createdAt?: string;
}

export interface AdminSetCurrentPriceInput {
  product_variant_id: string;
  price_cents: number;
  currency: string;
  starts_at?: string;
  end_previous?: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface AdminProductDetail {
  product: AdminProduct;
  variants: AdminProductVariant[];
  labels: AdminProductLabel[];
  media: AdminProductMedia[];
  priceHistory?: AdminPriceHistory[];
  price_history?: AdminPriceHistory[];
  prices?: AdminPriceHistory[];
  variantTerms?: AdminProductVariantTerm[];
  variant_terms?: AdminProductVariantTerm[];
}

export interface AdminOrder {
  id: string;
  user_id?: string | null;
  userId?: string | null;
  status?: string | null;
  status_reason?: string | null;
  statusReason?: string | null;
  currency?: string | null;
  subtotal_cents?: number | null;
  subtotalCents?: number | null;
  discount_cents?: number | null;
  discountCents?: number | null;
  coupon_id?: string | null;
  couponId?: string | null;
  coupon_code?: string | null;
  couponCode?: string | null;
  coupon_discount_cents?: number | null;
  couponDiscountCents?: number | null;
  total_cents?: number | null;
  totalCents?: number | null;
  paid_with_credits?: boolean | null;
  paidWithCredits?: boolean | null;
  auto_renew?: boolean | null;
  autoRenew?: boolean | null;
  payment_provider?: string | null;
  paymentProvider?: string | null;
  payment_reference?: string | null;
  paymentReference?: string | null;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
}

export interface AdminOrderItem {
  id: string;
  order_id?: string | null;
  orderId?: string | null;
  product_variant_id?: string | null;
  productVariantId?: string | null;
  product_name?: string | null;
  productName?: string | null;
  variant_name?: string | null;
  variantName?: string | null;
  quantity?: number | null;
  unit_price_cents?: number | null;
  unitPriceCents?: number | null;
  currency?: string | null;
  total_price_cents?: number | null;
  totalPriceCents?: number | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  createdAt?: string;
}

export interface AdminPayment {
  id?: string;
  payment_id?: string | null;
  paymentId?: string | null;
  provider?: string | null;
  payment_provider?: string | null;
  status?: string | null;
  status_reason?: string | null;
  statusReason?: string | null;
  reason?: string | null;
  amount?: number | null;
  amount_cents?: number | null;
  amountCents?: number | null;
  currency?: string | null;
  order_id?: string | null;
  orderId?: string | null;
  user_id?: string | null;
  userId?: string | null;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown> | null;
}

export interface AdminCoupon {
  id: string;
  code: string;
  code_normalized?: string | null;
  codeNormalized?: string | null;
  percent_off?: number | null;
  percentOff?: number | null;
  scope?: 'global' | 'category' | 'product';
  status?: 'active' | 'inactive';
  starts_at?: string | null;
  startsAt?: string | null;
  ends_at?: string | null;
  endsAt?: string | null;
  max_redemptions?: number | null;
  maxRedemptions?: number | null;
  redemptions_used?: number | null;
  redemptionsUsed?: number | null;
  bound_user_id?: string | null;
  boundUserId?: string | null;
  first_order_only?: boolean | null;
  firstOrderOnly?: boolean | null;
  category?: string | null;
  product_id?: string | null;
  productId?: string | null;
  created_at?: string;
  createdAt?: string;
  updated_at?: string;
  updatedAt?: string;
}

export interface AdminSubscription {
  id: string;
  user_id?: string | null;
  userId?: string | null;
  user_email?: string | null;
  userEmail?: string | null;
  service_type?: string | null;
  serviceType?: string | null;
  service_plan?: string | null;
  servicePlan?: string | null;
  status?: string | null;
  start_date?: string | null;
  startDate?: string | null;
  end_date?: string | null;
  endDate?: string | null;
  renewal_date?: string | null;
  renewalDate?: string | null;
  auto_renew?: boolean | null;
  autoRenew?: boolean | null;
  next_billing_at?: string | null;
  nextBillingAt?: string | null;
  renewal_method?: string | null;
  renewalMethod?: string | null;
  price_cents?: number | null;
  priceCents?: number | null;
  currency?: string | null;
  status_reason?: string | null;
  statusReason?: string | null;
  credentials_encrypted?: string | null;
  credentialsEncrypted?: string | null;
  has_credentials?: boolean | null;
  hasCredentials?: boolean | null;
  selection_type?: string | null;
  selectionType?: string | null;
  account_identifier?: string | null;
  accountIdentifier?: string | null;
  manual_monthly_acknowledged_at?: string | null;
  manualMonthlyAcknowledgedAt?: string | null;
  submitted_at?: string | null;
  submittedAt?: string | null;
  locked_at?: string | null;
  lockedAt?: string | null;
  upgrade_options_snapshot?: Record<string, unknown> | null;
  upgradeOptionsSnapshot?: Record<string, unknown> | null;
  has_user_credentials?: boolean | null;
  hasUserCredentials?: boolean | null;
  created_at?: string;
  createdAt?: string;
}

export interface AdminCreditBalance {
  user_id?: string | null;
  userId?: string | null;
  email?: string | null;
  total_balance?: number | null;
  totalBalance?: number | null;
  available_balance?: number | null;
  availableBalance?: number | null;
  pending_balance?: number | null;
  pendingBalance?: number | null;
  lastUpdated?: string | null;
  updated_at?: string | null;
  updatedAt?: string | null;
}

export interface AdminCreditTransaction {
  id: string;
  user_id?: string | null;
  userId?: string | null;
  type?: string | null;
  amount?: number | null;
  balance_before?: number | null;
  balanceBefore?: number | null;
  balance_after?: number | null;
  balanceAfter?: number | null;
  description?: string | null;
  order_id?: string | null;
  orderId?: string | null;
  product_variant_id?: string | null;
  productVariantId?: string | null;
  price_cents?: number | null;
  priceCents?: number | null;
  currency?: string | null;
  auto_renew?: boolean | null;
  autoRenew?: boolean | null;
  next_billing_at?: string | null;
  nextBillingAt?: string | null;
  renewal_method?: string | null;
  renewalMethod?: string | null;
  status_reason?: string | null;
  statusReason?: string | null;
  referral_reward_id?: string | null;
  referralRewardId?: string | null;
  pre_launch_reward_id?: string | null;
  preLaunchRewardId?: string | null;
  created_at?: string;
  createdAt?: string;
  metadata?: Record<string, unknown> | null;
}

export interface AdminUserVoucher {
  id: string;
  voucher_type?: string | null;
  scope?: string | null;
  amount?: number | null;
  status?: string | null;
  issued_at?: string | null;
  redeemed_at?: string | null;
  event_date?: string | null;
}

export interface AdminUserReward {
  id: string;
  reward_type?: string | null;
  tier?: string | null;
  applies_to?: string | null;
  free_months?: number | null;
  founder_status?: boolean | null;
  prize_won?: string | null;
  notes?: string | null;
  awarded_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AdminUserDeposit {
  id: string;
  amount?: number | null;
  currency?: string | null;
  payment_provider?: string | null;
  payment_status?: string | null;
  payment_id?: string | null;
  created_at?: string | null;
}

export interface AdminUserPurchase {
  id: string;
  amount?: number | null;
  order_id?: string | null;
  orderId?: string | null;
  description?: string | null;
  price_cents?: number | null;
  priceCents?: number | null;
  currency?: string | null;
  created_at?: string | null;
}

export interface AdminUserLookup {
  id: string;
  email?: string | null;
  status?: string | null;
  created_at?: string | null;
  last_login?: string | null;
  display_name?: string | null;
  pre_registration_id?: string | null;
  username?: string | null;
  pre_registration_email?: string | null;
  referral_code?: string | null;
  referred_by_code?: string | null;
  voucher_count?: number | null;
  reward_count?: number | null;
  deposit_count?: number | null;
  deposit_total?: number | null;
  deposit_confirmed_total?: number | null;
  deposit_pending_count?: number | null;
  last_deposit_at?: string | null;
  credit_balance?: number | null;
  credits_in?: number | null;
  credits_out?: number | null;
  purchase_count?: number | null;
  purchase_total?: number | null;
  last_purchase_at?: string | null;
  vouchers?: AdminUserVoucher[];
  rewards?: AdminUserReward[];
  deposits?: AdminUserDeposit[];
  purchases?: AdminUserPurchase[];
}

export interface AdminRefund {
  id: string;
  payment_id?: string | null;
  paymentId?: string | null;
  user_id?: string | null;
  userId?: string | null;
  amount?: number | null;
  reason?: string | null;
  description?: string | null;
  status?: string | null;
  approved_by?: string | null;
  approvedBy?: string | null;
  processed_at?: string | null;
  processedAt?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  updated_at?: string | null;
  updatedAt?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AdminRefundStats {
  period?: string | null;
  totalRequests?: number | null;
  approvedRefunds?: number | null;
  rejectedRefunds?: number | null;
  completedRefunds?: number | null;
  totalAmountRefunded?: number | null;
  averageProcessingTime?: number | null;
  pendingApprovals?: number | null;
  timestamp?: string | null;
}

export interface AdminReward {
  id: string;
  reward_type?: string | null;
  rewardType?: string | null;
  status?: string | null;
  referral_code?: string | null;
  referralCode?: string | null;
  referred_by_code?: string | null;
  referredByCode?: string | null;
  user_id?: string | null;
  userId?: string | null;
  redeemed_by_user_id?: string | null;
  redeemedByUserId?: string | null;
  redeemed_at?: string | null;
  redeemedAt?: string | null;
  applied_value_cents?: number | null;
  appliedValueCents?: number | null;
  created_at?: string;
  createdAt?: string | null;
}

export interface AdminTask {
  id: string;
  status?: string | null;
  task_category?: string | null;
  taskCategory?: string | null;
  task_type?: string | null;
  taskType?: string | null;
  priority?: string | null;
  due_date?: string | null;
  dueDate?: string | null;
  user_id?: string | null;
  userId?: string | null;
  user_email?: string | null;
  userEmail?: string | null;
  order_id?: string | null;
  orderId?: string | null;
  order_status?: string | null;
  orderStatus?: string | null;
  order_payment_provider?: string | null;
  orderPaymentProvider?: string | null;
  order_payment_reference?: string | null;
  orderPaymentReference?: string | null;
  subscription_id?: string | null;
  subscriptionId?: string | null;
  subscription_status?: string | null;
  subscriptionStatus?: string | null;
  subscription_service_type?: string | null;
  subscriptionServiceType?: string | null;
  subscription_service_plan?: string | null;
  subscriptionServicePlan?: string | null;
  assigned_admin?: string | null;
  assignedAdmin?: string | null;
  is_issue?: boolean | null;
  isIssue?: boolean | null;
  sla_due_at?: string | null;
  slaDueAt?: string | null;
  created_at?: string;
  createdAt?: string | null;
  completed_at?: string | null;
  completedAt?: string | null;
  payment_confirmed_at?: string | null;
  paymentConfirmedAt?: string | null;
  notes?: string | null;
  mmu_cycle_index?: number | null;
  mmuCycleIndex?: number | null;
  mmu_cycle_total?: number | null;
  mmuCycleTotal?: number | null;
}

export interface AdminRenewalPayment {
  id: string;
  amount?: number | null;
  balance_before?: number | null;
  balanceBefore?: number | null;
  balance_after?: number | null;
  balanceAfter?: number | null;
  created_at?: string | null;
  createdAt?: string | null;
  metadata?: Record<string, unknown> | null;
  status_reason?: string | null;
  statusReason?: string | null;
  renewal_method?: string | null;
  renewalMethod?: string | null;
  price_cents?: number | null;
  priceCents?: number | null;
  currency?: string | null;
}

export interface AdminOrderWithItems extends AdminOrder {
  items?: AdminOrderItem[];
}

export interface AdminCreditSummary {
  balance: number;
  creditsIn: number;
  creditsOut: number;
  depositsConfirmed: number;
  pendingDeposits: number;
  bonuses: number;
  refunds: number;
  purchases: number;
  withdrawals: number;
  lastDepositAt: string | null;
  lastPurchaseAt: string | null;
  flags: {
    spendExceedsCreditsIn: boolean;
    hasPendingDeposits: boolean;
  };
}

export interface AdminOrderFulfillment {
  order: AdminOrderWithItems;
  user: {
    id: string;
    email?: string | null;
    status?: string | null;
    created_at?: string | null;
    last_login?: string | null;
  } | null;
  subscriptions: AdminSubscription[];
  payments: AdminPayment[];
  tasks: AdminTask[];
  credit: {
    summary: AdminCreditSummary | null;
    recentDeposits: AdminUserDeposit[];
    recentPurchases: AdminUserPurchase[];
    orderCreditsSpent: number;
  };
}

export interface AdminRenewalFulfillment {
  subscription: AdminSubscription;
  user: {
    id: string;
    email?: string | null;
    status?: string | null;
    created_at?: string | null;
    last_login?: string | null;
  } | null;
  order?: AdminOrderWithItems | null;
  tasks: AdminTask[];
  renewal_payment?: AdminRenewalPayment | null;
  renewalPayment?: AdminRenewalPayment | null;
  stripe_payment?: AdminPayment | null;
  stripePayment?: AdminPayment | null;
}

export interface AdminMigrationPreview {
  dryRun?: boolean;
  mappedUsers?: number;
  unmatchedPreRegistrations?: number;
  duplicateEmails?: number;
  rewardsMigrated?: number;
  vouchersMigrated?: number;
  raffleEntriesMigrated?: number;
  conflicts?: Array<Record<string, unknown>>;
}

export interface AdminMigrationResult {
  applied?: boolean;
  mappedUsers?: number;
  rewardsMigrated?: number;
  vouchersMigrated?: number;
  raffleEntriesMigrated?: number;
  warnings?: string[];
}
