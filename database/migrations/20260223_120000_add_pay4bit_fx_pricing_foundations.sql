-- Migration: Pay4bit + FX pricing foundations (Milestone 1)
-- Created: 2026-02-23T12:00:00.000Z
-- Description:
--   - Adds FX fetch/cache, pricing publish run, and subscription reminder event tables
--   - Extends orders/order_items with pricing snapshot + settlement fields
--   - Extends provider constraints to include pay4bit without removing Stripe columns

-- Up Migration
BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- FX RATE TABLES
-- =====================================================

CREATE TABLE IF NOT EXISTS fx_rate_fetches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(50) NOT NULL DEFAULT 'currencyapi',
  base_currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  status VARCHAR(20) NOT NULL,
  fetch_started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  fetch_completed_at TIMESTAMP,
  http_status INTEGER,
  rates_count INTEGER,
  is_success BOOLEAN NOT NULL DEFAULT FALSE,
  error_code VARCHAR(100),
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT fx_rate_fetches_status_check CHECK (
    status IN ('success', 'failed', 'skipped')
  )
);

CREATE INDEX IF NOT EXISTS idx_fx_rate_fetches_created_at
  ON fx_rate_fetches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fx_rate_fetches_status_created_at
  ON fx_rate_fetches(status, created_at DESC);

CREATE TABLE IF NOT EXISTS fx_rate_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency VARCHAR(10) NOT NULL,
  quote_currency VARCHAR(10) NOT NULL,
  rate NUMERIC(20, 10) NOT NULL CHECK (rate > 0),
  fetched_at TIMESTAMP NOT NULL,
  source_fetch_id UUID REFERENCES fx_rate_fetches(id) ON DELETE SET NULL,
  is_lkg BOOLEAN NOT NULL DEFAULT FALSE,
  stale_after TIMESTAMP,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT fx_rate_cache_pair_unique UNIQUE (base_currency, quote_currency)
);

CREATE INDEX IF NOT EXISTS idx_fx_rate_cache_fetched_at
  ON fx_rate_cache(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_fx_rate_cache_is_lkg
  ON fx_rate_cache(is_lkg);

-- =====================================================
-- PRICING SNAPSHOT RUN TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS pricing_publish_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id UUID NOT NULL DEFAULT gen_random_uuid(),
  status VARCHAR(20) NOT NULL DEFAULT 'started',
  triggered_by VARCHAR(30) NOT NULL DEFAULT 'scheduler',
  fx_fetch_id UUID REFERENCES fx_rate_fetches(id) ON DELETE SET NULL,
  published_at TIMESTAMP,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT pricing_publish_runs_status_check CHECK (
    status IN ('started', 'succeeded', 'failed', 'skipped')
  ),
  CONSTRAINT pricing_publish_runs_triggered_by_check CHECK (
    triggered_by IN ('scheduler', 'manual', 'system')
  ),
  CONSTRAINT pricing_publish_runs_snapshot_unique UNIQUE (snapshot_id)
);

CREATE INDEX IF NOT EXISTS idx_pricing_publish_runs_status_created_at
  ON pricing_publish_runs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pricing_publish_runs_created_at
  ON pricing_publish_runs(created_at DESC);

-- =====================================================
-- SUBSCRIPTION REMINDER EVENT TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS subscription_reminder_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  reminder_stage VARCHAR(10) NOT NULL,
  target_expiry_at TIMESTAMP NOT NULL,
  notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
  email_sent_at TIMESTAMP,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT subscription_reminder_events_stage_check CHECK (
    reminder_stage IN ('7d', '3d', '24h')
  ),
  CONSTRAINT subscription_reminder_events_unique_stage UNIQUE (
    subscription_id,
    reminder_stage,
    target_expiry_at
  )
);

CREATE INDEX IF NOT EXISTS idx_subscription_reminder_events_stage_expiry
  ON subscription_reminder_events(reminder_stage, target_expiry_at);
