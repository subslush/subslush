-- =====================================================
-- Index Performance Testing Suite
-- =====================================================
-- Description: Comprehensive performance testing for subscription platform indexes
-- Usage: Run this file to benchmark query performance before and after index creation
-- Database: subscription_platform

-- Enable query timing and detailed analysis
\timing on
SET track_io_timing = on;
SET log_statement_stats = on;

-- Create a temporary function for timing queries
CREATE OR REPLACE FUNCTION time_query(query_text TEXT, description TEXT)
RETURNS TABLE(
    test_name TEXT,
    execution_time_ms NUMERIC,
    total_cost NUMERIC,
    rows_returned BIGINT
) AS $$
DECLARE
    start_time TIMESTAMP;
    end_time TIMESTAMP;
    plan_json JSON;
    exec_time NUMERIC;
    cost_val NUMERIC;
    rows_val BIGINT;
BEGIN
    -- Record start time
    start_time := clock_timestamp();

    -- Execute the query and get plan
    EXECUTE 'EXPLAIN (ANALYZE, FORMAT JSON) ' || query_text INTO plan_json;

    -- Record end time
    end_time := clock_timestamp();

    -- Extract metrics from plan
    exec_time := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
    cost_val := (plan_json->0->'Plan'->>'Total Cost')::NUMERIC;
    rows_val := (plan_json->0->'Plan'->>'Actual Rows')::BIGINT;

    RETURN QUERY SELECT description, exec_time, cost_val, rows_val;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TEST DATA PREPARATION
-- =====================================================

-- First, let's create some test data if tables are empty
DO $$
DECLARE
    user_count INTEGER;
    subscription_count INTEGER;
    credit_count INTEGER;
    task_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM users;
    SELECT COUNT(*) INTO subscription_count FROM subscriptions;
    SELECT COUNT(*) INTO credit_count FROM credits;
    SELECT COUNT(*) INTO task_count FROM admin_tasks;

    RAISE NOTICE 'Current data counts:';
    RAISE NOTICE '  Users: %', user_count;
    RAISE NOTICE '  Subscriptions: %', subscription_count;
    RAISE NOTICE '  Credits: %', credit_count;
    RAISE NOTICE '  Admin Tasks: %', task_count;

    -- If no data exists, create minimal test data
    IF user_count = 0 THEN
        RAISE NOTICE 'Creating test data for performance testing...';

        -- Insert test users
        INSERT INTO users (email, status, created_at, last_login)
        SELECT
            'user' || i || '@example.com',
            CASE
                WHEN i % 10 = 0 THEN 'inactive'
                WHEN i % 20 = 0 THEN 'suspended'
                ELSE 'active'
            END,
            NOW() - (i || ' days')::INTERVAL,
            CASE WHEN i % 3 = 0 THEN NOW() - (i/2 || ' hours')::INTERVAL ELSE NULL END
        FROM generate_series(1, 1000) i;

        -- Insert test subscriptions
        INSERT INTO subscriptions (user_id, service_type, service_plan, start_date, end_date, renewal_date, status, metadata)
        SELECT
            u.id,
            CASE (i % 3)
                WHEN 0 THEN 'spotify'
                WHEN 1 THEN 'netflix'
                ELSE 'tradingview'
            END,
            CASE (i % 3)
                WHEN 0 THEN 'premium'
                WHEN 1 THEN 'family'
                ELSE 'individual'
            END,
            NOW() - (i || ' days')::INTERVAL,
            NOW() + (365 - i || ' days')::INTERVAL,
            NOW() + (335 - i || ' days')::INTERVAL,
            CASE
                WHEN i % 10 = 0 THEN 'expired'
                WHEN i % 15 = 0 THEN 'cancelled'
                ELSE 'active'
            END,
            '{"region": "US", "payment_method": "crypto"}'::JSONB
        FROM generate_series(1, 2000) i
        JOIN users u ON u.email = 'user' || ((i % 1000) + 1) || '@example.com';

        -- Insert test credits
        INSERT INTO credits (user_id, amount, transaction_type, created_at, transaction_hash, description)
        SELECT
            u.id,
            (10 + (i % 100))::DECIMAL(10,2),
            CASE (i % 4)
                WHEN 0 THEN 'deposit'
                WHEN 1 THEN 'purchase'
                WHEN 2 THEN 'refund'
                ELSE 'bonus'
            END,
            NOW() - (i || ' hours')::INTERVAL,
            CASE WHEN (i % 4) = 0 THEN '0x' || md5(i::TEXT) ELSE NULL END,
            'Test transaction ' || i
        FROM generate_series(1, 5000) i
        JOIN users u ON u.email = 'user' || ((i % 1000) + 1) || '@example.com';

        -- Insert test admin tasks
        INSERT INTO admin_tasks (subscription_id, task_type, due_date, assigned_admin, notes, priority, completed_at)
        SELECT
            s.id,
            CASE (i % 5)
                WHEN 0 THEN 'credential_provision'
                WHEN 1 THEN 'renewal'
                WHEN 2 THEN 'cancellation'
                WHEN 3 THEN 'support'
                ELSE 'verification'
            END,
            NOW() + (i || ' hours')::INTERVAL,
            CASE WHEN i % 3 = 0 THEN u.id ELSE NULL END,
            'Test task notes for task ' || i,
            CASE (i % 4)
                WHEN 0 THEN 'low'
                WHEN 1 THEN 'medium'
                WHEN 2 THEN 'high'
                ELSE 'urgent'
            END,
            CASE WHEN i % 5 = 0 THEN NOW() - (i/2 || ' hours')::INTERVAL ELSE NULL END
        FROM generate_series(1, 1500) i
        JOIN subscriptions s ON s.id = (SELECT id FROM subscriptions ORDER BY created_at LIMIT 1 OFFSET (i % (SELECT COUNT(*) FROM subscriptions)))
        LEFT JOIN users u ON u.email = 'user1@example.com';

        RAISE NOTICE 'Test data created successfully';
    END IF;
