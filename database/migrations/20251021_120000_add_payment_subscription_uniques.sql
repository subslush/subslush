-- Migration: Enforce payment/provider uniqueness and prevent duplicate subscriptions per order
-- Created: 2025-10-21 12:00:00 UTC

-- Up Migration
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS ux_payments_provider_payment_id
  ON payments(provider, provider_payment_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_subscriptions_order_id
  ON subscriptions(order_id)
  WHERE order_id IS NOT NULL;

COMMIT;

-- Down Migration
BEGIN;

DROP INDEX IF EXISTS ux_subscriptions_order_id;
DROP INDEX IF EXISTS ux_payments_provider_payment_id;

COMMIT;
