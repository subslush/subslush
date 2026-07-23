-- Migration: Backfill durable product identity without guessing
-- Created: 2026-07-21T14:00:00.000Z
-- Requires: 20260721_130000_expand_durable_product_identity.sql
-- Strategy: backfill + verify. Conflicts and ambiguous aggregates are audited,
-- never assigned an arbitrary product.

-- Up Migration
BEGIN;

CREATE TEMP TABLE product_identity_candidates (
  entity_id TEXT PRIMARY KEY,
  candidate_product_ids UUID[] NOT NULL,
  sources JSONB NOT NULL DEFAULT '{}'::jsonb,
  aggregate_only BOOLEAN NOT NULL DEFAULT FALSE
) ON COMMIT DROP;

-- Order items: variant ownership is strongest; validated metadata supports
-- fixed-product orders. Disagreement is a conflict and is left untouched.
INSERT INTO product_identity_candidates (entity_id, candidate_product_ids, sources)
SELECT
  oi.id::text,
  ARRAY(
    SELECT DISTINCT candidate
    FROM unnest(ARRAY[oi.product_id, pv.product_id, metadata_product.id]) candidate
    WHERE candidate IS NOT NULL
  ),
  jsonb_strip_nulls(jsonb_build_object(
    'explicit_product_id', oi.product_id,
    'variant_product_id', pv.product_id,
    'metadata_product_id', metadata_product.id,
    'legacy_variant_id', oi.product_variant_id
  ))
FROM order_items oi
LEFT JOIN product_variants pv ON pv.id = oi.product_variant_id
LEFT JOIN products metadata_product
  ON metadata_product.id::text = oi.metadata->>'product_id';

UPDATE order_items oi
SET product_id = candidates.candidate_product_ids[1]
FROM product_identity_candidates candidates
WHERE candidates.entity_id = oi.id::text
  AND cardinality(candidates.candidate_product_ids) = 1
  AND oi.product_id IS NULL;

INSERT INTO product_identity_backfill_audit (
  migration_key, entity_table, entity_id, status, chosen_product_id,
  candidate_product_ids, sources, details
)
SELECT
  '20260721_durable_product_identity',
  'order_items',
  entity_id,
  CASE cardinality(candidate_product_ids)
    WHEN 0 THEN 'unresolved'
    WHEN 1 THEN 'resolved'
    ELSE 'conflict'
  END,
  CASE WHEN cardinality(candidate_product_ids) = 1 THEN candidate_product_ids[1] END,
  candidate_product_ids,
  sources,
  jsonb_build_object('precedence', 'explicit>variant>validated_metadata')
FROM product_identity_candidates
ON CONFLICT (migration_key, entity_table, entity_id) DO UPDATE
SET status = EXCLUDED.status,
    chosen_product_id = EXCLUDED.chosen_product_id,
    candidate_product_ids = EXCLUDED.candidate_product_ids,
    sources = EXCLUDED.sources,
    details = EXCLUDED.details,
    observed_at = NOW();

UPDATE order_items oi
SET product_name_snapshot = COALESCE(oi.product_name_snapshot, p.name),
    product_slug_snapshot = COALESCE(oi.product_slug_snapshot, p.slug),
    duration_months_snapshot = COALESCE(
      oi.duration_months_snapshot,
      oi.term_months,
      CASE
        WHEN (oi.metadata->>'duration_months') ~ '^[1-9][0-9]*$'
          THEN (oi.metadata->>'duration_months')::integer
      END
    ),
    fulfillment_config_snapshot = COALESCE(
      oi.fulfillment_config_snapshot,
      jsonb_strip_nulls(jsonb_build_object(
        'upgrade_options', COALESCE(
          oi.metadata->'upgrade_options',
          p.metadata->'upgrade_options',
          p.metadata->'upgradeOptions'
        ),
        'delivery_format_label', COALESCE(
          oi.metadata->'delivery_format_label',
          p.metadata->'delivery_format_label'
        ),
        'delivery_format_description', COALESCE(
          oi.metadata->'delivery_format_description',
          p.metadata->'delivery_format_description'
        )
      ))
    ),
    catalog_mode_snapshot = COALESCE(
      oi.catalog_mode_snapshot,
      NULLIF(oi.metadata->>'catalog_mode', ''),
      CASE WHEN oi.product_variant_id IS NULL THEN 'fixed_product' ELSE 'variant' END
    )
