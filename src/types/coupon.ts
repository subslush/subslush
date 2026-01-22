export type CouponScope = 'global' | 'category' | 'product';
export type CouponStatus = 'active' | 'inactive';
export type CouponRedemptionStatus =
  | 'reserved'
  | 'redeemed'
  | 'expired'
  | 'voided';

export interface Coupon {
  id: string;
  code: string;
  code_normalized: string;
  percent_off: number;
  scope: CouponScope;
  status: CouponStatus;
  starts_at?: Date | null;
  ends_at?: Date | null;
  max_redemptions?: number | null;
  redemptions_used?: number | null;
  bound_user_id?: string | null;
  first_order_only: boolean;
  category?: string | null;
  product_id?: string | null;
  term_months?: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface CouponRedemption {
  id: string;
  coupon_id: string;
  user_id: string;
  order_id?: string | null;
  status: CouponRedemptionStatus;
  reserved_at: Date;
  redeemed_at?: Date | null;
  expires_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCouponInput {
  code: string;
  percent_off: number;
  scope: CouponScope;
  status?: CouponStatus;
  starts_at?: Date | null;
  ends_at?: Date | null;
  max_redemptions?: number | null;
  bound_user_id?: string | null;
  first_order_only?: boolean;
  category?: string | null;
  product_id?: string | null;
  term_months?: number | null;
}

export interface UpdateCouponInput {
  code?: string;
  percent_off?: number;
  scope?: CouponScope;
  status?: CouponStatus;
  starts_at?: Date | null;
  ends_at?: Date | null;
  max_redemptions?: number | null;
  bound_user_id?: string | null;
  first_order_only?: boolean;
  category?: string | null;
  product_id?: string | null;
  term_months?: number | null;
}
