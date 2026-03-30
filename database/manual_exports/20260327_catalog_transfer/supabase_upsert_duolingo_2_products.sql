-- Local -> Production catalog transfer
-- Generated from curated source on 2026-03-27
-- Scope: 1 sub-category + 2 products
-- Products:
--   - duolingo-max-12-months
--   - duolingo-super-12-months

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

-- =====================================================
-- 1) Sub-categories (upsert first)
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
      '4b7a4fe1-1a3a-4736-ba60-185815753dff'::uuid,
      'Education, Productivity'::varchar,
      'Duolingo'::varchar,
      'duolingo'::varchar,
      '2026-03-27 13:50:00.000000'::timestamp,
      '2026-03-27 13:50:00.000000'::timestamp
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
-- 2) Products (upsert second)
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
      '7c7b4416-2c0e-497f-8453-b8700d6776a8'::uuid,
      'Duolingo Max 12 Months Subscription'::varchar,
      'duolingo-max-12-months'::varchar,
      'Duolingo Max annual access delivered by invitation to your existing Duolingo account.'::text,
      'duolingo'::varchar,
      'active'::varchar,
      $duolingo_max_json${"region": "GLOBAL", "features": ["Access to all Duolingo Max features."], "platform": "Duolingo", "info_box_text": "Your subscription is delivered directly to your Duolingo account.\nAt checkout, provide the email address linked to that account.\nYou will receive an invitation to join the Duolingo Max plan on the same account.", "upgrade_options": {"allow_new_account": false, "allow_own_account": true, "manual_monthly_upgrade": false, "own_account_credential_requirement": "email_only"}, "activation_guide": "During checkout, provide the email address linked to your Duolingo account.\nMake sure the email is correct, since delivery is sent to that exact Duolingo account.\nYou will receive an invitation to join the Duolingo Max plan.\nOpen and accept the invite to activate access on your account.", "comparison_price_cents": 19900}$duolingo_max_json$::jsonb,
      '2026-03-27 13:50:00.000000'::timestamp,
      '2026-03-27 13:50:00.000000'::timestamp,
      'duolingo-logo'::varchar,
      'Education, Productivity'::varchar,
      'USD'::varchar,
      NULL::integer,
      12::integer,
      5499::integer,
      'USD'::varchar,
      'Duolingo'::varchar
    ),
    (
      '0e326a80-7b87-4e89-9aef-4c33923a77f3'::uuid,
      'Duolingo Super 12 Months Subscription'::varchar,
      'duolingo-super-12-months'::varchar,
      'Duolingo Super annual access delivered by invitation to your existing Duolingo account.'::text,
      'duolingo'::varchar,
      'active'::varchar,
      $duolingo_super_json${"region": "GLOBAL", "features": ["Access to all Duolingo Super features."], "platform": "Duolingo", "info_box_text": "Your subscription is delivered directly to your Duolingo account.\nAt checkout, provide the email address linked to that account.\nYou will receive an invitation to join the Duolingo Super plan on the same account.", "upgrade_options": {"allow_new_account": false, "allow_own_account": true, "manual_monthly_upgrade": false, "own_account_credential_requirement": "email_only"}, "activation_guide": "During checkout, provide the email address linked to your Duolingo account.\nMake sure the email is correct, since delivery is sent to that exact Duolingo account.\nYou will receive an invitation to join the Duolingo Super plan.\nOpen and accept the invite to activate access on your account.", "comparison_price_cents": 9999}$duolingo_super_json$::jsonb,
      '2026-03-27 13:50:00.000000'::timestamp,
      '2026-03-27 13:50:00.000000'::timestamp,
      'duolingo-logo'::varchar,
      'Education, Productivity'::varchar,
      'USD'::varchar,
      NULL::integer,
      12::integer,
      2999::integer,
      'USD'::varchar,
      'Duolingo'::varchar
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
-- 3) Sub-category mapping sync (Phase 1 taxonomy table)
-- =====================================================
WITH target_products AS (
  SELECT id, category, sub_category
  FROM products
  WHERE slug IN ('duolingo-max-12-months', 'duolingo-super-12-months')
), resolved_pairs AS (
  SELECT
    tp.id AS product_id,
    sc.id AS sub_category_id
  FROM target_products tp
  JOIN product_sub_categories sc
    ON LOWER(BTRIM(sc.category)) = LOWER(BTRIM(tp.category))
   AND LOWER(BTRIM(sc.name)) = LOWER(BTRIM(tp.sub_category))
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

WITH ranked AS (
  SELECT
    pscm.product_id,
    pscm.sub_category_id,
    ROW_NUMBER() OVER (
      PARTITION BY pscm.product_id
      ORDER BY pscm.is_primary DESC, pscm.created_at ASC, pscm.sub_category_id ASC
    ) AS rn
  FROM product_sub_category_map pscm
  JOIN products p
    ON p.id = pscm.product_id
  WHERE p.slug IN ('duolingo-max-12-months', 'duolingo-super-12-months')
)
UPDATE product_sub_category_map target
SET
  is_primary = ranked.rn = 1,
  updated_at = NOW()
FROM ranked
WHERE ranked.product_id = target.product_id
  AND ranked.sub_category_id = target.sub_category_id;

COMMIT;