FROM products p
WHERE p.id = oi.product_id;

TRUNCATE product_identity_candidates;

-- Subscriptions inherit the immutable order line first, then fall back to the
-- legacy variant or validated subscription metadata.
INSERT INTO product_identity_candidates (entity_id, candidate_product_ids, sources)
SELECT
  s.id::text,
  ARRAY(
    SELECT DISTINCT candidate
    FROM unnest(ARRAY[s.product_id, oi.product_id, pv.product_id, metadata_product.id]) candidate
    WHERE candidate IS NOT NULL
  ),
  jsonb_strip_nulls(jsonb_build_object(
    'explicit_product_id', s.product_id,
    'order_item_product_id', oi.product_id,
    'variant_product_id', pv.product_id,
    'metadata_product_id', metadata_product.id,
    'order_item_id', s.order_item_id,
    'legacy_variant_id', s.product_variant_id
  ))
FROM subscriptions s
LEFT JOIN order_items oi ON oi.id = s.order_item_id
LEFT JOIN product_variants pv ON pv.id = s.product_variant_id
LEFT JOIN products metadata_product
  ON metadata_product.id::text = s.metadata->>'product_id';

UPDATE subscriptions s
SET product_id = candidates.candidate_product_ids[1]
FROM product_identity_candidates candidates
WHERE candidates.entity_id = s.id::text
  AND cardinality(candidates.candidate_product_ids) = 1
  AND s.product_id IS NULL;

INSERT INTO product_identity_backfill_audit (
  migration_key, entity_table, entity_id, status, chosen_product_id,
  candidate_product_ids, sources, details
)
SELECT
  '20260721_durable_product_identity', 'subscriptions', entity_id,
  CASE cardinality(candidate_product_ids)
    WHEN 0 THEN 'unresolved' WHEN 1 THEN 'resolved' ELSE 'conflict' END,
  CASE WHEN cardinality(candidate_product_ids) = 1 THEN candidate_product_ids[1] END,
  candidate_product_ids, sources,
  jsonb_build_object('precedence', 'explicit>order_item>variant>validated_metadata')
FROM product_identity_candidates
ON CONFLICT (migration_key, entity_table, entity_id) DO UPDATE
SET status = EXCLUDED.status, chosen_product_id = EXCLUDED.chosen_product_id,
    candidate_product_ids = EXCLUDED.candidate_product_ids,
    sources = EXCLUDED.sources, details = EXCLUDED.details, observed_at = NOW();

UPDATE subscriptions s
SET product_name_snapshot = COALESCE(
      s.product_name_snapshot,
      (SELECT oi.product_name_snapshot FROM order_items oi WHERE oi.id = s.order_item_id),
      p.name
    ),
    product_slug_snapshot = COALESCE(
      s.product_slug_snapshot,
      (SELECT oi.product_slug_snapshot FROM order_items oi WHERE oi.id = s.order_item_id),
      p.slug
    ),
    duration_months_snapshot = COALESCE(
      s.duration_months_snapshot,
      (SELECT oi.duration_months_snapshot FROM order_items oi WHERE oi.id = s.order_item_id),
      s.term_months
    ),
    unit_price_cents_snapshot = COALESCE(
      s.unit_price_cents_snapshot,
      (SELECT oi.unit_price_cents FROM order_items oi WHERE oi.id = s.order_item_id),
      s.base_price_cents,
      s.price_cents
    ),
    total_price_cents_snapshot = COALESCE(
      s.total_price_cents_snapshot,
      (SELECT oi.total_price_cents FROM order_items oi WHERE oi.id = s.order_item_id),
      s.price_cents
    ),
    currency_snapshot = COALESCE(
      s.currency_snapshot,
      (SELECT oi.currency FROM order_items oi WHERE oi.id = s.order_item_id),
      s.currency
    ),
    fulfillment_config_snapshot = COALESCE(
      s.fulfillment_config_snapshot,
      (SELECT oi.fulfillment_config_snapshot FROM order_items oi WHERE oi.id = s.order_item_id),
      jsonb_strip_nulls(jsonb_build_object(
        'upgrade_options', COALESCE(
          s.metadata->'upgrade_options',
          p.metadata->'upgrade_options',
          p.metadata->'upgradeOptions'
        ),
        'delivery_format_label', p.metadata->'delivery_format_label',
        'delivery_format_description', p.metadata->'delivery_format_description'
      ))
    )
