-- =====================================================
-- Comprehensive Performance Indexes
-- =====================================================
-- Description: Optimized indexes for subscription platform handling 300-600 concurrent users
-- Database: subscription_platform
-- PostgreSQL Version: 16
-- Created: 2024-12-19

-- Enable timing to monitor index creation performance
\timing on

-- Start transaction for atomic index creation
BEGIN;

-- =====================================================
-- USERS TABLE INDEXES
-- =====================================================

-- Primary authentication index (verify existing unique index)
-- This should already exist from initial schema, but we'll ensure it's optimized
-- Note: UNIQUE indexes are automatically created for UNIQUE constraints

-- Active users partial index for common queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_active_status
ON users(created_at DESC)
WHERE status = 'active'
INCLUDE (email, last_login);
COMMENT ON INDEX idx_users_active_status IS 'Optimized for active user queries with user details';

-- Last login tracking for user activity analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_last_login_activity
ON users(last_login DESC NULLS LAST)
WHERE last_login IS NOT NULL AND status = 'active';
COMMENT ON INDEX idx_users_last_login_activity IS 'Track active user login patterns for analytics';

-- User status distribution index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_status_created
ON users(status, created_at DESC);
COMMENT ON INDEX idx_users_status_created IS 'Admin queries for user management by status and registration date';

-- =====================================================
-- SUBSCRIPTIONS TABLE INDEXES
-- =====================================================

-- Core user dashboard index - most frequently used
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_user_dashboard
ON subscriptions(user_id, status, end_date DESC)
WHERE status IN ('active', 'pending')
INCLUDE (service_type, service_plan, renewal_date);
COMMENT ON INDEX idx_subscriptions_user_dashboard IS 'Primary index for user dashboard subscription display';

-- Service filtering for admin panel
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_service_admin
ON subscriptions(service_type, status, created_at DESC)
INCLUDE (user_id, service_plan, end_date);
COMMENT ON INDEX idx_subscriptions_service_admin IS 'Admin filtering by service type and status';

-- Active subscriptions by service (covering index)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_active_service
ON subscriptions(service_type, service_plan)
WHERE status = 'active'
INCLUDE (user_id, start_date, end_date, renewal_date);
COMMENT ON INDEX idx_subscriptions_active_service IS 'Covering index for active subscription queries by service';

-- Expiry monitoring and renewal processing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_expiry_monitoring
ON subscriptions(status, end_date)
WHERE status = 'active' AND end_date > NOW();
COMMENT ON INDEX idx_subscriptions_expiry_monitoring IS 'Monitor subscriptions approaching expiry';

-- Renewal processing queue
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_renewal_queue
ON subscriptions(renewal_date, status)
WHERE status = 'active' AND renewal_date <= (NOW() + INTERVAL '30 days');
COMMENT ON INDEX idx_subscriptions_renewal_queue IS 'Process upcoming renewals within 30 days';

-- User subscription count optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_user_count
ON subscriptions(user_id)
WHERE status IN ('active', 'pending')
INCLUDE (service_type);
COMMENT ON INDEX idx_subscriptions_user_count IS 'Count active subscriptions per user efficiently';

-- Revenue analysis by service and time
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_revenue_analysis
ON subscriptions(service_type, created_at, status)
INCLUDE (service_plan);
COMMENT ON INDEX idx_subscriptions_revenue_analysis IS 'Revenue reporting by service over time';

-- Recently created subscriptions for analytics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_recent_activity
ON subscriptions(created_at DESC, status)
WHERE created_at >= (NOW() - INTERVAL '90 days');
COMMENT ON INDEX idx_subscriptions_recent_activity IS 'Recent subscription activity for trend analysis';

-- =====================================================
-- SUBSCRIPTIONS METADATA JSONB INDEXES
-- =====================================================

-- GIN index for flexible metadata searches
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_metadata_gin
ON subscriptions USING GIN (metadata);
COMMENT ON INDEX idx_subscriptions_metadata_gin IS 'Full-text search capabilities for subscription metadata';

-- Specific metadata fields for common queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_region
ON subscriptions((metadata->>'region'))
WHERE metadata->>'region' IS NOT NULL;
COMMENT ON INDEX idx_subscriptions_region IS 'Regional subscription distribution analysis';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_payment_method
ON subscriptions((metadata->>'payment_method'))
WHERE metadata->>'payment_method' IS NOT NULL;
COMMENT ON INDEX idx_subscriptions_payment_method IS 'Payment method tracking for billing optimization';

-- =====================================================
-- CREDITS TABLE INDEXES
-- =====================================================

