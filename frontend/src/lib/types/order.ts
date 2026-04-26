import type { Subscription } from './subscription.js';

export type OrderStatus =
  | 'cart'
  | 'pending_payment'
  | 'paid'
  | 'in_process'
  | 'delivered'
  | 'cancelled';

export type PaymentMethodBadgeType =
  | 'credits'
  | 'paypal'
  | 'stripe'
  | 'other'
  | 'unknown';

export interface PaymentMethodBadge {
  type: PaymentMethodBadgeType;
  label: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_variant_id?: string | null;
  product_name?: string | null;
  variant_name?: string | null;
  quantity: number;
  unit_price_cents: number;
  base_price_cents?: number | null;
  discount_percent?: number | null;
  term_months?: number | null;
  currency: string;
  total_price_cents: number;
  settlement_currency?: string | null;
  settlement_unit_price_cents?: number | null;
  settlement_base_price_cents?: number | null;
  settlement_coupon_discount_cents?: number | null;
  settlement_total_price_cents?: number | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

export interface OrderListItem {
  id: string;
  user_id?: string;
  status: OrderStatus;
  status_reason?: string | null;
  currency?: string | null;
  display_currency?: string | null;
  subtotal_cents?: number | null;
  discount_cents?: number | null;
  coupon_id?: string | null;
  coupon_code?: string | null;
  coupon_discount_cents?: number | null;
  total_cents?: number | null;
  display_total_cents?: number | null;
  pricing_snapshot_id?: string | null;
  settlement_currency?: string | null;
  settlement_total_cents?: number | null;
  paid_with_credits?: boolean;
  auto_renew?: boolean;
  payment_provider?: string | null;
  payment_reference?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
  payment_method_badge?: PaymentMethodBadge;
}

export interface OrdersListResponse {
  orders: OrderListItem[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

export interface OrderSubscriptionResponse {
  subscription: Subscription | null;
}

export interface OrderSubscriptionsResponse {
  subscriptions: Subscription[];
}

export interface OrderEntitlement {
  id: string;
  order_id: string;
  order_item_id?: string | null;
  user_id: string;
  status: 'active' | 'expired' | 'cancelled' | 'pending';
  starts_at: string;
  ends_at: string;
  duration_months_snapshot?: number | null;
  mmu_cycle_index?: number | null;
  mmu_cycle_total?: number | null;
  source_subscription_id?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  has_credentials?: boolean;
}

export interface OrderEntitlementsResponse {
  entitlements: OrderEntitlement[];
}

export interface OrderCredentialRevealResponse {
  order_id: string;
  entitlement_id?: string | null;
  subscription_id?: string | null;
  credentials: string;
}
