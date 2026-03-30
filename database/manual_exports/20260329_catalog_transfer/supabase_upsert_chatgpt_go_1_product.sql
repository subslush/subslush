-- Local -> Production catalog transfer
-- Generated from curated source on 2026-03-29
-- Scope: 1 sub-category + 1 product
-- Products:
--   - chatgpt-go-12-months-subscription

BEGIN;

-- =====================================================
-- 0) Schema compatibility guards
-- =====================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sub_category VARCHAR(120),
  ADD COLUMN IF NOT EXISTS duration_months INTEGER,
  ADD COLUMN IF NOT EXISTS fixed_price_cents INTEGER,
  ADD COLUMN IF NOT EXISTS fixed_price_currency VARCHAR(10);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_duration_months_check'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_duration_months_check
      CHECK (duration_months IS NULL OR duration_months > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_fixed_price_cents_check'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_fixed_price_cents_check
      CHECK (fixed_price_cents IS NULL OR fixed_price_cents >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'products_fixed_price_pair_check'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_fixed_price_pair_check
      CHECK (
        (fixed_price_cents IS NULL AND fixed_price_currency IS NULL)
        OR (fixed_price_cents IS NOT NULL AND fixed_price_currency IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_sub_category
  ON products(sub_category)
  WHERE sub_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_category_sub_category
  ON products(category, sub_category)
  WHERE category IS NOT NULL AND sub_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_duration_months
  ON products(duration_months)
  WHERE duration_months IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_fixed_price
  ON products(fixed_price_currency, fixed_price_cents)
  WHERE fixed_price_cents IS NOT NULL;

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

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_sub_category_map_primary_per_product
  ON product_sub_category_map(product_id)
  WHERE is_primary = TRUE;

CREATE TABLE IF NOT EXISTS product_category_map (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_key VARCHAR(120) NOT NULL,
  category VARCHAR(120) NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (product_id, category_key)
);

CREATE INDEX IF NOT EXISTS idx_product_category_map_product
  ON product_category_map(product_id);

CREATE INDEX IF NOT EXISTS idx_product_category_map_category_key
  ON product_category_map(category_key);

CREATE INDEX IF NOT EXISTS idx_product_category_map_primary
  ON product_category_map(product_id, is_primary);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_category_map_primary_per_product
  ON product_category_map(product_id)
  WHERE is_primary = TRUE;

-- =====================================================
-- 1) Sub-category (upsert first)
-- =====================================================
WITH source_sub_categories (
  id,
  category,
  name,
  slug,
  created_at,
  updated_at
) AS (
  VALUES
    (
      'f9f19370-3f9b-58e3-bb5a-59e6f25f4147'::uuid,
      'AI, Productivity'::varchar,
      'ChatGPT'::varchar,
      'chatgpt'::varchar,
      '2026-03-29 23:55:00.000000'::timestamp,
      '2026-03-29 23:55:00.000000'::timestamp
    )
), updated_by_name AS (
  UPDATE product_sub_categories target
  SET
    category = source.category,
    name = source.name,
    slug = source.slug,
    updated_at = source.updated_at
  FROM source_sub_categories source
  WHERE LOWER(BTRIM(target.category)) = LOWER(BTRIM(source.category))
    AND LOWER(BTRIM(target.name)) = LOWER(BTRIM(source.name))
  RETURNING source.id
)
INSERT INTO product_sub_categories (
  id,
  category,
  name,
  slug,
  created_at,
  updated_at
)
SELECT
  source.id,
  source.category,
  source.name,
  source.slug,
  source.created_at,
  source.updated_at
FROM source_sub_categories source
LEFT JOIN updated_by_name upd
  ON upd.id = source.id
WHERE upd.id IS NULL
ON CONFLICT (slug) DO UPDATE
SET
  category = EXCLUDED.category,
  name = EXCLUDED.name,
  updated_at = EXCLUDED.updated_at;

-- =====================================================
-- 2) Product (upsert second)
-- =====================================================
WITH source_products (
  id,
  name,
  slug,
  description,
  service_type,
  status,
  metadata,
  created_at,
  updated_at,
  logo_key,
  category,
  default_currency,
  max_subscriptions,
  duration_months,
  fixed_price_cents,
  fixed_price_currency,
  sub_category
) AS (
  VALUES
    (
      'e49dcaff-08c0-4254-ab13-9b760c5069b0'::uuid,
      'ChatGPT Go 12 Months Subscription'::varchar,
      'chatgpt-go-12-months-subscription'::varchar,
      'ChatGPT Go 12 Months Subscription with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'chatgpt'::varchar,
      'active'::varchar,
      $chatgpt_go_12_months_subscription_json${"region": "GLOBAL", "features": ["Everything in Free and:", "More access to our flagship model GPT-5.3", "More messages", "More uploads", "More image creation", "Longer memory"], "platform": "ChatGPT", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nYou may change the email and password.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order.\nYou will receive a private account with login credentials. Use same account for 12 months.\nSign in and update email/password if preferred.\nUse the included ChatGPT Go account features according to the listed feature set and limitations.", "comparison_price_cents": 9600}$chatgpt_go_12_months_subscription_json$::jsonb,
      '2026-03-29 23:55:00.000000'::timestamp,
      '2026-03-29 23:55:00.000000'::timestamp,
      'chatgpt-logo'::varchar,
      'AI'::varchar,
      'USD'::varchar,
      NULL::integer,
      12::integer,
      2999::integer,
      'USD'::varchar,
      'ChatGPT'::varchar
    )
)
INSERT INTO products (
  id,
  name,
  slug,
  description,
  service_type,
  status,
  metadata,
  created_at,
  updated_at,
  logo_key,
  category,
  default_currency,
  max_subscriptions,
  duration_months,
  fixed_price_cents,
  fixed_price_currency,
  sub_category
)
SELECT
  id,
  name,
  slug,
  description,
  service_type,
  status,
  metadata,
  created_at,
  updated_at,
  logo_key,
  category,
  default_currency,
  max_subscriptions,
  duration_months,
  fixed_price_cents,
  fixed_price_currency,
  sub_category
FROM source_products
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  service_type = EXCLUDED.service_type,
  status = EXCLUDED.status,
  metadata = EXCLUDED.metadata,
  updated_at = EXCLUDED.updated_at,
  logo_key = EXCLUDED.logo_key,
  category = EXCLUDED.category,
  default_currency = EXCLUDED.default_currency,
  max_subscriptions = EXCLUDED.max_subscriptions,
  duration_months = EXCLUDED.duration_months,
  fixed_price_cents = EXCLUDED.fixed_price_cents,
  fixed_price_currency = EXCLUDED.fixed_price_currency,
  sub_category = EXCLUDED.sub_category;

-- =====================================================
-- 3) Sub-category mapping sync
-- =====================================================
WITH source_product_sub_categories (product_slug, sub_category_slug) AS (
  VALUES
    ('chatgpt-go-12-months-subscription'::varchar, 'chatgpt'::varchar)
), resolved_pairs AS (
  SELECT
    p.id AS product_id,
    sc.id AS sub_category_id
  FROM source_product_sub_categories src
  JOIN products p
    ON p.slug = src.product_slug
  JOIN product_sub_categories sc
    ON sc.slug = src.sub_category_slug
), target_products AS (
  SELECT DISTINCT product_id
  FROM resolved_pairs
)
DELETE FROM product_sub_category_map m
USING target_products tp
WHERE m.product_id = tp.product_id
  AND NOT EXISTS (
    SELECT 1
    FROM resolved_pairs rp
    WHERE rp.product_id = m.product_id
      AND rp.sub_category_id = m.sub_category_id
  );

WITH source_product_sub_categories (product_slug, sub_category_slug) AS (
  VALUES
    ('chatgpt-go-12-months-subscription'::varchar, 'chatgpt'::varchar)
), resolved_pairs AS (
  SELECT
    p.id AS product_id,
    sc.id AS sub_category_id
  FROM source_product_sub_categories src
  JOIN products p
    ON p.slug = src.product_slug
  JOIN product_sub_categories sc
    ON sc.slug = src.sub_category_slug
)
INSERT INTO product_sub_category_map (
  product_id,
  sub_category_id,
  is_primary,
  created_at,
  updated_at
)
SELECT
  rp.product_id,
  rp.sub_category_id,
  TRUE,
  NOW(),
  NOW()
FROM resolved_pairs rp
ON CONFLICT (product_id, sub_category_id) DO UPDATE
SET
  is_primary = TRUE,
  updated_at = NOW();

WITH target_products AS (
  SELECT id AS product_id
  FROM products
  WHERE slug IN ('chatgpt-go-12-months-subscription')
), ranked AS (
  SELECT
    pscm.product_id,
    pscm.sub_category_id,
    ROW_NUMBER() OVER (
      PARTITION BY pscm.product_id
      ORDER BY pscm.is_primary DESC, pscm.created_at ASC, pscm.sub_category_id ASC
    ) AS rn
  FROM product_sub_category_map pscm
  JOIN target_products tp
    ON tp.product_id = pscm.product_id
)
UPDATE product_sub_category_map target
SET
  is_primary = ranked.rn = 1,
  updated_at = NOW()
FROM ranked
WHERE ranked.product_id = target.product_id
  AND ranked.sub_category_id = target.sub_category_id;

-- =====================================================
-- 4) Category mapping sync
-- =====================================================
WITH source_product_categories (product_slug, category_key, category, sort_order) AS (
  VALUES
    ('chatgpt-go-12-months-subscription'::varchar, 'ai'::varchar, 'AI'::varchar, 1::integer),
    ('chatgpt-go-12-months-subscription'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 2::integer)
), resolved AS (
  SELECT
    p.id AS product_id,
    src.category_key,
    src.category,
    src.sort_order
  FROM source_product_categories src
  JOIN products p
    ON p.slug = src.product_slug
), target_products AS (
  SELECT DISTINCT product_id
  FROM resolved
)
DELETE FROM product_category_map pcm
USING target_products tp
WHERE pcm.product_id = tp.product_id
  AND NOT EXISTS (
    SELECT 1
    FROM resolved r
    WHERE r.product_id = pcm.product_id
      AND r.category_key = pcm.category_key
  );

WITH source_product_categories (product_slug, category_key, category, sort_order) AS (
  VALUES
    ('chatgpt-go-12-months-subscription'::varchar, 'ai'::varchar, 'AI'::varchar, 1::integer),
    ('chatgpt-go-12-months-subscription'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 2::integer)
), resolved AS (
  SELECT
    p.id AS product_id,
    src.category_key,
    src.category,
    src.sort_order
  FROM source_product_categories src
  JOIN products p
    ON p.slug = src.product_slug
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
  r.sort_order = 1,
  NOW(),
  NOW()
FROM resolved r
ON CONFLICT (product_id, category_key) DO UPDATE
SET
  category = EXCLUDED.category,
  is_primary = EXCLUDED.is_primary,
  updated_at = NOW();

WITH target_products AS (
  SELECT id AS product_id
  FROM products
  WHERE slug IN ('chatgpt-go-12-months-subscription')
), ranked AS (
  SELECT
    pcm.product_id,
    pcm.category_key,
    ROW_NUMBER() OVER (
      PARTITION BY pcm.product_id
      ORDER BY pcm.is_primary DESC, pcm.created_at ASC, pcm.category_key ASC
    ) AS rn
  FROM product_category_map pcm
  JOIN target_products tp
    ON tp.product_id = pcm.product_id
)
UPDATE product_category_map target
SET
  is_primary = ranked.rn = 1,
  updated_at = NOW()
FROM ranked
WHERE ranked.product_id = target.product_id
  AND ranked.category_key = target.category_key;

COMMIT;
