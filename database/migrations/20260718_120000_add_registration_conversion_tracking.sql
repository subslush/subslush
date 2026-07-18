-- Migration: Add registration conversion tracking
-- Created: 2026-07-18T12:00:00.000Z
-- Description: Separates verified-account state from one-time conversion emission.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS registration_conversion_recorded_at TIMESTAMP;

-- Existing verified accounts predate this conversion workflow and must not emit
-- a new registration event on their next login.
UPDATE users
SET registration_conversion_recorded_at = email_verified_at
WHERE email_verified_at IS NOT NULL
  AND registration_conversion_recorded_at IS NULL;

COMMENT ON COLUMN users.registration_conversion_recorded_at IS
  'Atomic idempotency marker for the CompleteRegistration browser/server conversion pair.';

COMMIT;
