-- Migration: Add payment confirmed timestamp to admin tasks
-- Created: 2026-01-10T12:00:00.000Z
-- Description: Adds payment confirmation tracking for renewal fulfillment tasks.

-- Up Migration
BEGIN;

ALTER TABLE admin_tasks
  ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMP WITHOUT TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_admin_tasks_payment_confirmed_at
  ON admin_tasks(payment_confirmed_at);

COMMIT;

-- Down Migration
BEGIN;

-- Additive migration - no rollback included.

COMMIT;
