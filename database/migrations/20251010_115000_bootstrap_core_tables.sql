-- Migration: Bootstrap core tables required for payments
-- Created: 2025-10-10 11:50:00 UTC
-- Description:
--   - Ensure core tables (users, subscriptions, credit_transactions) exist before payments migration
--   - Adds required columns, constraints, and indexes if missing
--   - Idempotent: uses IF NOT EXISTS / DO blocks to avoid clobbering existing data

BEGIN;

-- Ensure pgcrypto for gen_random_uuid
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- USERS
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    first_name TEXT,
    last_name TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_login TIMESTAMP
);

-- SUBSCRIPTIONS (minimal shape; align with application expectations)
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_type TEXT NOT NULL,
    service_plan TEXT NOT NULL,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    renewal_date TIMESTAMP,
    credentials_encrypted TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_service_type ON subscriptions(service_type);

-- CREDIT TRANSACTIONS
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

-- Constraints (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'credit_transactions_payment_provider_check'
    ) THEN
        ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_payment_provider_check
            CHECK (payment_provider IS NULL OR payment_provider IN ('nowpayments', 'stripe', 'manual', 'admin'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'credit_transactions_payment_status_check'
    ) THEN
        ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_payment_status_check
            CHECK (payment_status IS NULL OR payment_status IN ('pending', 'waiting', 'confirming', 'confirmed', 'sending', 'partially_paid', 'finished', 'failed', 'refunded', 'expired'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'credit_transactions_monitoring_status_check'
    ) THEN
        ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_monitoring_status_check
            CHECK (monitoring_status IN ('pending', 'monitoring', 'completed', 'failed', 'skipped'));
    END IF;
END $$;

-- Indexes for credit_transactions
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_payment_id ON credit_transactions(payment_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_payment_status ON credit_transactions(payment_status);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_payment_provider ON credit_transactions(payment_provider);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_blockchain_hash ON credit_transactions(blockchain_hash);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_monitoring_status ON credit_transactions(monitoring_status);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_last_monitored_at ON credit_transactions(last_monitored_at);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_retry_count ON credit_transactions(retry_count);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_payment_monitoring
    ON credit_transactions(payment_status, monitoring_status, last_monitored_at)
    WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_credit_transactions_pending_payments
    ON credit_transactions(payment_id, payment_status, created_at)
    WHERE payment_id IS NOT NULL
      AND payment_status IN ('pending', 'waiting', 'confirming', 'confirmed', 'sending', 'partially_paid');

-- Updated_at trigger for credit_transactions
CREATE OR REPLACE FUNCTION credit_transactions_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_credit_transactions_set_updated_at ON credit_transactions;
CREATE TRIGGER trg_credit_transactions_set_updated_at
    BEFORE UPDATE ON credit_transactions
    FOR EACH ROW
    EXECUTE FUNCTION credit_transactions_set_updated_at();

COMMIT;
