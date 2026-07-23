-- Migration: Backfill missing fixed-product USD price history
-- Created: 2026-07-21T12:00:00.000Z
-- Description:
--   - Makes every complete fixed product snapshot-lockable at checkout
--   - Does not touch products that already have a current USD history row
--   - Tags every inserted run/row for observation and safe rollback

-- Up Migration
BEGIN;

DO $$
DECLARE
  affected_count INTEGER;
BEGIN
  SELECT COUNT(*)::int
  INTO affected_count
  FROM products p
  WHERE p.duration_months > 0
    AND p.fixed_price_cents > 0
    AND UPPER(p.fixed_price_currency) = 'USD'
    AND NOT EXISTS (
      SELECT 1
      FROM product_fixed_price_history pfph
      WHERE pfph.product_id = p.id
        AND UPPER(pfph.currency) = 'USD'
        AND pfph.starts_at <= NOW()
        AND (pfph.ends_at IS NULL OR pfph.ends_at > NOW())
    );
  RAISE NOTICE 'fixed product price-history backfill candidates: %', affected_count;
END $$;

WITH eligible_products AS (
  SELECT p.id, p.fixed_price_cents
  FROM products p
  WHERE p.duration_months > 0
    AND p.fixed_price_cents > 0
    AND UPPER(p.fixed_price_currency) = 'USD'
    AND NOT EXISTS (
      SELECT 1
      FROM product_fixed_price_history pfph
      WHERE pfph.product_id = p.id
        AND UPPER(pfph.currency) = 'USD'
        AND pfph.starts_at <= NOW()
        AND (pfph.ends_at IS NULL OR pfph.ends_at > NOW())
    )
),
publish_run AS (
  INSERT INTO pricing_publish_runs (
    status,
    triggered_by,
    published_at,
    reason,
    metadata
  )
  SELECT
    'succeeded',
    'system',
    NOW(),
    'fixed_product_price_history_backfill_20260721',
    jsonb_build_object(
      'source', 'migration_fixed_product_price_history_backfill_20260721',
      'affected_products', (SELECT COUNT(*) FROM eligible_products)
    )
  WHERE EXISTS (SELECT 1 FROM eligible_products)
  RETURNING snapshot_id
)
INSERT INTO product_fixed_price_history (
  product_id,
  price_cents,
  currency,
  starts_at,
  ends_at,
  metadata
)
SELECT
  eligible.id,
  eligible.fixed_price_cents,
  'USD',
  NOW(),
  NULL,
  jsonb_build_object(
    'snapshot_id', publish_run.snapshot_id::text,
    'settlement_currency', 'USD',
    'catalog_mode', 'fixed_product',
    'source', 'migration_fixed_product_price_history_backfill_20260721',
    'backfilled_at', NOW()
  )
FROM eligible_products eligible
CROSS JOIN publish_run;

DO $$
DECLARE
  remaining_count INTEGER;
BEGIN
  SELECT COUNT(*)::int
  INTO remaining_count
  FROM products p
  WHERE p.duration_months > 0
    AND p.fixed_price_cents > 0
    AND UPPER(p.fixed_price_currency) = 'USD'
    AND NOT EXISTS (
      SELECT 1
      FROM product_fixed_price_history pfph
      WHERE pfph.product_id = p.id
        AND UPPER(pfph.currency) = 'USD'
        AND pfph.starts_at <= NOW()
        AND (pfph.ends_at IS NULL OR pfph.ends_at > NOW())
    );
  RAISE NOTICE 'fixed products still missing current USD history: %', remaining_count;
END $$;

COMMIT;

-- Down Migration
-- Rows whose snapshot has been used by an order are deliberately retained.
BEGIN;

DELETE FROM product_fixed_price_history pfph
WHERE pfph.metadata->>'source' =
      'migration_fixed_product_price_history_backfill_20260721'
  AND NOT EXISTS (
    SELECT 1
    FROM orders o
    WHERE o.pricing_snapshot_id::text = pfph.metadata->>'snapshot_id'
  );

DELETE FROM pricing_publish_runs ppr
WHERE ppr.metadata->>'source' =
      'migration_fixed_product_price_history_backfill_20260721'
  AND NOT EXISTS (
    SELECT 1 FROM orders o WHERE o.pricing_snapshot_id = ppr.snapshot_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM product_fixed_price_history pfph
    WHERE pfph.metadata->>'snapshot_id' = ppr.snapshot_id::text
  );

COMMIT;
