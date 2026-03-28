-- Migration: Add product category mapping table (Phase 1)
-- Created: 2026-03-28T12:00:00.000Z
-- Description:
--   - Introduces many-to-many category assignments for products
--   - Preserves products.category as primary category for backward compatibility
--   - Backfills category assignments from legacy products.category values

-- Up Migration
BEGIN;

CREATE TABLE IF NOT EXISTS product_category_map (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_key VARCHAR(120) NOT NULL,
  category VARCHAR(120) NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, category_key),
  CONSTRAINT product_category_map_category_key_check CHECK (
    BTRIM(category_key) <> ''
    AND category_key = LOWER(BTRIM(category_key))
  ),
  CONSTRAINT product_category_map_category_check CHECK (
    BTRIM(category) <> ''
  )
);

CREATE INDEX IF NOT EXISTS idx_product_category_map_product
  ON product_category_map(product_id);

CREATE INDEX IF NOT EXISTS idx_product_category_map_category_key
  ON product_category_map(category_key);

CREATE INDEX IF NOT EXISTS idx_product_category_map_primary
  ON product_category_map(product_id, is_primary);

-- Backfill category rows from products.category.
WITH split_categories AS (
  SELECT
    p.id AS product_id,
    BTRIM(part.category) AS category,
    part.ordinality AS ordinality
  FROM products p
  CROSS JOIN LATERAL regexp_split_to_table(
    COALESCE(p.category, ''),
    ','
  ) WITH ORDINALITY AS part(category, ordinality)
  WHERE BTRIM(part.category) <> ''
), deduped AS (
  SELECT
    sc.product_id,
    LOWER(BTRIM(sc.category)) AS category_key,
    sc.category,
    MIN(sc.ordinality) AS min_ordinality
  FROM split_categories sc
  GROUP BY sc.product_id, LOWER(BTRIM(sc.category)), sc.category
), ranked AS (
  SELECT
    d.product_id,
    d.category_key,
    d.category,
    ROW_NUMBER() OVER (
      PARTITION BY d.product_id
      ORDER BY d.min_ordinality ASC, d.category_key ASC
    ) AS rn
  FROM deduped d
)
INSERT INTO product_category_map (
  product_id,
  category_key,
  category,
  is_primary,
  created_at,
  updated_at
)
SELECT
  r.product_id,
  r.category_key,
  r.category,
  r.rn = 1,
  NOW(),
  NOW()
FROM ranked r
ON CONFLICT (product_id, category_key) DO UPDATE
SET
  category = EXCLUDED.category,
  is_primary = EXCLUDED.is_primary,
  updated_at = NOW();

-- Enforce a single primary row per product deterministically.
WITH ranked AS (
  SELECT
    product_id,
    category_key,
    ROW_NUMBER() OVER (
      PARTITION BY product_id
      ORDER BY is_primary DESC, created_at ASC, category_key ASC
    ) AS rn
  FROM product_category_map
)
UPDATE product_category_map target
SET
  is_primary = ranked.rn = 1,
  updated_at = NOW()
FROM ranked
WHERE ranked.product_id = target.product_id
  AND ranked.category_key = target.category_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_category_map_primary_per_product
  ON product_category_map(product_id)
  WHERE is_primary = TRUE;

COMMIT;

-- Down Migration
BEGIN;

-- Additive migration - no rollback included.

COMMIT;
