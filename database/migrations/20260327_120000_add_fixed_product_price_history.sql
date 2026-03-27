-- Migration: Add fixed product price history table
-- Created: 2026-03-27T12:00:00.000Z
-- Description: Stores published FX display prices for fixed-only products.

-- Up Migration
BEGIN;

CREATE TABLE IF NOT EXISTS product_fixed_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  currency VARCHAR(10) NOT NULL,
  starts_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT product_fixed_price_history_window_check CHECK (
    ends_at IS NULL OR ends_at > starts_at
  )
);

CREATE INDEX IF NOT EXISTS idx_product_fixed_price_history_product_id
  ON product_fixed_price_history(product_id);

CREATE INDEX IF NOT EXISTS idx_product_fixed_price_history_product_start
  ON product_fixed_price_history(product_id, starts_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_fixed_price_history_product_currency_start
  ON product_fixed_price_history(product_id, UPPER(currency), starts_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_fixed_price_history_product_currency_start
  ON product_fixed_price_history(product_id, currency, starts_at);

COMMIT;

-- Down Migration
BEGIN;

-- Additive migration - no rollback included.

COMMIT;