CREATE INDEX IF NOT EXISTS idx_subscription_reminder_events_email_sent_at
  ON subscription_reminder_events(email_sent_at)
  WHERE email_sent_at IS NOT NULL;

-- =====================================================
-- ORDER HEADER + ITEM SETTLEMENT EXTENSIONS
-- =====================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS pricing_snapshot_id UUID,
  ADD COLUMN IF NOT EXISTS settlement_currency VARCHAR(10),
  ADD COLUMN IF NOT EXISTS settlement_total_cents INTEGER CHECK (settlement_total_cents >= 0);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_pricing_snapshot_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_pricing_snapshot_id_fkey
  FOREIGN KEY (pricing_snapshot_id)
  REFERENCES pricing_publish_runs(snapshot_id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_pricing_snapshot_id
  ON orders(pricing_snapshot_id)
  WHERE pricing_snapshot_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_settlement_currency
  ON orders(settlement_currency)
  WHERE settlement_currency IS NOT NULL;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS settlement_currency VARCHAR(10),
  ADD COLUMN IF NOT EXISTS settlement_unit_price_cents INTEGER CHECK (settlement_unit_price_cents >= 0),
  ADD COLUMN IF NOT EXISTS settlement_base_price_cents INTEGER CHECK (settlement_base_price_cents >= 0),
  ADD COLUMN IF NOT EXISTS settlement_coupon_discount_cents INTEGER CHECK (settlement_coupon_discount_cents >= 0),
  ADD COLUMN IF NOT EXISTS settlement_total_price_cents INTEGER CHECK (settlement_total_price_cents >= 0);

CREATE INDEX IF NOT EXISTS idx_order_items_settlement_currency
  ON order_items(settlement_currency)
  WHERE settlement_currency IS NOT NULL;

-- =====================================================
-- PROVIDER CONSTRAINT EXTENSIONS
-- =====================================================

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_provider_check;
ALTER TABLE payments ADD CONSTRAINT payments_provider_check
  CHECK (provider IN ('nowpayments', 'stripe', 'pay4bit', 'manual', 'admin'));

ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_payment_provider_check;
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_payment_provider_check
  CHECK (
    payment_provider IS NULL
    OR payment_provider IN ('nowpayments', 'stripe', 'pay4bit', 'manual', 'admin')
  );

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_provider_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_provider_check
  CHECK (
    payment_provider IS NULL
    OR payment_provider IN ('credits', 'nowpayments', 'stripe', 'pay4bit', 'manual', 'admin')
  );

COMMIT;

-- Down Migration
BEGIN;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_provider_check;

ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_payment_provider_check;
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_payment_provider_check
  CHECK (
    payment_provider IS NULL
    OR payment_provider IN ('nowpayments', 'stripe', 'manual', 'admin')
  );

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_provider_check;
ALTER TABLE payments ADD CONSTRAINT payments_provider_check
  CHECK (provider IN ('nowpayments', 'stripe', 'manual', 'admin'));

DROP INDEX IF EXISTS idx_order_items_settlement_currency;

ALTER TABLE order_items
  DROP COLUMN IF EXISTS settlement_total_price_cents,
  DROP COLUMN IF EXISTS settlement_coupon_discount_cents,
  DROP COLUMN IF EXISTS settlement_base_price_cents,
  DROP COLUMN IF EXISTS settlement_unit_price_cents,
  DROP COLUMN IF EXISTS settlement_currency;

DROP INDEX IF EXISTS idx_orders_settlement_currency;
DROP INDEX IF EXISTS idx_orders_pricing_snapshot_id;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_pricing_snapshot_id_fkey;
ALTER TABLE orders
  DROP COLUMN IF EXISTS settlement_total_cents,
  DROP COLUMN IF EXISTS settlement_currency,
  DROP COLUMN IF EXISTS pricing_snapshot_id;

DROP TABLE IF EXISTS subscription_reminder_events;
DROP TABLE IF EXISTS pricing_publish_runs;
DROP TABLE IF EXISTS fx_rate_cache;
DROP TABLE IF EXISTS fx_rate_fetches;

COMMIT;
