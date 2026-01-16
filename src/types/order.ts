export type OrderStatus =
  | 'cart'
  | 'pending_payment'
  | 'paid'
  | 'in_process'
  | 'delivered'
  | 'cancelled';

export interface Order {
  id: string;
  user_id: string;
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
  term_months?: number | null;
  paid_with_credits: boolean;
  auto_renew: boolean;
  payment_provider?: string | null;
  payment_reference?: string | null;
  metadata?: Record<string, any> | null;
  created_at: Date;
  updated_at: Date;
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
  description?: string | null;
  metadata?: Record<string, any> | null;
  created_at: Date;
}

export interface OrderWithItems extends Order {
  items: OrderItem[];
}

export interface OrderListItem extends Order {
  items?: OrderItem[];
}

export interface CreateOrderInput {
  user_id: string;
  status?: OrderStatus;
  status_reason?: string | null;
  currency?: string | null;
  subtotal_cents?: number | null;
  discount_cents?: number | null;
  coupon_id?: string | null;
  coupon_code?: string | null;
  coupon_discount_cents?: number | null;
  total_cents?: number | null;
  term_months?: number | null;
  paid_with_credits?: boolean;
  auto_renew?: boolean;
  payment_provider?: string | null;
  payment_reference?: string | null;
  metadata?: Record<string, any> | null;
}

export interface CreateOrderItemInput {
  product_variant_id?: string | null;
  quantity: number;
  unit_price_cents: number;
  base_price_cents?: number | null;
  discount_percent?: number | null;
  term_months?: number | null;
  currency: string;
  total_price_cents: number;
  description?: string | null;
  metadata?: Record<string, any> | null;
}
