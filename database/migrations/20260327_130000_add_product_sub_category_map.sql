-- Migration: Add product <-> sub-category mapping table (Phase 1)
-- Created: 2026-03-27T13:00:00.000Z
-- Description:
--   - Introduces many-to-many sub-category assignments for products
--   - Preserves legacy products.category + products.sub_category as primary assignment fields
--   - Backfills mapping rows from existing legacy category/sub_category values

-- Up Migration
BEGIN;

CREATE TABLE IF NOT EXISTS product_sub_category_map (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sub_category_id UUID NOT NULL REFERENCES product_sub_categories(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, sub_category_id)
);

CREATE INDEX IF NOT EXISTS idx_product_sub_category_map_sub_category
  ON product_sub_category_map(sub_category_id);

CREATE INDEX IF NOT EXISTS idx_product_sub_category_map_product
  ON product_sub_category_map(product_id);

CREATE INDEX IF NOT EXISTS idx_product_sub_category_map_primary
  ON product_sub_category_map(product_id, is_primary);

-- Ensure any legacy category/sub_category pairs missing from product_sub_categories are created.
WITH source_pairs AS (
  SELECT DISTINCT
    BTRIM(p.category) AS category,
    BTRIM(p.sub_category) AS name
  FROM products p
  WHERE p.category IS NOT NULL
    AND BTRIM(p.category) <> ''
    AND p.sub_category IS NOT NULL
    AND BTRIM(p.sub_category) <> ''
), missing_pairs AS (
  SELECT
    sp.category,
    sp.name
  FROM source_pairs sp
  LEFT JOIN product_sub_categories sc
    ON LOWER(BTRIM(sc.category)) = LOWER(sp.category)
   AND LOWER(BTRIM(sc.name)) = LOWER(sp.name)
  WHERE sc.id IS NULL
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
  FROM missing_pairs
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

-- Backfill mapping rows from legacy products.category + products.sub_category.
WITH mapped_pairs AS (
  SELECT
    p.id AS product_id,
    sc.id AS sub_category_id
  FROM products p
  JOIN product_sub_categories sc
    ON LOWER(BTRIM(sc.category)) = LOWER(BTRIM(COALESCE(p.category, '')))
   AND LOWER(BTRIM(sc.name)) = LOWER(BTRIM(COALESCE(p.sub_category, '')))
  WHERE BTRIM(COALESCE(p.category, '')) <> ''
    AND BTRIM(COALESCE(p.sub_category, '')) <> ''
)
INSERT INTO product_sub_category_map (
  product_id,
  sub_category_id,
  is_primary,
  created_at,
  updated_at
)
SELECT
  mp.product_id,
  mp.sub_category_id,
  TRUE,
  NOW(),
  NOW()
FROM mapped_pairs mp
ON CONFLICT (product_id, sub_category_id) DO UPDATE
SET
  is_primary = TRUE,
  updated_at = NOW();

-- Enforce a single primary row per product deterministically.
WITH ranked AS (
  SELECT
    product_id,
    sub_category_id,
    ROW_NUMBER() OVER (
      PARTITION BY product_id
      ORDER BY is_primary DESC, created_at ASC, sub_category_id ASC
    ) AS rn
  FROM product_sub_category_map
)
UPDATE product_sub_category_map target
SET
  is_primary = ranked.rn = 1,
  updated_at = NOW()
FROM ranked
WHERE ranked.product_id = target.product_id
  AND ranked.sub_category_id = target.sub_category_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_sub_category_map_primary_per_product
  ON product_sub_category_map(product_id)
  WHERE is_primary = TRUE;

COMMIT;

-- Down Migration
BEGIN;

-- Additive migration - no rollback included.

COMMIT;
