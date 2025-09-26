-- Migration: Add 'waiting' to payment status constraint
-- Created: 2025-09-26T13:48:00.000Z
-- Description: Update credit_transactions payment_status constraint to include 'waiting' status from NOWPayments API

-- Up Migration
BEGIN;

-- Drop existing constraint
ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_payment_status_check;

-- Add new constraint with 'waiting' status included
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_payment_status_check
    CHECK (payment_status IS NULL OR payment_status IN ('pending', 'waiting', 'confirming', 'confirmed', 'sending', 'partially_paid', 'finished', 'failed', 'refunded', 'expired'));

-- Update table comment to document the change
COMMENT ON CONSTRAINT credit_transactions_payment_status_check ON credit_transactions IS 'Payment status constraint updated to include waiting status from NOWPayments direct payment API';

COMMIT;

-- Down Migration (commented for safety)
/*
BEGIN;

-- Revert to original constraint without 'waiting'
ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_payment_status_check;
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_payment_status_check
    CHECK (payment_status IS NULL OR payment_status IN ('pending', 'confirming', 'confirmed', 'sending', 'partially_paid', 'finished', 'failed', 'refunded', 'expired'));

COMMIT;
*/