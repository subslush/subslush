import { ServiceResult } from './service';

export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'pending';

export type ServiceType = 'spotify' | 'netflix' | 'tradingview';

export type ServicePlan =
  // Spotify plans
  | 'premium'
  | 'family'
  // Netflix plans
  | 'basic'
  | 'standard'
  // TradingView plans
  | 'pro'
  | 'individual';

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
  | TradingViewMetadata;

export interface Subscription {
  id: string;
  user_id: string;
  service_type: ServiceType;
  service_plan: ServicePlan;
  start_date: Date;
  end_date: Date;
  renewal_date: Date;
  credentials_encrypted?: string;
  status: SubscriptionStatus;
  metadata?: SubscriptionMetadata;
  created_at: Date;
}

export interface SubscriptionWithUserInfo extends Subscription {
  user_email: string;
  user_full_name?: string;
}

export interface CreateSubscriptionInput {
  service_type: ServiceType;
  service_plan: ServicePlan;
  start_date: Date;
  end_date: Date;
  renewal_date: Date;
  credentials_encrypted?: string;
  metadata?: SubscriptionMetadata;
}

export interface UpdateSubscriptionInput {
  service_plan?: ServicePlan;
  end_date?: Date;
  renewal_date?: Date;
  credentials_encrypted?: string;
  metadata?: SubscriptionMetadata;
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

export interface SubscriptionOperationResult {
  success: boolean;
  data?: boolean;
  error?: string;
  subscription_id?: string;
  affected_count?: number;
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
