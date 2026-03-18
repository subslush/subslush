-- Migration: Add product sub-categories table
-- Created: 2026-03-18T12:00:00.000Z
-- Description: Introduces persisted product sub-categories for admin management and sub-category scoped catalog workflows.

-- Up Migration
BEGIN;

CREATE TABLE IF NOT EXISTS product_sub_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(120) NOT NULL,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(160) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_sub_categories_slug
  ON product_sub_categories (slug);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_sub_categories_category_name_normalized
  ON product_sub_categories (LOWER(BTRIM(category)), LOWER(BTRIM(name)));

CREATE INDEX IF NOT EXISTS idx_product_sub_categories_category_normalized
  ON product_sub_categories (LOWER(BTRIM(category)));

WITH source_pairs AS (
  SELECT DISTINCT
    BTRIM(category) AS category,
    BTRIM(sub_category) AS name
  FROM products
  WHERE category IS NOT NULL
    AND BTRIM(category) <> ''
    AND sub_category IS NOT NULL
    AND BTRIM(sub_category) <> ''
), slug_bases AS (
  SELECT
    category,
    name,
    CASE
      WHEN BTRIM(regexp_replace(LOWER(name), '[^a-z0-9]+', '-', 'g'), '-') <> '' THEN
        BTRIM(regexp_replace(LOWER(name), '[^a-z0-9]+', '-', 'g'), '-')
      ELSE
        'sub-category'
    END AS slug_base
  FROM source_pairs
), ranked AS (
  SELECT
    category,
    name,
    slug_base,
    ROW_NUMBER() OVER (PARTITION BY slug_base ORDER BY category, name) AS slug_rank
  FROM slug_bases
), prepared AS (
  SELECT
    category,
    name,
    CASE
      WHEN slug_rank = 1 THEN slug_base
      ELSE slug_base || '-' || SUBSTRING(MD5(category || ':' || name), 1, 8)
    END AS slug
  FROM ranked
)
INSERT INTO product_sub_categories (category, name, slug)
SELECT category, name, slug
FROM prepared
ON CONFLICT DO NOTHING;

COMMIT;

-- Down Migration
BEGIN;

-- Additive migration - no rollback included.

COMMIT;
