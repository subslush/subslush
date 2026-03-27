-- Post-apply verification for 3 sub-categories + 3 products

-- =====================================================
-- A) Quick presence checks
-- =====================================================
SELECT
  COUNT(*) AS sub_categories_found
FROM product_sub_categories
WHERE (category, name) IN (
  ('Design', 'Figma'),
  ('AI', 'Bolt.new'),
  ('Design, Productivity', 'Canva')
);

SELECT
  COUNT(*) AS products_found
FROM products
WHERE slug IN (
  'figma-professional-24-months',
  'bolt-new-pro-12-months',
  'canva-pro-12-months'
);

-- =====================================================
-- B) Exact-match verification (sub-categories)
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
)
SELECT
  src.slug,
  tgt.id IS NOT NULL AS exists_in_target,
  tgt.id = src.id AS id_match,
  tgt.category = src.category AS category_match,
  tgt.name = src.name AS name_match,
  tgt.slug = src.slug AS slug_match,
  tgt.created_at = src.created_at AS created_at_match,
  tgt.updated_at = src.updated_at AS updated_at_match
FROM source_sub_categories src
LEFT JOIN product_sub_categories tgt
  ON tgt.slug = src.slug
ORDER BY src.slug;

-- =====================================================
-- C) Exact-match verification (products)
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
SELECT
  src.slug,
  tgt.id IS NOT NULL AS exists_in_target,
  tgt.id = src.id AS id_match,
  tgt.name = src.name AS name_match,
  tgt.description = src.description AS description_match,
  tgt.service_type = src.service_type AS service_type_match,
  tgt.status = src.status AS status_match,
  tgt.metadata = src.metadata AS metadata_match,
  tgt.created_at = src.created_at AS created_at_match,
  tgt.updated_at = src.updated_at AS updated_at_match,
  tgt.logo_key = src.logo_key AS logo_key_match,
  tgt.category = src.category AS category_match,
  tgt.default_currency = src.default_currency AS default_currency_match,
  tgt.max_subscriptions IS NOT DISTINCT FROM src.max_subscriptions AS max_subscriptions_match,
  tgt.duration_months = src.duration_months AS duration_months_match,
  tgt.fixed_price_cents = src.fixed_price_cents AS fixed_price_cents_match,
  tgt.fixed_price_currency = src.fixed_price_currency AS fixed_price_currency_match,
  tgt.sub_category = src.sub_category AS sub_category_match
FROM source_products src
LEFT JOIN products tgt
  ON tgt.slug = src.slug
ORDER BY src.slug;
