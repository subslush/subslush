// Service types
export type ServiceType = string;
export type ServicePlan = string;
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'pending';

export interface UpgradeOptions {
  allow_new_account: boolean;
  allow_own_account: boolean;
  manual_monthly_upgrade: boolean;
}

// Service plan details
export interface ServicePlanDetails {
  service_type: ServiceType;
  plan: ServicePlan;
  variant_id?: string;
  product_id?: string;
  product_slug?: string;
  productSlug?: string;
  product_name?: string;
  variant_name?: string;
  price: number;
  currency?: string;
  features: string[];
  badges?: string[];
  display_name: string;
  description: string;
  name?: string;
  service_name?: string;
  logo_key?: string | null;
  logoKey?: string | null;
  category?: string | null;
}

// Request types
export interface ValidatePurchaseRequest {
  variant_id: string;
  duration_months?: number;
  coupon_code?: string;
}

export interface PurchaseRequest {
  variant_id: string;
  duration_months?: number;
  auto_renew?: boolean;
  coupon_code?: string;
}

type QueryParamValue = string | number | boolean | null | undefined;

export interface SubscriptionQuery extends Record<string, QueryParamValue> {
  service_type?: ServiceType;
  status?: SubscriptionStatus;
  limit?: number;
  page?: number;
}

// Response types
export interface ValidationResponse {
  valid?: boolean;
  can_purchase?: boolean;
  reason?: string;
  required_credits: number;
  user_credits?: number;
  user_balance?: number;
  balance_after?: number;
  has_active_subscription?: boolean;
}

export interface PurchaseResponse {
  order_id: string;
  subscription: Subscription;
  upgrade_options?: UpgradeOptions | null;
  transaction: {
    transaction_id: string;
    amount_debited: number;
    balance_after: number;
  };
}

export interface AvailablePlansResponse {
  services: Record<ServiceType, ServicePlanDetails[]>;
  total_plans: number;
}

export interface ProductListing {
  product_id: string;
  slug: string;
  name: string;
  description: string;
  service_type?: string | null;
  logo_key?: string | null;
  logoKey?: string | null;
  category?: string | null;
  currency: string;
  from_price: number;
  from_term_months: number;
  from_discount_percent?: number | null;
}

export interface AvailableProductsResponse {
  products: ProductListing[];
  total_products: number;
}

export interface ProductTermOption {
  months: number;
  total_price: number;
  discount_percent?: number | null;
  is_recommended?: boolean;
}

export interface ProductVariantOption {
  id: string;
  plan_code: string;
  name?: string | null;
  display_name: string;
  description: string;
  features: string[];
  badges?: string[];
  base_price: number;
  currency: string;
  term_options: ProductTermOption[];
}

export interface ProductDetail {
  product: {
    id: string;
    name: string;
    slug: string;
    description: string;
    service_type?: string | null;
    logo_key?: string | null;
    logoKey?: string | null;
    category?: string | null;
    terms_conditions?: string[] | null;
    termsConditions?: string[] | null;
    upgrade_options?: UpgradeOptions | null;
  };
  variants: ProductVariantOption[];
}

export interface SubscriptionsResponse {
  subscriptions: Subscription[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

export interface SubscriptionResponse {
  subscription: Subscription;
}

export interface AutoRenewEnableResponse {
  clientSecret: string;
  setup_intent_id: string;
}

export interface AutoRenewConfirmResponse {
  subscription: Subscription;
  payment_method: {
    id: string;
    brand?: string | null;
    last4?: string | null;
    exp_month?: number | null;
    exp_year?: number | null;
  };
}

export interface AutoRenewDisableResponse {
  subscription: Subscription;
}

export interface RenewalCheckoutResponse {
  paymentId: string;
  clientSecret: string;
  amount: number;
  currency: string;
}

export interface CreditsAutoRenewResponse {
  subscription: Subscription;
}

export interface CreditsRenewalResponse {
  subscription: Subscription;
  transaction?: {
    transaction_id?: string | null;
    amount_debited: number;
    balance_after?: number | null;
  } | null;
}

// Core subscription entity
export interface Subscription {
  id: string;
  user_id: string;
  service_type: ServiceType;
  service_plan: ServicePlan;
  start_date: string;
  term_start_at?: string | null;
  end_date: string;
  renewal_date: string;
  status: SubscriptionStatus;
  auto_renew: boolean;
  next_billing_at?: string | null;
  renewal_method?: string | null;
  billing_payment_method_id?: string | null;
  auto_renew_enabled_at?: string | null;
  auto_renew_disabled_at?: string | null;
  price_cents?: number | null;
  base_price_cents?: number | null;
  discount_percent?: number | null;
  term_months?: number | null;
  currency?: string | null;
  display_price_cents?: number | null;
  display_currency?: string | null;
  product_name?: string | null;
  variant_name?: string | null;
  status_reason?: string | null;
  cancellation_requested_at?: string | null;
  cancellation_reason?: string | null;
  renewal_state?: string;
  days_until_renewal?: number | null;
  metadata?: Record<string, unknown> | string | null;
  order_id?: string | null;
  product_variant_id?: string | null;
  created_at: string;
  updated_at?: string;
}

// Component props interfaces
export interface SubscriptionCardProps {
  serviceName: string;
  planName: string;
  price: number;
  features: string[];
  onSelect: () => void;
  isSelected?: boolean;
  disabled?: boolean;
}

// Purchase flow types
export interface PurchaseFlowProps {
  selectedPlan: ServicePlanDetails;
  selectedDuration?: number;
  selectedTotalPrice?: number | null;
  userCredits?: number;
  onClose: () => void;
  onSuccess: (subscription: Subscription) => void;
}

export interface PurchaseStep {
  step: number;
  title: string;
  isActive: boolean;
  isCompleted: boolean;
}

// Detailed subscription interfaces for detail pages
export interface SubscriptionDetail {
  id: string;
  serviceType: ServiceType;
  serviceName: string;
  planName: string;
  planType: ServicePlan;
  variantId?: string | null;
  productId?: string | null;
  productSlug?: string | null;
  product_slug?: string | null;
  logo_key?: string | null;
  logoKey?: string | null;
  description: string;
  longDescription?: string;
  price: number;
  originalPrice?: number;
  currency: string;
  features: string[];
  ratings?: {
    average: number;
    count: number;
  };
  host?: {
    id: string;
    name: string;
    isVerified: boolean;
    joinDate: string;
  };
  availability?: {
    totalSeats: number;
    occupiedSeats: number;
    availableSeats: number;
  };
  reviews?: Review[];
  durationOptions: DurationOption[];
  relatedPlans?: RelatedPlan[];
  badges?: string[];
}

export interface DurationOption {
  months: number;
  totalPrice: number;
  discount?: number; // percentage
  isRecommended?: boolean;
}

export interface Review {
  id: string;
  author: string;
  isVerified: boolean;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface RelatedPlan {
  id: string;
  serviceType: ServiceType;
  serviceName: string;
  planName: string;
  price: number;
  currency?: string;
  productId?: string | null;
  productSlug?: string | null;
  product_slug?: string | null;
  logo_key?: string | null;
  logoKey?: string | null;
}
