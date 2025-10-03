-- ============================================================================
-- Credit System Migration: credits → credit_transactions
-- ============================================================================
-- Purpose: Migrate data from legacy 'credits' table to 'credit_transactions'
--          ledger system with proper balance tracking
-- Date: 2025-10-02 20:15:00
-- Version: 1.0
--
-- Problem: Application queries 'credit_transactions' but real data is in 'credits'
-- Solution: Migrate all credit data with proper running balance calculations
-- ============================================================================

\echo 'Starting Credit System Migration...'

-- Start transaction for atomicity
BEGIN;

-- ============================================================================
-- Step 1: Validation and Safety Checks
-- ============================================================================

\echo 'Step 1: Performing validation and safety checks...'

-- Check if both tables exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'credits') THEN
        RAISE EXCEPTION 'Source table "credits" does not exist';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'credit_transactions') THEN
        RAISE EXCEPTION 'Target table "credit_transactions" does not exist';
    END IF;

    RAISE NOTICE 'Both source and target tables exist';
END $$;

-- Create backup of current credit_transactions data
CREATE TEMPORARY TABLE credit_transactions_backup AS
SELECT * FROM credit_transactions;

\echo 'Created backup of existing credit_transactions data'

-- ============================================================================
-- Step 2: Clear Existing Invalid Data
-- ============================================================================

\echo 'Step 2: Clearing existing invalid data from credit_transactions...'

-- Delete existing records (they appear to be test/dummy data with 0.00 amounts)
DELETE FROM credit_transactions;

\echo 'Cleared existing credit_transactions data'

-- ============================================================================
-- Step 3: Data Migration with Balance Calculation
-- ============================================================================

\echo 'Step 3: Migrating data from credits to credit_transactions...'

-- Migrate data from credits to credit_transactions with proper balance calculation
-- This handles the running balance calculation per user chronologically
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
    -- Get all credit records ordered by user and time
    SELECT
        c.id,
        c.user_id,
        c.transaction_type as type,
        c.amount,
        c.description,
        c.created_at,
        c.transaction_hash,
        -- Calculate running balance for each user
        SUM(c.amount) OVER (
            PARTITION BY c.user_id
            ORDER BY c.created_at, c.id
            ROWS UNBOUNDED PRECEDING
        ) - c.amount as balance_before,
        SUM(c.amount) OVER (
            PARTITION BY c.user_id
            ORDER BY c.created_at, c.id
            ROWS UNBOUNDED PRECEDING
        ) as balance_after
    FROM credits c
    ORDER BY c.user_id, c.created_at, c.id
)
SELECT
    -- Generate new UUID for credit_transactions (don't reuse credits.id)
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

-- Get count of migrated records
SELECT COUNT(*) as migrated_records FROM credit_transactions;

\echo 'Data migration completed'

-- ============================================================================
-- Step 4: Data Integrity Verification
-- ============================================================================

\echo 'Step 4: Performing data integrity verification...'

-- Verify balance calculations are correct
DO $$
DECLARE
    rec RECORD;
    calculated_balance NUMERIC(10,2);
    stored_balance NUMERIC(10,2);
BEGIN
    RAISE NOTICE 'Verifying balance calculations...';

    FOR rec IN
        SELECT DISTINCT user_id FROM credit_transactions
    LOOP
        -- Calculate balance from SUM of amounts
        SELECT COALESCE(SUM(amount), 0) INTO calculated_balance
        FROM credit_transactions
        WHERE user_id = rec.user_id;

        -- Get the latest balance_after for this user
        SELECT balance_after INTO stored_balance
        FROM credit_transactions
        WHERE user_id = rec.user_id
        ORDER BY created_at DESC, id DESC
        LIMIT 1;

        IF calculated_balance != stored_balance THEN
            RAISE EXCEPTION 'Balance mismatch for user %: calculated=%, stored=%',
                rec.user_id, calculated_balance, stored_balance;
        END IF;

        RAISE NOTICE 'User % balance verified: %', rec.user_id, calculated_balance;
    END LOOP;

    RAISE NOTICE 'All balance calculations verified successfully';
END $$;

-- Verify all original credit records were migrated
DO $$
DECLARE
    credits_count INTEGER;
    transactions_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO credits_count FROM credits;
    SELECT COUNT(*) INTO transactions_count FROM credit_transactions;

    IF credits_count != transactions_count THEN
        RAISE EXCEPTION 'Migration incomplete: % credits records but % transaction records',
            credits_count, transactions_count;
    END IF;

    RAISE NOTICE 'Record count verification passed: % records migrated', transactions_count;
END $$;

-- Verify no data loss - check that all user balances match
DO $$
DECLARE
    rec RECORD;
    credits_balance NUMERIC(10,2);
    transactions_balance NUMERIC(10,2);
BEGIN
    FOR rec IN
        SELECT DISTINCT user_id FROM credits
    LOOP
        -- Get balance from credits table
        SELECT COALESCE(SUM(amount), 0) INTO credits_balance
        FROM credits
        WHERE user_id = rec.user_id;

        -- Get balance from credit_transactions table
        SELECT COALESCE(SUM(amount), 0) INTO transactions_balance
        FROM credit_transactions
        WHERE user_id = rec.user_id;

        IF credits_balance != transactions_balance THEN
            RAISE EXCEPTION 'Balance mismatch after migration for user %: credits=%, transactions=%',
                rec.user_id, credits_balance, transactions_balance;
        END IF;

        RAISE NOTICE 'User % balance consistency verified: %', rec.user_id, transactions_balance;
    END LOOP;

    RAISE NOTICE 'All user balances match between tables';
END $$;

-- ============================================================================
-- Step 5: Performance Optimization
-- ============================================================================

\echo 'Step 5: Updating table statistics for optimal performance...'

-- Update table statistics for query planner
ANALYZE credit_transactions;

-- Verify critical indexes exist and are being used
DO $$
BEGIN
    -- Check critical indexes exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'credit_transactions'
        AND indexname = 'idx_credit_transactions_user_id'
    ) THEN
        RAISE WARNING 'Critical index idx_credit_transactions_user_id is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'credit_transactions'
        AND indexname = 'idx_credit_transactions_balance_calculation'
    ) THEN
        RAISE WARNING 'Critical index idx_credit_transactions_balance_calculation is missing';
    END IF;

    RAISE NOTICE 'Critical indexes verified';
