-- Migration: Add Payment Tracking Support
-- Created: 2025-09-25T12:00:00.000Z
-- Description: Add NOWPayments integration fields to credit_transactions table

-- Up Migration
BEGIN;

-- Ensure credit_transactions exists for clean-slate installs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,
    amount DECIMAL(18,8) NOT NULL,
    balance_before DECIMAL(18,8) DEFAULT 0,
    balance_after DECIMAL(18,8) DEFAULT 0,
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    payment_id VARCHAR(100),
    payment_provider VARCHAR(20) DEFAULT 'nowpayments',
    payment_status VARCHAR(20),
    payment_currency VARCHAR(10),
    payment_amount DECIMAL(18,8),
    blockchain_hash VARCHAR(100),
    monitoring_status VARCHAR(20) DEFAULT 'pending',
    last_monitored_at TIMESTAMP,
    retry_count INTEGER DEFAULT 0
);

-- Add payment tracking columns to existing credit_transactions table
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS payment_id VARCHAR(100);
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(20) DEFAULT 'nowpayments';
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20);
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS payment_currency VARCHAR(10);
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS payment_amount DECIMAL(18,8);
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS blockchain_hash VARCHAR(100);

-- Add constraints for payment fields
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_payment_provider_check
    CHECK (payment_provider IN ('nowpayments', 'manual', 'admin'));

ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_payment_status_check
    CHECK (payment_status IS NULL OR payment_status IN ('pending', 'confirming', 'confirmed', 'sending', 'partially_paid', 'finished', 'failed', 'refunded', 'expired'));

-- Add indexes for payment tracking
CREATE INDEX IF NOT EXISTS idx_credit_transactions_payment_id ON credit_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_payment_status ON credit_transactions(payment_status);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_payment_provider ON credit_transactions(payment_provider);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_blockchain_hash ON credit_transactions(blockchain_hash);

-- Add table comments for new columns
COMMENT ON COLUMN credit_transactions.payment_id IS 'NOWPayments payment ID or external reference';
COMMENT ON COLUMN credit_transactions.payment_provider IS 'Payment provider: nowpayments, manual, admin';
COMMENT ON COLUMN credit_transactions.payment_status IS 'NOWPayments payment status';
COMMENT ON COLUMN credit_transactions.payment_currency IS 'Cryptocurrency used for payment (BTC, ETH, etc.)';
COMMENT ON COLUMN credit_transactions.payment_amount IS 'Amount paid in cryptocurrency';
COMMENT ON COLUMN credit_transactions.blockchain_hash IS 'Blockchain transaction hash for verification';

COMMIT;

-- Down Migration (commented for safety)
/*
BEGIN;

-- Remove indexes
DROP INDEX IF EXISTS idx_credit_transactions_payment_id;
DROP INDEX IF EXISTS idx_credit_transactions_payment_status;
DROP INDEX IF EXISTS idx_credit_transactions_payment_provider;
DROP INDEX IF EXISTS idx_credit_transactions_blockchain_hash;

-- Remove constraints
ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_payment_provider_check;
ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_payment_status_check;

-- Remove columns
ALTER TABLE credit_transactions DROP COLUMN IF EXISTS payment_id;
ALTER TABLE credit_transactions DROP COLUMN IF EXISTS payment_provider;
ALTER TABLE credit_transactions DROP COLUMN IF EXISTS payment_status;
ALTER TABLE credit_transactions DROP COLUMN IF EXISTS payment_currency;
ALTER TABLE credit_transactions DROP COLUMN IF EXISTS payment_amount;
ALTER TABLE credit_transactions DROP COLUMN IF EXISTS blockchain_hash;

COMMIT;
*/
