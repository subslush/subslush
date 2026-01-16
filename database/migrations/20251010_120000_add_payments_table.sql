-- Migration: Add payments table and extend providers
-- Created: 2025-10-10 12:00:00 UTC
-- Description:
--   - Introduce a normalized payments table for provider-agnostic tracking
--   - Allow credit_transactions to store Stripe as a provider (for future direct payments)
--   - This migration is additive and keeps existing crypto/credit flows intact

-- Up Migration
BEGIN;

-- Create payments table for unified tracking of payment intents across providers
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL,
    provider_payment_id VARCHAR(150) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    provider_status VARCHAR(50),
    purpose VARCHAR(30) NOT NULL DEFAULT 'credit_topup',
    amount DECIMAL(18,8) NOT NULL CHECK (amount > 0),
    currency VARCHAR(10) NOT NULL,
    amount_usd DECIMAL(18,8),
    payment_method_type VARCHAR(30),
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    credit_transaction_id UUID REFERENCES credit_transactions(id) ON DELETE SET NULL,
    expires_at TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT payments_provider_check CHECK (provider IN ('nowpayments', 'stripe', 'manual', 'admin')),
    CONSTRAINT payments_status_check CHECK (status IN ('pending', 'requires_payment_method', 'requires_action', 'processing', 'succeeded', 'failed', 'canceled', 'expired')),
    CONSTRAINT payments_purpose_check CHECK (purpose IN ('subscription', 'credit_topup', 'one_time'))
);

-- Maintain updated_at automatically
CREATE OR REPLACE FUNCTION payments_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payments_set_updated_at ON payments;
CREATE TRIGGER trg_payments_set_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION payments_set_updated_at();

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_payments_provider_payment_id ON payments(provider, provider_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_status ON payments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_purpose_status ON payments(purpose, status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);

-- Extend credit_transactions provider check to include Stripe for future direct payments
ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_payment_provider_check;
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_payment_provider_check
    CHECK (payment_provider IS NULL OR payment_provider IN ('nowpayments', 'stripe', 'manual', 'admin'));

COMMENT ON TABLE payments IS 'Unified payment intents across providers (Stripe, NOWPayments, manual)';
COMMENT ON COLUMN payments.provider IS 'Payment provider (nowpayments, stripe, manual, admin)';
COMMENT ON COLUMN payments.provider_payment_id IS 'Provider-specific payment/intent identifier';
COMMENT ON COLUMN payments.purpose IS 'Business purpose of the payment (subscription, credit_topup, one_time)';
COMMENT ON COLUMN payments.credit_transaction_id IS 'Linked credit transaction when the payment funds credits';

COMMIT;

-- Down Migration
BEGIN;

-- Revert credit_transactions provider check (remove Stripe)
ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_payment_provider_check;
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_payment_provider_check
    CHECK (payment_provider IS NULL OR payment_provider IN ('nowpayments', 'manual', 'admin'));

-- Drop payments table and helper trigger/function
DROP TRIGGER IF EXISTS trg_payments_set_updated_at ON payments;
DROP FUNCTION IF EXISTS payments_set_updated_at();
DROP TABLE IF EXISTS payments;

COMMIT;