FROM products p
WHERE p.id = s.product_id;

TRUNCATE product_identity_candidates;

-- Payment allocation rows are always item-scoped.
INSERT INTO product_identity_candidates (entity_id, candidate_product_ids, sources)
SELECT
  pi.payment_id::text || ':' || pi.order_item_id::text,
  ARRAY(
    SELECT DISTINCT candidate
    FROM unnest(ARRAY[pi.product_id, oi.product_id]) candidate
    WHERE candidate IS NOT NULL
  ),
  jsonb_strip_nulls(jsonb_build_object(
    'explicit_product_id', pi.product_id,
    'order_item_product_id', oi.product_id,
    'payment_id', pi.payment_id,
    'order_item_id', pi.order_item_id
  ))
FROM payment_items pi
JOIN order_items oi ON oi.id = pi.order_item_id;

UPDATE payment_items pi
SET product_id = candidates.candidate_product_ids[1]
FROM product_identity_candidates candidates
WHERE candidates.entity_id = pi.payment_id::text || ':' || pi.order_item_id::text
  AND cardinality(candidates.candidate_product_ids) = 1
  AND pi.product_id IS NULL;

INSERT INTO product_identity_backfill_audit (
  migration_key, entity_table, entity_id, status, chosen_product_id,
  candidate_product_ids, sources
)
SELECT
  '20260721_durable_product_identity', 'payment_items', entity_id,
  CASE cardinality(candidate_product_ids)
    WHEN 0 THEN 'unresolved' WHEN 1 THEN 'resolved' ELSE 'conflict' END,
  CASE WHEN cardinality(candidate_product_ids) = 1 THEN candidate_product_ids[1] END,
  candidate_product_ids, sources
FROM product_identity_candidates
ON CONFLICT (migration_key, entity_table, entity_id) DO UPDATE
SET status = EXCLUDED.status, chosen_product_id = EXCLUDED.chosen_product_id,
    candidate_product_ids = EXCLUDED.candidate_product_ids,
    sources = EXCLUDED.sources, observed_at = NOW();

TRUNCATE product_identity_candidates;

-- A root payment receives a product only when its direct references agree or
-- its order contains exactly one product. Multi-product payments are aggregate.
INSERT INTO product_identity_candidates (
  entity_id, candidate_product_ids, sources, aggregate_only
)
SELECT
  pay.id::text,
  ARRAY(
    SELECT DISTINCT candidate
    FROM unnest(ARRAY[
      pay.product_id,
      oi.product_id,
      s.product_id,
      pv.product_id,
      metadata_product.id,
      CASE WHEN order_products.product_count = 1 THEN order_products.only_product_id END
    ]) candidate
    WHERE candidate IS NOT NULL
  ),
  jsonb_strip_nulls(jsonb_build_object(
    'explicit_product_id', pay.product_id,
    'order_item_product_id', oi.product_id,
    'subscription_product_id', s.product_id,
    'variant_product_id', pv.product_id,
    'metadata_product_id', metadata_product.id,
    'order_product_count', order_products.product_count,
    'single_order_product_id', order_products.only_product_id
  )),
  COALESCE(order_products.product_count, 0) > 1
    AND oi.product_id IS NULL
    AND s.product_id IS NULL
    AND pv.product_id IS NULL
    AND metadata_product.id IS NULL
    AND pay.product_id IS NULL
FROM payments pay
LEFT JOIN order_items oi ON oi.id = pay.order_item_id
LEFT JOIN subscriptions s ON s.id = pay.subscription_id
LEFT JOIN product_variants pv ON pv.id = pay.product_variant_id
LEFT JOIN products metadata_product
  ON metadata_product.id::text = pay.metadata->>'product_id'
