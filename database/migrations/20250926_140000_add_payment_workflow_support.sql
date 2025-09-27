-- Migration: Add Payment Workflow Support
-- Created: 2025-09-26T14:00:00.000Z
-- Description: Add payment monitoring, refund tracking, and workflow management support

-- Up Migration
BEGIN;

-- First, update payment status constraint to include 'waiting' status
ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_payment_status_check;
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_payment_status_check
    CHECK (payment_status IS NULL OR payment_status IN ('pending', 'waiting', 'confirming', 'confirmed', 'sending', 'partially_paid', 'finished', 'failed', 'refunded', 'expired'));

-- Add monitoring status tracking columns to credit_transactions
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS monitoring_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS last_monitored_at TIMESTAMP;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- Add constraints for monitoring columns
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_monitoring_status_check
    CHECK (monitoring_status IN ('pending', 'monitoring', 'completed', 'failed', 'skipped'));

-- Create payment_refunds table for refund workflow management
CREATE TABLE IF NOT EXISTS payment_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id VARCHAR(100) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(18,8) NOT NULL CHECK (amount > 0),
    reason VARCHAR(50) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    approved_by UUID REFERENCES users(id),
    processed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- Add constraints for payment_refunds
ALTER TABLE payment_refunds ADD CONSTRAINT payment_refunds_reason_check
    CHECK (reason IN ('user_request', 'payment_error', 'service_issue', 'overpayment', 'admin_decision', 'dispute'));

ALTER TABLE payment_refunds ADD CONSTRAINT payment_refunds_status_check
    CHECK (status IN ('pending', 'approved', 'processing', 'completed', 'failed', 'rejected'));

