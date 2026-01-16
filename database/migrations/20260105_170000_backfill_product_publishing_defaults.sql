-- Migration: Backfill product publishing defaults + relax subscription checks
-- Created: 2026-01-05T17:00:00.000Z
-- Description: Backfills publishing fields and removes legacy subscription enum constraints.

-- Up Migration
BEGIN;

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_service_type_check;

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_service_plan_check;

-- Backfill logo_key from metadata or service_type defaults
UPDATE products
SET logo_key = COALESCE(
  NULLIF(logo_key, ''),
  NULLIF(metadata->>'logo_key', ''),
  NULLIF(metadata->>'logoKey', ''),
  CASE
    WHEN LOWER(service_type) = 'spotify' THEN 'spotify'
    WHEN LOWER(service_type) = 'netflix' THEN 'netflix'
    WHEN LOWER(service_type) = 'tradingview' THEN 'tradingview'
    WHEN LOWER(service_type) = 'hbo' THEN 'hbo'
    ELSE NULL
  END
)
WHERE logo_key IS NULL OR logo_key = '';

-- Backfill category from metadata or service_type defaults
UPDATE products
SET category = COALESCE(
  NULLIF(category, ''),
  NULLIF(metadata->>'category', ''),
  NULLIF(metadata->>'category_key', ''),
  NULLIF(metadata->>'categoryKey', ''),
  CASE
    WHEN LOWER(service_type) = 'netflix' THEN 'streaming'
    WHEN LOWER(service_type) = 'spotify' THEN 'music'
    WHEN LOWER(service_type) = 'tradingview' THEN 'productivity'
    ELSE NULL
  END
)
WHERE category IS NULL OR category = '';

-- Backfill default_currency from latest price history
WITH latest_prices AS (
  SELECT
    pv.product_id,
    ph.currency,
    ROW_NUMBER() OVER (
      PARTITION BY pv.product_id
      ORDER BY ph.starts_at DESC, ph.created_at DESC
    ) AS rn
  FROM product_variants pv
  JOIN price_history ph ON ph.product_variant_id = pv.id
  WHERE ph.currency IS NOT NULL AND ph.currency <> ''
)
UPDATE products p
SET default_currency = lp.currency
FROM latest_prices lp
WHERE p.id = lp.product_id
  AND lp.rn = 1
  AND (p.default_currency IS NULL OR p.default_currency = '');

-- Backfill default_currency from metadata or fallback to USD
UPDATE products
SET default_currency = COALESCE(
  NULLIF(default_currency, ''),
  NULLIF(metadata->>'default_currency', ''),
  NULLIF(metadata->>'defaultCurrency', ''),
  'USD'
)
WHERE default_currency IS NULL OR default_currency = '';

-- Backfill max_subscriptions from metadata or service_type defaults
UPDATE products
SET max_subscriptions = COALESCE(
  max_subscriptions,
  CASE
    WHEN (metadata->>'max_subscriptions') ~ '^[0-9]+$'
      THEN (metadata->>'max_subscriptions')::int
    WHEN (metadata->>'maxSubscriptions') ~ '^[0-9]+$'
      THEN (metadata->>'maxSubscriptions')::int
    ELSE NULL
  END,
  CASE
    WHEN LOWER(service_type) = 'netflix' THEN 2
    WHEN LOWER(service_type) = 'spotify' THEN 1
    WHEN LOWER(service_type) = 'tradingview' THEN 1
    ELSE NULL
  END
)
WHERE max_subscriptions IS NULL;

COMMIT;

-- Down Migration
BEGIN;

-- Additive/backfill migration - no rollback included.

COMMIT;