LEFT JOIN LATERAL (
  SELECT
    count(DISTINCT order_item.product_id)::integer AS product_count,
    (array_agg(DISTINCT order_item.product_id))[1] AS only_product_id
  FROM order_items order_item
  WHERE order_item.order_id = pay.order_id
    AND order_item.product_id IS NOT NULL
) order_products ON TRUE;

UPDATE payments pay
SET product_id = candidates.candidate_product_ids[1]
FROM product_identity_candidates candidates
WHERE candidates.entity_id = pay.id::text
  AND cardinality(candidates.candidate_product_ids) = 1
  AND NOT candidates.aggregate_only
  AND pay.product_id IS NULL;

INSERT INTO product_identity_backfill_audit (
  migration_key, entity_table, entity_id, status, chosen_product_id,
  candidate_product_ids, sources, details
)
SELECT
  '20260721_durable_product_identity', 'payments', entity_id,
  CASE
    WHEN aggregate_only THEN 'aggregate'
    WHEN cardinality(candidate_product_ids) = 0 THEN 'unresolved'
    WHEN cardinality(candidate_product_ids) = 1 THEN 'resolved'
    ELSE 'conflict'
  END,
  CASE
    WHEN NOT aggregate_only AND cardinality(candidate_product_ids) = 1
      THEN candidate_product_ids[1]
  END,
  candidate_product_ids, sources,
  jsonb_build_object('aggregate_product_id_policy', 'null_for_multi_product_payment')
FROM product_identity_candidates
ON CONFLICT (migration_key, entity_table, entity_id) DO UPDATE
SET status = EXCLUDED.status, chosen_product_id = EXCLUDED.chosen_product_id,
    candidate_product_ids = EXCLUDED.candidate_product_ids,
    sources = EXCLUDED.sources, details = EXCLUDED.details, observed_at = NOW();

TRUNCATE product_identity_candidates;

-- Child and operational records use their strong parent relationship.
INSERT INTO product_identity_candidates (entity_id, candidate_product_ids, sources)
SELECT oe.id::text,
       ARRAY(SELECT DISTINCT candidate FROM unnest(ARRAY[oe.product_id, oi.product_id, s.product_id]) candidate WHERE candidate IS NOT NULL),
       jsonb_strip_nulls(jsonb_build_object('explicit_product_id', oe.product_id, 'order_item_product_id', oi.product_id, 'subscription_product_id', s.product_id))
FROM order_entitlements oe
LEFT JOIN order_items oi ON oi.id = oe.order_item_id
LEFT JOIN subscriptions s ON s.id = oe.source_subscription_id;

UPDATE order_entitlements oe
SET product_id = candidates.candidate_product_ids[1]
FROM product_identity_candidates candidates
WHERE candidates.entity_id = oe.id::text
  AND cardinality(candidates.candidate_product_ids) = 1
  AND oe.product_id IS NULL;

UPDATE order_entitlements oe
SET product_name_snapshot = COALESCE(
      oe.product_name_snapshot,
      (SELECT oi.product_name_snapshot FROM order_items oi WHERE oi.id = oe.order_item_id),
      (SELECT s.product_name_snapshot FROM subscriptions s WHERE s.id = oe.source_subscription_id),
      p.name
    ),
    product_slug_snapshot = COALESCE(
      oe.product_slug_snapshot,
      (SELECT oi.product_slug_snapshot FROM order_items oi WHERE oi.id = oe.order_item_id),
      (SELECT s.product_slug_snapshot FROM subscriptions s WHERE s.id = oe.source_subscription_id),
      p.slug
    ),
    duration_months_snapshot = COALESCE(
      oe.duration_months_snapshot,
      (SELECT oi.duration_months_snapshot FROM order_items oi WHERE oi.id = oe.order_item_id),
      (SELECT s.duration_months_snapshot FROM subscriptions s WHERE s.id = oe.source_subscription_id)
    ),
    fulfillment_config_snapshot = COALESCE(
      oe.fulfillment_config_snapshot,
      (SELECT oi.fulfillment_config_snapshot FROM order_items oi WHERE oi.id = oe.order_item_id),
      (SELECT s.fulfillment_config_snapshot FROM subscriptions s WHERE s.id = oe.source_subscription_id)
    )