-- Primary user credit history index (covering)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_credits_user_history
ON credits(user_id, created_at DESC)
INCLUDE (amount, transaction_type, transaction_hash, description);
COMMENT ON INDEX idx_credits_user_history IS 'Complete user transaction history with details';

-- User balance calculation optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_credits_user_balance
ON credits(user_id, transaction_type, created_at DESC);
COMMENT ON INDEX idx_credits_user_balance IS 'Efficient user balance calculations by transaction type';

-- Transaction type analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_credits_transaction_analysis
ON credits(transaction_type, created_at DESC, amount)
WHERE amount > 0;
COMMENT ON INDEX idx_credits_transaction_analysis IS 'Revenue analysis by transaction type over time';

-- Cryptocurrency transaction tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_credits_crypto_transactions
ON credits(transaction_hash, created_at DESC)
WHERE transaction_hash IS NOT NULL
INCLUDE (user_id, amount, transaction_type);
COMMENT ON INDEX idx_credits_crypto_transactions IS 'Track and verify cryptocurrency deposits';

-- High-value transaction monitoring
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_credits_high_value
ON credits(amount DESC, created_at DESC)
WHERE amount >= 100.00
INCLUDE (user_id, transaction_type, transaction_hash);
COMMENT ON INDEX idx_credits_high_value IS 'Monitor high-value transactions for compliance';

-- Recent transactions for real-time monitoring
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_credits_recent_activity
ON credits(created_at DESC, transaction_type)
WHERE created_at >= (NOW() - INTERVAL '24 hours');
COMMENT ON INDEX idx_credits_recent_activity IS 'Real-time transaction monitoring dashboard';

-- User deposit patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_credits_deposits
ON credits(user_id, created_at DESC)
WHERE transaction_type = 'deposit'
INCLUDE (amount, transaction_hash);
COMMENT ON INDEX idx_credits_deposits IS 'User deposit history and patterns';

-- Purchase transaction optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_credits_purchases
ON credits(user_id, created_at DESC)
WHERE transaction_type = 'purchase'
INCLUDE (amount, description);
COMMENT ON INDEX idx_credits_purchases IS 'User purchase history for subscription correlation';

-- =====================================================
-- ADMIN_TASKS TABLE INDEXES
-- =====================================================

-- Primary task management index (covering)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_tasks_management
ON admin_tasks(status, due_date, priority)
INCLUDE (id, subscription_id, task_type, assigned_admin, notes);
COMMENT ON INDEX idx_admin_tasks_management IS 'Comprehensive task management dashboard index';

-- Admin workload distribution
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_tasks_workload
ON admin_tasks(assigned_admin, status, due_date)
WHERE assigned_admin IS NOT NULL
INCLUDE (task_type, priority, subscription_id);
COMMENT ON INDEX idx_admin_tasks_workload IS 'Admin workload tracking and balance';

-- Incomplete tasks priority queue
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_tasks_priority_queue
ON admin_tasks(priority, due_date, created_at)
WHERE completed_at IS NULL
INCLUDE (task_type, assigned_admin, subscription_id);
COMMENT ON INDEX idx_admin_tasks_priority_queue IS 'Prioritized queue of incomplete tasks';

-- Overdue tasks critical monitoring
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_tasks_overdue
ON admin_tasks(due_date, priority DESC)
WHERE completed_at IS NULL AND due_date < NOW()
INCLUDE (task_type, assigned_admin, subscription_id, notes);
COMMENT ON INDEX idx_admin_tasks_overdue IS 'Critical monitoring of overdue tasks';

-- Task completion performance metrics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_tasks_completion_metrics
ON admin_tasks(task_type, completed_at, created_at)
WHERE completed_at IS NOT NULL
INCLUDE (assigned_admin, priority);
COMMENT ON INDEX idx_admin_tasks_completion_metrics IS 'Task completion time analysis';

-- Subscription-related task tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_tasks_subscription
ON admin_tasks(subscription_id, status, created_at DESC)
INCLUDE (task_type, due_date, assigned_admin);
COMMENT ON INDEX idx_admin_tasks_subscription IS 'Track all tasks related to specific subscriptions';

-- Recent task activity monitoring
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_tasks_recent_activity
ON admin_tasks(created_at DESC, status)
WHERE created_at >= (NOW() - INTERVAL '7 days')
INCLUDE (task_type, priority, assigned_admin);
COMMENT ON INDEX idx_admin_tasks_recent_activity IS 'Monitor recent task creation and assignment patterns';

