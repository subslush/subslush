-- Migration: Add order entitlements and fixed catalog fields
-- Created: 2026-03-12T12:00:00.000Z
-- Description:
--   - Adds additive order-centric fulfillment table (order_entitlements)
--   - Adds fixed product catalog fields for unique products
--   - Backfills entitlements from existing subscriptions with traceability

-- Up Migration
BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- PRODUCTS: fixed catalog fields for unique products
-- =====================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS duration_months INTEGER,
  ADD COLUMN IF NOT EXISTS fixed_price_cents INTEGER,
  ADD COLUMN IF NOT EXISTS fixed_price_currency VARCHAR(10);

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_duration_months_check;
ALTER TABLE products
  ADD CONSTRAINT products_duration_months_check
  CHECK (duration_months IS NULL OR duration_months > 0);

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_fixed_price_cents_check;
ALTER TABLE products
  ADD CONSTRAINT products_fixed_price_cents_check
  CHECK (fixed_price_cents IS NULL OR fixed_price_cents >= 0);

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_fixed_price_pair_check;
ALTER TABLE products
  ADD CONSTRAINT products_fixed_price_pair_check
  CHECK (
    (fixed_price_cents IS NULL AND fixed_price_currency IS NULL)
    OR (fixed_price_cents IS NOT NULL AND fixed_price_currency IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_products_duration_months
  ON products(duration_months)
  WHERE duration_months IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_fixed_price
  ON products(fixed_price_currency, fixed_price_cents)
  WHERE fixed_price_cents IS NOT NULL;

-- =====================================================
-- ORDER ENTITLEMENTS: additive order-centric fulfillment
-- =====================================================

CREATE TABLE IF NOT EXISTS order_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NOT NULL,
  duration_months_snapshot INTEGER CHECK (
    duration_months_snapshot IS NULL OR duration_months_snapshot > 0
  ),
  credentials_encrypted TEXT,
  mmu_cycle_index INTEGER CHECK (mmu_cycle_index IS NULL OR mmu_cycle_index > 0),
  mmu_cycle_total INTEGER CHECK (mmu_cycle_total IS NULL OR mmu_cycle_total > 0),
  source_subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT order_entitlements_status_check CHECK (
    status IN ('active', 'expired', 'cancelled', 'pending')
  ),
  CONSTRAINT order_entitlements_date_order_check CHECK (ends_at > starts_at),
  CONSTRAINT order_entitlements_mmu_cycle_check CHECK (
    (mmu_cycle_index IS NULL AND mmu_cycle_total IS NULL)
    OR (
      mmu_cycle_index IS NOT NULL
      AND mmu_cycle_total IS NOT NULL
      AND mmu_cycle_index <= mmu_cycle_total
    )
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'order_entitlements_order_item_id_key'
  ) THEN
    ALTER TABLE order_entitlements
      ADD CONSTRAINT order_entitlements_order_item_id_key
      UNIQUE (order_item_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'order_entitlements_source_subscription_id_key'
  ) THEN
    ALTER TABLE order_entitlements
      ADD CONSTRAINT order_entitlements_source_subscription_id_key
      UNIQUE (source_subscription_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_entitlements_order_id
  ON order_entitlements(order_id);

CREATE INDEX IF NOT EXISTS idx_order_entitlements_user_status
  ON order_entitlements(user_id, status);

CREATE INDEX IF NOT EXISTS idx_order_entitlements_ends_at
  ON order_entitlements(ends_at);

-- Shared helper used by other migrations; keep idempotent.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_entitlements_updated_at ON order_entitlements;
CREATE TRIGGER trg_order_entitlements_updated_at
  BEFORE UPDATE ON order_entitlements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- BACKFILL: subscriptions -> order_entitlements
-- =====================================================

WITH single_order_items AS (
  SELECT order_id, MIN(id::text)::uuid AS order_item_id
  FROM order_items
  GROUP BY order_id
  HAVING COUNT(*) = 1
),
subscription_entitlements AS (
  SELECT
    s.id AS source_subscription_id,
    s.order_id,
    COALESCE(s.order_item_id, soi.order_item_id) AS order_item_id,
    s.user_id,
    COALESCE(NULLIF(TRIM(s.status), ''), 'active') AS status,
    COALESCE(s.term_start_at, s.start_date, s.created_at, NOW()) AS starts_at,
    COALESCE(
      s.end_date,
      COALESCE(s.term_start_at, s.start_date, s.created_at, NOW()) + INTERVAL '1 month'
    ) AS ends_at,
    CASE
      WHEN s.term_months IS NOT NULL AND s.term_months > 0 THEN s.term_months
      ELSE NULL
    END AS duration_months_snapshot,
    s.credentials_encrypted,
    CASE
      WHEN s.term_months IS NOT NULL AND s.term_months > 1 THEN 1
      ELSE NULL
    END AS mmu_cycle_index,
    CASE
      WHEN s.term_months IS NOT NULL AND s.term_months > 1 THEN s.term_months
      ELSE NULL
    END AS mmu_cycle_total,
    jsonb_build_object(
      'backfilled_from', 'subscriptions',
      'backfilled_at', NOW()
    ) AS metadata
  FROM subscriptions s
  LEFT JOIN single_order_items soi
    ON soi.order_id = s.order_id
  WHERE s.order_id IS NOT NULL
)
INSERT INTO order_entitlements (
  order_id,
  order_item_id,
  user_id,
  status,
  starts_at,
  ends_at,
  duration_months_snapshot,
  credentials_encrypted,
  mmu_cycle_index,
  mmu_cycle_total,
  source_subscription_id,
  metadata
)
SELECT
  se.order_id,
  se.order_item_id,
  se.user_id,
  se.status,
  se.starts_at,
  se.ends_at,
  se.duration_months_snapshot,
  se.credentials_encrypted,
  se.mmu_cycle_index,
  se.mmu_cycle_total,
  se.source_subscription_id,
  se.metadata
FROM subscription_entitlements se
ON CONFLICT (source_subscription_id) DO NOTHING;

COMMIT;

-- Down Migration
BEGIN;

-- Additive migration - no rollback included.

COMMIT;
