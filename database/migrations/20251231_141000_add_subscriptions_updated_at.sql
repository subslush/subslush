-- Migration: Add updated_at to subscriptions
-- Created: 2025-12-31
-- Purpose: Support admin updates and job-driven subscription updates

-- Up Migration
BEGIN;

ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

-- Backfill any existing rows that might have NULL updated_at (defensive)
UPDATE subscriptions
SET updated_at = COALESCE(updated_at, created_at, NOW());

-- Keep updated_at fresh on updates
CREATE OR REPLACE FUNCTION subscriptions_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subscriptions_set_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_set_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION subscriptions_set_updated_at();

COMMIT;

-- Down Migration
BEGIN;

DROP TRIGGER IF EXISTS trg_subscriptions_set_updated_at ON subscriptions;
DROP FUNCTION IF EXISTS subscriptions_set_updated_at();
ALTER TABLE subscriptions DROP COLUMN IF EXISTS updated_at;

COMMIT;
