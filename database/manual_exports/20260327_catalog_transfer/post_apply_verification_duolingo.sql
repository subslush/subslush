-- Post-apply verification for 1 sub-category + 2 products (Duolingo)

-- =====================================================
-- A) Quick presence checks
-- =====================================================
SELECT
  COUNT(*) AS sub_categories_found
FROM product_sub_categories
WHERE (category, name) IN (
  ('Education, Productivity', 'Duolingo')
);

SELECT
  COUNT(*) AS products_found
FROM products
WHERE slug IN (
  'duolingo-max-12-months',
  'duolingo-super-12-months'
);

SELECT
  COUNT(*) AS mapping_rows_found
FROM product_sub_category_map pscm
JOIN products p
  ON p.id = pscm.product_id
WHERE p.slug IN (
  'duolingo-max-12-months',
  'duolingo-super-12-months'
);

-- =====================================================
-- B) Exact-match verification (sub-category)
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

-- =====================================================
-- D) Mapping verification (product_sub_category_map)
-- =====================================================
SELECT
  p.slug,
  sc.slug AS sub_category_slug,
  sc.category,
  sc.name AS sub_category_name,
  pscm.is_primary
FROM product_sub_category_map pscm
JOIN products p
  ON p.id = pscm.product_id
JOIN product_sub_categories sc
  ON sc.id = pscm.sub_category_id
WHERE p.slug IN (
  'duolingo-max-12-months',
  'duolingo-super-12-months'
)
ORDER BY p.slug, pscm.is_primary DESC, sc.slug;

SELECT
  p.slug,
  COUNT(*) FILTER (WHERE pscm.is_primary) AS primary_rows,
  COUNT(*) AS total_rows
FROM product_sub_category_map pscm
JOIN products p
  ON p.id = pscm.product_id
WHERE p.slug IN (
  'duolingo-max-12-months',
  'duolingo-super-12-months'
)
GROUP BY p.slug
ORDER BY p.slug;
