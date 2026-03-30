-- Local -> Production catalog transfer
-- Generated from curated source on 2026-03-29
-- Scope: 13 sub-categories + 44 products

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
      '5ed2f6d0-c1a2-5f78-9696-bfa0491f6383'::uuid,
      'Design, Productivity'::varchar,
      'Adobe'::varchar,
      'adobe-creative-clound'::varchar,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp
    ),
    (
      '1ee832aa-0336-5453-87de-6b4f12b4702b'::uuid,
      'Streaming'::varchar,
      'Amazon Prime Video'::varchar,
      'amazon-prime-video'::varchar,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp
    ),
    (
      'a516af4e-53da-5f24-b978-0c45472bfc34'::uuid,
      'Music'::varchar,
      'Apple'::varchar,
      'apple'::varchar,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp
    ),
    (
      'f9f19370-3f9b-58e3-bb5a-59e6f25f4147'::uuid,
      'AI, Productivity'::varchar,
      'ChatGPT'::varchar,
      'chatgpt'::varchar,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp
    ),
    (
      '2a551f87-86db-5686-94d7-7fc7dc6f3f40'::uuid,
      'Productivity'::varchar,
      'Linkedin'::varchar,
      'linkedin'::varchar,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp
    ),
    (
      'f08c325a-5724-5c81-8921-24947b4ab7c4'::uuid,
      'AI'::varchar,
      'Loveable'::varchar,
      'loveable'::varchar,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp
    ),
    (
      'c264618b-cce6-5777-8e65-3dd6ad7edfa9'::uuid,
      'Fitness'::varchar,
      'Myfitnesspal'::varchar,
      'myfitnesspal'::varchar,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp
    ),
    (
      'da216937-0a00-5cb6-b87b-d321e970422c'::uuid,
      'AI'::varchar,
      'n8n'::varchar,
      'n8n'::varchar,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp
    ),
    (
      '8243710f-33c7-52c7-9946-61285ff6796b'::uuid,
      'Streaming'::varchar,
      'Netflix'::varchar,
      'netflix'::varchar,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp
    ),
    (
      'a5457413-72ba-5f49-a1e5-36c7efac9480'::uuid,
      'Productivity'::varchar,
      'Notion'::varchar,
      'notion'::varchar,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp
    ),
    (
      'c02df5a9-b67f-5088-91d0-57d5f16be37d'::uuid,
      'AI'::varchar,
      'Perplexity'::varchar,
      'perplexity'::varchar,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp
    ),
    (
      '62846d8c-ff9a-5766-a2ea-66c2c01a68af'::uuid,
      'Music'::varchar,
      'Spotify'::varchar,
      'spotify'::varchar,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp
    ),
    (
      '7b8d4b14-0800-5fe0-bec8-32737fe4792e'::uuid,
      'Streaming, Music'::varchar,
      'Youtube'::varchar,
      'youtube'::varchar,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp
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
      'f85fa89c-8fce-5d04-9f51-ce7383d33a10'::uuid,
      'Adobe Creative Cloud 1 Month Subscription'::varchar,
      'adobe-creative-cloud-1-month-subscription'::varchar,
      'Adobe Creative Cloud 1 Month Subscription with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'adobe_creative_cloud'::varchar,
      'active'::varchar,
      $adobe_creative_cloud_1_month_subscription_json${"region": "GLOBAL", "features": ["Includes access to all Adobe Creative Cloud applications, 4000 AI credits, can be used on 2 devices.", "Does not include access to Software 3D."], "platform": "Adobe Creative Cloud", "info_box_text": "This offer provides private account access only, and the account is not shared with other users.\nYou will receive a new account with email and password.\nAfter delivery, you can change the account password.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order.\nYou will receive a new private Adobe account with email and password.\nSign in and confirm Creative Cloud access is active.\nChange the account password after delivery.", "comparison_price_cents": 6999}$adobe_creative_cloud_1_month_subscription_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'adobecc-logo'::varchar,
      'Design'::varchar,
      'USD'::varchar,
      NULL::integer,
      1::integer,
      2999::integer,
      'USD'::varchar,
      'Adobe'::varchar
    ),
    (
      'fe594c61-cd76-5b6c-be75-760cdd6e30f2'::uuid,
      'Adobe Creative Cloud 12 Months Subscription (Prepaid)'::varchar,
      'adobe-creative-cloud-12-months-subscription-prepaid'::varchar,
      'Adobe Creative Cloud 12 Months Subscription (Prepaid) with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'adobe_creative_cloud'::varchar,
      'active'::varchar,
      $adobe_creative_cloud_12_months_subscription_prepaid_json${"region": "GLOBAL", "features": ["Includes access to all Adobe Creative Cloud applications, 1TB cloud storage, 4000 AI credits per month (48000 credits per year), Generative Fill Text to Image and other AI features, can be used on 3 devices."], "platform": "Adobe Creative Cloud", "info_box_text": "This offer provides private account access only, and the account is not shared with other users.\nYou may change the account email and password, and enable your own 2FA authenticator.\nThe same account is used for the full 12-month prepaid term.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your prepaid Adobe Creative Cloud 12-month order.\nYou will receive one private Adobe account for the full term.\nSign in and secure the account by changing email, changing password, and enabling your own 2FA authenticator.\nContinue using the same account for the full 12-month subscription period.", "comparison_price_cents": 83988}$adobe_creative_cloud_12_months_subscription_prepaid_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'adobecc-logo'::varchar,
      'Design'::varchar,
      'USD'::varchar,
      NULL::integer,
      12::integer,
      10999::integer,
      'USD'::varchar,
      'Adobe'::varchar
    ),
    (
      '10d13d6e-a808-52fd-8523-a773bef8dddf'::uuid,
      'Adobe Creative Cloud 3 Months Subscription'::varchar,
      'adobe-creative-cloud-3-months-subscription'::varchar,
      'Adobe Creative Cloud 3 Months Subscription with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'adobe_creative_cloud'::varchar,
      'active'::varchar,
      $adobe_creative_cloud_3_months_subscription_json${"region": "GLOBAL", "features": ["Includes access to all Adobe Creative Cloud applications, 4000 AI credits per month, can be used on 2 devices.", "Does not include access to Software 3D."], "platform": "Adobe Creative Cloud", "info_box_text": "This offer provides private account access only, and the account is not shared with other users.\nYou will receive a new account with email and password.\nA new account is delivered for each month in the term.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order for the 3-month package.\nYou will receive a new private Adobe account with email and password for the current month.\nA new Adobe account is delivered again for each additional month in the term.\nUse the latest delivered credentials each month and update password after delivery if needed.", "comparison_price_cents": 20997}$adobe_creative_cloud_3_months_subscription_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'adobecc-logo'::varchar,
      'Design'::varchar,
      'USD'::varchar,
      NULL::integer,
      3::integer,
      4999::integer,
      'USD'::varchar,
      'Adobe'::varchar
    ),
    (
      '12391762-c792-5ac2-aa60-357f2338e02e'::uuid,
      'Adobe Creative Cloud 6 Months Subscription'::varchar,
      'adobe-creative-cloud-6-months-subscription'::varchar,
      'Adobe Creative Cloud 6 Months Subscription with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'adobe_creative_cloud'::varchar,
      'active'::varchar,
      $adobe_creative_cloud_6_months_subscription_json${"region": "GLOBAL", "features": ["Includes access to all Adobe Creative Cloud applications, 4000 AI credits per month, can be used on 2 devices.", "Does not include access to Software 3D."], "platform": "Adobe Creative Cloud", "info_box_text": "This offer provides private account access only, and the account is not shared with other users.\nYou will receive a new account with email and password.\nA new account is delivered for each month in the term.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order for the 6-month package.\nYou will receive a new private Adobe account with email and password for the current month.\nA new Adobe account is delivered again for each additional month in the term.\nUse the latest delivered credentials each month and update password after delivery if needed.", "comparison_price_cents": 41994}$adobe_creative_cloud_6_months_subscription_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'adobecc-logo'::varchar,
      'Design'::varchar,
      'USD'::varchar,
      NULL::integer,
      6::integer,
      7999::integer,
      'USD'::varchar,
      'Adobe'::varchar
    ),
    (
      'e77f6e59-c3e2-5178-a254-55993ff561c2'::uuid,
      'Amazon Prime Video 1 Month Subscription'::varchar,
      'amazon-prime-video-1-month-subscription'::varchar,
      'Amazon Prime Video 1 Month Subscription with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'amazon_prime_video'::varchar,
      'active'::varchar,
      $amazon_prime_video_1_month_subscription_json${"region": "GLOBAL", "features": ["Includes all access to Amazon Prime Video features.", "Includes access to Luna Games.", "Does not include access to Prime Video Ultra, or Amazon Prime for making purchases on the Amazon marketplace."], "platform": "Amazon Prime Video", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nYou may change the email and password and manage the account.\nThis product is for standalone Amazon Prime Video only, and Prime Video Ultra is not included.\nDo not use this account for Amazon shopping orders, or the account may be suspended with no replacement or refund.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order and receive private account credentials.\nSign in and update email/password if you want to manage the account yourself.\nUse the account only for standalone Amazon Prime Video (Prime Video Ultra is not included).\nDo not place Amazon shopping orders on this account, or it may be suspended with no replacement or refund.", "comparison_price_cents": 899}$amazon_prime_video_1_month_subscription_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'amazonprimevideo-logo'::varchar,
      'Streaming'::varchar,
      'USD'::varchar,
      NULL::integer,
      1::integer,
      499::integer,
      'USD'::varchar,
      'Amazon Prime Video'::varchar
    ),
    (
      '88486451-f303-5d39-88e4-1b0d9289a0c4'::uuid,
      'Amazon Prime Video 12 Months Subscription'::varchar,
      'amazon-prime-video-12-months-subscription'::varchar,
      'Amazon Prime Video 12 Months Subscription with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'amazon_prime_video'::varchar,
      'active'::varchar,
      $amazon_prime_video_12_months_subscription_json${"region": "GLOBAL", "features": ["Includes all access to Amazon Prime Video features.", "Includes access to Luna Games.", "Does not include access to Prime Video Ultra, or Amazon Prime for making purchases on the Amazon marketplace."], "platform": "Amazon Prime Video", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nYou may change the email and password and manage the account.\nThis product is for standalone Amazon Prime Video only, and Prime Video Ultra is not included.\nDo not use this account for Amazon shopping orders, or the account may be suspended with no replacement or refund.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order and receive private account credentials.\nSign in and update email/password if you want to manage the account yourself.\nUse the account only for standalone Amazon Prime Video (Prime Video Ultra is not included).\nDo not place Amazon shopping orders on this account, or it may be suspended with no replacement or refund.", "comparison_price_cents": 10788}$amazon_prime_video_12_months_subscription_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'amazonprimevideo-logo'::varchar,
      'Streaming'::varchar,
      'USD'::varchar,
      NULL::integer,
      12::integer,
      2999::integer,
      'USD'::varchar,
      'Amazon Prime Video'::varchar
    ),
    (
      '21c9c9c8-12e5-55c2-a346-609b668dc2be'::uuid,
      'Amazon Prime Video 3 Months Subscription'::varchar,
      'amazon-prime-video-3-months-subscription'::varchar,
      'Amazon Prime Video 3 Months Subscription with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'amazon_prime_video'::varchar,
      'active'::varchar,
      $amazon_prime_video_3_months_subscription_json${"region": "GLOBAL", "features": ["Includes all access to Amazon Prime Video features.", "Includes access to Luna Games.", "Does not include access to Prime Video Ultra, or Amazon Prime for making purchases on the Amazon marketplace."], "platform": "Amazon Prime Video", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nYou may change the email and password and manage the account.\nThis product is for standalone Amazon Prime Video only, and Prime Video Ultra is not included.\nDo not use this account for Amazon shopping orders, or the account may be suspended with no replacement or refund.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order and receive private account credentials.\nSign in and update email/password if you want to manage the account yourself.\nUse the account only for standalone Amazon Prime Video (Prime Video Ultra is not included).\nDo not place Amazon shopping orders on this account, or it may be suspended with no replacement or refund.", "comparison_price_cents": 2697}$amazon_prime_video_3_months_subscription_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'amazonprimevideo-logo'::varchar,
      'Streaming'::varchar,
      'USD'::varchar,
      NULL::integer,
      3::integer,
      1499::integer,
      'USD'::varchar,
      'Amazon Prime Video'::varchar
    ),
    (
      'f837225e-094b-5046-ab67-9ff96b6ddde8'::uuid,
      'Amazon Prime Video 6 Months Subscription'::varchar,
      'amazon-prime-video-6-months-subscription'::varchar,
      'Amazon Prime Video 6 Months Subscription with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'amazon_prime_video'::varchar,
      'active'::varchar,
      $amazon_prime_video_6_months_subscription_json${"region": "GLOBAL", "features": ["Includes all access to Amazon Prime Video features.", "Includes access to Luna Games.", "Does not include access to Prime Video Ultra, or Amazon Prime for making purchases on the Amazon marketplace."], "platform": "Amazon Prime Video", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nYou may change the email and password and manage the account.\nThis product is for standalone Amazon Prime Video only, and Prime Video Ultra is not included.\nDo not use this account for Amazon shopping orders, or the account may be suspended with no replacement or refund.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order and receive private account credentials.\nSign in and update email/password if you want to manage the account yourself.\nUse the account only for standalone Amazon Prime Video (Prime Video Ultra is not included).\nDo not place Amazon shopping orders on this account, or it may be suspended with no replacement or refund.", "comparison_price_cents": 5394}$amazon_prime_video_6_months_subscription_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'amazonprimevideo-logo'::varchar,
      'Streaming'::varchar,
      'USD'::varchar,
      NULL::integer,
      6::integer,
      1799::integer,
      'USD'::varchar,
      'Amazon Prime Video'::varchar
    ),
    (
      'f1e63a86-a529-5464-b83e-713d2b8a95d2'::uuid,
      'Apple Music 1 Month Subscription'::varchar,
      'apple-music-1-month-subscription'::varchar,
      'Apple Music 1 Month Subscription with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'apple_music'::varchar,
      'active'::varchar,
      $apple_music_1_month_subscription_json${"region": "GLOBAL", "features": ["Includes access to all Apple Music features."], "platform": "Apple", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nYou can manage the account as needed.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order.\nYou will receive a private Apple Music account with login credentials.\nSign in and start using Apple Music.\nManage the account as needed.", "comparison_price_cents": 1099}$apple_music_1_month_subscription_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'applemusic-logo'::varchar,
      'Music'::varchar,
      'USD'::varchar,
      NULL::integer,
      1::integer,
      499::integer,
      'USD'::varchar,
      'Apple'::varchar
    ),
    (
      '92607436-5ddb-52d7-abfb-de92501222b9'::uuid,
      'Apple TV 1 Month Subscription'::varchar,
      'apple-tv-1-month-subscription'::varchar,
      'Apple TV 1 Month Subscription with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'apple_tv'::varchar,
      'active'::varchar,
      $apple_tv_1_month_subscription_json${"region": "GLOBAL", "features": ["Includes access to all Apple TV features.", "Can be accessed through the official Apple TV application on Smart TVs, or through web browser for computer & smartphones (PC, Mac, Android and iOS).", "Mobile application login on phones or tablets are not supported."], "platform": "Apple", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nThe account is created and managed by SubSlush, and it does not include email access, password changes, or security setting changes.\nFor Smart TVs, the product works through the official Apple TV application.\nFor PC, Mac, Android, and iOS, access is through the web browser only; mobile application login on phones or tablets is not supported.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order and receive Apple TV account access.\nFor Smart TVs, use the official Apple TV app.\nFor PC, Mac, Android, and iOS, use a web browser only; mobile app login on phones/tablets is not supported.\nThis account is managed by SubSlush, so email access, password changes, and security setting changes are not included.", "comparison_price_cents": 1099}$apple_tv_1_month_subscription_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'appletv-logo'::varchar,
      'Music'::varchar,
      'USD'::varchar,
      NULL::integer,
      1::integer,
      499::integer,
      'USD'::varchar,
      'Apple'::varchar
    ),
    (
      '8c8ccd11-e6f4-520a-9595-4d6b1d42a8b8'::uuid,
      'Apple TV 12 Months Subscription'::varchar,
      'apple-tv-12-months-subscription'::varchar,
      'Apple TV 12 Months Subscription with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'apple_tv'::varchar,
      'active'::varchar,
      $apple_tv_12_months_subscription_json${"region": "GLOBAL", "features": ["Includes access to all Apple TV features.", "Can be accessed through the official Apple TV application on Smart TVs, or through web browser for computer & smartphones (PC, Mac, Android and iOS).", "Mobile application login on phones or tablets are not supported."], "platform": "Apple", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nThe account is created and managed by SubSlush, and it does not include email access, password changes, or security setting changes.\nFor Smart TVs, the product works through the official Apple TV application.\nFor PC, Mac, Android, and iOS, access is through the web browser only; mobile application login on phones or tablets is not supported.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order and receive Apple TV account access.\nFor Smart TVs, use the official Apple TV app.\nFor PC, Mac, Android, and iOS, use a web browser only; mobile app login on phones/tablets is not supported.\nThis account is managed by SubSlush, so email access, password changes, and security setting changes are not included.", "comparison_price_cents": 15588}$apple_tv_12_months_subscription_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'appletv-logo'::varchar,
      'Music'::varchar,
      'USD'::varchar,
      NULL::integer,
      12::integer,
      5299::integer,
      'USD'::varchar,
      'Apple'::varchar
    ),
    (
      '1c4473f9-0764-5441-b46a-d11f77bbede1'::uuid,
      'Apple TV 2 Months Subscription'::varchar,
      'apple-tv-2-months-subscription'::varchar,
      'Apple TV 2 Months Subscription with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'apple_tv'::varchar,
      'active'::varchar,
      $apple_tv_2_months_subscription_json${"region": "GLOBAL", "features": ["Includes access to all Apple TV features.", "Can be accessed through the official Apple TV application on Smart TVs, or through web browser for computer & smartphones (PC, Mac, Android and iOS).", "Mobile application login on phones or tablets are not supported."], "platform": "Apple", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nThe account is created and managed by SubSlush, and it does not include email access, password changes, or security setting changes.\nFor Smart TVs, the product works through the official Apple TV application.\nFor PC, Mac, Android, and iOS, access is through the web browser only; mobile application login on phones or tablets is not supported.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order and receive Apple TV account access.\nFor Smart TVs, use the official Apple TV app.\nFor PC, Mac, Android, and iOS, use a web browser only; mobile app login on phones/tablets is not supported.\nThis account is managed by SubSlush, so email access, password changes, and security setting changes are not included.", "comparison_price_cents": 2598}$apple_tv_2_months_subscription_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'appletv-logo'::varchar,
      'Music'::varchar,
      'USD'::varchar,
      NULL::integer,
      2::integer,
      1299::integer,
      'USD'::varchar,
      'Apple'::varchar
    ),
    (
      'e4639257-6d9f-58a1-a318-d5c191b681e7'::uuid,
      'Apple TV 3 Months Subscription'::varchar,
      'apple-tv-3-months-subscription'::varchar,
      'Apple TV 3 Months Subscription with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'apple_tv'::varchar,
      'active'::varchar,
      $apple_tv_3_months_subscription_json${"region": "GLOBAL", "features": ["Includes access to all Apple TV features.", "Can be accessed through the official Apple TV application on Smart TVs, or through web browser for computer & smartphones (PC, Mac, Android and iOS).", "Mobile application login on phones or tablets are not supported."], "platform": "Apple", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nThe account is created and managed by SubSlush, and it does not include email access, password changes, or security setting changes.\nFor Smart TVs, the product works through the official Apple TV application.\nFor PC, Mac, Android, and iOS, access is through the web browser only; mobile application login on phones or tablets is not supported.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order and receive Apple TV account access.\nFor Smart TVs, use the official Apple TV app.\nFor PC, Mac, Android, and iOS, use a web browser only; mobile app login on phones/tablets is not supported.\nThis account is managed by SubSlush, so email access, password changes, and security setting changes are not included.", "comparison_price_cents": 3897}$apple_tv_3_months_subscription_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'appletv-logo'::varchar,
      'Music'::varchar,
      'USD'::varchar,
      NULL::integer,
      3::integer,
      1699::integer,
      'USD'::varchar,
      'Apple'::varchar
    ),
    (
      'af63cd3b-bc63-5579-9461-78e3995fa3ab'::uuid,
      'Apple TV 6 Months Subscription'::varchar,
      'apple-tv-6-months-subscription'::varchar,
      'Apple TV 6 Months Subscription with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'apple_tv'::varchar,
      'active'::varchar,
      $apple_tv_6_months_subscription_json${"region": "GLOBAL", "features": ["Includes access to all Apple TV features.", "Can be accessed through the official Apple TV application on Smart TVs, or through web browser for computer & smartphones (PC, Mac, Android and iOS).", "Mobile application login on phones or tablets are not supported."], "platform": "Apple", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nThe account is created and managed by SubSlush, and it does not include email access, password changes, or security setting changes.\nFor Smart TVs, the product works through the official Apple TV application.\nFor PC, Mac, Android, and iOS, access is through the web browser only; mobile application login on phones or tablets is not supported.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order and receive Apple TV account access.\nFor Smart TVs, use the official Apple TV app.\nFor PC, Mac, Android, and iOS, use a web browser only; mobile app login on phones/tablets is not supported.\nThis account is managed by SubSlush, so email access, password changes, and security setting changes are not included.", "comparison_price_cents": 7794}$apple_tv_6_months_subscription_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'appletv-logo'::varchar,
      'Music'::varchar,
      'USD'::varchar,
      NULL::integer,
      6::integer,
      2999::integer,
      'USD'::varchar,
      'Apple'::varchar
    ),
    (
      '37343943-79db-5b1f-ae90-d157639651b0'::uuid,
      'ChatGPT Pro 1 Month Subscription'::varchar,
      'chatgpt-pro-1-month-subscription'::varchar,
      'ChatGPT Pro 1 Month Subscription with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'chatgpt'::varchar,
      'active'::varchar,
      $chatgpt_pro_1_month_subscription_json${"region": "GLOBAL", "features": ["Includes everything in Plus and:", "Unlimited GPT‑5.4 messages, with generous access to GPT‑5.4 Thinking, and limited access to GPT‑5.4 Pro", "60+ apps that bring your tools and data into ChatGPT—like Slack, Google Drive, SharePoint, GitHub, Atlassian, and more", "Business features like apps, data analysis, record mode, canvas, shared projects, and custom workspace GPTs", "Encryption at rest and in transit, and no training on your data by default.", "Includes access to Codex and ChatGPT agent for reasoning and taking action across your documents, tools, and codebases"], "platform": "ChatGPT", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nYou may change the email and password.\nThe account includes access to a ChatGPT Pro workspace with the listed features and limitations.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order.\nYou will receive a private account with login credentials.\nSign in and update email/password if preferred.\nUse the included ChatGPT Pro workspace features according to the listed feature set and limitations.", "comparison_price_cents": 15000}$chatgpt_pro_1_month_subscription_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'chatgpt-logo'::varchar,
      'AI'::varchar,
      'USD'::varchar,
      NULL::integer,
      1::integer,
      3999::integer,
      'USD'::varchar,
      'ChatGPT'::varchar
    ),
    (
      '90f4acd2-df28-5b11-95d1-a2414299a4b5'::uuid,
      'ChatGPT Pro 12 Months Subscription'::varchar,
      'chatgpt-pro-12-months-subscription'::varchar,
      'ChatGPT Pro 12 Months Subscription with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'chatgpt'::varchar,
      'active'::varchar,
      $chatgpt_pro_12_months_subscription_json${"region": "GLOBAL", "features": ["Includes everything in Plus and:", "Unlimited GPT‑5.4 messages, with generous access to GPT‑5.4 Thinking, and access to GPT‑5.4 Pro", "60+ apps that bring your tools and data into ChatGPT—like Slack, Google Drive, SharePoint, GitHub, Atlassian, and more", "Business features like apps, data analysis, record mode, canvas, shared projects, and custom workspace GPTs", "Encryption at rest and in transit, and no training on your data by default.", "Includes access to Codex and ChatGPT agent for reasoning and taking action across your documents, tools, and codebases"], "platform": "ChatGPT", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nYou may change the email and password.\nThe account includes access to a ChatGPT Pro workspace with the listed features and limitations.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order.\nYou will receive a private account with login credentials.\nSign in and update email/password if preferred.\nUse the included ChatGPT Pro workspace features according to the listed feature set and limitations.", "comparison_price_cents": 180000}$chatgpt_pro_12_months_subscription_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'chatgpt-logo'::varchar,
      'AI'::varchar,
      'USD'::varchar,
      NULL::integer,
      12::integer,
      17999::integer,
      'USD'::varchar,
      'ChatGPT'::varchar
    ),
    (
      '28dce64d-500d-5a44-b15f-ef373a887196'::uuid,
      'ChatGPT Pro 3 Months Subscription'::varchar,
      'chatgpt-pro-3-months-subscription'::varchar,
      'ChatGPT Pro 3 Months Subscription with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'chatgpt'::varchar,
      'active'::varchar,
      $chatgpt_pro_3_months_subscription_json${"region": "GLOBAL", "features": ["Includes everything in Plus and:", "Unlimited GPT‑5.4 messages, with generous access to GPT‑5.4 Thinking, and access to GPT‑5.4 Pro", "60+ apps that bring your tools and data into ChatGPT—like Slack, Google Drive, SharePoint, GitHub, Atlassian, and more", "Business features like apps, data analysis, record mode, canvas, shared projects, and custom workspace GPTs", "Encryption at rest and in transit, and no training on your data by default.", "Includes access to Codex and ChatGPT agent for reasoning and taking action across your documents, tools, and codebases"], "platform": "ChatGPT", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nYou may change the email and password.\nThe account includes access to a ChatGPT Pro workspace with the listed features and limitations.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order.\nYou will receive a private account with login credentials.\nSign in and update email/password if preferred.\nUse the included ChatGPT Pro workspace features according to the listed feature set and limitations.", "comparison_price_cents": 45000}$chatgpt_pro_3_months_subscription_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'chatgpt-logo'::varchar,
      'AI'::varchar,
      'USD'::varchar,
      NULL::integer,
      3::integer,
      8999::integer,
      'USD'::varchar,
      'ChatGPT'::varchar
    ),
    (
      '6eb91ada-5fb4-5dd0-b756-082c7519877f'::uuid,
      'ChatGPT Pro 6 Months Subscription'::varchar,
      'chatgpt-pro-6-months-subscription'::varchar,
      'ChatGPT Pro 6 Months Subscription with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'chatgpt'::varchar,
      'active'::varchar,
      $chatgpt_pro_6_months_subscription_json${"region": "GLOBAL", "features": ["Includes everything in Plus and:", "Unlimited GPT‑5.4 messages, with generous access to GPT‑5.4 Thinking, and access to GPT‑5.4 Pro", "60+ apps that bring your tools and data into ChatGPT—like Slack, Google Drive, SharePoint, GitHub, Atlassian, and more", "Business features like apps, data analysis, record mode, canvas, shared projects, and custom workspace GPTs", "Encryption at rest and in transit, and no training on your data by default.", "Includes access to Codex and ChatGPT agent for reasoning and taking action across your documents, tools, and codebases"], "platform": "ChatGPT", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nYou may change the email and password.\nThe account includes access to a ChatGPT Pro workspace with the listed features and limitations.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order.\nYou will receive a private account with login credentials.\nSign in and update email/password if preferred.\nUse the included ChatGPT Pro workspace features according to the listed feature set and limitations.", "comparison_price_cents": 90000}$chatgpt_pro_6_months_subscription_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'chatgpt-logo'::varchar,
      'AI'::varchar,
      'USD'::varchar,
      NULL::integer,
      6::integer,
      11999::integer,
      'USD'::varchar,
      'ChatGPT'::varchar
    ),
    (
      '4175f0f2-c3e6-56ff-93ea-dd0a70e7f4e5'::uuid,
      'Linked Premium Career 3 months'::varchar,
      'linked-premium-career-3-months'::varchar,
      'Linked Premium Career 3 months with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'linkedin'::varchar,
      'active'::varchar,
      $linked_premium_career_3_months_json${"region": "GLOBAL", "features": ["Includes LinkedIn Premium Career features such as LinkedIn Premium access for 3 months, InMail credits, \"Who viewed your profile\" insights, Full LinkedIn learning library access,", "Faster networking & smarter outreach tools."], "platform": "Linkedin", "info_box_text": "This product is delivered as an activation link that you redeem on your own LinkedIn account.\nIt can only be applied to an account that has never used a LinkedIn offer before.\nPlease verify eligibility before purchase, because delivered activation links cannot be reversed or refunded.", "upgrade_options": {"allow_new_account": false, "allow_own_account": true, "manual_monthly_upgrade": false, "own_account_credential_requirement": "email_only"}, "activation_guide": "Before purchasing, confirm your LinkedIn account has never used a Premium offer before.\nPlace your order and receive the activation link.\nLog in to your LinkedIn account and open the activation link to apply the plan.\nIf the account has used a previous offer, activation may fail, and delivered links cannot be reversed or refunded.", "comparison_price_cents": 5997}$linked_premium_career_3_months_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'linkedin-logo'::varchar,
      'Productivity'::varchar,
      'USD'::varchar,
      NULL::integer,
      3::integer,
      1499::integer,
      'USD'::varchar,
      'Linkedin'::varchar
    ),
    (
      '6db605af-77be-5e01-9904-ddfd0022a1b3'::uuid,
      'LinkedIn Premium Business 12 months'::varchar,
      'linkedin-premium-business-12-months'::varchar,
      'LinkedIn Premium Business 12 months with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'linkedin'::varchar,
      'active'::varchar,
      $linkedin_premium_business_12_months_json${"region": "GLOBAL", "features": ["Includes all LinkedIn Premium Business features."], "platform": "Linkedin", "info_box_text": "This product is delivered as an upgrade or renewal on your own LinkedIn account.\nDuring checkout, provide your LinkedIn email and password so SubSlush can complete manual fulfillment.\nFor security, we recommend using a temporary password first and changing it back after activation is completed.", "upgrade_options": {"allow_new_account": false, "allow_own_account": true, "manual_monthly_upgrade": false, "own_account_credential_requirement": "email_and_password"}, "activation_guide": "Before checkout, change your LinkedIn password to a temporary one.\nDuring checkout, provide your LinkedIn email and temporary password for manual fulfillment.\nSubSlush applies the Premium Business upgrade or renewal directly to your account.\nAfter activation is completed, sign in, confirm access, and change your password again to a private one.", "comparison_price_cents": 53999}$linkedin_premium_business_12_months_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'linkedin-logo'::varchar,
      'Productivity'::varchar,
      'USD'::varchar,
      NULL::integer,
      12::integer,
      17499::integer,
      'USD'::varchar,
      'Linkedin'::varchar
    ),
    (
      '2de9f4bb-e062-5fb7-b88c-cce039dacbf8'::uuid,
      'LinkedIn Sales Navigator 12 months'::varchar,
      'linkedin-sales-navigator-12-months'::varchar,
      'LinkedIn Sales Navigator 12 months with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'linkedin'::varchar,
      'active'::varchar,
      $linkedin_sales_navigator_12_months_json${"region": "GLOBAL", "features": ["Includes all LinkedIn Sales Navigator features."], "platform": "Linkedin", "info_box_text": "This product is delivered as an upgrade or renewal on your own LinkedIn account.\nDuring checkout, provide your LinkedIn email and password so SubSlush can complete manual fulfillment.\nFor security, we recommend using a temporary password first and changing it back after activation is completed.", "upgrade_options": {"allow_new_account": false, "allow_own_account": true, "manual_monthly_upgrade": false, "own_account_credential_requirement": "email_and_password"}, "activation_guide": "Before checkout, we recommend to change your LinkedIn password to a temporary one.\nDuring checkout, provide your LinkedIn email and temporary password for manual fulfillment.\nSubSlush applies the Sales Navigator upgrade or renewal directly to your account.\nAfter activation is completed, sign in, confirm access, and change your password again to a private one.", "comparison_price_cents": 107988}$linkedin_sales_navigator_12_months_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'linkedin-logo'::varchar,
      'Productivity'::varchar,
      'USD'::varchar,
      NULL::integer,
      12::integer,
      29999::integer,
      'USD'::varchar,
      'Linkedin'::varchar
    ),
    (
      'a665aee8-00e1-5721-82d9-66797d5d10ec'::uuid,
      'Lovable (100 credits) 1 Month Subscription'::varchar,
      'lovable-100-credits-1-month-subscription'::varchar,
      'Lovable (100 credits) 1 Month Subscription with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'loveable'::varchar,
      'active'::varchar,
      $lovable_100_credits_1_month_subscription_json${"region": "GLOBAL", "features": ["Includes access to all Loveable features, including 100 credits."], "platform": "Loveable", "info_box_text": "This product is delivered as a new workspace to your Loveable account.\nThe workspace includes 100 credits that are available for 30 days.", "upgrade_options": {"allow_new_account": false, "allow_own_account": true, "manual_monthly_upgrade": false, "own_account_credential_requirement": "email_only"}, "activation_guide": "During checkout, provide the email linked to your Lovable account.\nSubSlush delivers a new workspace to that account.\nOpen the workspace and confirm 100 credits are available.\nUse the credits within 30 days, since this subscription period is 1 month.", "comparison_price_cents": 2500}$lovable_100_credits_1_month_subscription_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'lovable-logo'::varchar,
      'AI'::varchar,
      'USD'::varchar,
      NULL::integer,
      1::integer,
      1299::integer,
      'USD'::varchar,
      'Loveable'::varchar
    ),
    (
      '0ed9983f-b101-566c-b2fc-58daadc5682b'::uuid,
      'Myfitnesspal Premium 12 months'::varchar,
      'myfitnesspal-premium-12-months'::varchar,
      'Myfitnesspal Premium 12 months with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'myfitnesspal'::varchar,
      'active'::varchar,
      $myfitnesspal_premium_12_months_json${"region": "GLOBAL", "features": ["Includes access to all Myfitness Premium features."], "platform": "Myfitnesspal", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nYou will receive a new account with email and password.\nAfter delivery, you can change both the email and password.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order for the product.\nYou will receive a new private MyFitnessPal account with email and password.\nSign in and confirm Premium access is active.\nChange the account email and password to your own details after delivery.", "comparison_price_cents": 9999}$myfitnesspal_premium_12_months_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'myfitnesspal-logo'::varchar,
      'Fitness'::varchar,
      'USD'::varchar,
      NULL::integer,
      12::integer,
      4899::integer,
      'USD'::varchar,
      'Myfitnesspal'::varchar
    ),
    (
      'e107925d-7b3e-5532-85d5-de0965a2fe4f'::uuid,
      'n8n Starter 12 Months Subscription'::varchar,
      'n8n-starter-12-months-subscription'::varchar,
      'n8n Starter 12 Months Subscription with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'n8n'::varchar,
      'active'::varchar,
      $n8n_starter_12_months_subscription_json${"region": "GLOBAL", "features": ["Includes access to all n8n Starter features."], "platform": "n8n", "info_box_text": "This product is delivered as an upgrade or renewal on your own n8n account, or to a newly provisioned account when you choose Upgrade New Account.\nFor Upgrade Own Account, provide your n8n email and password during checkout for manual fulfillment, and using a temporary password is recommended.", "upgrade_options": {"allow_new_account": true, "allow_own_account": true, "manual_monthly_upgrade": false, "own_account_credential_requirement": "email_and_password"}, "activation_guide": "At checkout, choose Upgrade Own Account or Upgrade New Account.\nIf upgrading your own account, provide your n8n email and a temporary password for manual fulfillment.\nIf upgrading a new account, SubSlush provisions the account and applies the plan for you.\nAfter activation, confirm access is active and change your password back if you shared credentials.", "comparison_price_cents": 27800}$n8n_starter_12_months_subscription_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'n8n-logo'::varchar,
      'AI'::varchar,
      'USD'::varchar,
      NULL::integer,
      12::integer,
      10999::integer,
      'USD'::varchar,
      'n8n'::varchar
    ),
    (
      'ae550037-524d-51b6-9338-e577243e6aa1'::uuid,
      'Netflix Basic 1 Month'::varchar,
      'netflix-basic-1-month'::varchar,
      'Netflix Basic 1 Month with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'netflix'::varchar,
      'active'::varchar,
      $netflix_basic_1_month_json${"region": "GLOBAL", "features": ["Unlimited ad-free movies, TV shows, and games", "Watch on 1 supported device at a time", "Watch in 720p (HD)", "Download on 1 supported device at a time"], "platform": "Netflix", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nThe account is provisioned and managed by SubSlush, and the same account can be used for renewals by purchasing another Netflix product from SubSlush.\nA VPN may be required in the first month due to Netflix region locks.\nFor 1-month terms, free VPN access is not included, so you must use your own VPN if needed.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order and receive your managed Netflix account credentials.\nSign in and use this same account for future renewals if you buy another Netflix product from SubSlush.\nA VPN may be required during the first month due to region locks; for this 1-month product, you must use your own VPN if needed.\nAfter the first month, region locks are typically removed.", "comparison_price_cents": 1199}$netflix_basic_1_month_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'netflix'::varchar,
      'Streaming'::varchar,
      'USD'::varchar,
      NULL::integer,
      1::integer,
      699::integer,
      'USD'::varchar,
      'Netflix'::varchar
    ),
    (
      '08442943-4745-58c8-85f2-f74fb4762603'::uuid,
      'Netflix Basic 12 Months'::varchar,
      'netflix-basic-12-months'::varchar,
      'Netflix Basic 12 Months with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'netflix'::varchar,
      'active'::varchar,
      $netflix_basic_12_months_json${"region": "GLOBAL", "features": ["Unlimited ad-free movies, TV shows, and games", "Watch on 1 supported device at a time", "Watch in 720p (HD)", "Download on 1 supported device at a time"], "platform": "Netflix", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nThe account is provisioned and managed by SubSlush, and the same account can be used for renewals by purchasing another Netflix product from SubSlush.\nA VPN may be required in the first month due to Netflix region locks; SubSlush provides free VPN access for the first subscription period on 3, 6, and 12 month terms.\nThe Netflix subscription is automatically renewed each month on the same account for the full 12-month term.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order and receive your managed Netflix account credentials.\nSign in and use the same account for the full term; the subscription renews automatically each month for 12 months.\nIf region lock applies in the first month, SubSlush will provide access to a VPN free of charge.\nContinue using the same account for ongoing access and future renewals.", "comparison_price_cents": 14388}$netflix_basic_12_months_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'netflix'::varchar,
      'Streaming'::varchar,
      'USD'::varchar,
      NULL::integer,
      12::integer,
      5999::integer,
      'USD'::varchar,
      'Netflix'::varchar
    ),
    (
      'c8fe726e-edd6-5283-a574-192a3c0bcc8e'::uuid,
      'Netflix Basic 3 Months'::varchar,
      'netflix-basic-3-months'::varchar,
      'Netflix Basic 3 Months with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'netflix'::varchar,
      'active'::varchar,
      $netflix_basic_3_months_json${"region": "GLOBAL", "features": ["Unlimited ad-free movies, TV shows, and games", "Watch on 1 supported device at a time", "Watch in 720p (HD)", "Download on 1 supported device at a time"], "platform": "Netflix", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nThe account is provisioned and managed by SubSlush, and the same account can be used for renewals by purchasing another Netflix product from SubSlush.\nA VPN may be required in the first month due to Netflix region locks; SubSlush provides free VPN access for the first subscription period on 3, 6, and 12 month terms.\nThe Netflix subscription is automatically renewed each month on the same account for the full 3-month term.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order and receive your managed Netflix account credentials.\nSign in and use the same account for the full term; the subscription renews automatically each month for 3 months.\nIf region lock applies in the first month, SubSlush will provide access to a VPN free of charge.\nContinue using the same account for ongoing access and future renewals.", "comparison_price_cents": 3597}$netflix_basic_3_months_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'netflix'::varchar,
      'Streaming'::varchar,
      'USD'::varchar,
      NULL::integer,
      3::integer,
      1999::integer,
      'USD'::varchar,
      'Netflix'::varchar
    ),
    (
      'c02f3d7b-e865-50fa-9b56-174195c509a3'::uuid,
      'Netflix Basic 6 Months'::varchar,
      'netflix-basic-6-months'::varchar,
      'Netflix Basic 6 Months with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'netflix'::varchar,
      'active'::varchar,
      $netflix_basic_6_months_json${"region": "GLOBAL", "features": ["Unlimited ad-free movies, TV shows, and games", "Watch on 1 supported device at a time", "Watch in 720p (HD)", "Download on 1 supported device at a time"], "platform": "Netflix", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nThe account is provisioned and managed by SubSlush, and the same account can be used for renewals by purchasing another Netflix product from SubSlush.\nA VPN may be required in the first month due to Netflix region locks; SubSlush provides free VPN access for the first subscription period on 3, 6, and 12 month terms.\nThe Netflix subscription is automatically renewed each month on the same account for the full 6-month term.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order and receive your managed Netflix account credentials.\nSign in and use the same account for the full term; the subscription renews automatically each month for 6 months.\nIf region lock applies in the first month, SubSlush will provide access to a VPN free of charge.\nContinue using the same account for ongoing access and future renewals.", "comparison_price_cents": 7195}$netflix_basic_6_months_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'netflix'::varchar,
      'Streaming'::varchar,
      'USD'::varchar,
      NULL::integer,
      6::integer,
      3399::integer,
      'USD'::varchar,
      'Netflix'::varchar
    ),
    (
      '2e5e158a-e50e-5b2b-8e95-a4f5af8ac4de'::uuid,
      'Netflix Premium 4K 1 Month'::varchar,
      'netflix-premium-4k-1-month'::varchar,
      'Netflix Premium 4K 1 Month with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'netflix'::varchar,
      'active'::varchar,
      $netflix_premium_4k_1_month_json${"region": "GLOBAL", "features": ["Unlimited ad-free movies, TV shows, and games", "Watch on 4 supported devices at a time", "Watch in 4K (Ultra HD) + HDR", "Download on 6 supported devices at a time", "Netflix spatial audio"], "platform": "Netflix", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nThe account is provisioned and managed by SubSlush, and the same account can be used for renewals by purchasing another Netflix product from SubSlush.\nA VPN may be required in the first month due to Netflix region locks.\nFor 1-month terms, free VPN access is not included, so you must use your own VPN if needed.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order and receive your managed Netflix account credentials.\nSign in and use this same account for future renewals if you buy another Netflix product from SubSlush.\nA VPN may be required during the first month due to region locks; for this 1-month product, you must use your own VPN if needed.\nAfter the first month, region locks are typically removed.", "comparison_price_cents": 2499}$netflix_premium_4k_1_month_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'netflix'::varchar,
      'Streaming'::varchar,
      'USD'::varchar,
      NULL::integer,
      1::integer,
      1499::integer,
      'USD'::varchar,
      'Netflix'::varchar
    ),
    (
      'eac4a400-22fa-5ada-843e-7de13676a0e7'::uuid,
      'Netflix Premium 4K 12 Months'::varchar,
      'netflix-premium-4k-12-months'::varchar,
      'Netflix Premium 4K 12 Months with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'netflix'::varchar,
      'active'::varchar,
      $netflix_premium_4k_12_months_json${"region": "GLOBAL", "features": ["Unlimited ad-free movies, TV shows, and games", "Watch on 4 supported devices at a time", "Watch in 4K (Ultra HD) + HDR", "Download on 6 supported devices at a time", "Netflix spatial audio"], "platform": "Netflix", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nThe account is provisioned and managed by SubSlush, and the same account can be used for renewals by purchasing another Netflix product from SubSlush.\nA VPN may be required in the first month due to Netflix region locks; SubSlush provides free VPN access for the first subscription period on 3, 6, and 12 month terms.\nThe Netflix subscription is automatically renewed each month on the same account for the full 12-month term.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order and receive your managed Netflix account credentials.\nSign in and use the same account for the full term; the subscription renews automatically each month for 12 months.\nIf region lock applies in the first month, SubSlush will provide access to a VPN free of charge.\nContinue using the same account for ongoing access and future renewals.", "comparison_price_cents": 29988}$netflix_premium_4k_12_months_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'netflix'::varchar,
      'Streaming'::varchar,
      'USD'::varchar,
      NULL::integer,
      12::integer,
      11999::integer,
      'USD'::varchar,
      'Netflix'::varchar
    ),
    (
      'e1223f9f-669d-5377-8f2a-9afc8cba200c'::uuid,
      'Netflix Premium 4K 3 Months'::varchar,
      'netflix-premium-4k-3-months'::varchar,
      'Netflix Premium 4K 3 Months with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'netflix'::varchar,
      'active'::varchar,
      $netflix_premium_4k_3_months_json${"region": "GLOBAL", "features": ["Unlimited ad-free movies, TV shows, and games", "Watch on 4 supported devices at a time", "Watch in 4K (Ultra HD) + HDR", "Download on 6 supported devices at a time", "Netflix spatial audio"], "platform": "Netflix", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nThe account is provisioned and managed by SubSlush, and the same account can be used for renewals by purchasing another Netflix product from SubSlush.\nA VPN may be required in the first month due to Netflix region locks; SubSlush provides free VPN access for the first subscription period on 3, 6, and 12 month terms.\nThe Netflix subscription is automatically renewed each month on the same account for the full 3-month term.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order and receive your managed Netflix account credentials.\nSign in and use the same account for the full term; the subscription renews automatically each month for 3 months.\nIf region lock applies in the first month, SubSlush will provide access to a VPN free of charge.\nContinue using the same account for ongoing access and future renewals.", "comparison_price_cents": 7497}$netflix_premium_4k_3_months_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'netflix'::varchar,
      'Streaming'::varchar,
      'USD'::varchar,
      NULL::integer,
      3::integer,
      4099::integer,
      'USD'::varchar,
      'Netflix'::varchar
    ),
    (
      '196adbbe-6f4e-59c6-b05b-f9e40d625aab'::uuid,
      'Netflix Premium 4K 6 Months'::varchar,
      'netflix-premium-4k-6-months'::varchar,
      'Netflix Premium 4K 6 Months with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'netflix'::varchar,
      'active'::varchar,
      $netflix_premium_4k_6_months_json${"region": "GLOBAL", "features": ["Unlimited ad-free movies, TV shows, and games", "Watch on 4 supported devices at a time", "Watch in 4K (Ultra HD) + HDR", "Download on 6 supported devices at a time", "Netflix spatial audio"], "platform": "Netflix", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nThe account is provisioned and managed by SubSlush, and the same account can be used for renewals by purchasing another Netflix product from SubSlush.\nA VPN may be required in the first month due to Netflix region locks; SubSlush provides free VPN access for the first subscription period on 3, 6, and 12 month terms.\nThe Netflix subscription is automatically renewed each month on the same account for the full 6-month term.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order and receive your managed Netflix account credentials.\nSign in and use the same account for the full term; the subscription renews automatically each month for 6 months.\nIf region lock applies in the first month, SubSlush will provide access to a VPN free of charge.\nContinue using the same account for ongoing access and future renewals.", "comparison_price_cents": 14994}$netflix_premium_4k_6_months_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'netflix'::varchar,
      'Streaming'::varchar,
      'USD'::varchar,
      NULL::integer,
      6::integer,
      6999::integer,
      'USD'::varchar,
      'Netflix'::varchar
    ),
    (
      '0653853f-c3cb-5337-94a6-9db9e41c0033'::uuid,
      'Netflix Standard 1 Month'::varchar,
      'netflix-standard-1-month'::varchar,
      'Netflix Standard 1 Month with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'netflix'::varchar,
      'active'::varchar,
      $netflix_standard_1_month_json${"region": "GLOBAL", "features": ["Unlimited ad-free movies, TV shows, and games", "Watch on 2 supported devices at a time", "Watch in 1080p (Full HD)", "Download on 2 supported devices at a time"], "platform": "Netflix", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nThe account is provisioned and managed by SubSlush, and the same account can be used for renewals by purchasing another Netflix product from SubSlush.\nA VPN may be required in the first month due to Netflix region locks.\nFor 1-month terms, free VPN access is not included, so you must use your own VPN if needed.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order and receive your managed Netflix account credentials.\nSign in and use this same account for future renewals if you buy another Netflix product from SubSlush.\nA VPN may be required during the first month due to region locks; for this 1-month product, you must use your own VPN if needed.\nAfter the first month, region locks are typically removed.", "comparison_price_cents": 1799}$netflix_standard_1_month_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'netflix'::varchar,
      'Streaming'::varchar,
      'USD'::varchar,
      NULL::integer,
      1::integer,
      999::integer,
      'USD'::varchar,
      'Netflix'::varchar
    ),
    (
      '335b1e19-7db8-5e01-a323-b6bde4336ddf'::uuid,
      'Netflix Standard 12 Months'::varchar,
      'netflix-standard-12-months'::varchar,
      'Netflix Standard 12 Months with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'netflix'::varchar,
      'active'::varchar,
      $netflix_standard_12_months_json${"region": "GLOBAL", "features": ["Unlimited ad-free movies, TV shows, and games", "Watch on 2 supported devices at a time", "Watch in 1080p (Full HD)", "Download on 2 supported devices at a time"], "platform": "Netflix", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nThe account is provisioned and managed by SubSlush, and the same account can be used for renewals by purchasing another Netflix product from SubSlush.\nA VPN may be required in the first month due to Netflix region locks; SubSlush provides free VPN access for the first subscription period on 3, 6, and 12 month terms.\nThe Netflix subscription is automatically renewed each month on the same account for the full 12-month term.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order and receive your managed Netflix account credentials.\nSign in and use the same account for the full term; the subscription renews automatically each month for 12 months.\nIf region lock applies in the first month, SubSlush will provide access to a VPN free of charge.\nContinue using the same account for ongoing access and future renewals.", "comparison_price_cents": 21588}$netflix_standard_12_months_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'netflix'::varchar,
      'Streaming'::varchar,
      'USD'::varchar,
      NULL::integer,
      12::integer,
      9999::integer,
      'USD'::varchar,
      'Netflix'::varchar
    ),
    (
      '93218a36-da71-59ec-81fc-60df163e8e12'::uuid,
      'Netflix Standard 3 Months'::varchar,
      'netflix-standard-3-months'::varchar,
      'Netflix Standard 3 Months with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'netflix'::varchar,
      'active'::varchar,
      $netflix_standard_3_months_json${"region": "GLOBAL", "features": ["Unlimited ad-free movies, TV shows, and games", "Watch on 2 supported devices at a time", "Watch in 1080p (Full HD)", "Download on 2 supported devices at a time"], "platform": "Netflix", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nThe account is provisioned and managed by SubSlush, and the same account can be used for renewals by purchasing another Netflix product from SubSlush.\nA VPN may be required in the first month due to Netflix region locks; SubSlush provides free VPN access for the first subscription period on 3, 6, and 12 month terms.\nThe Netflix subscription is automatically renewed each month on the same account for the full 3-month term.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order and receive your managed Netflix account credentials.\nSign in and use the same account for the full term; the subscription renews automatically each month for 3 months.\nIf region lock applies in the first month, SubSlush will provide access to a VPN free of charge.\nContinue using the same account for ongoing access and future renewals.", "comparison_price_cents": 5397}$netflix_standard_3_months_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'netflix'::varchar,
      'Streaming'::varchar,
      'USD'::varchar,
      NULL::integer,
      3::integer,
      2799::integer,
      'USD'::varchar,
      'Netflix'::varchar
    ),
    (
      '50b120b0-e3e3-5de4-8527-caf9c1395bb6'::uuid,
      'Netflix Standard 6 Months'::varchar,
      'netflix-standard-6-months'::varchar,
      'Netflix Standard 6 Months with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'netflix'::varchar,
      'active'::varchar,
      $netflix_standard_6_months_json${"region": "GLOBAL", "features": ["Unlimited ad-free movies, TV shows, and games", "Watch on 2 supported devices at a time", "Watch in 1080p (Full HD)", "Download on 2 supported devices at a time"], "platform": "Netflix", "info_box_text": "This offer provides private account access only, and the account is not shared with anyone else.\nThe account is provisioned and managed by SubSlush, and the same account can be used for renewals by purchasing another Netflix product from SubSlush.\nA VPN may be required in the first month due to Netflix region locks; SubSlush provides free VPN access for the first subscription period on 3, 6, and 12 month terms.\nThe Netflix subscription is automatically renewed each month on the same account for the full 6-month term.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "Place your order and receive your managed Netflix account credentials.\nSign in and use the same account for the full term; the subscription renews automatically each month for 6 months.\nIf region lock applies in the first month, SubSlush will provide access to a VPN free of charge.\nContinue using the same account for ongoing access and future renewals.", "comparison_price_cents": 10794}$netflix_standard_6_months_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'netflix'::varchar,
      'Streaming'::varchar,
      'USD'::varchar,
      NULL::integer,
      6::integer,
      5299::integer,
      'USD'::varchar,
      'Netflix'::varchar
    ),
    (
      'fe48d040-0502-567c-af28-bf61891c0af5'::uuid,
      'Notion Plus 12 months'::varchar,
      'notion-plus-12-months'::varchar,
      'Notion Plus 12 months with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'notion'::varchar,
      'active'::varchar,
      $notion_plus_12_months_json${"region": "GLOBAL", "features": ["Access to all Notion plus features. AI credits are not included."], "platform": "Notion", "info_box_text": "This offer provides private account access only, and the account is not shared with other users.\nYou receive access to the email account connected to this Notion account.\nDelivery is under an existing Notion workspace, so creating a separate paid workspace on this account is not supported.\nYour projects remain private unless you explicitly share them, and you may update credentials and security settings after delivery.", "upgrade_options": {"allow_new_account": true, "allow_own_account": false, "manual_monthly_upgrade": false}, "activation_guide": "During checkout, place your order for Notion account access.\nYou will receive Notion login details plus access to the connected email account.\nSign in to the existing managed Notion workspace; creating a separate paid workspace on this account is not supported.\nAfter delivery, you may update credentials and security settings; your projects remain private unless you explicitly share them.", "comparison_price_cents": 12000}$notion_plus_12_months_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'notion-logo'::varchar,
      'Productivity'::varchar,
      'USD'::varchar,
      NULL::integer,
      12::integer,
      2999::integer,
      'USD'::varchar,
      'Notion'::varchar
    ),
    (
      'f41416f9-a4dc-5439-b979-7758c05be2af'::uuid,
      'Perplexity Pro 12 Months Subscription'::varchar,
      'perplexity-pro-12-months-subscription'::varchar,
      'Perplexity Pro 12 Months Subscription with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'perplexity'::varchar,
      'active'::varchar,
      $perplexity_pro_12_months_subscription_json${"region": "GLOBAL", "features": ["Includes access to all Perplexity Pro features."], "platform": "Perplexity", "info_box_text": "This product is delivered as an activation code that you redeem on your own Perplexity account.\nThe code can only be applied to a Perplexity account that has never had a Perplexity Pro subscription before.", "upgrade_options": {"allow_new_account": false, "allow_own_account": true, "manual_monthly_upgrade": false, "own_account_credential_requirement": "email_only"}, "activation_guide": "Use a Perplexity account that has never had Perplexity Pro before.\nPlace your order and receive your activation code.\nLog in to your eligible Perplexity account and redeem the code.\nConfirm Pro access is active on that same account.", "comparison_price_cents": 20400}$perplexity_pro_12_months_subscription_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'perplexity-logo'::varchar,
      'AI'::varchar,
      'USD'::varchar,
      NULL::integer,
      12::integer,
      3999::integer,
      'USD'::varchar,
      'Perplexity'::varchar
    ),
    (
      'b099b007-9947-586b-b791-ba86066a5832'::uuid,
      'Spotify Premium 1 month'::varchar,
      'spotify-premium-1-month'::varchar,
      'Spotify Premium 1 month with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'spotify'::varchar,
      'active'::varchar,
      $spotify_premium_1_month_json${"region": "GLOBAL", "features": ["Access to all Spotify Premium features.", "Does not include access to Spotify audiobooks."], "platform": "Spotify", "info_box_text": "This product is delivered as an upgrade or renewal on your own Spotify account, or to a newly provisioned account when you choose Upgrade New Account.\nFor Upgrade Own Account, provide your Spotify email and password during checkout for manual fulfillment, and using a temporary password is recommended.\nThe account must not have an active subscription at activation time.\nThe plan can be applied to Spotify accounts globally, and region may be adjusted during fulfillment while keeping full Premium feature access.", "upgrade_options": {"allow_new_account": true, "allow_own_account": true, "manual_monthly_upgrade": false, "own_account_credential_requirement": "email_and_password"}, "activation_guide": "At checkout, choose Upgrade Own Account or Upgrade New Account.\nIf upgrading your own account, make sure there is no active Spotify subscription, then provide Spotify email and temporary password.\nSubSlush applies the upgrade or renewal (region may be adjusted if required for activation); new-account orders receive credentials after setup.\nAfter activation, sign in and confirm Premium access, then change your password back if you shared credentials.", "comparison_price_cents": 1299}$spotify_premium_1_month_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'spotify'::varchar,
      'Music'::varchar,
      'USD'::varchar,
      NULL::integer,
      1::integer,
      499::integer,
      'USD'::varchar,
      'Spotify'::varchar
    ),
    (
      'de9f7a14-79cb-590d-9134-58a61822fbce'::uuid,
      'Spotify Premium 12 months'::varchar,
      'spotify-premium-12-months'::varchar,
      'Spotify Premium 12 months with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'spotify'::varchar,
      'active'::varchar,
      $spotify_premium_12_months_json${"region": "GLOBAL", "features": ["Includes access to all Spotify Premium features.", "Does not include access to Spotify audiobooks."], "platform": "Spotify", "info_box_text": "This product is delivered as an upgrade or renewal on your own Spotify account, or to a newly provisioned account when you choose Upgrade New Account.\nFor Upgrade Own Account, provide your Spotify email and password during checkout for manual fulfillment, and using a temporary password is recommended.\nThe account must not have an active subscription at activation time.\nThe plan can be applied to Spotify accounts globally, and region may be adjusted during fulfillment while keeping full Premium feature access.", "upgrade_options": {"allow_new_account": true, "allow_own_account": true, "manual_monthly_upgrade": false, "own_account_credential_requirement": "email_and_password"}, "activation_guide": "At checkout, choose Upgrade Own Account or Upgrade New Account.\nIf upgrading your own account, make sure there is no active Spotify subscription, then provide Spotify email and temporary password.\nSubSlush applies the upgrade or renewal (region may be adjusted if required for activation); new-account orders receive credentials after setup.\nAfter activation, sign in and confirm Premium access, then change your password back if you shared credentials.", "comparison_price_cents": 15588}$spotify_premium_12_months_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'spotify'::varchar,
      'Music'::varchar,
      'USD'::varchar,
      NULL::integer,
      12::integer,
      5699::integer,
      'USD'::varchar,
      'Spotify'::varchar
    ),
    (
      '67e64371-bfce-5952-b856-155802b6694e'::uuid,
      'Spotify Premium 3 months'::varchar,
      'spotify-premium-3-months'::varchar,
      'Spotify Premium 3 months with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'spotify'::varchar,
      'active'::varchar,
      $spotify_premium_3_months_json${"region": "GLOBAL", "features": ["Access to all Spotify Premium features.", "Does not include access to Spotify audiobooks."], "platform": "Spotify", "info_box_text": "This product is delivered as an upgrade or renewal on your own Spotify account, or to a newly provisioned account when you choose Upgrade New Account.\nFor Upgrade Own Account, provide your Spotify email and password during checkout for manual fulfillment, and using a temporary password is recommended.\nThe account must not have an active subscription at activation time.\nThe plan can be applied to Spotify accounts globally, and region may be adjusted during fulfillment while keeping full Premium feature access.", "upgrade_options": {"allow_new_account": true, "allow_own_account": true, "manual_monthly_upgrade": false, "own_account_credential_requirement": "email_and_password"}, "activation_guide": "At checkout, choose Upgrade Own Account or Upgrade New Account.\nIf upgrading your own account, make sure there is no active Spotify subscription, then provide Spotify email and temporary password.\nSubSlush applies the upgrade or renewal (region may be adjusted if required for activation); new-account orders receive credentials after setup.\nAfter activation, sign in and confirm Premium access, then change your password back if you shared credentials.", "comparison_price_cents": 3897}$spotify_premium_3_months_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'spotify'::varchar,
      'Music'::varchar,
      'USD'::varchar,
      NULL::integer,
      3::integer,
      1799::integer,
      'USD'::varchar,
      'Spotify'::varchar
    ),
    (
      'b2e1848e-339c-582e-8233-04f99a391a1f'::uuid,
      'Spotify Premium 6 months'::varchar,
      'spotify-premium-6-months'::varchar,
      'Spotify Premium 6 months with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'spotify'::varchar,
      'active'::varchar,
      $spotify_premium_6_months_json${"region": "GLOBAL", "features": ["Access to all Spotify Premium features.", "Does not include access to Spotify audiobooks."], "platform": "Spotify", "info_box_text": "This product is delivered as an upgrade or renewal on your own Spotify account, or to a newly provisioned account when you choose Upgrade New Account.\nFor Upgrade Own Account, provide your Spotify email and password during checkout for manual fulfillment, and using a temporary password is recommended.\nThe account must not have an active subscription at activation time.\nThe plan can be applied to Spotify accounts globally, and region may be adjusted during fulfillment while keeping full Premium feature access.", "upgrade_options": {"allow_new_account": true, "allow_own_account": true, "manual_monthly_upgrade": false, "own_account_credential_requirement": "email_and_password"}, "activation_guide": "At checkout, choose Upgrade Own Account or Upgrade New Account.\nIf upgrading your own account, make sure there is no active Spotify subscription, then provide Spotify email and temporary password.\nSubSlush applies the upgrade or renewal (region may be adjusted if required for activation); new-account orders receive credentials after setup.\nAfter activation, sign in and confirm Premium access, then change your password back if you shared credentials.", "comparison_price_cents": 7794}$spotify_premium_6_months_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'spotify'::varchar,
      'Music'::varchar,
      'USD'::varchar,
      NULL::integer,
      6::integer,
      3199::integer,
      'USD'::varchar,
      'Spotify'::varchar
    ),
    (
      '9888edf4-9ea0-5f88-9fc7-ec809d4b5d58'::uuid,
      'Youtube Premium 12 Months Subscription'::varchar,
      'youtube-premium-12-months-subscription'::varchar,
      'Youtube Premium 12 Months Subscription with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'youtube'::varchar,
      'active'::varchar,
      $youtube_premium_12_months_subscription_json${"region": "GLOBAL", "features": ["Includes access to all Youtube Premium features."], "platform": "Youtube", "info_box_text": "This product is delivered as an activation link that you redeem on your own YouTube account.", "upgrade_options": {"allow_new_account": false, "allow_own_account": true, "manual_monthly_upgrade": false, "own_account_credential_requirement": "email_only"}, "activation_guide": "Place your order and receive the activation link.\nLog in to the YouTube/Google account you want to use.\nOpen the activation link while signed in to that account.\nComplete redemption and confirm YouTube Premium is active.", "comparison_price_cents": 16788}$youtube_premium_12_months_subscription_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'youtube-logo'::varchar,
      'Streaming'::varchar,
      'USD'::varchar,
      NULL::integer,
      12::integer,
      6499::integer,
      'USD'::varchar,
      'Youtube'::varchar
    ),
    (
      '848078a4-5542-560d-b60c-4bb04b54d021'::uuid,
      'Youtube Premium 3 Months Subscription'::varchar,
      'youtube-premium-3-months-subscription'::varchar,
      'Youtube Premium 3 Months Subscription with fulfillment handled by SubSlush according to the listed delivery flow.'::text,
      'youtube'::varchar,
      'active'::varchar,
      $youtube_premium_3_months_subscription_json${"region": "GLOBAL", "features": ["Includes access to all Youtube Premium features."], "platform": "Youtube", "info_box_text": "This product is delivered as an activation link that you redeem on your own YouTube account.", "upgrade_options": {"allow_new_account": false, "allow_own_account": true, "manual_monthly_upgrade": false, "own_account_credential_requirement": "email_only"}, "activation_guide": "Place your order and receive the activation link.\nLog in to the YouTube/Google account you want to use.\nOpen the activation link while signed in to that account.\nComplete redemption and confirm YouTube Premium is active.", "comparison_price_cents": 4197}$youtube_premium_3_months_subscription_json$::jsonb,
      '2026-03-29 12:00:00.000000'::timestamp,
      '2026-03-29 12:00:00.000000'::timestamp,
      'youtube-logo'::varchar,
      'Streaming'::varchar,
      'USD'::varchar,
      NULL::integer,
      3::integer,
      2499::integer,
      'USD'::varchar,
      'Youtube'::varchar
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
    ('adobe-creative-cloud-1-month-subscription'::varchar, 'adobe-creative-clound'::varchar),
    ('adobe-creative-cloud-12-months-subscription-prepaid'::varchar, 'adobe-creative-clound'::varchar),
    ('adobe-creative-cloud-3-months-subscription'::varchar, 'adobe-creative-clound'::varchar),
    ('adobe-creative-cloud-6-months-subscription'::varchar, 'adobe-creative-clound'::varchar),
    ('amazon-prime-video-1-month-subscription'::varchar, 'amazon-prime-video'::varchar),
    ('amazon-prime-video-12-months-subscription'::varchar, 'amazon-prime-video'::varchar),
    ('amazon-prime-video-3-months-subscription'::varchar, 'amazon-prime-video'::varchar),
    ('amazon-prime-video-6-months-subscription'::varchar, 'amazon-prime-video'::varchar),
    ('apple-music-1-month-subscription'::varchar, 'apple'::varchar),
    ('apple-tv-1-month-subscription'::varchar, 'apple'::varchar),
    ('apple-tv-12-months-subscription'::varchar, 'apple'::varchar),
    ('apple-tv-2-months-subscription'::varchar, 'apple'::varchar),
    ('apple-tv-3-months-subscription'::varchar, 'apple'::varchar),
    ('apple-tv-6-months-subscription'::varchar, 'apple'::varchar),
    ('chatgpt-pro-1-month-subscription'::varchar, 'chatgpt'::varchar),
    ('chatgpt-pro-12-months-subscription'::varchar, 'chatgpt'::varchar),
    ('chatgpt-pro-3-months-subscription'::varchar, 'chatgpt'::varchar),
    ('chatgpt-pro-6-months-subscription'::varchar, 'chatgpt'::varchar),
    ('linked-premium-career-3-months'::varchar, 'linkedin'::varchar),
    ('linkedin-premium-business-12-months'::varchar, 'linkedin'::varchar),
    ('linkedin-sales-navigator-12-months'::varchar, 'linkedin'::varchar),
    ('lovable-100-credits-1-month-subscription'::varchar, 'loveable'::varchar),
    ('myfitnesspal-premium-12-months'::varchar, 'myfitnesspal'::varchar),
    ('n8n-starter-12-months-subscription'::varchar, 'n8n'::varchar),
    ('netflix-basic-1-month'::varchar, 'netflix'::varchar),
    ('netflix-basic-12-months'::varchar, 'netflix'::varchar),
    ('netflix-basic-3-months'::varchar, 'netflix'::varchar),
    ('netflix-basic-6-months'::varchar, 'netflix'::varchar),
    ('netflix-premium-4k-1-month'::varchar, 'netflix'::varchar),
    ('netflix-premium-4k-12-months'::varchar, 'netflix'::varchar),
    ('netflix-premium-4k-3-months'::varchar, 'netflix'::varchar),
    ('netflix-premium-4k-6-months'::varchar, 'netflix'::varchar),
    ('netflix-standard-1-month'::varchar, 'netflix'::varchar),
    ('netflix-standard-12-months'::varchar, 'netflix'::varchar),
    ('netflix-standard-3-months'::varchar, 'netflix'::varchar),
    ('netflix-standard-6-months'::varchar, 'netflix'::varchar),
    ('notion-plus-12-months'::varchar, 'notion'::varchar),
    ('perplexity-pro-12-months-subscription'::varchar, 'perplexity'::varchar),
    ('spotify-premium-1-month'::varchar, 'spotify'::varchar),
    ('spotify-premium-12-months'::varchar, 'spotify'::varchar),
    ('spotify-premium-3-months'::varchar, 'spotify'::varchar),
    ('spotify-premium-6-months'::varchar, 'spotify'::varchar),
    ('youtube-premium-12-months-subscription'::varchar, 'youtube'::varchar),
    ('youtube-premium-3-months-subscription'::varchar, 'youtube'::varchar)
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
    ('adobe-creative-cloud-1-month-subscription'::varchar, 'adobe-creative-clound'::varchar),
    ('adobe-creative-cloud-12-months-subscription-prepaid'::varchar, 'adobe-creative-clound'::varchar),
    ('adobe-creative-cloud-3-months-subscription'::varchar, 'adobe-creative-clound'::varchar),
    ('adobe-creative-cloud-6-months-subscription'::varchar, 'adobe-creative-clound'::varchar),
    ('amazon-prime-video-1-month-subscription'::varchar, 'amazon-prime-video'::varchar),
    ('amazon-prime-video-12-months-subscription'::varchar, 'amazon-prime-video'::varchar),
    ('amazon-prime-video-3-months-subscription'::varchar, 'amazon-prime-video'::varchar),
    ('amazon-prime-video-6-months-subscription'::varchar, 'amazon-prime-video'::varchar),
    ('apple-music-1-month-subscription'::varchar, 'apple'::varchar),
    ('apple-tv-1-month-subscription'::varchar, 'apple'::varchar),
    ('apple-tv-12-months-subscription'::varchar, 'apple'::varchar),
    ('apple-tv-2-months-subscription'::varchar, 'apple'::varchar),
    ('apple-tv-3-months-subscription'::varchar, 'apple'::varchar),
    ('apple-tv-6-months-subscription'::varchar, 'apple'::varchar),
    ('chatgpt-pro-1-month-subscription'::varchar, 'chatgpt'::varchar),
    ('chatgpt-pro-12-months-subscription'::varchar, 'chatgpt'::varchar),
    ('chatgpt-pro-3-months-subscription'::varchar, 'chatgpt'::varchar),
    ('chatgpt-pro-6-months-subscription'::varchar, 'chatgpt'::varchar),
    ('linked-premium-career-3-months'::varchar, 'linkedin'::varchar),
    ('linkedin-premium-business-12-months'::varchar, 'linkedin'::varchar),
    ('linkedin-sales-navigator-12-months'::varchar, 'linkedin'::varchar),
    ('lovable-100-credits-1-month-subscription'::varchar, 'loveable'::varchar),
    ('myfitnesspal-premium-12-months'::varchar, 'myfitnesspal'::varchar),
    ('n8n-starter-12-months-subscription'::varchar, 'n8n'::varchar),
    ('netflix-basic-1-month'::varchar, 'netflix'::varchar),
    ('netflix-basic-12-months'::varchar, 'netflix'::varchar),
    ('netflix-basic-3-months'::varchar, 'netflix'::varchar),
    ('netflix-basic-6-months'::varchar, 'netflix'::varchar),
    ('netflix-premium-4k-1-month'::varchar, 'netflix'::varchar),
    ('netflix-premium-4k-12-months'::varchar, 'netflix'::varchar),
    ('netflix-premium-4k-3-months'::varchar, 'netflix'::varchar),
    ('netflix-premium-4k-6-months'::varchar, 'netflix'::varchar),
    ('netflix-standard-1-month'::varchar, 'netflix'::varchar),
    ('netflix-standard-12-months'::varchar, 'netflix'::varchar),
    ('netflix-standard-3-months'::varchar, 'netflix'::varchar),
    ('netflix-standard-6-months'::varchar, 'netflix'::varchar),
    ('notion-plus-12-months'::varchar, 'notion'::varchar),
    ('perplexity-pro-12-months-subscription'::varchar, 'perplexity'::varchar),
    ('spotify-premium-1-month'::varchar, 'spotify'::varchar),
    ('spotify-premium-12-months'::varchar, 'spotify'::varchar),
    ('spotify-premium-3-months'::varchar, 'spotify'::varchar),
    ('spotify-premium-6-months'::varchar, 'spotify'::varchar),
    ('youtube-premium-12-months-subscription'::varchar, 'youtube'::varchar),
    ('youtube-premium-3-months-subscription'::varchar, 'youtube'::varchar)
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
  WHERE slug IN (
  'adobe-creative-cloud-1-month-subscription',
  'adobe-creative-cloud-12-months-subscription-prepaid',
  'adobe-creative-cloud-3-months-subscription',
  'adobe-creative-cloud-6-months-subscription',
  'amazon-prime-video-1-month-subscription',
  'amazon-prime-video-12-months-subscription',
  'amazon-prime-video-3-months-subscription',
  'amazon-prime-video-6-months-subscription',
  'apple-music-1-month-subscription',
  'apple-tv-1-month-subscription',
  'apple-tv-12-months-subscription',
  'apple-tv-2-months-subscription',
  'apple-tv-3-months-subscription',
  'apple-tv-6-months-subscription',
  'chatgpt-pro-1-month-subscription',
  'chatgpt-pro-12-months-subscription',
  'chatgpt-pro-3-months-subscription',
  'chatgpt-pro-6-months-subscription',
  'linked-premium-career-3-months',
  'linkedin-premium-business-12-months',
  'linkedin-sales-navigator-12-months',
  'lovable-100-credits-1-month-subscription',
  'myfitnesspal-premium-12-months',
  'n8n-starter-12-months-subscription',
  'netflix-basic-1-month',
  'netflix-basic-12-months',
  'netflix-basic-3-months',
  'netflix-basic-6-months',
  'netflix-premium-4k-1-month',
  'netflix-premium-4k-12-months',
  'netflix-premium-4k-3-months',
  'netflix-premium-4k-6-months',
  'netflix-standard-1-month',
  'netflix-standard-12-months',
  'netflix-standard-3-months',
  'netflix-standard-6-months',
  'notion-plus-12-months',
  'perplexity-pro-12-months-subscription',
  'spotify-premium-1-month',
  'spotify-premium-12-months',
  'spotify-premium-3-months',
  'spotify-premium-6-months',
  'youtube-premium-12-months-subscription',
  'youtube-premium-3-months-subscription'
  )
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
    ('adobe-creative-cloud-1-month-subscription'::varchar, 'design'::varchar, 'Design'::varchar, 1::integer),
    ('adobe-creative-cloud-1-month-subscription'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 2::integer),
    ('adobe-creative-cloud-12-months-subscription-prepaid'::varchar, 'design'::varchar, 'Design'::varchar, 1::integer),
    ('adobe-creative-cloud-12-months-subscription-prepaid'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 2::integer),
    ('adobe-creative-cloud-3-months-subscription'::varchar, 'design'::varchar, 'Design'::varchar, 1::integer),
    ('adobe-creative-cloud-3-months-subscription'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 2::integer),
    ('adobe-creative-cloud-6-months-subscription'::varchar, 'design'::varchar, 'Design'::varchar, 1::integer),
    ('adobe-creative-cloud-6-months-subscription'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 2::integer),
    ('amazon-prime-video-1-month-subscription'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('amazon-prime-video-12-months-subscription'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('amazon-prime-video-3-months-subscription'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('amazon-prime-video-6-months-subscription'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('apple-music-1-month-subscription'::varchar, 'music'::varchar, 'Music'::varchar, 1::integer),
    ('apple-tv-1-month-subscription'::varchar, 'music'::varchar, 'Music'::varchar, 1::integer),
    ('apple-tv-12-months-subscription'::varchar, 'music'::varchar, 'Music'::varchar, 1::integer),
    ('apple-tv-2-months-subscription'::varchar, 'music'::varchar, 'Music'::varchar, 1::integer),
    ('apple-tv-3-months-subscription'::varchar, 'music'::varchar, 'Music'::varchar, 1::integer),
    ('apple-tv-6-months-subscription'::varchar, 'music'::varchar, 'Music'::varchar, 1::integer),
    ('chatgpt-pro-1-month-subscription'::varchar, 'ai'::varchar, 'AI'::varchar, 1::integer),
    ('chatgpt-pro-1-month-subscription'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 2::integer),
    ('chatgpt-pro-12-months-subscription'::varchar, 'ai'::varchar, 'AI'::varchar, 1::integer),
    ('chatgpt-pro-12-months-subscription'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 2::integer),
    ('chatgpt-pro-3-months-subscription'::varchar, 'ai'::varchar, 'AI'::varchar, 1::integer),
    ('chatgpt-pro-3-months-subscription'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 2::integer),
    ('chatgpt-pro-6-months-subscription'::varchar, 'ai'::varchar, 'AI'::varchar, 1::integer),
    ('chatgpt-pro-6-months-subscription'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 2::integer),
    ('linked-premium-career-3-months'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 1::integer),
    ('linkedin-premium-business-12-months'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 1::integer),
    ('linkedin-sales-navigator-12-months'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 1::integer),
    ('lovable-100-credits-1-month-subscription'::varchar, 'ai'::varchar, 'AI'::varchar, 1::integer),
    ('myfitnesspal-premium-12-months'::varchar, 'fitness'::varchar, 'Fitness'::varchar, 1::integer),
    ('n8n-starter-12-months-subscription'::varchar, 'ai'::varchar, 'AI'::varchar, 1::integer),
    ('netflix-basic-1-month'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('netflix-basic-12-months'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('netflix-basic-3-months'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('netflix-basic-6-months'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('netflix-premium-4k-1-month'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('netflix-premium-4k-12-months'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('netflix-premium-4k-3-months'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('netflix-premium-4k-6-months'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('netflix-standard-1-month'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('netflix-standard-12-months'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('netflix-standard-3-months'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('netflix-standard-6-months'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('notion-plus-12-months'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 1::integer),
    ('perplexity-pro-12-months-subscription'::varchar, 'ai'::varchar, 'AI'::varchar, 1::integer),
    ('spotify-premium-1-month'::varchar, 'music'::varchar, 'Music'::varchar, 1::integer),
    ('spotify-premium-12-months'::varchar, 'music'::varchar, 'Music'::varchar, 1::integer),
    ('spotify-premium-3-months'::varchar, 'music'::varchar, 'Music'::varchar, 1::integer),
    ('spotify-premium-6-months'::varchar, 'music'::varchar, 'Music'::varchar, 1::integer),
    ('youtube-premium-12-months-subscription'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('youtube-premium-12-months-subscription'::varchar, 'music'::varchar, 'Music'::varchar, 2::integer),
    ('youtube-premium-3-months-subscription'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('youtube-premium-3-months-subscription'::varchar, 'music'::varchar, 'Music'::varchar, 2::integer)
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
    ('adobe-creative-cloud-1-month-subscription'::varchar, 'design'::varchar, 'Design'::varchar, 1::integer),
    ('adobe-creative-cloud-1-month-subscription'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 2::integer),
    ('adobe-creative-cloud-12-months-subscription-prepaid'::varchar, 'design'::varchar, 'Design'::varchar, 1::integer),
    ('adobe-creative-cloud-12-months-subscription-prepaid'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 2::integer),
    ('adobe-creative-cloud-3-months-subscription'::varchar, 'design'::varchar, 'Design'::varchar, 1::integer),
    ('adobe-creative-cloud-3-months-subscription'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 2::integer),
    ('adobe-creative-cloud-6-months-subscription'::varchar, 'design'::varchar, 'Design'::varchar, 1::integer),
    ('adobe-creative-cloud-6-months-subscription'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 2::integer),
    ('amazon-prime-video-1-month-subscription'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('amazon-prime-video-12-months-subscription'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('amazon-prime-video-3-months-subscription'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('amazon-prime-video-6-months-subscription'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('apple-music-1-month-subscription'::varchar, 'music'::varchar, 'Music'::varchar, 1::integer),
    ('apple-tv-1-month-subscription'::varchar, 'music'::varchar, 'Music'::varchar, 1::integer),
    ('apple-tv-12-months-subscription'::varchar, 'music'::varchar, 'Music'::varchar, 1::integer),
    ('apple-tv-2-months-subscription'::varchar, 'music'::varchar, 'Music'::varchar, 1::integer),
    ('apple-tv-3-months-subscription'::varchar, 'music'::varchar, 'Music'::varchar, 1::integer),
    ('apple-tv-6-months-subscription'::varchar, 'music'::varchar, 'Music'::varchar, 1::integer),
    ('chatgpt-pro-1-month-subscription'::varchar, 'ai'::varchar, 'AI'::varchar, 1::integer),
    ('chatgpt-pro-1-month-subscription'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 2::integer),
    ('chatgpt-pro-12-months-subscription'::varchar, 'ai'::varchar, 'AI'::varchar, 1::integer),
    ('chatgpt-pro-12-months-subscription'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 2::integer),
    ('chatgpt-pro-3-months-subscription'::varchar, 'ai'::varchar, 'AI'::varchar, 1::integer),
    ('chatgpt-pro-3-months-subscription'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 2::integer),
    ('chatgpt-pro-6-months-subscription'::varchar, 'ai'::varchar, 'AI'::varchar, 1::integer),
    ('chatgpt-pro-6-months-subscription'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 2::integer),
    ('linked-premium-career-3-months'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 1::integer),
    ('linkedin-premium-business-12-months'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 1::integer),
    ('linkedin-sales-navigator-12-months'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 1::integer),
    ('lovable-100-credits-1-month-subscription'::varchar, 'ai'::varchar, 'AI'::varchar, 1::integer),
    ('myfitnesspal-premium-12-months'::varchar, 'fitness'::varchar, 'Fitness'::varchar, 1::integer),
    ('n8n-starter-12-months-subscription'::varchar, 'ai'::varchar, 'AI'::varchar, 1::integer),
    ('netflix-basic-1-month'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('netflix-basic-12-months'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('netflix-basic-3-months'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('netflix-basic-6-months'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('netflix-premium-4k-1-month'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('netflix-premium-4k-12-months'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('netflix-premium-4k-3-months'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('netflix-premium-4k-6-months'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('netflix-standard-1-month'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('netflix-standard-12-months'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('netflix-standard-3-months'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('netflix-standard-6-months'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('notion-plus-12-months'::varchar, 'productivity'::varchar, 'Productivity'::varchar, 1::integer),
    ('perplexity-pro-12-months-subscription'::varchar, 'ai'::varchar, 'AI'::varchar, 1::integer),
    ('spotify-premium-1-month'::varchar, 'music'::varchar, 'Music'::varchar, 1::integer),
    ('spotify-premium-12-months'::varchar, 'music'::varchar, 'Music'::varchar, 1::integer),
    ('spotify-premium-3-months'::varchar, 'music'::varchar, 'Music'::varchar, 1::integer),
    ('spotify-premium-6-months'::varchar, 'music'::varchar, 'Music'::varchar, 1::integer),
    ('youtube-premium-12-months-subscription'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('youtube-premium-12-months-subscription'::varchar, 'music'::varchar, 'Music'::varchar, 2::integer),
    ('youtube-premium-3-months-subscription'::varchar, 'streaming'::varchar, 'Streaming'::varchar, 1::integer),
    ('youtube-premium-3-months-subscription'::varchar, 'music'::varchar, 'Music'::varchar, 2::integer)
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
  WHERE slug IN (
  'adobe-creative-cloud-1-month-subscription',
  'adobe-creative-cloud-12-months-subscription-prepaid',
  'adobe-creative-cloud-3-months-subscription',
  'adobe-creative-cloud-6-months-subscription',
  'amazon-prime-video-1-month-subscription',
  'amazon-prime-video-12-months-subscription',
  'amazon-prime-video-3-months-subscription',
  'amazon-prime-video-6-months-subscription',
  'apple-music-1-month-subscription',
  'apple-tv-1-month-subscription',
  'apple-tv-12-months-subscription',
  'apple-tv-2-months-subscription',
  'apple-tv-3-months-subscription',
  'apple-tv-6-months-subscription',
  'chatgpt-pro-1-month-subscription',
  'chatgpt-pro-12-months-subscription',
  'chatgpt-pro-3-months-subscription',
  'chatgpt-pro-6-months-subscription',
  'linked-premium-career-3-months',
  'linkedin-premium-business-12-months',
  'linkedin-sales-navigator-12-months',
  'lovable-100-credits-1-month-subscription',
  'myfitnesspal-premium-12-months',
  'n8n-starter-12-months-subscription',
  'netflix-basic-1-month',
  'netflix-basic-12-months',
  'netflix-basic-3-months',
  'netflix-basic-6-months',
  'netflix-premium-4k-1-month',
  'netflix-premium-4k-12-months',
  'netflix-premium-4k-3-months',
  'netflix-premium-4k-6-months',
  'netflix-standard-1-month',
  'netflix-standard-12-months',
  'netflix-standard-3-months',
  'netflix-standard-6-months',
  'notion-plus-12-months',
  'perplexity-pro-12-months-subscription',
  'spotify-premium-1-month',
  'spotify-premium-12-months',
  'spotify-premium-3-months',
  'spotify-premium-6-months',
  'youtube-premium-12-months-subscription',
  'youtube-premium-3-months-subscription'
  )
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
