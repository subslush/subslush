-- Migration: Drop prelaunch contest routines
-- Created: 2026-01-20T12:00:00.000Z
-- Description: Remove deprecated contest/leaderboard triggers and functions.

-- Up Migration
BEGIN;

DROP TRIGGER IF EXISTS trigger_update_leaderboard ON referrals;
DROP TRIGGER IF EXISTS trigger_create_leaderboard_entry ON pre_registrations;

DROP FUNCTION IF EXISTS update_leaderboard();
DROP FUNCTION IF EXISTS create_leaderboard_entry();
DROP FUNCTION IF EXISTS calculate_contest_prizes();
DROP FUNCTION IF EXISTS get_contest_status();

COMMIT;

-- Down Migration
BEGIN;

-- No rollback included. Recreate functions/triggers manually if needed.

COMMIT;