END $$;

-- Update statistics after data insertion
ANALYZE users;
ANALYZE subscriptions;
ANALYZE credits;
ANALYZE admin_tasks;

-- =====================================================
-- PERFORMANCE TEST SUITE
-- =====================================================

\echo ''
\echo '========================================='
\echo 'INDEX PERFORMANCE TESTING SUITE'
\echo '========================================='

-- Test 1: User Authentication Queries
\echo ''
\echo 'TEST 1: USER AUTHENTICATION'
\echo '----------------------------'

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, email, status, last_login
FROM users
WHERE email = 'user500@example.com';

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT COUNT(*)
FROM users
WHERE status = 'active';

-- Test 2: User Dashboard Queries
\echo ''
\echo 'TEST 2: USER DASHBOARD QUERIES'
\echo '-------------------------------'

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT s.id, s.service_type, s.service_plan, s.status, s.end_date, s.renewal_date
FROM subscriptions s
JOIN users u ON s.user_id = u.id
WHERE u.email = 'user100@example.com'
AND s.status IN ('active', 'pending')
ORDER BY s.end_date DESC;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
    s.service_type,
    COUNT(*) as total_subscriptions,
    COUNT(CASE WHEN s.status = 'active' THEN 1 END) as active_subscriptions
FROM subscriptions s
JOIN users u ON s.user_id = u.id
WHERE u.email = 'user100@example.com'
GROUP BY s.service_type;

-- Test 3: Service Filtering Queries
\echo ''
\echo 'TEST 3: SERVICE FILTERING'
\echo '-------------------------'

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT s.id, s.user_id, s.service_plan, s.start_date, s.end_date
FROM subscriptions s
WHERE s.service_type = 'spotify'
AND s.status = 'active'
ORDER BY s.created_at DESC
LIMIT 50;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
    service_type,
    service_plan,
    COUNT(*) as subscription_count,
    MIN(start_date) as earliest_start,
    MAX(end_date) as latest_end
FROM subscriptions
WHERE status = 'active'
GROUP BY service_type, service_plan
ORDER BY subscription_count DESC;

-- Test 4: Credit System Queries
\echo ''
\echo 'TEST 4: CREDIT SYSTEM QUERIES'
\echo '------------------------------'

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
    SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE 0 END) -
    SUM(CASE WHEN transaction_type = 'purchase' THEN amount ELSE 0 END) as balance
FROM credits c
JOIN users u ON c.user_id = u.id
WHERE u.email = 'user100@example.com';

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT c.id, c.amount, c.transaction_type, c.created_at, c.description
FROM credits c
JOIN users u ON c.user_id = u.id
WHERE u.email = 'user100@example.com'
ORDER BY c.created_at DESC
LIMIT 20;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT transaction_hash, amount, created_at
FROM credits
WHERE transaction_hash IS NOT NULL
AND transaction_type = 'deposit'
ORDER BY created_at DESC
LIMIT 100;

-- Test 5: Admin Panel Queries
\echo ''
\echo 'TEST 5: ADMIN PANEL QUERIES'
\echo '----------------------------'

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT at.id, at.task_type, at.due_date, at.priority, s.service_type
FROM admin_tasks at
JOIN subscriptions s ON at.subscription_id = s.id
WHERE at.status IN ('pending', 'assigned')
AND at.due_date <= NOW() + INTERVAL '7 days'
ORDER BY at.priority DESC, at.due_date ASC
LIMIT 50;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
    assigned_admin,
    COUNT(*) as task_count,
    COUNT(CASE WHEN completed_at IS NULL THEN 1 END) as pending_tasks,
    COUNT(CASE WHEN due_date < NOW() AND completed_at IS NULL THEN 1 END) as overdue_tasks
FROM admin_tasks
WHERE assigned_admin IS NOT NULL
GROUP BY assigned_admin
ORDER BY pending_tasks DESC;

