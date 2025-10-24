// Service types
export type ServiceType = 'spotify' | 'netflix' | 'tradingview';
export type ServicePlan = 'premium' | 'family' | 'basic' | 'standard' | 'pro' | 'individual';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled' | 'pending';

// Service plan details
export interface ServicePlanDetails {
  service_type: ServiceType;
  plan: ServicePlan;
  price: number;
  features: string[];
  display_name: string;
  description: string;
}

// Request types
export interface ValidatePurchaseRequest {
  service_type: ServiceType;
  service_plan: ServicePlan;
  duration_months?: number;
}

export interface PurchaseRequest {
  service_type: ServiceType;
  service_plan: ServicePlan;
  duration_months?: number;
  auto_renew?: boolean;
}

export interface SubscriptionQuery {
  service_type?: ServiceType;
  status?: SubscriptionStatus;
  limit?: number;
  page?: number;
}

// Response types
export interface ValidationResponse {
  valid: boolean;
  reason?: string;
  required_credits: number;
  user_credits: number;
  has_active_subscription?: boolean;
}

export interface PurchaseResponse {
  subscription: Subscription;
  remaining_credits: number;
  transaction_id: string;
}

export interface AvailablePlansResponse {
  services: Record<ServiceType, ServicePlanDetails[]>;
  total_plans: number;
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

// Core subscription entity
export interface Subscription {
  id: string;
  user_id: string;
  service_type: ServiceType;
  service_plan: ServicePlan;
  start_date: string;
  end_date: string;
  renewal_date: string;
  status: SubscriptionStatus;
  auto_renew: boolean;
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
  description: string;
  longDescription: string;
  price: number;
  originalPrice: number;
  currency: string;
  features: string[];
  ratings: {
    average: number;
    count: number;
  };
  host: {
    id: string;
    name: string;
    isVerified: boolean;
    joinDate: string;
  };
  availability: {
    totalSeats: number;
    occupiedSeats: number;
    availableSeats: number;
  };
  reviews: Review[];
  durationOptions: DurationOption[];
  relatedPlans: RelatedPlan[];
  badges: string[]; // 'streaming', 'shared_plan', 'verified', 'popular'
}

export interface Review {
  id: string;
  author: string;
  isVerified: boolean;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface DurationOption {
  months: number;
  totalPrice: number;
  discount?: number; // percentage
  isRecommended?: boolean;
}

export interface RelatedPlan {
  id: string;
  serviceType: ServiceType;
  serviceName: string;
  planName: string;
  price: number;
}