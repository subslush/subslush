import { ServiceResult } from './service';

export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'pending';

export type ServiceType = string;

export type ServicePlan = string;

export interface SpotifyMetadata {
  region: string;
  payment_method: string;
  screens?: number;
}

export interface NetflixMetadata {
  screens: number;
  region: string;
  quality: 'SD' | 'HD' | '4K';
  profiles?: number;
}

export interface TradingViewMetadata {
  charts: 'limited' | 'unlimited';
  alerts_count: number;
  region: string;
}

export type SubscriptionMetadata =
  | SpotifyMetadata
  | NetflixMetadata
  | TradingViewMetadata
  | {
      provider?: string;
      payment_id?: string;
      [key: string]: any;
    };

export interface Subscription {
  id: string;
  user_id: string;
  service_type: ServiceType;
  service_plan: ServicePlan;
  start_date: Date;
  term_start_at?: Date | null;
  end_date: Date;
  renewal_date: Date;
  credentials_encrypted?: string;
  status: SubscriptionStatus;
  metadata?: SubscriptionMetadata;
  order_id?: string | null;
  order_item_id?: string | null;
  product_variant_id?: string | null;
  price_cents?: number | null;
  base_price_cents?: number | null;
  discount_percent?: number | null;
  term_months?: number | null;
  currency?: string | null;
  display_price_cents?: number | null;
  display_currency?: string | null;
  product_name?: string | null;
  variant_name?: string | null;
  auto_renew?: boolean;
  next_billing_at?: Date | null;
  renewal_method?: string | null;
  billing_payment_method_id?: string | null;
  auto_renew_enabled_at?: Date | null;
  auto_renew_disabled_at?: Date | null;
  status_reason?: string | null;
  cancellation_requested_at?: Date | null;
  cancellation_reason?: string | null;
  referral_reward_id?: string | null;
  pre_launch_reward_id?: string | null;
  created_at: Date;
}

export interface SubscriptionWithUserInfo extends Subscription {
  user_email: string;
  user_full_name?: string;
  has_credentials?: boolean;
}

export interface CreateSubscriptionInput {
  service_type: ServiceType;
  service_plan: ServicePlan;
  start_date: Date;
  term_start_at?: Date | null;
  end_date: Date;
  renewal_date: Date;
  credentials_encrypted?: string;
  selection_provided?: boolean;
  manual_monthly_acknowledged?: boolean;
  status?: SubscriptionStatus;
  metadata?: SubscriptionMetadata;
  auto_renew?: boolean;
  order_id?: string;
  order_item_id?: string | null;
  product_variant_id?: string | null;
  price_cents?: number | null;
  base_price_cents?: number | null;
  discount_percent?: number | null;
  term_months?: number | null;
  currency?: string | null;
  next_billing_at?: Date | null;
  renewal_method?: string | null;
  billing_payment_method_id?: string | null;
  auto_renew_enabled_at?: Date | null;
  auto_renew_disabled_at?: Date | null;
  status_reason?: string | null;
  cancellation_requested_at?: Date | null;
  cancellation_reason?: string | null;
  upgrade_options_snapshot?: UpgradeOptionsSnapshot | null;
  referral_reward_id?: string | null;
  pre_launch_reward_id?: string | null;
}

export interface UpdateSubscriptionInput {
  service_plan?: ServicePlan;
  start_date?: Date;
  term_start_at?: Date | null;
  end_date?: Date;
  renewal_date?: Date;
  credentials_encrypted?: string | null;
  metadata?: SubscriptionMetadata;
  auto_renew?: boolean;
  next_billing_at?: Date | null;
  renewal_method?: string | null;
  billing_payment_method_id?: string | null;
  auto_renew_enabled_at?: Date | null;
  auto_renew_disabled_at?: Date | null;
  status_reason?: string | null;
  cancellation_requested_at?: Date | null;
  cancellation_reason?: string | null;
  price_cents?: number | null;
  base_price_cents?: number | null;
  discount_percent?: number | null;
  term_months?: number | null;
  currency?: string | null;
  order_id?: string | null;
  order_item_id?: string | null;
  product_variant_id?: string | null;
  referral_reward_id?: string | null;
  pre_launch_reward_id?: string | null;
}

export interface SubscriptionQuery {
  service_type?: ServiceType;
  status?: SubscriptionStatus;
  limit?: number;
  offset?: number;
  include_expired?: boolean;
}

export interface StatusUpdateInput {
  status: SubscriptionStatus;
  reason: string;
  updated_by: string;
}

export interface ServicePlanDetails {
  plan: ServicePlan;
  name: string;
  description: string;
  price: number;
  currency?: string;
  features: string[];
  limitations?: string[];
}

export interface SubscriptionPurchaseValidation {
  canPurchase: boolean;
  reason?: string;
  required_credits?: number;
  existing_subscription?: Subscription | undefined;
}

export interface SubscriptionStats {
  total_active: number;
  total_expired: number;
  total_cancelled: number;
  by_service: Record<ServiceType, number>;
}

export type UpgradeSelectionType =
  | 'upgrade_new_account'
  | 'upgrade_own_account';

export type OwnAccountCredentialRequirement =
  | 'email_and_password'
  | 'email_only';

export interface UpgradeOptionsSnapshot {
  allow_new_account: boolean;
  allow_own_account: boolean;
  manual_monthly_upgrade: boolean;
  own_account_credential_requirement?: OwnAccountCredentialRequirement | null;
}

export interface SubscriptionOperationResult {
  success: boolean;
  data?: boolean;
  error?: string;
  subscription_id?: string;
  affected_count?: number;
  subscription?: Subscription;
}

export type SubscriptionResult = ServiceResult<Subscription>;
export type SubscriptionsResult = ServiceResult<Subscription[]>;
export type SubscriptionValidationResult =
  ServiceResult<SubscriptionPurchaseValidation>;
export type SubscriptionStatsResult = ServiceResult<SubscriptionStats>;
export type ServicePlanDetailsResult = ServiceResult<ServicePlanDetails[]>;

export interface BatchUpdateResult {
  updated: number;
  errors: string[];
  subscription_ids: string[];
}

export type BatchUpdateResponse = ServiceResult<BatchUpdateResult>;

export const VALID_STATUS_TRANSITIONS: Record<
  SubscriptionStatus,
  SubscriptionStatus[]
> = {
  pending: ['active', 'cancelled'],
  active: ['expired', 'cancelled'],
  expired: ['active', 'cancelled'],
  cancelled: [],
};

export const SERVICE_PLAN_COMPATIBILITY: Record<ServiceType, ServicePlan[]> = {
  spotify: ['premium', 'family'],
  netflix: ['basic', 'standard', 'premium'],
  tradingview: ['pro', 'individual'],
};

export const DEFAULT_PLAN_PRICING: Record<
  ServiceType,
  Record<ServicePlan, number>
> = {
  spotify: {
    premium: 50,
    family: 80,
    basic: 0,
    standard: 0,
    pro: 0,
    individual: 0,
  },
  netflix: {
    basic: 30,
    standard: 50,
    premium: 70,
    family: 0,
    pro: 0,
    individual: 0,
  },
  tradingview: {
    pro: 150,
    individual: 100,
    premium: 0,
    family: 0,
    basic: 0,
    standard: 0,
  },
};
