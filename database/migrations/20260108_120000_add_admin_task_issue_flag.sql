-- Migration: Add issue flag to admin tasks
-- Created: 2026-01-08T12:00:00.000Z
-- Description: Adds a manual issue flag for admin task triage.

-- Up Migration
BEGIN;

ALTER TABLE admin_tasks
  ADD COLUMN IF NOT EXISTS is_issue BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_admin_tasks_is_issue
  ON admin_tasks(is_issue);

COMMIT;

-- Down Migration
BEGIN;

-- Additive migration - no rollback included.

COMMIT;
