-- Migration: Add renewal_date to subscriptions
-- Created: 2026-01-05T12:50:00.000Z
-- Description: Align subscriptions schema with renewal_date used by dashboard and services.

-- Up Migration
BEGIN;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS renewal_date TIMESTAMP;

COMMENT ON COLUMN subscriptions.renewal_date IS 'Next renewal date for the subscription';

COMMIT;

-- Down Migration
BEGIN;

ALTER TABLE subscriptions
  DROP COLUMN IF EXISTS renewal_date;

COMMIT;
