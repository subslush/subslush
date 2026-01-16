-- Migration: Add upgrade selections, term_start_at, and MMU task metadata
-- Created: 2026-01-14T12:00:00.000Z
-- Description: Adds upgrade selection storage, term start tracking, and manual monthly upgrade task metadata.

-- Up Migration
BEGIN;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS term_start_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_subscriptions_term_start_at
  ON subscriptions(term_start_at) WHERE term_start_at IS NOT NULL;

-- Backfill term_start_at using calendar month math when term_months is available.
UPDATE subscriptions
SET term_start_at = CASE
  WHEN term_start_at IS NOT NULL THEN term_start_at
  WHEN term_months IS NOT NULL AND term_months > 0 THEN end_date - (term_months || ' months')::interval
  ELSE start_date
END
WHERE term_start_at IS NULL;

CREATE TABLE IF NOT EXISTS subscription_upgrade_selections (
    subscription_id UUID PRIMARY KEY REFERENCES subscriptions(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    selection_type VARCHAR(50),
    account_identifier TEXT,
    credentials_encrypted TEXT,
    manual_monthly_acknowledged_at TIMESTAMP,
    submitted_at TIMESTAMP,
    locked_at TIMESTAMP,
    reminder_24h_at TIMESTAMP,
    reminder_48h_at TIMESTAMP,
    auto_selected_at TIMESTAMP,
    upgrade_options_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT subscription_upgrade_selections_type_check CHECK (
      selection_type IS NULL OR selection_type IN ('upgrade_new_account', 'upgrade_own_account')
    )
);

CREATE INDEX IF NOT EXISTS idx_upgrade_selections_order_id
  ON subscription_upgrade_selections(order_id);
CREATE INDEX IF NOT EXISTS idx_upgrade_selections_submitted_at
  ON subscription_upgrade_selections(submitted_at);
CREATE INDEX IF NOT EXISTS idx_upgrade_selections_locked_at
  ON subscription_upgrade_selections(locked_at);

ALTER TABLE admin_tasks
  ADD COLUMN IF NOT EXISTS mmu_cycle_index INTEGER,
  ADD COLUMN IF NOT EXISTS mmu_cycle_total INTEGER;

ALTER TABLE admin_tasks DROP CONSTRAINT IF EXISTS admin_tasks_type_check;
ALTER TABLE admin_tasks ADD CONSTRAINT admin_tasks_type_check CHECK (
  task_type IN (
    'credential_provision',
    'renewal',
    'cancellation',
    'support',
    'verification',
    'manual_monthly_upgrade'
  )
);

COMMIT;

-- Down Migration
BEGIN;

-- Additive migration - no rollback included.

COMMIT;