FROM products p
WHERE p.id = oe.product_id;

INSERT INTO product_identity_backfill_audit (
  migration_key, entity_table, entity_id, status, chosen_product_id,
  candidate_product_ids, sources
)
SELECT '20260721_durable_product_identity', 'order_entitlements', entity_id,
       CASE cardinality(candidate_product_ids) WHEN 0 THEN 'unresolved' WHEN 1 THEN 'resolved' ELSE 'conflict' END,
       CASE WHEN cardinality(candidate_product_ids) = 1 THEN candidate_product_ids[1] END,
       candidate_product_ids, sources
FROM product_identity_candidates
ON CONFLICT (migration_key, entity_table, entity_id) DO UPDATE
SET status = EXCLUDED.status, chosen_product_id = EXCLUDED.chosen_product_id,
    candidate_product_ids = EXCLUDED.candidate_product_ids,
    sources = EXCLUDED.sources, observed_at = NOW();

TRUNCATE product_identity_candidates;

INSERT INTO product_identity_candidates (entity_id, candidate_product_ids, sources)
SELECT sr.id::text,
       ARRAY(SELECT DISTINCT candidate FROM unnest(ARRAY[sr.product_id, s.product_id]) candidate WHERE candidate IS NOT NULL),
       jsonb_strip_nulls(jsonb_build_object('explicit_product_id', sr.product_id, 'subscription_product_id', s.product_id))
FROM subscription_renewals sr
JOIN subscriptions s ON s.id = sr.subscription_id;

UPDATE subscription_renewals sr
SET product_id = candidates.candidate_product_ids[1]
FROM product_identity_candidates candidates
WHERE candidates.entity_id = sr.id::text
  AND cardinality(candidates.candidate_product_ids) = 1
  AND sr.product_id IS NULL;

INSERT INTO product_identity_backfill_audit (migration_key, entity_table, entity_id, status, chosen_product_id, candidate_product_ids, sources)
SELECT '20260721_durable_product_identity', 'subscription_renewals', entity_id,
       CASE cardinality(candidate_product_ids) WHEN 0 THEN 'unresolved' WHEN 1 THEN 'resolved' ELSE 'conflict' END,
       CASE WHEN cardinality(candidate_product_ids) = 1 THEN candidate_product_ids[1] END,
       candidate_product_ids, sources
FROM product_identity_candidates
ON CONFLICT (migration_key, entity_table, entity_id) DO UPDATE
SET status = EXCLUDED.status, chosen_product_id = EXCLUDED.chosen_product_id,
    candidate_product_ids = EXCLUDED.candidate_product_ids, sources = EXCLUDED.sources, observed_at = NOW();

TRUNCATE product_identity_candidates;

INSERT INTO product_identity_candidates (entity_id, candidate_product_ids, sources, aggregate_only)
SELECT task.id::text,
       ARRAY(SELECT DISTINCT candidate FROM unnest(ARRAY[task.product_id, s.product_id, CASE WHEN order_products.product_count = 1 THEN order_products.only_product_id END]) candidate WHERE candidate IS NOT NULL),
       jsonb_strip_nulls(jsonb_build_object('explicit_product_id', task.product_id, 'subscription_product_id', s.product_id, 'order_product_count', order_products.product_count, 'single_order_product_id', order_products.only_product_id)),
       COALESCE(order_products.product_count, 0) > 1 AND s.product_id IS NULL AND task.product_id IS NULL
FROM admin_tasks task
LEFT JOIN subscriptions s ON s.id = task.subscription_id
LEFT JOIN LATERAL (
  SELECT count(DISTINCT oi.product_id)::integer product_count,
         (array_agg(DISTINCT oi.product_id))[1] only_product_id
  FROM order_items oi WHERE oi.order_id = task.order_id AND oi.product_id IS NOT NULL
) order_products ON TRUE;

UPDATE admin_tasks task
SET product_id = candidates.candidate_product_ids[1]
FROM product_identity_candidates candidates
WHERE candidates.entity_id = task.id::text
  AND cardinality(candidates.candidate_product_ids) = 1
  AND NOT candidates.aggregate_only
  AND task.product_id IS NULL;

