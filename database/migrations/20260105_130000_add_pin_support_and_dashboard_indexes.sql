-- Migration: Add PIN support and dashboard query indexes
-- Created: 2026-01-05T13:00:00.000Z
-- Description: Add user PIN fields, credential reveal audit logs, and composite indexes for dashboard queries.

-- Up Migration
BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- USERS: PIN support
-- =====================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_set_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMP;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pin_failed_attempts_check;
ALTER TABLE users ADD CONSTRAINT users_pin_failed_attempts_check
  CHECK (pin_failed_attempts >= 0);

COMMENT ON COLUMN users.pin_hash IS 'Hashed 4-digit PIN for credential reveal';
COMMENT ON COLUMN users.pin_set_at IS 'Timestamp when PIN was set';
COMMENT ON COLUMN users.pin_failed_attempts IS 'Consecutive failed PIN attempts';
COMMENT ON COLUMN users.pin_locked_until IS 'Lockout expiration timestamp after too many PIN failures';

-- =====================================================
-- AUDIT: Credential reveal attempts
-- =====================================================

CREATE TABLE IF NOT EXISTS credential_reveal_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    failure_reason TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    request_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credential_reveal_audit_logs_user_id
  ON credential_reveal_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_credential_reveal_audit_logs_subscription_id
  ON credential_reveal_audit_logs(subscription_id);
CREATE INDEX IF NOT EXISTS idx_credential_reveal_audit_logs_created_at
  ON credential_reveal_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_credential_reveal_audit_logs_success
  ON credential_reveal_audit_logs(success);

COMMENT ON TABLE credential_reveal_audit_logs IS 'Audit log for credential reveal attempts';
COMMENT ON COLUMN credential_reveal_audit_logs.success IS 'Whether the credential reveal succeeded';
COMMENT ON COLUMN credential_reveal_audit_logs.failure_reason IS 'Failure reason if reveal failed';

-- =====================================================
-- DASHBOARD QUERY INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status_renewal_date
  ON subscriptions(user_id, status, renewal_date);
CREATE INDEX IF NOT EXISTS idx_orders_user_created_at
  ON orders(user_id, created_at DESC);

COMMIT;

-- Down Migration
BEGIN;

-- Additive migration - no rollback included.

COMMIT;