-- Test 6: Date Range Queries
\echo ''
\echo 'TEST 6: DATE RANGE QUERIES'
\echo '---------------------------'

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT COUNT(*), DATE_TRUNC('day', created_at) as day
FROM users
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY day DESC;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT s.service_type, COUNT(*) as expired_count
FROM subscriptions s
WHERE s.end_date BETWEEN NOW() - INTERVAL '7 days' AND NOW()
AND s.status = 'active'
GROUP BY s.service_type;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT COUNT(*) as renewal_count
FROM subscriptions
WHERE status = 'active'
AND renewal_date BETWEEN NOW() AND NOW() + INTERVAL '30 days';

-- Test 7: JSONB Metadata Queries
\echo ''
\echo 'TEST 7: JSONB METADATA QUERIES'
\echo '-------------------------------'

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT COUNT(*)
FROM subscriptions
WHERE metadata->>'region' = 'US';

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT COUNT(*)
FROM subscriptions
WHERE metadata->>'payment_method' = 'crypto';

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
    metadata->>'region' as region,
    COUNT(*) as subscription_count
FROM subscriptions
WHERE metadata->>'region' IS NOT NULL
GROUP BY metadata->>'region'
ORDER BY subscription_count DESC;

-- Test 8: Complex JOIN Queries
\echo ''
\echo 'TEST 8: COMPLEX JOIN QUERIES'
\echo '-----------------------------'

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
    u.email,
    COUNT(s.id) as subscription_count,
    SUM(c.amount) as total_credits,
    MAX(s.end_date) as latest_expiry
FROM users u
LEFT JOIN subscriptions s ON u.id = s.user_id AND s.status = 'active'
LEFT JOIN credits c ON u.id = c.user_id AND c.transaction_type = 'deposit'
WHERE u.status = 'active'
GROUP BY u.id, u.email
HAVING COUNT(s.id) > 0
ORDER BY total_credits DESC NULLS LAST
LIMIT 20;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT
    s.service_type,
    s.service_plan,
    COUNT(DISTINCT s.user_id) as unique_users,
    COUNT(at.id) as admin_tasks,
    AVG(EXTRACT(EPOCH FROM (at.completed_at - at.created_at))/3600) as avg_completion_hours
FROM subscriptions s
LEFT JOIN admin_tasks at ON s.id = at.subscription_id
WHERE s.created_at >= NOW() - INTERVAL '90 days'
GROUP BY s.service_type, s.service_plan
ORDER BY unique_users DESC;

-- =====================================================
-- PERFORMANCE COMPARISON QUERIES
-- =====================================================

\echo ''
\echo '========================================='
\echo 'PERFORMANCE COMPARISON TESTS'
\echo '========================================='

-- Test index usage vs full table scan
\echo ''
\echo 'COMPARISON 1: Index vs Table Scan'
\echo '-----------------------------------'

-- Force table scan
SET enable_indexscan = off;
SET enable_bitmapscan = off;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT COUNT(*)
FROM users
WHERE status = 'active';

-- Enable indexes again
SET enable_indexscan = on;
SET enable_bitmapscan = on;

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT COUNT(*)
FROM users
WHERE status = 'active';

-- Test covering index performance
\echo ''
\echo 'COMPARISON 2: Covering Index Benefits'
\echo '-------------------------------------'

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT user_id, service_type, status, end_date
FROM subscriptions
WHERE status = 'active'
AND service_type = 'spotify'
ORDER BY end_date DESC
LIMIT 100;

-- =====================================================
-- INDEX USAGE STATISTICS
-- =====================================================

\echo ''
\echo '========================================='
\echo 'INDEX USAGE STATISTICS'
\echo '========================================='

SELECT
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch,
    idx_scan,
    CASE
        WHEN idx_scan = 0 THEN 'UNUSED'
        WHEN idx_scan < 10 THEN 'LOW USAGE'
        WHEN idx_scan < 100 THEN 'MODERATE USAGE'
        ELSE 'HIGH USAGE'
    END as usage_level
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- =====================================================
-- QUERY PERFORMANCE SUMMARY
-- =====================================================

\echo ''
\echo '========================================='
\echo 'PERFORMANCE TEST SUMMARY'
\echo '========================================='

-- Check which indexes are being used most
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as scans,
    pg_size_pretty(pg_relation_size(indexrelid)) as size,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
AND idx_scan > 0
ORDER BY idx_scan DESC;

-- Check for missing indexes (high sequential scans)
SELECT
    schemaname,
    tablename,
    seq_scan,
    seq_tup_read,
    idx_scan,
    CASE
        WHEN seq_scan > idx_scan THEN 'Consider adding indexes'
        ELSE 'Good index usage'
    END as recommendation
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY seq_scan DESC;

-- Clean up test function
DROP FUNCTION IF EXISTS time_query(TEXT, TEXT);

-- Reset settings
SET track_io_timing = off;
SET log_statement_stats = off;

\timing off

\echo ''
\echo 'Performance testing completed!'
\echo 'Review the EXPLAIN ANALYZE output above to:'
\echo '1. Verify indexes are being used (look for Index Scan, Bitmap Index Scan)'
\echo '2. Check execution times and buffer usage'
\echo '3. Identify any remaining Seq Scan operations that might benefit from indexes'
\echo '4. Monitor index usage statistics regularly'