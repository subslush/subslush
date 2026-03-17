-- Migration: Add product sub-category field
-- Created: 2026-03-17T12:00:00.000Z
-- Description: Adds optional sub-category taxonomy to products for grouped browsing.

-- Up Migration
BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sub_category VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_products_sub_category
  ON products(sub_category)
  WHERE sub_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_category_sub_category
  ON products(category, sub_category)
  WHERE category IS NOT NULL AND sub_category IS NOT NULL;

COMMIT;

-- Down Migration
BEGIN;

-- Additive migration - no rollback included.

COMMIT;
