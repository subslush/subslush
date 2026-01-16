-- Migration: Add email_verified_at to users
-- Created: 2026-01-07T12:00:00.000Z
-- Description: Adds email verification timestamp to user records.

-- Up Migration
BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;

COMMIT;

-- Down Migration
BEGIN;

-- Additive migration - no rollback included.

COMMIT;
