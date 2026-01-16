-- Migration: Backfill subscription billing fields
-- Created: 2026-01-05T14:00:00.000Z
-- Description: Populate subscription billing fields from orders/payments data.

-- Up Migration
BEGIN;

-- Backfill subscriptions linked to orders
UPDATE subscriptions s
SET
  price_cents = COALESCE(
    s.price_cents,
    ct.price_cents,
    p.price_cents,
    oi.unit_price_cents,
    oi.total_price_cents,
    o.total_cents,
    o.subtotal_cents
  ),
  currency = COALESCE(
    s.currency,
    ct.currency,
    p.currency,
    oi.currency,
    o.currency
  ),
  renewal_method = COALESCE(
    s.renewal_method,
    ct.renewal_method,
    p.renewal_method,
    CASE
      WHEN o.paid_with_credits = true THEN 'credits'
      WHEN o.payment_provider IS NOT NULL THEN o.payment_provider
      ELSE NULL
    END
  ),
  next_billing_at = COALESCE(
    s.next_billing_at,
    ct.next_billing_at,
    p.next_billing_at,
    CASE
      WHEN s.auto_renew = true THEN s.renewal_date
      ELSE NULL
    END
  )
FROM orders o
LEFT JOIN LATERAL (
  SELECT unit_price_cents, total_price_cents, currency
  FROM order_items
  WHERE order_id = o.id
  ORDER BY created_at ASC
  LIMIT 1
) oi ON true
LEFT JOIN LATERAL (
  SELECT price_cents, currency, next_billing_at, renewal_method
  FROM payments
  WHERE order_id = o.id
    AND purpose = 'subscription'
    AND status IN ('succeeded', 'processing')
  ORDER BY created_at DESC
  LIMIT 1
) p ON true
LEFT JOIN LATERAL (
  SELECT price_cents, currency, next_billing_at, renewal_method
  FROM credit_transactions
  WHERE order_id = o.id
    AND type = 'purchase'
  ORDER BY created_at DESC
  LIMIT 1
) ct ON true
WHERE s.order_id = o.id
  AND (
    s.price_cents IS NULL
    OR s.currency IS NULL
    OR s.renewal_method IS NULL
    OR (s.next_billing_at IS NULL AND s.auto_renew = true)
  );

-- Backfill subscriptions linked directly to payments (no order_id)
WITH subscription_payments AS (
  SELECT DISTINCT ON (p.subscription_id)
    p.subscription_id,
    p.price_cents,
    p.currency,
    p.next_billing_at,
    p.renewal_method
  FROM payments p
  WHERE p.subscription_id IS NOT NULL
    AND p.purpose = 'subscription'
    AND p.status IN ('succeeded', 'processing')
  ORDER BY p.subscription_id, p.created_at DESC
)
UPDATE subscriptions s
SET
  price_cents = COALESCE(s.price_cents, sp.price_cents),
  currency = COALESCE(s.currency, sp.currency),
  renewal_method = COALESCE(s.renewal_method, sp.renewal_method),
  next_billing_at = COALESCE(
    s.next_billing_at,
    sp.next_billing_at,
    CASE
      WHEN s.auto_renew = true THEN s.renewal_date
      ELSE NULL
    END
  )
FROM subscription_payments sp
WHERE s.order_id IS NULL
  AND sp.subscription_id = s.id
  AND (
    s.price_cents IS NULL
    OR s.currency IS NULL
    OR s.renewal_method IS NULL
    OR (s.next_billing_at IS NULL AND s.auto_renew = true)
  );

COMMIT;

-- Down Migration
BEGIN;

-- Data backfill is non-destructive; rollback is not provided.

COMMIT;
