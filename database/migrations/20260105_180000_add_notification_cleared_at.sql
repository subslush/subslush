-- Migration: Add cleared_at to notifications
-- Created: 2026-01-05T18:00:00.000Z
-- Description: Adds a soft-clear timestamp to avoid resurfacing cleared notifications.

-- Up Migration
BEGIN;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMP;

COMMIT;

-- Down Migration
BEGIN;

-- Additive migration - no rollback included.

COMMIT;