INSERT INTO product_identity_backfill_audit (migration_key, entity_table, entity_id, status, chosen_product_id, candidate_product_ids, sources)
SELECT '20260721_durable_product_identity', 'admin_tasks', entity_id,
       CASE WHEN aggregate_only THEN 'aggregate' WHEN cardinality(candidate_product_ids) = 0 THEN 'unresolved' WHEN cardinality(candidate_product_ids) = 1 THEN 'resolved' ELSE 'conflict' END,
       CASE WHEN NOT aggregate_only AND cardinality(candidate_product_ids) = 1 THEN candidate_product_ids[1] END,
       candidate_product_ids, sources
FROM product_identity_candidates
ON CONFLICT (migration_key, entity_table, entity_id) DO UPDATE
SET status = EXCLUDED.status, chosen_product_id = EXCLUDED.chosen_product_id,
    candidate_product_ids = EXCLUDED.candidate_product_ids, sources = EXCLUDED.sources, observed_at = NOW();

TRUNCATE product_identity_candidates;

INSERT INTO product_identity_candidates (entity_id, candidate_product_ids, sources)
SELECT audit.id::text,
       ARRAY(SELECT DISTINCT candidate FROM unnest(ARRAY[audit.product_id, s.product_id]) candidate WHERE candidate IS NOT NULL),
       jsonb_strip_nulls(jsonb_build_object('explicit_product_id', audit.product_id, 'subscription_product_id', s.product_id))
FROM credential_reveal_audit_logs audit
LEFT JOIN subscriptions s ON s.id = audit.subscription_id;

UPDATE credential_reveal_audit_logs audit
SET product_id = candidates.candidate_product_ids[1]
FROM product_identity_candidates candidates
WHERE candidates.entity_id = audit.id::text
  AND cardinality(candidates.candidate_product_ids) = 1
  AND audit.product_id IS NULL;

INSERT INTO product_identity_backfill_audit (migration_key, entity_table, entity_id, status, chosen_product_id, candidate_product_ids, sources)
SELECT '20260721_durable_product_identity', 'credential_reveal_audit_logs', entity_id,
       CASE cardinality(candidate_product_ids) WHEN 0 THEN 'unresolved' WHEN 1 THEN 'resolved' ELSE 'conflict' END,
       CASE WHEN cardinality(candidate_product_ids) = 1 THEN candidate_product_ids[1] END,
       candidate_product_ids, sources
FROM product_identity_candidates
ON CONFLICT (migration_key, entity_table, entity_id) DO UPDATE
SET status = EXCLUDED.status, chosen_product_id = EXCLUDED.chosen_product_id,
    candidate_product_ids = EXCLUDED.candidate_product_ids, sources = EXCLUDED.sources, observed_at = NOW();

TRUNCATE product_identity_candidates;

-- Compliance evidence may be item-scoped or order aggregate. Validate the
-- metadata item UUID through the FK target before assigning it.
UPDATE order_compliance_evidence_logs evidence
SET order_item_id = oi.id
FROM order_items oi
WHERE evidence.order_item_id IS NULL
  AND oi.id::text = evidence.metadata->>'order_item_id';

INSERT INTO product_identity_candidates (entity_id, candidate_product_ids, sources, aggregate_only)
SELECT evidence.id::text,
       ARRAY(SELECT DISTINCT candidate FROM unnest(ARRAY[evidence.product_id, oi.product_id, s.product_id, CASE WHEN order_products.product_count = 1 THEN order_products.only_product_id END]) candidate WHERE candidate IS NOT NULL),
       jsonb_strip_nulls(jsonb_build_object('explicit_product_id', evidence.product_id, 'order_item_product_id', oi.product_id, 'subscription_product_id', s.product_id, 'order_product_count', order_products.product_count)),
       COALESCE(order_products.product_count, 0) > 1 AND oi.product_id IS NULL AND s.product_id IS NULL AND evidence.product_id IS NULL