-- Task type distribution analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_tasks_type_analysis
ON admin_tasks(task_type, created_at, status)
INCLUDE (priority, assigned_admin);
COMMENT ON INDEX idx_admin_tasks_type_analysis IS 'Analyze task distribution by type over time';

-- =====================================================
-- CROSS-TABLE RELATIONSHIP INDEXES
-- =====================================================

-- User-subscription relationship optimization
-- (Note: Foreign key indexes are automatically created, but we optimize them)

-- Enhanced foreign key index for subscription -> user relationship
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_user_enhanced
ON subscriptions(user_id)
INCLUDE (service_type, status, created_at);
COMMENT ON INDEX idx_subscriptions_user_enhanced IS 'Enhanced foreign key index with commonly selected columns';

-- Enhanced foreign key index for admin_tasks -> subscription relationship
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_tasks_subscription_enhanced
ON admin_tasks(subscription_id)
INCLUDE (status, task_type, due_date);
COMMENT ON INDEX idx_admin_tasks_subscription_enhanced IS 'Enhanced foreign key index for task-subscription relationship';

-- Enhanced foreign key index for credits -> user relationship
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_credits_user_enhanced
ON credits(user_id)
INCLUDE (transaction_type, amount, created_at);
COMMENT ON INDEX idx_credits_user_enhanced IS 'Enhanced foreign key index for user-credit relationship';

-- =====================================================
-- SPECIALIZED REPORTING INDEXES
-- =====================================================

-- Monthly revenue reporting
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reporting_monthly_revenue
ON credits(DATE_TRUNC('month', created_at), transaction_type)
WHERE transaction_type = 'purchase'
INCLUDE (amount, user_id);
COMMENT ON INDEX idx_reporting_monthly_revenue IS 'Efficient monthly revenue aggregation';

-- Service popularity tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reporting_service_popularity
ON subscriptions(service_type, DATE_TRUNC('month', created_at), status)
WHERE status = 'active'
INCLUDE (service_plan, user_id);
COMMENT ON INDEX idx_reporting_service_popularity IS 'Track service adoption trends over time';

-- User lifecycle analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reporting_user_lifecycle
ON users(DATE_TRUNC('week', created_at), status)
INCLUDE (email, last_login);
COMMENT ON INDEX idx_reporting_user_lifecycle IS 'Weekly user registration and retention analysis';

-- Admin performance metrics
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reporting_admin_performance
ON admin_tasks(assigned_admin, DATE_TRUNC('day', completed_at))
WHERE completed_at IS NOT NULL
INCLUDE (task_type, created_at, priority);
COMMENT ON INDEX idx_reporting_admin_performance IS 'Daily admin task completion performance';

-- =====================================================
-- MAINTENANCE AND MONITORING INDEXES
-- =====================================================

-- Index for monitoring table sizes and growth
-- This will help with capacity planning
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_maintenance_table_activity
ON subscriptions(created_at)
WHERE created_at >= (NOW() - INTERVAL '1 year');
COMMENT ON INDEX idx_maintenance_table_activity IS 'Monitor table growth patterns for capacity planning';

-- =====================================================
-- UPDATE TABLE STATISTICS
-- =====================================================

-- Update table statistics for better query planning
-- This should be done after index creation
ANALYZE users;
ANALYZE subscriptions;
ANALYZE credits;
ANALYZE admin_tasks;

-- =====================================================
-- INDEX CREATION SUMMARY
-- =====================================================

-- Log index creation completion
DO $$
DECLARE
    index_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE schemaname = 'public'
    AND tablename IN ('users', 'subscriptions', 'credits', 'admin_tasks');

    RAISE NOTICE 'Performance index creation completed. Total indexes: %', index_count;
    RAISE NOTICE 'Remember to monitor index usage with pg_stat_user_indexes';
    RAISE NOTICE 'Run VACUUM ANALYZE periodically to maintain optimal performance';
END $$;

COMMIT;

-- =====================================================
-- POST-CREATION RECOMMENDATIONS
-- =====================================================

-- Verify index creation
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('users', 'subscriptions', 'credits', 'admin_tasks')
ORDER BY tablename, indexname;

-- Check index sizes
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;

-- Disable timing
\timing off

-- Final recommendations
\echo 'Performance indexes created successfully!'
\echo 'Next steps:'
\echo '1. Monitor index usage with monitor_indexes.sql'
\echo '2. Run performance tests with test_index_performance.sql'
\echo '3. Set up regular VACUUM ANALYZE maintenance'
\echo '4. Monitor index bloat and usage statistics'