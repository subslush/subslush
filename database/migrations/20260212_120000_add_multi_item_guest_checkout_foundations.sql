-- Migration: Multi-item checkout foundations + guest identity
-- Created: 2026-02-12T12:00:00.000Z
-- Description: Adds guest checkout identity, multi-item order allocation, webhook idempotency, and enforcement triggers.

-- Up Migration
BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- GUEST USERS + IDENTITIES
-- =====================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS guest_claimed_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS guest_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_guest_identities_email
  ON guest_identities(email);

CREATE TABLE IF NOT EXISTS guest_claim_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_identity_id UUID NOT NULL REFERENCES guest_identities(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_guest_claim_tokens_hash
  ON guest_claim_tokens(token_hash);

CREATE INDEX IF NOT EXISTS idx_guest_claim_tokens_unused
  ON guest_claim_tokens(token_hash)
  WHERE used_at IS NULL;

-- =====================================================
-- ORDER METADATA + CHECKOUT SESSION LOOKUP
-- =====================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS checkout_session_key TEXT,
  ADD COLUMN IF NOT EXISTS checkout_mode VARCHAR(20),
  ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(150);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_checkout_session_key
  ON orders(checkout_session_key)
  WHERE checkout_session_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_stripe_session_id
  ON orders(stripe_session_id);

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS checkout_mode VARCHAR(20),
  ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(150);

CREATE INDEX IF NOT EXISTS idx_payments_stripe_session_id
  ON payments(stripe_session_id);

-- =====================================================
-- PER-ITEM AUTO-RENEW + COUPON ALLOCATION
-- =====================================================

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN,
  ADD COLUMN IF NOT EXISTS coupon_discount_cents INTEGER CHECK (coupon_discount_cents >= 0);

-- =====================================================
-- COUPON APPLY SCOPE
-- =====================================================

ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS apply_scope VARCHAR(30) NOT NULL DEFAULT 'highest_eligible_item';

ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_apply_scope_check;
ALTER TABLE coupons ADD CONSTRAINT coupons_apply_scope_check
  CHECK (apply_scope IN ('highest_eligible_item', 'order_total'));

-- =====================================================
-- RENEWAL INVOICE TRACKING + MULTI-ITEM MAPPING
-- =====================================================

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS renewal_invoice_payment_id UUID,
  ADD COLUMN IF NOT EXISTS renewal_invoice_status VARCHAR(30),
  ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL;

ALTER TABLE credit_transactions
  ADD COLUMN IF NOT EXISTS order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_order_item_id
  ON payments(order_item_id);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_order_item_id
  ON credit_transactions(order_item_id);

-- Drop legacy uniqueness that blocks multi-item subscriptions
DROP INDEX IF EXISTS ux_subscriptions_order_id;

CREATE UNIQUE INDEX IF NOT EXISTS ux_subscriptions_order_item_id
  ON subscriptions(order_item_id)
  WHERE order_item_id IS NOT NULL;

-- =====================================================
-- UPGRADE SELECTION STORAGE (ORDER ITEMS)
-- =====================================================

CREATE TABLE IF NOT EXISTS order_item_upgrade_selections (
  order_item_id UUID PRIMARY KEY REFERENCES order_items(id) ON DELETE CASCADE,
  selection_type VARCHAR(50),
  account_identifier TEXT,
  credentials_encrypted TEXT,
  manual_monthly_acknowledged_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT order_item_upgrade_selections_type_check CHECK (
    selection_type IS NULL OR selection_type IN ('upgrade_new_account', 'upgrade_own_account')
  )
);

-- =====================================================
-- PAYMENT -> ITEM ALLOCATION
-- =====================================================

CREATE TABLE IF NOT EXISTS payment_items (
  payment_id UUID REFERENCES payments(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES order_items(id) ON DELETE CASCADE,
  allocated_subtotal_cents INTEGER NOT NULL CHECK (allocated_subtotal_cents >= 0),
  allocated_discount_cents INTEGER NOT NULL CHECK (allocated_discount_cents >= 0),
  allocated_total_cents INTEGER NOT NULL CHECK (allocated_total_cents >= 0),
  PRIMARY KEY (payment_id, order_item_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_items_order_item_id
  ON payment_items(order_item_id);

-- =====================================================
-- WEBHOOK IDEMPOTENCY
-- =====================================================

CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(30) NOT NULL,
  event_id VARCHAR(150) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_events_provider_event_id
  ON payment_events(provider, event_id);

-- =====================================================
-- RENEWAL LOCK TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS subscription_renewals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  cycle_end_date DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  invoice_payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_subscription_renewal_cycle
  ON subscription_renewals(subscription_id, cycle_end_date);

-- =====================================================
-- UPDATED_AT TRIGGERS
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_item_upgrade_selections_updated_at ON order_item_upgrade_selections;
CREATE TRIGGER trg_order_item_upgrade_selections_updated_at
  BEFORE UPDATE ON order_item_upgrade_selections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_subscription_renewals_updated_at ON subscription_renewals;
CREATE TRIGGER trg_subscription_renewals_updated_at
  BEFORE UPDATE ON subscription_renewals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- BACKFILL: SUBSCRIPTION -> ORDER ITEM
-- =====================================================

WITH single_order_items AS (
  SELECT order_id, MIN(id::text)::uuid AS order_item_id
  FROM order_items
  GROUP BY order_id
  HAVING COUNT(*) = 1
)
UPDATE subscriptions s
SET order_item_id = soi.order_item_id
FROM single_order_items soi
WHERE s.order_id = soi.order_id
  AND s.order_item_id IS NULL;

-- =====================================================
-- BACKFILL: ITEM-LEVEL COUPON DISCOUNTS
-- =====================================================

WITH item_weights AS (
  SELECT
    oi.id AS order_item_id,
    oi.order_id,
    oi.total_price_cents,
    COALESCE(o.coupon_discount_cents, 0) AS coupon_discount_cents,
    SUM(oi.total_price_cents) OVER (PARTITION BY oi.order_id) AS order_total_cents,
    ROW_NUMBER() OVER (
      PARTITION BY oi.order_id
      ORDER BY oi.total_price_cents DESC, oi.id
    ) AS rn
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE COALESCE(o.coupon_discount_cents, 0) > 0
),
allocations AS (
  SELECT
    order_item_id,
    order_id,
    coupon_discount_cents,
    order_total_cents,
    total_price_cents,
    rn,
    CASE
      WHEN order_total_cents <= 0 THEN 0
      ELSE FLOOR(
        coupon_discount_cents * (total_price_cents::numeric / order_total_cents)
      )::int
    END AS base_alloc
  FROM item_weights
),
final_alloc AS (
  SELECT
    *,
    (coupon_discount_cents - SUM(base_alloc) OVER (PARTITION BY order_id)) AS remainder
  FROM allocations
)
UPDATE order_items oi
SET coupon_discount_cents = CASE
  WHEN fa.order_total_cents <= 0 THEN 0
  WHEN fa.rn = 1 THEN fa.base_alloc + fa.remainder
  ELSE fa.base_alloc
END
FROM final_alloc fa
WHERE oi.id = fa.order_item_id
  AND (oi.coupon_discount_cents IS NULL OR oi.coupon_discount_cents = 0);

-- =====================================================
-- ENFORCEMENT TRIGGERS (DEFERRABLE)
-- =====================================================

CREATE OR REPLACE FUNCTION enforce_payment_item_singleton()
RETURNS TRIGGER AS $$
DECLARE
  v_payment_id UUID;
  v_item_count INTEGER;
  v_single_item UUID;
  v_payment_item UUID;
BEGIN
  IF TG_TABLE_NAME = 'payments' THEN
    v_payment_id := NEW.id;
  ELSE
    v_payment_id := COALESCE(NEW.payment_id, OLD.payment_id);
  END IF;

  IF v_payment_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*), MIN(order_item_id)
  INTO v_item_count, v_single_item
  FROM payment_items
  WHERE payment_id = v_payment_id;

  SELECT order_item_id INTO v_payment_item
  FROM payments
  WHERE id = v_payment_id;

  IF v_item_count > 1 THEN
    IF v_payment_item IS NOT NULL THEN
      RAISE EXCEPTION
        'payments.order_item_id must be NULL when payment has multiple items (payment_id=%)',
        v_payment_id;
    END IF;
  ELSIF v_item_count = 1 THEN
    IF v_payment_item IS DISTINCT FROM v_single_item THEN
      RAISE EXCEPTION
        'payments.order_item_id must match payment_items when single item (payment_id=%)',
        v_payment_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_items_singleton ON payment_items;
CREATE CONSTRAINT TRIGGER trg_payment_items_singleton
  AFTER INSERT OR UPDATE OR DELETE ON payment_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION enforce_payment_item_singleton();

DROP TRIGGER IF EXISTS trg_payments_singleton ON payments;
CREATE CONSTRAINT TRIGGER trg_payments_singleton
  AFTER INSERT OR UPDATE OF order_item_id ON payments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION enforce_payment_item_singleton();

CREATE OR REPLACE FUNCTION enforce_order_allocation_parity()
RETURNS TRIGGER AS $$
DECLARE
  v_order_id UUID;
  v_status TEXT;
  v_order_coupon INTEGER;
  v_order_total INTEGER;
  v_items_coupon INTEGER;
  v_payment_total INTEGER;
  v_payment_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'orders' THEN
    v_order_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'order_items' THEN
    v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  ELSIF TG_TABLE_NAME = 'payment_items' THEN
    SELECT order_id
      INTO v_order_id
      FROM order_items
     WHERE id = COALESCE(NEW.order_item_id, OLD.order_item_id);
  ELSE
    RETURN NULL;
  END IF;

  IF v_order_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT status,
         COALESCE(coupon_discount_cents, 0),
         COALESCE(total_cents, 0)
    INTO v_status, v_order_coupon, v_order_total
    FROM orders
   WHERE id = v_order_id;

  IF v_status IS NULL OR v_status = 'cart' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(COALESCE(coupon_discount_cents, 0)), 0)
    INTO v_items_coupon
    FROM order_items
   WHERE order_id = v_order_id;

  IF v_items_coupon <> v_order_coupon THEN
    RAISE EXCEPTION
      'Order coupon allocation mismatch (order_id=% items=% order=%)',
      v_order_id, v_items_coupon, v_order_coupon;
  END IF;

  SELECT COALESCE(SUM(COALESCE(pi.allocated_total_cents, 0)), 0),
         COUNT(pi.payment_id)
    INTO v_payment_total, v_payment_count
    FROM payment_items pi
    JOIN order_items oi ON oi.id = pi.order_item_id
   WHERE oi.order_id = v_order_id;

  IF v_payment_count > 0 AND v_payment_total <> v_order_total THEN
    RAISE EXCEPTION
      'Order payment allocation mismatch (order_id=% items=% order=%)',
      v_order_id, v_payment_total, v_order_total;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_allocation_parity ON orders;
CREATE CONSTRAINT TRIGGER trg_orders_allocation_parity
  AFTER INSERT OR UPDATE OF status, coupon_discount_cents, total_cents ON orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION enforce_order_allocation_parity();

DROP TRIGGER IF EXISTS trg_order_items_allocation_parity ON order_items;
CREATE CONSTRAINT TRIGGER trg_order_items_allocation_parity
  AFTER INSERT OR UPDATE OF order_id, coupon_discount_cents OR DELETE ON order_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION enforce_order_allocation_parity();

DROP TRIGGER IF EXISTS trg_payment_items_allocation_parity ON payment_items;
CREATE CONSTRAINT TRIGGER trg_payment_items_allocation_parity
  AFTER INSERT OR UPDATE OF order_item_id, allocated_total_cents OR DELETE ON payment_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION enforce_order_allocation_parity();

COMMIT;

-- Down Migration
BEGIN;

-- Additive migration - no rollback included.

COMMIT;
