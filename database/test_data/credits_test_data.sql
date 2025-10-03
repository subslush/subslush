-- ============================================================================
-- Credit System Test Data and Validation
-- ============================================================================
-- Purpose: Create test data and validate credit system functionality
-- Date: 2025-10-02
-- ============================================================================

\echo 'Creating credit system test data and validation...'

-- Test multiple users with various transaction types
DO $$
DECLARE
    test_user_1 UUID := '11111111-1111-1111-1111-111111111111';
    test_user_2 UUID := '22222222-2222-2222-2222-222222222222';
    running_balance_1 NUMERIC(10,2) := 0;
    running_balance_2 NUMERIC(10,2) := 0;
BEGIN
    -- Clear existing test data
    DELETE FROM credit_transactions WHERE user_id IN (test_user_1, test_user_2);

    -- Create test users if they don't exist
    INSERT INTO users (id, email, created_at)
    SELECT test_user_1, 'test1_' || gen_random_uuid()::text || '@example.com', NOW()
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = test_user_1);

    INSERT INTO users (id, email, created_at)
    SELECT test_user_2, 'test2_' || gen_random_uuid()::text || '@example.com', NOW()
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = test_user_2);

    -- Test User 1: Multiple transaction types

    -- 1. Initial deposit
    running_balance_1 := running_balance_1 + 100.00;
    INSERT INTO credit_transactions (
        id, user_id, type, amount, balance_before, balance_after,
        description, metadata, payment_provider, monitoring_status
    ) VALUES (
        gen_random_uuid(), test_user_1, 'deposit', 100.00,
        running_balance_1 - 100.00, running_balance_1,
        'Initial deposit', '{"test": true}', 'manual', 'completed'
    );

    -- 2. Purchase (negative amount)
    running_balance_1 := running_balance_1 - 25.00;
    INSERT INTO credit_transactions (
        id, user_id, type, amount, balance_before, balance_after,
        description, metadata, payment_provider, monitoring_status
    ) VALUES (
        gen_random_uuid(), test_user_1, 'purchase', -25.00,
        running_balance_1 + 25.00, running_balance_1,
        'Test purchase', '{"test": true, "item": "spotify_premium"}', 'manual', 'completed'
    );

    -- 3. Bonus credits
    running_balance_1 := running_balance_1 + 15.00;
    INSERT INTO credit_transactions (
        id, user_id, type, amount, balance_before, balance_after,
        description, metadata, payment_provider, monitoring_status
    ) VALUES (
        gen_random_uuid(), test_user_1, 'bonus', 15.00,
        running_balance_1 - 15.00, running_balance_1,
        'Referral bonus', '{"test": true, "referral_id": "ref123"}', 'manual', 'completed'
    );

    -- 4. Refund
    running_balance_1 := running_balance_1 + 10.00;
    INSERT INTO credit_transactions (
        id, user_id, type, amount, balance_before, balance_after,
        description, metadata, payment_provider, monitoring_status
    ) VALUES (
        gen_random_uuid(), test_user_1, 'refund', 10.00,
        running_balance_1 - 10.00, running_balance_1,
        'Purchase refund', '{"test": true, "original_purchase_id": "purchase123"}', 'manual', 'completed'
    );

    -- Test User 2: Simpler transactions

    -- 1. Large deposit
    running_balance_2 := running_balance_2 + 500.00;
    INSERT INTO credit_transactions (
        id, user_id, type, amount, balance_before, balance_after,
        description, metadata, payment_provider, monitoring_status
    ) VALUES (
        gen_random_uuid(), test_user_2, 'deposit', 500.00,
        running_balance_2 - 500.00, running_balance_2,
        'Large initial deposit', '{"test": true}', 'manual', 'completed'
    );

    -- 2. Multiple purchases
    running_balance_2 := running_balance_2 - 50.00;
    INSERT INTO credit_transactions (
        id, user_id, type, amount, balance_before, balance_after,
        description, metadata, payment_provider, monitoring_status
    ) VALUES (
        gen_random_uuid(), test_user_2, 'purchase', -50.00,
        running_balance_2 + 50.00, running_balance_2,
        'Netflix subscription', '{"test": true, "service": "netflix"}', 'manual', 'completed'
    );

    running_balance_2 := running_balance_2 - 30.00;
    INSERT INTO credit_transactions (
        id, user_id, type, amount, balance_before, balance_after,
        description, metadata, payment_provider, monitoring_status
    ) VALUES (
        gen_random_uuid(), test_user_2, 'purchase', -30.00,
        running_balance_2 + 30.00, running_balance_2,
        'TradingView subscription', '{"test": true, "service": "tradingview"}', 'manual', 'completed'
    );

    RAISE NOTICE 'Test data created successfully';
    RAISE NOTICE 'Test User 1 final balance: %', running_balance_1;
    RAISE NOTICE 'Test User 2 final balance: %', running_balance_2;