FROM order_compliance_evidence_logs evidence
LEFT JOIN order_items oi ON oi.id = evidence.order_item_id
LEFT JOIN subscriptions s ON s.id::text = evidence.metadata->>'subscription_id'
LEFT JOIN LATERAL (
  SELECT count(DISTINCT order_item.product_id)::integer product_count,
         (array_agg(DISTINCT order_item.product_id))[1] only_product_id
  FROM order_items order_item WHERE order_item.order_id = evidence.order_id AND order_item.product_id IS NOT NULL
) order_products ON TRUE;

UPDATE order_compliance_evidence_logs evidence
SET product_id = candidates.candidate_product_ids[1]
FROM product_identity_candidates candidates
WHERE candidates.entity_id = evidence.id::text
  AND cardinality(candidates.candidate_product_ids) = 1
  AND NOT candidates.aggregate_only
  AND evidence.product_id IS NULL;

INSERT INTO product_identity_backfill_audit (migration_key, entity_table, entity_id, status, chosen_product_id, candidate_product_ids, sources)
SELECT '20260721_durable_product_identity', 'order_compliance_evidence_logs', entity_id,
       CASE WHEN aggregate_only THEN 'aggregate' WHEN cardinality(candidate_product_ids) = 0 THEN 'unresolved' WHEN cardinality(candidate_product_ids) = 1 THEN 'resolved' ELSE 'conflict' END,
       CASE WHEN NOT aggregate_only AND cardinality(candidate_product_ids) = 1 THEN candidate_product_ids[1] END,
       candidate_product_ids, sources
FROM product_identity_candidates
ON CONFLICT (migration_key, entity_table, entity_id) DO UPDATE
SET status = EXCLUDED.status, chosen_product_id = EXCLUDED.chosen_product_id,
    candidate_product_ids = EXCLUDED.candidate_product_ids, sources = EXCLUDED.sources, observed_at = NOW();

TRUNCATE product_identity_candidates;

-- Credit transactions: resolve only agreeing direct/parent identities.
INSERT INTO product_identity_candidates (entity_id, candidate_product_ids, sources, aggregate_only)
SELECT credit.id::text,
       ARRAY(SELECT DISTINCT candidate FROM unnest(ARRAY[credit.product_id, oi.product_id, pv.product_id, pay.product_id, metadata_product.id, CASE WHEN order_products.product_count = 1 THEN order_products.only_product_id END]) candidate WHERE candidate IS NOT NULL),
       jsonb_strip_nulls(jsonb_build_object('explicit_product_id', credit.product_id, 'order_item_product_id', oi.product_id, 'variant_product_id', pv.product_id, 'payment_product_id', pay.product_id, 'metadata_product_id', metadata_product.id, 'order_product_count', order_products.product_count)),
       COALESCE(order_products.product_count, 0) > 1 AND oi.product_id IS NULL AND pv.product_id IS NULL AND pay.product_id IS NULL AND metadata_product.id IS NULL AND credit.product_id IS NULL
FROM credit_transactions credit
LEFT JOIN order_items oi ON oi.id = credit.order_item_id
LEFT JOIN product_variants pv ON pv.id = credit.product_variant_id
LEFT JOIN LATERAL (
  SELECT p.* FROM payments p
  WHERE p.id::text = credit.payment_id OR p.provider_payment_id = credit.payment_id
  ORDER BY CASE WHEN p.id::text = credit.payment_id THEN 0 ELSE 1 END
  LIMIT 1
) pay ON TRUE
LEFT JOIN products metadata_product ON metadata_product.id::text = credit.metadata->>'product_id'
LEFT JOIN LATERAL (
  SELECT count(DISTINCT order_item.product_id)::integer product_count,
         (array_agg(DISTINCT order_item.product_id))[1] only_product_id
  FROM order_items order_item WHERE order_item.order_id = credit.order_id AND order_item.product_id IS NOT NULL
) order_products ON TRUE;

UPDATE credit_transactions credit
SET product_id = candidates.candidate_product_ids[1]
FROM product_identity_candidates candidates
WHERE candidates.entity_id = credit.id::text
  AND cardinality(candidates.candidate_product_ids) = 1
  AND NOT candidates.aggregate_only
  AND credit.product_id IS NULL;

