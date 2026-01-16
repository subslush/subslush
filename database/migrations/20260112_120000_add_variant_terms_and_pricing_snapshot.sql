-- Migration: Add variant terms and pricing snapshot fields
-- Created: 2026-01-12T12:00:00.000Z
-- Description: Adds product_variant_terms table and pricing snapshot columns for term-based pricing.

-- Up Migration
BEGIN;

CREATE TABLE IF NOT EXISTS product_variant_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    months INTEGER NOT NULL CHECK (months > 0),
    discount_percent NUMERIC(5, 2) CHECK (discount_percent >= 0 AND discount_percent <= 100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_recommended BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT product_variant_terms_unique_month UNIQUE (product_variant_id, months)
);

CREATE INDEX IF NOT EXISTS idx_product_variant_terms_variant_id
  ON product_variant_terms(product_variant_id);
CREATE INDEX IF NOT EXISTS idx_product_variant_terms_active
  ON product_variant_terms(is_active);
CREATE INDEX IF NOT EXISTS idx_product_variant_terms_sort
  ON product_variant_terms(product_variant_id, sort_order);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS term_months INTEGER CHECK (term_months > 0);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS term_months INTEGER CHECK (term_months > 0),
  ADD COLUMN IF NOT EXISTS base_price_cents INTEGER CHECK (base_price_cents >= 0),
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5, 2) CHECK (discount_percent >= 0 AND discount_percent <= 100);

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS term_months INTEGER CHECK (term_months > 0),
  ADD COLUMN IF NOT EXISTS base_price_cents INTEGER CHECK (base_price_cents >= 0),
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5, 2) CHECK (discount_percent >= 0 AND discount_percent <= 100);

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS term_months INTEGER CHECK (term_months > 0),
  ADD COLUMN IF NOT EXISTS base_price_cents INTEGER CHECK (base_price_cents >= 0),
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5, 2) CHECK (discount_percent >= 0 AND discount_percent <= 100);

COMMIT;

-- Down Migration
BEGIN;

-- Additive migration - no rollback included.

COMMIT;
