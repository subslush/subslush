-- ============================================================================
-- Credit System Data Migration: credits → credit_transactions
-- ============================================================================
-- Purpose: Migrate data from legacy 'credits' table to 'credit_transactions'
-- Date: 2025-10-02 20:20:00
-- Version: 1.1 (Fixed)
-- ============================================================================

\echo 'Starting Credit Data Migration...'

-- Start transaction
BEGIN;

-- Step 1: Clear existing invalid data from credit_transactions
DELETE FROM credit_transactions;
\echo 'Cleared existing credit_transactions data'

-- Step 2: Migrate data with proper balance calculation
INSERT INTO credit_transactions (
    id,
    user_id,
    type,
    amount,
    balance_before,
    balance_after,
    description,
    metadata,
    created_at,
    updated_at,
    payment_provider,
    monitoring_status
)
WITH user_transactions AS (
    SELECT
        c.id,
        c.user_id,
        c.transaction_type as type,
        c.amount,
        c.description,
        c.created_at,
        c.transaction_hash,
        -- Calculate running balance: previous balance
        SUM(c.amount) OVER (
            PARTITION BY c.user_id
            ORDER BY c.created_at, c.id
            ROWS UNBOUNDED PRECEDING
        ) - c.amount as balance_before,
        -- Calculate running balance: after this transaction
        SUM(c.amount) OVER (
            PARTITION BY c.user_id
            ORDER BY c.created_at, c.id
            ROWS UNBOUNDED PRECEDING
        ) as balance_after
    FROM credits c
    ORDER BY c.user_id, c.created_at, c.id
)
SELECT
    gen_random_uuid() as id,
    ut.user_id,
    ut.type,
    ut.amount,
    ut.balance_before,
    ut.balance_after,
    COALESCE(ut.description, 'Migrated from legacy credits table') as description,
    jsonb_build_object(
        'migrated_from', 'credits_table',
        'original_id', ut.id,
        'migration_date', NOW()::text,
        'original_transaction_hash', ut.transaction_hash
    ) as metadata,
    ut.created_at,
    NOW() as updated_at,
    'manual' as payment_provider,
    'completed' as monitoring_status
FROM user_transactions ut;

-- Step 3: Verify migration
\echo 'Migration completed. Verifying data...'

-- Show migrated data
SELECT
    'MIGRATED DATA' as status,
    user_id,
    type,
    amount,
    balance_before,
    balance_after,
    description
FROM credit_transactions
ORDER BY created_at;

-- Show balance summary
SELECT
    'BALANCE SUMMARY' as status,
    user_id,
    SUM(amount) as total_balance,
    COUNT(*) as transaction_count
FROM credit_transactions
GROUP BY user_id;

-- Update table statistics
ANALYZE credit_transactions;

COMMIT;

\echo 'Credit data migration completed successfully!'
\echo 'Next: Test the balance API at GET /api/v1/credits/balance/{userId}'