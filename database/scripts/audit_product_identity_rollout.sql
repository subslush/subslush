-- Read-only rollout verification for durable product identity.
-- Usage: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/scripts/audit_product_identity_rollout.sql
-- Safe to run before/after the idempotent backfill; it never writes data.

\pset pager off
\echo 'Backfill outcome counts'
SELECT entity_table, status, COUNT(*) AS rows
FROM product_identity_backfill_audit
WHERE migration_key = '20260721_durable_product_identity'
GROUP BY entity_table, status
ORDER BY entity_table, status;

\echo 'Unresolved/conflicting identifiers (must be investigated, never guessed)'
SELECT entity_table, entity_id, status, candidate_product_ids, sources, details
FROM product_identity_backfill_audit
WHERE migration_key = '20260721_durable_product_identity'
  AND status IN ('unresolved', 'conflict')
ORDER BY entity_table, entity_id;

\echo 'Order item identity and immutable snapshot coverage'
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE product_id IS NOT NULL) AS identified,
  COUNT(*) FILTER (WHERE product_id IS NULL) AS unresolved,
  COUNT(*) FILTER (WHERE product_name_snapshot IS NOT NULL) AS name_snapshots,
  COUNT(*) FILTER (WHERE duration_months_snapshot IS NOT NULL) AS duration_snapshots,
  COUNT(*) FILTER (WHERE currency IS NOT NULL AND unit_price_cents IS NOT NULL
                    AND total_price_cents IS NOT NULL) AS monetary_snapshots
FROM order_items;

\echo 'Subscription identity and snapshot coverage'
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE product_id IS NOT NULL) AS identified,
  COUNT(*) FILTER (WHERE product_id IS NULL) AS unresolved,
  COUNT(*) FILTER (WHERE product_name_snapshot IS NOT NULL) AS name_snapshots,
  COUNT(*) FILTER (WHERE duration_months_snapshot IS NOT NULL) AS duration_snapshots,
  COUNT(*) FILTER (WHERE currency_snapshot IS NOT NULL
                    AND unit_price_cents_snapshot IS NOT NULL
                    AND total_price_cents_snapshot IS NOT NULL) AS monetary_snapshots
FROM subscriptions;

\echo 'Identity conflicts against retained legacy variant ownership'
SELECT 'order_items' AS entity_table, oi.id::text AS entity_id,
       oi.product_id, pv.product_id AS legacy_product_id
FROM order_items oi
JOIN product_variants pv ON pv.id = oi.product_variant_id
WHERE oi.product_id IS DISTINCT FROM pv.product_id
  AND oi.product_id IS NOT NULL
UNION ALL
SELECT 'subscriptions', s.id::text, s.product_id, pv.product_id
FROM subscriptions s
JOIN product_variants pv ON pv.id = s.product_variant_id
WHERE s.product_id IS DISTINCT FROM pv.product_id
  AND s.product_id IS NOT NULL
UNION ALL
SELECT 'payments', p.id::text, p.product_id, pv.product_id
FROM payments p
JOIN product_variants pv ON pv.id = p.product_variant_id
WHERE p.product_id IS DISTINCT FROM pv.product_id
  AND p.product_id IS NOT NULL;

\echo 'Multi-product aggregate payments (root product_id must remain NULL)'
SELECT p.id AS payment_id, p.product_id, COUNT(DISTINCT oi.product_id) AS product_count,
       ARRAY_AGG(DISTINCT oi.product_id ORDER BY oi.product_id) AS product_ids
FROM payments p
JOIN payment_items pi ON pi.payment_id = p.id
JOIN order_items oi ON oi.id = pi.order_item_id
GROUP BY p.id, p.product_id
HAVING COUNT(DISTINCT oi.product_id) > 1
ORDER BY p.id;

\echo 'Price/duration continuity (historical snapshots versus current catalog)'
SELECT oi.id AS order_item_id, oi.product_id,
       oi.product_name_snapshot, p.name AS current_name,
       COALESCE(oi.duration_months_snapshot, oi.term_months) AS purchased_months,
       p.duration_months AS current_months,
       oi.unit_price_cents AS purchased_unit_price_cents,
       oi.total_price_cents AS purchased_total_price_cents,
       oi.currency AS purchased_currency,
       p.fixed_price_cents AS current_price_cents,
       p.fixed_price_currency AS current_currency
FROM order_items oi
LEFT JOIN products p ON p.id = oi.product_id
ORDER BY oi.created_at, oi.id;
