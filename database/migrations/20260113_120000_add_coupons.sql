-- Migration: Add coupons and coupon redemptions
-- Created: 2026-01-13T12:00:00.000Z
-- Description: Adds percent-only coupons and redemption tracking, plus order linkage fields.

-- Up Migration
BEGIN;

CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(64) NOT NULL,
    code_normalized VARCHAR(64) NOT NULL,
    percent_off NUMERIC(5, 2) NOT NULL CHECK (percent_off >= 0 AND percent_off <= 100),
    scope VARCHAR(20) NOT NULL DEFAULT 'global',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    starts_at TIMESTAMP,
    ends_at TIMESTAMP,
    max_redemptions INTEGER CHECK (max_redemptions >= 0),
    bound_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    first_order_only BOOLEAN NOT NULL DEFAULT FALSE,
    category VARCHAR(80),
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT coupons_scope_check CHECK (scope IN ('global', 'category', 'product')),
    CONSTRAINT coupons_status_check CHECK (status IN ('active', 'inactive')),
    CONSTRAINT coupons_scope_target_check CHECK (
      (scope = 'global' AND category IS NULL AND product_id IS NULL)
      OR (scope = 'category' AND category IS NOT NULL AND product_id IS NULL)
      OR (scope = 'product' AND product_id IS NOT NULL AND category IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coupons_code_normalized
  ON coupons(code_normalized);
CREATE INDEX IF NOT EXISTS idx_coupons_status
  ON coupons(status);
CREATE INDEX IF NOT EXISTS idx_coupons_scope
  ON coupons(scope);
CREATE INDEX IF NOT EXISTS idx_coupons_bound_user
  ON coupons(bound_user_id) WHERE bound_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coupons_product
  ON coupons(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coupons_category
  ON coupons(category) WHERE category IS NOT NULL;

CREATE TABLE IF NOT EXISTS coupon_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'reserved',
    reserved_at TIMESTAMP NOT NULL DEFAULT NOW(),
    redeemed_at TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT coupon_redemptions_status_check CHECK (
      status IN ('reserved', 'redeemed', 'expired', 'voided')
    )
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon
  ON coupon_redemptions(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user
  ON coupon_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_order
  ON coupon_redemptions(order_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_status
  ON coupon_redemptions(status);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_expires
  ON coupon_redemptions(expires_at) WHERE expires_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupon_redemptions_order_unique
  ON coupon_redemptions(order_id) WHERE order_id IS NOT NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(64),
  ADD COLUMN IF NOT EXISTS coupon_discount_cents INTEGER CHECK (coupon_discount_cents >= 0);

CREATE INDEX IF NOT EXISTS idx_orders_coupon_id
  ON orders(coupon_id) WHERE coupon_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_coupon_code
  ON orders(coupon_code) WHERE coupon_code IS NOT NULL;

COMMIT;

-- Down Migration
BEGIN;

-- Additive migration - no rollback included.

COMMIT;