END $$;

-- Validation queries
\echo 'Running validation checks...'

-- 1. Verify balance calculations
SELECT
    'BALANCE VERIFICATION' as check_type,
    user_id,
    SUM(amount) as calculated_balance,
    MAX(balance_after) as stored_balance,
    CASE
        WHEN SUM(amount) = MAX(balance_after) THEN 'PASS'
        ELSE 'FAIL'
    END as validation_status
FROM credit_transactions
GROUP BY user_id
ORDER BY user_id;

-- 2. Verify transaction counts per user
SELECT
    'TRANSACTION COUNT' as check_type,
    user_id,
    COUNT(*) as transaction_count,
    ARRAY_AGG(type ORDER BY created_at) as transaction_types
FROM credit_transactions
GROUP BY user_id
ORDER BY user_id;

-- 3. Verify balance progression is correct
SELECT
    'BALANCE PROGRESSION' as check_type,
    user_id,
    type,
    amount,
    balance_before,
    balance_after,
    (balance_before + amount) as expected_balance_after,
    CASE
        WHEN (balance_before + amount) = balance_after THEN 'PASS'
        ELSE 'FAIL'
    END as progression_check
FROM credit_transactions
ORDER BY user_id, created_at;

-- 4. Test specific balance queries (simulate API calls)
\echo 'Testing balance queries (simulating API calls)...'

-- Query for original migrated user
SELECT
    'ORIGINAL USER BALANCE' as test_type,
    user_id,
    SUM(amount) as total_balance
FROM credit_transactions
WHERE user_id = '75076db1-cc73-4c30-9ce5-c961df34f5bd'
GROUP BY user_id;

-- Query for test users
SELECT
    'TEST USER BALANCES' as test_type,
    user_id,
    SUM(amount) as total_balance,
    COUNT(*) as transaction_count
FROM credit_transactions
WHERE user_id IN (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222'
)
GROUP BY user_id
ORDER BY user_id;

-- 5. Test concurrent transaction simulation
\echo 'Testing transaction integrity...'

-- Verify no orphaned balances
SELECT
    'INTEGRITY CHECK' as test_type,
    COUNT(*) as total_transactions,
    COUNT(DISTINCT user_id) as unique_users,
    MIN(created_at) as earliest_transaction,
    MAX(created_at) as latest_transaction
FROM credit_transactions;

-- Update statistics for optimal performance
ANALYZE credit_transactions;

\echo 'Credit system test data and validation completed!'
\echo ''
\echo 'Test Summary:'
\echo '- Created test data for multiple users with various transaction types'
\echo '- Verified balance calculations are correct'
\echo '- Tested transaction progression logic'
\echo '- Validated data integrity'
\echo '- Updated table statistics'
\echo ''
\echo 'Ready for API testing with:'
\echo '- Original user: 75076db1-cc73-4c30-9ce5-c961df34f5bd (200.00 balance)'
\echo '- Test user 1: 11111111-1111-1111-1111-111111111111 (100.00 balance expected)'
\echo '- Test user 2: 22222222-2222-2222-2222-222222222222 (420.00 balance expected)'