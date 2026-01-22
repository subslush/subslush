-- Migration: Add term month restriction for coupons
-- Created: 2026-01-21T14:00:00.000Z
-- Description: Adds optional term_months restriction to coupons.

-- Up Migration
BEGIN;

ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS term_months INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'coupons_term_months_check'
  ) THEN
    ALTER TABLE coupons
      ADD CONSTRAINT coupons_term_months_check
      CHECK (term_months IS NULL OR term_months > 0);
  END IF;
END $$;

COMMIT;

-- Down Migration
BEGIN;

-- Additive migration - no rollback included.

COMMIT;