INSERT INTO product_identity_backfill_audit (migration_key, entity_table, entity_id, status, chosen_product_id, candidate_product_ids, sources)
SELECT '20260721_durable_product_identity', 'credit_transactions', entity_id,
       CASE WHEN aggregate_only THEN 'aggregate' WHEN cardinality(candidate_product_ids) = 0 THEN 'unresolved' WHEN cardinality(candidate_product_ids) = 1 THEN 'resolved' ELSE 'conflict' END,
       CASE WHEN NOT aggregate_only AND cardinality(candidate_product_ids) = 1 THEN candidate_product_ids[1] END,
       candidate_product_ids, sources
FROM product_identity_candidates
ON CONFLICT (migration_key, entity_table, entity_id) DO UPDATE
SET status = EXCLUDED.status, chosen_product_id = EXCLUDED.chosen_product_id,
    candidate_product_ids = EXCLUDED.candidate_product_ids, sources = EXCLUDED.sources, observed_at = NOW();

TRUNCATE product_identity_candidates;

-- Refunds inherit only an unambiguous payment product. Multi-item payment
-- refunds remain aggregate unless later associated with an order item.
INSERT INTO product_identity_candidates (entity_id, candidate_product_ids, sources, aggregate_only)
SELECT refund.id::text,
       ARRAY(SELECT DISTINCT candidate FROM unnest(ARRAY[refund.product_id, pay.product_id]) candidate WHERE candidate IS NOT NULL),
       jsonb_strip_nulls(jsonb_build_object('explicit_product_id', refund.product_id, 'payment_product_id', pay.product_id, 'payment_record_id', pay.id)),
       pay.id IS NOT NULL AND pay.product_id IS NULL
FROM payment_refunds refund
LEFT JOIN LATERAL (
  SELECT p.* FROM payments p
  WHERE p.id::text = refund.payment_id OR p.provider_payment_id = refund.payment_id
  ORDER BY CASE WHEN p.id::text = refund.payment_id THEN 0 ELSE 1 END
  LIMIT 1
) pay ON TRUE;

UPDATE payment_refunds refund
SET product_id = candidates.candidate_product_ids[1]
FROM product_identity_candidates candidates
WHERE candidates.entity_id = refund.id::text
  AND cardinality(candidates.candidate_product_ids) = 1
  AND NOT candidates.aggregate_only
  AND refund.product_id IS NULL;

INSERT INTO product_identity_backfill_audit (migration_key, entity_table, entity_id, status, chosen_product_id, candidate_product_ids, sources)
SELECT '20260721_durable_product_identity', 'payment_refunds', entity_id,
       CASE WHEN aggregate_only THEN 'aggregate' WHEN cardinality(candidate_product_ids) = 0 THEN 'unresolved' WHEN cardinality(candidate_product_ids) = 1 THEN 'resolved' ELSE 'conflict' END,
       CASE WHEN NOT aggregate_only AND cardinality(candidate_product_ids) = 1 THEN candidate_product_ids[1] END,
       candidate_product_ids, sources
FROM product_identity_candidates
ON CONFLICT (migration_key, entity_table, entity_id) DO UPDATE
SET status = EXCLUDED.status, chosen_product_id = EXCLUDED.chosen_product_id,
    candidate_product_ids = EXCLUDED.candidate_product_ids, sources = EXCLUDED.sources, observed_at = NOW();

DO $$
DECLARE
  summary RECORD;
BEGIN
  FOR summary IN
    SELECT entity_table, status, count(*) AS row_count
    FROM product_identity_backfill_audit
    WHERE migration_key = '20260721_durable_product_identity'
    GROUP BY entity_table, status
    ORDER BY entity_table, status
  LOOP
    RAISE NOTICE 'product identity backfill: table=%, status=%, rows=%',
      summary.entity_table, summary.status, summary.row_count;
  END LOOP;
END $$;

COMMIT;

-- Down Migration
-- Identity columns are deliberately not cleared: doing so after dual-write
-- traffic starts could erase valid new data. Roll back application readers,
-- retain the nullable columns, and use the audit table for a forward fix.
BEGIN;

DELETE FROM product_identity_backfill_audit
WHERE migration_key = '20260721_durable_product_identity';

COMMIT;
