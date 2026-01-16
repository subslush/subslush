-- Migration: Add PIN reset requests
-- Created: 2026-01-17T12:00:00.000Z
-- Description: Stores admin-initiated PIN reset verification codes.

-- Up Migration
BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS pin_reset_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
    confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    code_hash TEXT NOT NULL,
    code_salt TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    confirmed_at TIMESTAMP
);

ALTER TABLE pin_reset_requests DROP CONSTRAINT IF EXISTS pin_reset_requests_status_check;
ALTER TABLE pin_reset_requests ADD CONSTRAINT pin_reset_requests_status_check
  CHECK (status IN ('pending', 'confirmed', 'expired', 'superseded', 'failed'));

CREATE INDEX IF NOT EXISTS idx_pin_reset_requests_user_status_created_at
  ON pin_reset_requests(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pin_reset_requests_expires_at
  ON pin_reset_requests(expires_at);

COMMIT;

-- Down Migration
BEGIN;

-- Additive migration - no rollback included.

COMMIT;
