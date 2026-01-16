-- Migration: Add product publishing fields
-- Created: 2026-01-05T16:00:00.000Z
-- Description: Adds publishing configuration columns to products for admin-driven catalog control.

-- Up Migration
BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS logo_key VARCHAR(150),
  ADD COLUMN IF NOT EXISTS category VARCHAR(100),
  ADD COLUMN IF NOT EXISTS default_currency VARCHAR(10),
  ADD COLUMN IF NOT EXISTS max_subscriptions INTEGER;

COMMIT;

-- Down Migration
BEGIN;

-- Additive migration - no rollback included.

COMMIT;
