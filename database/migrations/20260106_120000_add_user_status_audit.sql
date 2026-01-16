-- Migration: Add user status audit
-- Created: 2026-01-06T12:00:00.000Z
-- Description: Adds audit logging for user status changes.

-- Up Migration
BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS user_status_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    old_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    reason TEXT,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_status_audit_user_id
  ON user_status_audit(user_id);

CREATE INDEX IF NOT EXISTS idx_user_status_audit_changed_by
  ON user_status_audit(changed_by);

CREATE INDEX IF NOT EXISTS idx_user_status_audit_changed_at
  ON user_status_audit(changed_at);

COMMIT;

-- Down Migration
BEGIN;

-- Additive migration - no rollback included.

COMMIT;
