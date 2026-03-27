-- Local -> Production catalog transfer
-- Generated from local DB rows on 2026-03-27
-- Scope: 3 sub-categories + 3 products
-- Products:
--   - figma-professional-24-months
--   - bolt-new-pro-12-months
--   - canva-pro-12-months

BEGIN;

-- =====================================================
-- 0) Schema compatibility guard (for older prod schemas)
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
      'b499343a-2737-444d-802e-645d76eaf8ce'::uuid,
      'Design'::varchar,
      'Figma'::varchar,
      'figma'::varchar,
      '2026-03-24 21:09:42.568493'::timestamp,
      '2026-03-24 21:09:42.568493'::timestamp
    ),
    (
      '8b4b7deb-305c-4de5-83c5-64fa42bd4fc0'::uuid,
      'AI'::varchar,
      'Bolt.new'::varchar,
      'bolt-new'::varchar,
      '2026-03-25 00:20:57.05429'::timestamp,
      '2026-03-25 00:20:57.05429'::timestamp
    ),
    (
      'bf04bdd6-9f1c-468e-a10d-6a294c9163aa'::uuid,
      'Design, Productivity'::varchar,
      'Canva'::varchar,
      'canva'::varchar,
      '2026-03-27 01:05:39.451826'::timestamp,
      '2026-03-27 01:05:39.451826'::timestamp
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
      '6545eef0-0bf3-497b-b911-6effc46c4f32'::uuid,
      'Figma Professional 24 Months Subscription'::varchar,
      'figma-professional-24-months'::varchar,
      'Access to all Figma Professional features.'::text,
      'figma'::varchar,
      'active'::varchar,
      $figma_json${"region": "GLOBAL", "features": ["Access to all Figma Professional features."], "platform": "Figma", "info_box_text": "This product includes access through a new private account. The account is not shared with other users.\nYou will receive login credentials (email and password). The account email cannot be changed.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order for the product.\nYour order enters the SubSlush fulfillment queue for manual account setup.\nOur team creates a new private account for you.\nDelivery is usually completed within 24 hours, but can take up to 72 hours.\nOnce ready, your login credentials (email and password) are sent to your email inbox.", "comparison_price_cents": 38400}$figma_json$::jsonb,
      '2026-03-24 21:09:42.568493'::timestamp,
      '2026-03-24 23:53:12.236759'::timestamp,
      'figma-logo'::varchar,
      'Design'::varchar,
      'USD'::varchar,
      NULL::integer,
      24::integer,
      7999::integer,
      'USD'::varchar,
      'Figma'::varchar
    ),
    (
      '0fc13ddf-9d89-41a1-a70e-be32abcba88d'::uuid,
      'Bolt.new Pro 12 Months Subscription'::varchar,
      'bolt-new-pro-12-months'::varchar,
      'Access Bolt.new Pro on your personal account with manual fulfillment by SubSlush.'::text,
      'bolt_new'::varchar,
      'active'::varchar,
      $bolt_json${"region": "GLOBAL", "features": ["Access to all Bolt.new Pro features."], "platform": "Bolt.new", "info_box_text": "This product is applied to your personal Bolt.new account.\nIf you do not currently have a Bolt.new account, SubSlush can apply it to a newly provisioned account when you select Upgrade New Account.\n\nDelivery is completed by applying a 100% off activation code to your account.\nAfter activation, do not change the billing method or upgrade the plan in the Bolt.new dashboard, as this may trigger automatic cancellation by Bolt.new's internal system.\nSubSlush is not responsible for cancellations caused by user-side account changes.", "upgrade_options": {"allow_new_account": true, "allow_own_account": true, "manual_monthly_upgrade": false, "own_account_credential_requirement": "email_and_password"}, "activation_guide": "Place your order and choose your upgrade option: Upgrade Own Account or Upgrade New Account (use Upgrade New Account if you do not have a Bolt.new account).\nIf you choose Upgrade Own Account, share your Bolt.new account email and password with SubSlush for fulfillment.\nIf you choose Upgrade New Account, no account details are needed; SubSlush will provision a new Bolt.new account for you.\nYour order is then handled by the SubSlush manual fulfillment queue. The team delivers the product by applying a 100% off activation code to the account.\nMost orders are completed within 24 hours, but delivery can take up to 72 hours.\nOnce activation is completed, you will receive an email notification; if you selected Upgrade New Account, that email will include your login credentials (email and password).\nAfter activation, do not change the billing method or upgrade the plan in the Bolt.new dashboard, as this can trigger automatic cancellation by Bolt.new's internal system.", "comparison_price_cents": 21600}$bolt_json$::jsonb,
      '2026-03-25 00:20:57.05429'::timestamp,
      '2026-03-25 00:29:05.071344'::timestamp,
      'bolt-logo'::varchar,
      'AI'::varchar,
      'USD'::varchar,
      NULL::integer,
      12::integer,
      9999::integer,
      'USD'::varchar,
      'Bolt.new'::varchar
    ),
    (
      '6d81d186-5254-472d-a3ef-30a87e7078c3'::uuid,
      'Canva Pro 12 months'::varchar,
      'canva-pro-12-months'::varchar,
      'Canva Pro annual access with invitation delivery sent to your email.'::text,
      'canva'::varchar,
      'active'::varchar,
      $canva_json${"region": "GLOBAL", "features": ["You have access to all Canva Pro features (including Photo AI), but excluding video AI."], "platform": "Canva", "info_box_text": "This product is delivered to your email. Please enter the email address where you want to receive it.", "upgrade_options": {"allow_new_account": false, "allow_own_account": true, "manual_monthly_upgrade": false, "own_account_credential_requirement": "email_only"}, "activation_guide": "During checkout, enter the email address where you want to receive delivery.\nMake sure the email address is correct, since delivery is sent to that exact inbox.\nAfter purchase, you will receive an invitation email to join a Canva Pro plan.\nOpen the invitation email and accept it to activate access.", "comparison_price_cents": 12000}$canva_json$::jsonb,
      '2026-03-27 01:05:39.451826'::timestamp,
      '2026-03-27 01:06:35.079924'::timestamp,
      'canva-logo'::varchar,
      'Design, Productivity'::varchar,
      'USD'::varchar,
      NULL::integer,
      12::integer,
      2999::integer,
      'USD'::varchar,
      'Canva'::varchar
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

COMMIT;
