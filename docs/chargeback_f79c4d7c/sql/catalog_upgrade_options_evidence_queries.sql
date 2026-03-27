-- Catalog evidence extraction for dispute packet
-- Case anchor:
--   order_id        = f79c4d7c-a188-4d3d-91e4-b62c6772d830
--   subscription_id = d2aacda0-6cd4-484d-83bc-0b5a54767aad
--
-- Run each query block separately in Supabase SQL Editor and export results to CSV.

-- =====================================================
-- Q1) Checkout-time snapshot (what options were recorded at purchase)
-- =====================================================
WITH params AS (
  SELECT 'f79c4d7c-a188-4d3d-91e4-b62c6772d830'::uuid AS order_id
)
SELECT
  o.id AS order_id,
  o.created_at AS order_created_at_utc,
  o.user_id,
  o.status AS order_status,
  o.status_reason AS order_status_reason,
  oi.id AS order_item_id,
  oi.product_variant_id AS variant_id,
  pv.product_id,
  p.name AS product_name,
  p.slug AS product_slug,
  p.description AS product_description_current,
  pv.name AS variant_name,
  pv.service_plan,
  pv.description AS variant_description_current,
  COALESCE(o.metadata #> '{upgrade_options}', o.metadata #> '{upgradeOptions}') AS order_upgrade_options,
  COALESCE(oi.metadata #> '{upgrade_options}', oi.metadata #> '{upgradeOptions}') AS order_item_upgrade_options,
  COALESCE(pm.metadata #> '{upgrade_options}', pm.metadata #> '{upgradeOptions}') AS payment_upgrade_options,
  o.metadata AS order_metadata_full,
  oi.metadata AS order_item_metadata_full,
  pm.metadata AS payment_metadata_full
FROM params x
JOIN orders o ON o.id = x.order_id
JOIN order_items oi ON oi.order_id = o.id
LEFT JOIN product_variants pv ON pv.id = oi.product_variant_id
LEFT JOIN products p ON p.id = pv.product_id
LEFT JOIN payments pm ON pm.order_id = o.id
ORDER BY pm.created_at NULLS LAST;


-- =====================================================
-- Q2) Current product/variant config + terms/upgrade metadata
-- =====================================================
WITH params AS (
  SELECT 'f79c4d7c-a188-4d3d-91e4-b62c6772d830'::uuid AS order_id
),
ctx AS (
  SELECT DISTINCT
    oi.product_variant_id AS variant_id,
    pv.product_id
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  JOIN product_variants pv ON pv.id = oi.product_variant_id
  WHERE o.id = (SELECT order_id FROM params)
)
SELECT
  p.id AS product_id,
  p.created_at AS product_created_at_utc,
  p.updated_at AS product_updated_at_utc,
  p.status AS product_status,
  p.name AS product_name,
  p.slug AS product_slug,
  p.service_type,
  p.category,
  p.sub_category,
  p.description AS product_description,
  COALESCE(p.metadata #> '{upgrade_options}', p.metadata #> '{upgradeOptions}') AS product_upgrade_options_current,
  COALESCE(p.metadata #> '{terms_conditions}', p.metadata #> '{termsConditions}', p.metadata #> '{terms}') AS product_terms_conditions_current,
  p.metadata AS product_metadata_full,
  pv.id AS variant_id,
  pv.created_at AS variant_created_at_utc,
  pv.updated_at AS variant_updated_at_utc,
  pv.is_active AS variant_is_active,
  pv.name AS variant_name,
  pv.variant_code,
  pv.service_plan,
  pv.description AS variant_description,
  pv.metadata AS variant_metadata_full
FROM ctx
JOIN products p ON p.id = ctx.product_id
JOIN product_variants pv ON pv.id = ctx.variant_id;


-- =====================================================
-- Q3) Full admin audit history for this product + variant
-- =====================================================
WITH params AS (
  SELECT 'f79c4d7c-a188-4d3d-91e4-b62c6772d830'::uuid AS order_id
),
ctx AS (
  SELECT DISTINCT
    oi.product_variant_id AS variant_id,
    pv.product_id
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  JOIN product_variants pv ON pv.id = oi.product_variant_id
  WHERE o.id = (SELECT order_id FROM params)
)
SELECT
  a.created_at AS audit_created_at_utc,
  a.action,
  a.entity_type,
  a.entity_id,
  a.user_id AS admin_user_id,
  a.request_id,
  a.ip_address,
  a.before ->> 'description' AS before_description,
  a.after ->> 'description' AS after_description,
  COALESCE(a.before #> '{metadata,upgrade_options}', a.before #> '{metadata,upgradeOptions}') AS before_upgrade_options,
  COALESCE(a.after #> '{metadata,upgrade_options}', a.after #> '{metadata,upgradeOptions}') AS after_upgrade_options,
  a.metadata AS audit_metadata,
  a.before AS before_full,
  a.after AS after_full
FROM admin_audit_logs a
JOIN ctx
  ON (a.entity_type = 'product' AND a.entity_id = ctx.product_id)
  OR (a.entity_type = 'product_variant' AND a.entity_id = ctx.variant_id)
WHERE a.action IN (
  'catalog.product.create',
  'catalog.product.update',
  'catalog.variant.create',
  'catalog.variant.update'
)
ORDER BY a.created_at;


-- =====================================================
-- Q4) Pre-purchase audit-only log view (<= order.created_at)
-- =====================================================
WITH params AS (
  SELECT 'f79c4d7c-a188-4d3d-91e4-b62c6772d830'::uuid AS order_id
),
ctx AS (
  SELECT DISTINCT
    o.created_at AS order_created_at_utc,
    oi.product_variant_id AS variant_id,
    pv.product_id
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  JOIN product_variants pv ON pv.id = oi.product_variant_id
  WHERE o.id = (SELECT order_id FROM params)
)
SELECT
  a.created_at AS audit_created_at_utc,
  c.order_created_at_utc,
  a.action,
  a.entity_type,
  a.entity_id,
  a.before ->> 'description' AS before_description,
  a.after ->> 'description' AS after_description,
  COALESCE(a.before #> '{metadata,upgrade_options}', a.before #> '{metadata,upgradeOptions}') AS before_upgrade_options,
  COALESCE(a.after #> '{metadata,upgrade_options}', a.after #> '{metadata,upgradeOptions}') AS after_upgrade_options,
  a.metadata AS audit_metadata,
  a.request_id,
  a.ip_address
FROM admin_audit_logs a
JOIN ctx c
  ON (
    (a.entity_type = 'product' AND a.entity_id = c.product_id)
    OR
    (a.entity_type = 'product_variant' AND a.entity_id = c.variant_id)
  )
WHERE a.action IN (
  'catalog.product.create',
  'catalog.product.update',
  'catalog.variant.create',
  'catalog.variant.update'
)
  AND a.created_at <= c.order_created_at_utc
ORDER BY a.created_at;


-- =====================================================
-- Q5) Reconstructed product/variant state AS OF purchase timestamp
--      (uses latest audit "after" <= order.created_at, falls back to current row)
-- =====================================================
WITH params AS (
  SELECT 'f79c4d7c-a188-4d3d-91e4-b62c6772d830'::uuid AS order_id
),
ctx AS (
  SELECT
    o.id AS order_id,
    o.created_at AS order_created_at_utc,
    oi.product_variant_id AS variant_id,
    pv.product_id,
    COALESCE(o.metadata #> '{upgrade_options}', o.metadata #> '{upgradeOptions}') AS order_upgrade_options
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  JOIN product_variants pv ON pv.id = oi.product_variant_id
  WHERE o.id = (SELECT order_id FROM params)
  ORDER BY oi.created_at
  LIMIT 1
),
product_current AS (
  SELECT p.*
  FROM products p
  JOIN ctx c ON c.product_id = p.id
),
variant_current AS (
  SELECT pv.*
  FROM product_variants pv
  JOIN ctx c ON c.variant_id = pv.id
),
product_before_order AS (
  SELECT a.after
  FROM admin_audit_logs a
  JOIN ctx c ON a.entity_type = 'product' AND a.entity_id = c.product_id
  WHERE a.action IN ('catalog.product.create', 'catalog.product.update')
    AND a.created_at <= c.order_created_at_utc
  ORDER BY a.created_at DESC
  LIMIT 1
),
variant_before_order AS (
  SELECT a.after
  FROM admin_audit_logs a
  JOIN ctx c ON a.entity_type = 'product_variant' AND a.entity_id = c.variant_id
  WHERE a.action IN ('catalog.variant.create', 'catalog.variant.update')
    AND a.created_at <= c.order_created_at_utc
  ORDER BY a.created_at DESC
  LIMIT 1
)
SELECT
  c.order_id,
  c.order_created_at_utc,
  (COALESCE((SELECT after FROM product_before_order), to_jsonb(pc)) ->> 'name') AS product_name_asof_order,
  (COALESCE((SELECT after FROM product_before_order), to_jsonb(pc)) ->> 'slug') AS product_slug_asof_order,
  (COALESCE((SELECT after FROM product_before_order), to_jsonb(pc)) ->> 'description') AS product_description_asof_order,
  COALESCE(
    COALESCE((SELECT after FROM product_before_order), to_jsonb(pc)) #> '{metadata,upgrade_options}',
    COALESCE((SELECT after FROM product_before_order), to_jsonb(pc)) #> '{metadata,upgradeOptions}'
  ) AS product_upgrade_options_asof_order,
  (COALESCE((SELECT after FROM variant_before_order), to_jsonb(vc)) ->> 'name') AS variant_name_asof_order,
  (COALESCE((SELECT after FROM variant_before_order), to_jsonb(vc)) ->> 'service_plan') AS variant_service_plan_asof_order,
  (COALESCE((SELECT after FROM variant_before_order), to_jsonb(vc)) ->> 'description') AS variant_description_asof_order,
  c.order_upgrade_options AS order_upgrade_options_recorded_at_checkout
FROM ctx c
JOIN product_current pc ON TRUE
JOIN variant_current vc ON TRUE;


-- =====================================================
-- Q6) Inventory view: all Google AI Pro related products/variants + options
-- =====================================================
SELECT
  p.id AS product_id,
  p.created_at AS product_created_at_utc,
  p.updated_at AS product_updated_at_utc,
  p.status AS product_status,
  p.name AS product_name,
  p.slug,
  p.service_type,
  p.description AS product_description,
  COALESCE(p.metadata #> '{upgrade_options}', p.metadata #> '{upgradeOptions}') AS product_upgrade_options_current,
  COALESCE(p.metadata #> '{terms_conditions}', p.metadata #> '{termsConditions}', p.metadata #> '{terms}') AS product_terms_conditions_current,
  pv.id AS variant_id,
  pv.created_at AS variant_created_at_utc,
  pv.updated_at AS variant_updated_at_utc,
  pv.is_active,
  pv.name AS variant_name,
  pv.variant_code,
  pv.service_plan,
  pv.description AS variant_description,
  pv.metadata AS variant_metadata
FROM products p
LEFT JOIN product_variants pv ON pv.product_id = p.id
WHERE lower(COALESCE(p.service_type, '')) = 'google'
  AND (
    lower(COALESCE(p.name, '')) LIKE '%ai pro%'
    OR lower(COALESCE(p.slug, '')) LIKE '%google-aipro%'
    OR lower(COALESCE(pv.name, '')) LIKE '%ai pro%'
    OR lower(COALESCE(pv.service_plan, '')) LIKE '%google-aipro%'
  )
ORDER BY p.created_at, pv.created_at;


-- =====================================================
-- Q7) Upgrade selection snapshot for this subscription/order
--      (direct evidence of allowed options + selected path)
-- =====================================================
WITH params AS (
  SELECT
    'f79c4d7c-a188-4d3d-91e4-b62c6772d830'::uuid AS order_id,
    'd2aacda0-6cd4-484d-83bc-0b5a54767aad'::uuid AS subscription_id
)
SELECT
  sel.subscription_id,
  sel.order_id,
  sel.selection_type,
  sel.submitted_at AS selection_submitted_at_utc,
  sel.locked_at AS selection_locked_at_utc,
  sel.auto_selected_at AS selection_auto_selected_at_utc,
  sel.manual_monthly_acknowledged_at,
  sel.upgrade_options_snapshot,
  s.service_type,
  s.service_plan,
  s.product_variant_id,
  s.created_at AS subscription_created_at_utc,
  s.updated_at AS subscription_updated_at_utc,
  o.created_at AS order_created_at_utc,
  o.status AS order_status,
  o.status_reason AS order_status_reason
FROM params p
LEFT JOIN subscription_upgrade_selections sel
  ON sel.subscription_id = p.subscription_id
  OR sel.order_id = p.order_id
LEFT JOIN subscriptions s ON s.id = COALESCE(sel.subscription_id, p.subscription_id)
LEFT JOIN orders o ON o.id = COALESCE(sel.order_id, p.order_id);


-- =====================================================
-- Q8) Consistency check: was "upgrade current account" ever enabled
--      for this purchased product/variant before checkout?
-- =====================================================
WITH params AS (
  SELECT 'f79c4d7c-a188-4d3d-91e4-b62c6772d830'::uuid AS order_id
),
ctx AS (
  SELECT
    o.id AS order_id,
    o.created_at AS order_created_at_utc,
    oi.product_variant_id AS variant_id,
    pv.product_id,
    COALESCE(o.metadata #> '{upgrade_options}', o.metadata #> '{upgradeOptions}') AS order_upgrade_options
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  JOIN product_variants pv ON pv.id = oi.product_variant_id
  WHERE o.id = (SELECT order_id FROM params)
  ORDER BY oi.created_at
  LIMIT 1
),
snapshots AS (
  SELECT
    a.created_at AS snapshot_ts_utc,
    a.action AS snapshot_source,
    COALESCE(a.after #> '{metadata,upgrade_options}', a.after #> '{metadata,upgradeOptions}') AS upgrade_options
  FROM admin_audit_logs a
  JOIN ctx c
    ON (
      (a.entity_type = 'product' AND a.entity_id = c.product_id)
      OR
      (a.entity_type = 'product_variant' AND a.entity_id = c.variant_id)
    )
  WHERE a.action IN (
    'catalog.product.create',
    'catalog.product.update',
    'catalog.variant.create',
    'catalog.variant.update'
  )
    AND a.created_at <= c.order_created_at_utc

  UNION ALL

  SELECT
    c.order_created_at_utc AS snapshot_ts_utc,
    'checkout.order.metadata' AS snapshot_source,
    c.order_upgrade_options AS upgrade_options
  FROM ctx c
),
normalized AS (
  SELECT
    snapshot_ts_utc,
    snapshot_source,
    upgrade_options,
    lower(COALESCE(upgrade_options ->> 'allow_new_account', '')) AS allow_new_account_text,
    lower(COALESCE(upgrade_options ->> 'allow_own_account', '')) AS allow_own_account_text,
    lower(COALESCE(upgrade_options ->> 'manual_monthly_upgrade', '')) AS manual_monthly_upgrade_text
  FROM snapshots
)
SELECT
  COUNT(*) AS snapshots_considered,
  SUM(CASE WHEN allow_new_account_text = 'true' THEN 1 ELSE 0 END) AS new_account_enabled_count,
  SUM(CASE WHEN allow_own_account_text = 'true' THEN 1 ELSE 0 END) AS own_account_enabled_count,
  SUM(CASE WHEN manual_monthly_upgrade_text = 'true' THEN 1 ELSE 0 END) AS manual_monthly_upgrade_enabled_count
FROM normalized;

-- Optional detail rows for appendix:
WITH params AS (
  SELECT 'f79c4d7c-a188-4d3d-91e4-b62c6772d830'::uuid AS order_id
),
ctx AS (
  SELECT
    o.id AS order_id,
    o.created_at AS order_created_at_utc,
    oi.product_variant_id AS variant_id,
    pv.product_id,
    COALESCE(o.metadata #> '{upgrade_options}', o.metadata #> '{upgradeOptions}') AS order_upgrade_options
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  JOIN product_variants pv ON pv.id = oi.product_variant_id
  WHERE o.id = (SELECT order_id FROM params)
  ORDER BY oi.created_at
  LIMIT 1
),
snapshots AS (
  SELECT
    a.created_at AS snapshot_ts_utc,
    a.action AS snapshot_source,
    COALESCE(a.after #> '{metadata,upgrade_options}', a.after #> '{metadata,upgradeOptions}') AS upgrade_options
  FROM admin_audit_logs a
  JOIN ctx c
    ON (
      (a.entity_type = 'product' AND a.entity_id = c.product_id)
      OR
      (a.entity_type = 'product_variant' AND a.entity_id = c.variant_id)
    )
  WHERE a.action IN (
    'catalog.product.create',
    'catalog.product.update',
    'catalog.variant.create',
    'catalog.variant.update'
  )
    AND a.created_at <= c.order_created_at_utc

  UNION ALL

  SELECT
    c.order_created_at_utc AS snapshot_ts_utc,
    'checkout.order.metadata' AS snapshot_source,
    c.order_upgrade_options AS upgrade_options
  FROM ctx c
)
SELECT
  snapshot_ts_utc,
  snapshot_source,
  upgrade_options
FROM snapshots
ORDER BY snapshot_ts_utc;
