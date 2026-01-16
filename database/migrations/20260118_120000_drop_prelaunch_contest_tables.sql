-- Migration: Drop prelaunch contest tables
-- Created: 2026-01-18T12:00:00.000Z
-- Description: Remove deprecated leaderboard and viral metrics tables.

-- Up Migration
BEGIN;

DROP TABLE IF EXISTS leaderboard;
DROP TABLE IF EXISTS viral_metrics;

COMMIT;

-- Down Migration
BEGIN;

-- No rollback included. Recreate tables manually if needed.

COMMIT;