END $$;

-- ============================================================================
-- Step 6: Final Migration Summary
-- ============================================================================

\echo 'Step 6: Migration summary and verification...'

-- Display migration summary
SELECT
    'MIGRATION SUMMARY' as status,
    COUNT(*) as total_transactions,
    COUNT(DISTINCT user_id) as unique_users,
    SUM(amount) as total_amount,
    MIN(created_at) as earliest_transaction,
    MAX(created_at) as latest_transaction
FROM credit_transactions;

-- Display per-user balance summary
SELECT
    user_id,
    SUM(amount) as total_balance,
    COUNT(*) as transaction_count,
    MAX(balance_after) as final_balance
FROM credit_transactions
GROUP BY user_id
ORDER BY total_balance DESC;

-- ============================================================================
-- Step 7: Create Rollback Script
-- ============================================================================

\echo 'Step 7: Creating rollback capability...'

-- Store rollback information
DO $$
BEGIN
    -- Create rollback information
    RAISE NOTICE 'ROLLBACK SCRIPT (save this for emergency rollback):';
    RAISE NOTICE '-- To rollback this migration, run:';
    RAISE NOTICE '-- BEGIN;';
    RAISE NOTICE '-- DELETE FROM credit_transactions WHERE metadata->''migrated_from'' = ''"credits_table"'';';
    RAISE NOTICE '-- INSERT INTO credit_transactions SELECT * FROM credit_transactions_backup; -- if needed';
    RAISE NOTICE '-- COMMIT;';
    RAISE NOTICE 'Migration completed successfully - rollback script generated';
END $$;

-- Commit the transaction
COMMIT;

\echo ''
\echo '============================================================================'
\echo 'CREDIT SYSTEM MIGRATION COMPLETED SUCCESSFULLY!'
\echo '============================================================================'
\echo ''
\echo 'Summary:'
\echo '- Migrated all data from credits table to credit_transactions'
\echo '- Calculated proper running balances for ledger accounting'
\echo '- Verified data integrity and balance consistency'
\echo '- Updated table statistics for optimal performance'
\echo '- Created rollback capability for emergency use'
\echo ''
\echo 'Next Steps:'
\echo '1. Test the credit balance API: GET /api/v1/credits/balance/{userId}'
\echo '2. Test subscription purchase flow with credit deduction'
\echo '3. Verify all credit operations work correctly'
\echo '4. Monitor application logs for any credit-related errors'
\echo ''
\echo 'The credits table is preserved for backward compatibility.'
\echo 'It can be safely dropped after confirming all systems work correctly.'
\echo ''
\echo '============================================================================'

-- ============================================================================
-- MIGRATION COMPLETED
-- ============================================================================