-- Create indexes for payment_refunds
CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment_id ON payment_refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_user_id ON payment_refunds(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_status ON payment_refunds(status);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_created_at ON payment_refunds(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_approved_by ON payment_refunds(approved_by);

-- Create indexes for monitoring columns on credit_transactions
CREATE INDEX IF NOT EXISTS idx_credit_transactions_monitoring_status ON credit_transactions(monitoring_status);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_last_monitored_at ON credit_transactions(last_monitored_at);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_retry_count ON credit_transactions(retry_count);

-- Create composite index for efficient payment monitoring queries
CREATE INDEX IF NOT EXISTS idx_credit_transactions_payment_monitoring
    ON credit_transactions(payment_status, monitoring_status, last_monitored_at)
    WHERE payment_id IS NOT NULL;

-- Create composite index for pending payments monitoring
CREATE INDEX IF NOT EXISTS idx_credit_transactions_pending_payments
    ON credit_transactions(payment_id, payment_status, created_at)
    WHERE payment_id IS NOT NULL
    AND payment_status IN ('pending', 'waiting', 'confirming', 'confirmed', 'sending', 'partially_paid');

-- Add table comments
COMMENT ON TABLE payment_refunds IS 'Tracks refund requests and their processing status';
COMMENT ON COLUMN payment_refunds.payment_id IS 'Reference to the original payment ID';
COMMENT ON COLUMN payment_refunds.amount IS 'Amount to be refunded in USD';
COMMENT ON COLUMN payment_refunds.reason IS 'Reason for the refund request';
COMMENT ON COLUMN payment_refunds.status IS 'Current status of the refund request';
COMMENT ON COLUMN payment_refunds.approved_by IS 'Admin user who approved/rejected the refund';
COMMENT ON COLUMN payment_refunds.metadata IS 'Additional refund processing metadata';

-- Add comments for new credit_transactions columns
COMMENT ON COLUMN credit_transactions.monitoring_status IS 'Status of payment monitoring process';
COMMENT ON COLUMN credit_transactions.last_monitored_at IS 'Timestamp of last monitoring check';
COMMENT ON COLUMN credit_transactions.retry_count IS 'Number of monitoring retry attempts';

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for payment_refunds updated_at
DROP TRIGGER IF EXISTS update_payment_refunds_updated_at ON payment_refunds;
CREATE TRIGGER update_payment_refunds_updated_at
    BEFORE UPDATE ON payment_refunds
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert some test data for development (only if no data exists)
DO $$
BEGIN
    -- Only insert test data in development environment
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users' AND table_schema = 'public') THEN
        -- Test data would go here if needed for development
        -- This is intentionally left empty for production safety
        NULL;
    END IF;
END $$;

-- Create view for payment monitoring dashboard
CREATE OR REPLACE VIEW payment_monitoring_dashboard AS
SELECT
    ct.payment_id,
    ct.user_id,
    ct.payment_status,
    ct.monitoring_status,
    ct.payment_currency,
    ct.payment_amount,
    ct.retry_count,
    ct.last_monitored_at,
    ct.created_at as payment_created_at,
    ct.updated_at as last_updated,
    CASE
        WHEN ct.payment_status IN ('finished', 'failed', 'expired', 'refunded') THEN 'final'
        WHEN ct.last_monitored_at < NOW() - INTERVAL '1 hour' THEN 'stale'
        WHEN ct.retry_count >= 3 THEN 'high_retry'
        ELSE 'normal'
    END as monitoring_priority,
    EXISTS(SELECT 1 FROM payment_refunds pr WHERE pr.payment_id = ct.payment_id) as has_refund_request
FROM credit_transactions ct
WHERE ct.payment_id IS NOT NULL
ORDER BY
    CASE
        WHEN ct.payment_status IN ('pending', 'waiting', 'confirming', 'confirmed', 'sending', 'partially_paid') THEN 1
        ELSE 2
    END,
    ct.retry_count DESC,
    ct.last_monitored_at ASC NULLS FIRST;

-- Create view for refund management dashboard
CREATE OR REPLACE VIEW refund_management_dashboard AS
SELECT
    pr.id as refund_id,
    pr.payment_id,
    pr.user_id,
    pr.amount,
    pr.reason,
    pr.status,
    pr.created_at as requested_at,
    pr.approved_by,
    pr.processed_at,
    ct.payment_status,
    ct.payment_amount as original_payment_amount,
    ct.payment_currency,
    EXTRACT(EPOCH FROM (NOW() - pr.created_at))/3600 as hours_pending,
    CASE
        WHEN pr.status = 'pending' AND pr.created_at < NOW() - INTERVAL '24 hours' THEN 'urgent'
        WHEN pr.status = 'pending' AND pr.created_at < NOW() - INTERVAL '4 hours' THEN 'attention'
        ELSE 'normal'
    END as priority_level
FROM payment_refunds pr
LEFT JOIN credit_transactions ct ON ct.payment_id = pr.payment_id
ORDER BY
    CASE pr.status
        WHEN 'pending' THEN 1
        WHEN 'approved' THEN 2
        WHEN 'processing' THEN 3
        ELSE 4
    END,
    pr.created_at DESC;

-- Grant necessary permissions
GRANT SELECT ON payment_monitoring_dashboard TO PUBLIC;
GRANT SELECT ON refund_management_dashboard TO PUBLIC;

COMMIT;

-- Down Migration (commented for safety)
/*
BEGIN;

-- Drop views
DROP VIEW IF EXISTS payment_monitoring_dashboard;
DROP VIEW IF EXISTS refund_management_dashboard;

-- Drop trigger and function
DROP TRIGGER IF EXISTS update_payment_refunds_updated_at ON payment_refunds;
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop indexes
DROP INDEX IF EXISTS idx_payment_refunds_payment_id;
DROP INDEX IF EXISTS idx_payment_refunds_user_id;
DROP INDEX IF EXISTS idx_payment_refunds_status;
DROP INDEX IF EXISTS idx_payment_refunds_created_at;
DROP INDEX IF EXISTS idx_payment_refunds_approved_by;
DROP INDEX IF EXISTS idx_credit_transactions_monitoring_status;
DROP INDEX IF EXISTS idx_credit_transactions_last_monitored_at;
DROP INDEX IF EXISTS idx_credit_transactions_retry_count;
DROP INDEX IF EXISTS idx_credit_transactions_payment_monitoring;
DROP INDEX IF EXISTS idx_credit_transactions_pending_payments;

-- Drop table
DROP TABLE IF EXISTS payment_refunds;

-- Remove monitoring columns from credit_transactions
ALTER TABLE credit_transactions DROP COLUMN IF EXISTS monitoring_status;
ALTER TABLE credit_transactions DROP COLUMN IF EXISTS last_monitored_at;
ALTER TABLE credit_transactions DROP COLUMN IF EXISTS retry_count;

-- Remove constraints
ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_monitoring_status_check;

-- Revert payment status constraint
ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_payment_status_check;
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_payment_status_check
    CHECK (payment_status IS NULL OR payment_status IN ('pending', 'confirming', 'confirmed', 'sending', 'partially_paid', 'finished', 'failed', 'refunded', 'expired'));

COMMIT;
*/