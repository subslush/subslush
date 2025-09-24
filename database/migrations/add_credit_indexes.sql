-- Credit System Performance Indexes
-- This file creates optimized database indexes for the credit management system
-- to ensure fast balance calculations and transaction history queries.

-- Drop indexes if they exist (for re-running)
DROP INDEX IF EXISTS idx_credit_transactions_user_id;
DROP INDEX IF EXISTS idx_credit_transactions_user_id_created_at;
DROP INDEX IF EXISTS idx_credit_transactions_user_id_type;
DROP INDEX IF EXISTS idx_credit_transactions_user_id_type_created_at;
DROP INDEX IF EXISTS idx_credit_transactions_created_at;
DROP INDEX IF EXISTS idx_credit_transactions_type;
DROP INDEX IF EXISTS idx_credit_transactions_balance_calculation;

-- Create the credit_transactions table if it doesn't exist
CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('deposit', 'purchase', 'refund', 'bonus', 'withdrawal')),
    amount DECIMAL(10, 2) NOT NULL,
    balance_before DECIMAL(10, 2) NOT NULL DEFAULT 0,
    balance_after DECIMAL(10, 2) NOT NULL DEFAULT 0,
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Primary index for user lookups (most common operation)
-- This index optimizes all queries that filter by user_id
CREATE INDEX idx_credit_transactions_user_id
ON credit_transactions (user_id);

-- Composite index for user balance calculations and transaction history
-- This index optimizes queries that need transactions for a user ordered by date
CREATE INDEX idx_credit_transactions_user_id_created_at
ON credit_transactions (user_id, created_at DESC);

-- Index for filtering by user and transaction type
-- This optimizes queries like "get all deposits for user X"
CREATE INDEX idx_credit_transactions_user_id_type
ON credit_transactions (user_id, type);

-- Composite index for user + type + date filtering
-- This optimizes complex queries with multiple filters
CREATE INDEX idx_credit_transactions_user_id_type_created_at
ON credit_transactions (user_id, type, created_at DESC);

-- Index for date-based queries (admin reporting)
-- This optimizes queries that filter transactions by date ranges
CREATE INDEX idx_credit_transactions_created_at
ON credit_transactions (created_at DESC);

-- Index for transaction type filtering (admin reporting)
-- This optimizes queries that filter by transaction type across all users
CREATE INDEX idx_credit_transactions_type
ON credit_transactions (type);

-- Specialized index for fast balance calculations
-- This index is optimized for SUM operations on amount grouped by user_id
CREATE INDEX idx_credit_transactions_balance_calculation
ON credit_transactions (user_id, amount, created_at);

-- Add foreign key constraint if users table exists
-- This ensures referential integrity between credit transactions and users
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users') THEN
        ALTER TABLE credit_transactions
        ADD CONSTRAINT fk_credit_transactions_user_id
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
EXCEPTION
    WHEN others THEN
        -- Ignore error if constraint already exists
        NULL;
END $$;

-- Create a partial index for recent transactions (last 90 days)
-- This optimizes queries for recent transaction history
CREATE INDEX idx_credit_transactions_recent
ON credit_transactions (user_id, created_at DESC)
WHERE created_at >= NOW() - INTERVAL '90 days';

-- Add a trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_credit_transaction_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_update_credit_transaction_timestamp ON credit_transactions;
CREATE TRIGGER trigger_update_credit_transaction_timestamp
    BEFORE UPDATE ON credit_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_credit_transaction_timestamp();

-- Create a view for easy balance lookups
CREATE OR REPLACE VIEW user_credit_balances AS
SELECT
    user_id,
    COALESCE(SUM(amount), 0) AS total_balance,
    COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS total_credits_added,
    COALESCE(ABS(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END)), 0) AS total_credits_spent,
    COUNT(*) AS transaction_count,
    MAX(created_at) AS last_transaction_date,
    MIN(created_at) AS first_transaction_date
FROM credit_transactions
GROUP BY user_id;

-- Add helpful comments
COMMENT ON TABLE credit_transactions IS 'Stores all credit transactions for the platform with balance tracking';
COMMENT ON COLUMN credit_transactions.amount IS 'Transaction amount - positive for credits added, negative for credits spent';
COMMENT ON COLUMN credit_transactions.balance_before IS 'User balance before this transaction';
COMMENT ON COLUMN credit_transactions.balance_after IS 'User balance after this transaction';
COMMENT ON COLUMN credit_transactions.metadata IS 'Additional transaction metadata stored as JSON';
COMMENT ON VIEW user_credit_balances IS 'Aggregated view of user credit balances and statistics';

-- Analyze tables for query optimization
ANALYZE credit_transactions;

-- Display index information
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'credit_transactions'
ORDER BY indexname;