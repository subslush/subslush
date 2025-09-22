-- Migration: Add Performance Indexes
-- Created: 2024-12-19T12:00:01.000Z
-- Description: Add additional indexes for query performance optimization

-- Up Migration
BEGIN;

-- =====================================================
-- SUBSCRIPTION PERFORMANCE INDEXES
-- =====================================================

-- Composite indexes for common query patterns
CREATE INDEX idx_subscriptions_user_service ON subscriptions(user_id, service_type);
CREATE INDEX idx_subscriptions_service_plan ON subscriptions(service_type, service_plan);
CREATE INDEX idx_subscriptions_renewal_date ON subscriptions(renewal_date);
CREATE INDEX idx_subscriptions_end_date ON subscriptions(end_date);

-- Partial indexes for active subscriptions (most common queries)
CREATE INDEX idx_subscriptions_active_user ON subscriptions(user_id)
WHERE status = 'active';

CREATE INDEX idx_subscriptions_active_service ON subscriptions(service_type)
WHERE status = 'active';

-- Index for subscription expiration monitoring
CREATE INDEX idx_subscriptions_expiring ON subscriptions(end_date)
WHERE status = 'active' AND end_date > NOW();

-- =====================================================
-- CREDITS PERFORMANCE INDEXES
-- =====================================================

-- Composite index for user transaction history
CREATE INDEX idx_credits_user_date ON credits(user_id, created_at DESC);

-- Index for transaction hash lookups (crypto transactions)
CREATE INDEX idx_credits_transaction_hash ON credits(transaction_hash)
WHERE transaction_hash IS NOT NULL;

-- Partial indexes for different transaction types
CREATE INDEX idx_credits_deposits ON credits(user_id, created_at DESC)
WHERE transaction_type = 'deposit';

CREATE INDEX idx_credits_purchases ON credits(user_id, created_at DESC)
WHERE transaction_type = 'purchase';

-- =====================================================
-- ADMIN TASKS PERFORMANCE INDEXES
-- =====================================================

-- Composite indexes for task management
CREATE INDEX idx_admin_tasks_type_priority ON admin_tasks(task_type, priority);
CREATE INDEX idx_admin_tasks_assigned_due ON admin_tasks(assigned_admin, due_date);

-- Partial index for incomplete tasks (most important for admins)
CREATE INDEX idx_admin_tasks_incomplete ON admin_tasks(due_date, priority)
WHERE completed_at IS NULL;

-- Index for overdue tasks
CREATE INDEX idx_admin_tasks_overdue ON admin_tasks(due_date)
WHERE completed_at IS NULL AND due_date < NOW();

-- =====================================================
-- USERS PERFORMANCE INDEXES
-- =====================================================

-- Index for user activity tracking
CREATE INDEX idx_users_last_login ON users(last_login DESC)
WHERE last_login IS NOT NULL;

-- Partial index for active users
CREATE INDEX idx_users_active ON users(created_at DESC)
WHERE status = 'active';

-- =====================================================
-- JSONB PERFORMANCE INDEXES (METADATA)
-- =====================================================

-- GIN index for subscription metadata searches
CREATE INDEX idx_subscriptions_metadata_gin ON subscriptions USING GIN (metadata);

-- Specific indexes for common metadata queries
CREATE INDEX idx_subscriptions_region ON subscriptions((metadata->>'region'))
WHERE metadata->>'region' IS NOT NULL;

CREATE INDEX idx_subscriptions_payment_method ON subscriptions((metadata->>'payment_method'))
WHERE metadata->>'payment_method' IS NOT NULL;

-- =====================================================
-- ADDITIONAL PERFORMANCE OPTIMIZATIONS
-- =====================================================

-- Index for user subscription count queries
CREATE INDEX idx_subscriptions_user_count ON subscriptions(user_id)
WHERE status IN ('active', 'pending');

-- Index for revenue analysis
CREATE INDEX idx_credits_amount_date ON credits(created_at, amount)
WHERE transaction_type = 'purchase';

-- Index for admin workload analysis
CREATE INDEX idx_admin_tasks_completion_stats ON admin_tasks(task_type, completed_at, created_at);

-- =====================================================
-- STATISTICS UPDATE
-- =====================================================

-- Update table statistics for better query planning
ANALYZE users;
ANALYZE subscriptions;
ANALYZE credits;
ANALYZE admin_tasks;

COMMIT;

-- Down Migration
BEGIN;

-- Drop all the indexes created in this migration
-- Note: We don't need to drop indexes created in the initial schema

-- Subscription indexes
DROP INDEX IF EXISTS idx_subscriptions_user_service;
DROP INDEX IF EXISTS idx_subscriptions_service_plan;
DROP INDEX IF EXISTS idx_subscriptions_renewal_date;
DROP INDEX IF EXISTS idx_subscriptions_end_date;
DROP INDEX IF EXISTS idx_subscriptions_active_user;
DROP INDEX IF EXISTS idx_subscriptions_active_service;
DROP INDEX IF EXISTS idx_subscriptions_expiring;

-- Credits indexes
DROP INDEX IF EXISTS idx_credits_user_date;
DROP INDEX IF EXISTS idx_credits_transaction_hash;
DROP INDEX IF EXISTS idx_credits_deposits;
DROP INDEX IF EXISTS idx_credits_purchases;

-- Admin tasks indexes
DROP INDEX IF EXISTS idx_admin_tasks_type_priority;
DROP INDEX IF EXISTS idx_admin_tasks_assigned_due;
DROP INDEX IF EXISTS idx_admin_tasks_incomplete;
DROP INDEX IF EXISTS idx_admin_tasks_overdue;

-- Users indexes
DROP INDEX IF EXISTS idx_users_last_login;
DROP INDEX IF EXISTS idx_users_active;

-- JSONB indexes
DROP INDEX IF EXISTS idx_subscriptions_metadata_gin;
DROP INDEX IF EXISTS idx_subscriptions_region;
DROP INDEX IF EXISTS idx_subscriptions_payment_method;

-- Additional performance indexes
DROP INDEX IF EXISTS idx_subscriptions_user_count;
DROP INDEX IF EXISTS idx_credits_amount_date;
DROP INDEX IF EXISTS idx_admin_tasks_completion_stats;

COMMIT;