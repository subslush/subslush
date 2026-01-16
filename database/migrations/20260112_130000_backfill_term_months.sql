-- Migration: Backfill term_months for orders, order_items, payments, subscriptions
-- Created: 2026-01-12T13:00:00.000Z
-- Description: Populate term_months from metadata/order data without using date deltas.

-- Up Migration
BEGIN;

-- Backfill order item term_months from item/order metadata or order.term_months
UPDATE order_items oi
SET term_months = COALESCE(
  oi.term_months,
  CASE WHEN (oi.metadata->>'term_months') ~ '^[0-9]+$' THEN (oi.metadata->>'term_months')::int END,
  CASE WHEN (oi.metadata->>'duration_months') ~ '^[0-9]+$' THEN (oi.metadata->>'duration_months')::int END,
  CASE WHEN (oi.metadata->>'termMonths') ~ '^[0-9]+$' THEN (oi.metadata->>'termMonths')::int END,
  CASE WHEN (oi.metadata->>'durationMonths') ~ '^[0-9]+$' THEN (oi.metadata->>'durationMonths')::int END,
  CASE WHEN (o.metadata->>'term_months') ~ '^[0-9]+$' THEN (o.metadata->>'term_months')::int END,
  CASE WHEN (o.metadata->>'duration_months') ~ '^[0-9]+$' THEN (o.metadata->>'duration_months')::int END,
  CASE WHEN (o.metadata->>'termMonths') ~ '^[0-9]+$' THEN (o.metadata->>'termMonths')::int END,
  CASE WHEN (o.metadata->>'durationMonths') ~ '^[0-9]+$' THEN (o.metadata->>'durationMonths')::int END,
  o.term_months
)
FROM orders o
WHERE oi.order_id = o.id
  AND oi.term_months IS NULL;

-- Backfill order term_months from order metadata or first item term_months
UPDATE orders o
SET term_months = COALESCE(
  o.term_months,
  CASE WHEN (o.metadata->>'term_months') ~ '^[0-9]+$' THEN (o.metadata->>'term_months')::int END,
  CASE WHEN (o.metadata->>'duration_months') ~ '^[0-9]+$' THEN (o.metadata->>'duration_months')::int END,
  CASE WHEN (o.metadata->>'termMonths') ~ '^[0-9]+$' THEN (o.metadata->>'termMonths')::int END,
  CASE WHEN (o.metadata->>'durationMonths') ~ '^[0-9]+$' THEN (o.metadata->>'durationMonths')::int END,
  (
    SELECT oi.term_months
    FROM order_items oi
    WHERE oi.order_id = o.id
      AND oi.term_months IS NOT NULL
    ORDER BY oi.created_at ASC
    LIMIT 1
  )
)
WHERE o.term_months IS NULL;

-- Backfill payment term_months from metadata and order term_months
UPDATE payments p
SET term_months = COALESCE(
  p.term_months,
  CASE WHEN (p.metadata->>'term_months') ~ '^[0-9]+$' THEN (p.metadata->>'term_months')::int END,
  CASE WHEN (p.metadata->>'duration_months') ~ '^[0-9]+$' THEN (p.metadata->>'duration_months')::int END,
  CASE WHEN (p.metadata->>'termMonths') ~ '^[0-9]+$' THEN (p.metadata->>'termMonths')::int END,
  CASE WHEN (p.metadata->>'durationMonths') ~ '^[0-9]+$' THEN (p.metadata->>'durationMonths')::int END,
  o.term_months
)
FROM orders o
WHERE p.order_id = o.id
  AND p.term_months IS NULL;

-- Backfill payment term_months from subscription term_months when no order is linked
UPDATE payments p
SET term_months = COALESCE(p.term_months, s.term_months)
FROM subscriptions s
WHERE p.subscription_id = s.id
  AND p.order_id IS NULL
  AND p.term_months IS NULL
  AND s.term_months IS NOT NULL;

-- Backfill subscription term_months from subscription metadata, order, or order items
UPDATE subscriptions s
SET term_months = COALESCE(
  s.term_months,
  CASE WHEN (s.metadata->>'term_months') ~ '^[0-9]+$' THEN (s.metadata->>'term_months')::int END,
  CASE WHEN (s.metadata->>'duration_months') ~ '^[0-9]+$' THEN (s.metadata->>'duration_months')::int END,
  CASE WHEN (s.metadata->>'termMonths') ~ '^[0-9]+$' THEN (s.metadata->>'termMonths')::int END,
  CASE WHEN (s.metadata->>'durationMonths') ~ '^[0-9]+$' THEN (s.metadata->>'durationMonths')::int END,
  o.term_months,
  (
    SELECT oi.term_months
    FROM order_items oi
    WHERE oi.order_id = o.id
      AND oi.term_months IS NOT NULL
      AND (s.product_variant_id IS NULL OR oi.product_variant_id = s.product_variant_id)
    ORDER BY oi.created_at ASC
    LIMIT 1
  )
)
FROM orders o
WHERE s.order_id = o.id
  AND s.term_months IS NULL;

-- Backfill subscription term_months from payment term_months when no order is linked
WITH subscription_payments AS (
  SELECT DISTINCT ON (subscription_id)
    subscription_id,
    term_months
  FROM payments
  WHERE subscription_id IS NOT NULL
    AND term_months IS NOT NULL
  ORDER BY subscription_id, created_at DESC
)
UPDATE subscriptions s
SET term_months = COALESCE(s.term_months, sp.term_months)
FROM subscription_payments sp
WHERE s.order_id IS NULL
  AND sp.subscription_id = s.id
  AND s.term_months IS NULL;

COMMIT;

-- Down Migration
BEGIN;

-- Data backfill is non-destructive; rollback is not provided.

COMMIT;
