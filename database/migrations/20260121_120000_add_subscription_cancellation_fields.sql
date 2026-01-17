-- Migration: Add subscription cancellation tracking
-- Created: 2026-01-21 12:00:00 UTC
-- Description: Store cancellation requests and reasons on subscriptions.

-- Up Migration
BEGIN;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS cancellation_requested_at TIMESTAMP;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

COMMENT ON COLUMN subscriptions.cancellation_requested_at IS
  'Timestamp when the user requested cancellation (no further renewals).';
COMMENT ON COLUMN subscriptions.cancellation_reason IS
  'User-provided cancellation reason for audit and analysis.';

COMMIT;

-- Down Migration
BEGIN;

ALTER TABLE subscriptions
  DROP COLUMN IF EXISTS cancellation_reason;

ALTER TABLE subscriptions
  DROP COLUMN IF EXISTS cancellation_requested_at;

COMMIT;
