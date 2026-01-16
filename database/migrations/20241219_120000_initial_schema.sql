-- Migration: Initial Schema Setup
-- Created: 2024-12-19T12:00:00.000Z
-- Description: Create the foundational database schema for subscription platform

-- Up Migration
BEGIN;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- USERS TABLE
-- =====================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_login TIMESTAMP,
    status TEXT DEFAULT 'active',

    -- Constraints
    CONSTRAINT users_status_check CHECK (status IN ('active', 'inactive', 'suspended', 'deleted')),
    CONSTRAINT users_email_format_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Add table comments
COMMENT ON TABLE users IS 'User account information and authentication status';
COMMENT ON COLUMN users.email IS 'Unique email address for user login';
COMMENT ON COLUMN users.status IS 'User account status: active, inactive, suspended, deleted';

-- =====================================================
-- SUBSCRIPTIONS TABLE
-- =====================================================
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_type TEXT NOT NULL,
    service_plan TEXT NOT NULL,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    renewal_date TIMESTAMP,
    credentials_encrypted TEXT,
    status TEXT DEFAULT 'active' NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT subscriptions_service_type_check CHECK (service_type IN ('spotify', 'netflix', 'tradingview')),
    CONSTRAINT subscriptions_service_plan_check CHECK (service_plan IN ('premium', 'family', 'individual', 'basic', 'standard', 'pro')),
    CONSTRAINT subscriptions_status_check CHECK (status IN ('active', 'expired', 'cancelled', 'pending')),
    CONSTRAINT subscriptions_date_order_check CHECK (start_date <= end_date),
    CONSTRAINT subscriptions_renewal_check CHECK (renewal_date >= start_date)
);

-- Add table comments
COMMENT ON TABLE subscriptions IS 'Subscription details for streaming and trading services';
COMMENT ON COLUMN subscriptions.credentials_encrypted IS 'Encrypted login credentials provided by admin';
COMMENT ON COLUMN subscriptions.metadata IS 'Service-specific configuration and settings in JSON format';

-- =====================================================
-- CREDITS TABLE
-- =====================================================
CREATE TABLE credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL,
    transaction_hash VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    description TEXT,

    -- Constraints
    CONSTRAINT credits_amount_positive_check CHECK (amount > 0),
    CONSTRAINT credits_transaction_type_check CHECK (transaction_type IN ('deposit', 'purchase', 'refund', 'bonus', 'withdrawal'))
);

-- Add table comments
COMMENT ON TABLE credits IS 'Credit transactions including crypto deposits and subscription purchases';
COMMENT ON COLUMN credits.transaction_hash IS 'Blockchain transaction hash for cryptocurrency deposits';
COMMENT ON COLUMN credits.amount IS 'Transaction amount in USD (positive values only)';

-- =====================================================
-- ADMIN_TASKS TABLE
-- =====================================================
CREATE TABLE admin_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    task_type VARCHAR(50) NOT NULL,
    due_date TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    assigned_admin UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    priority VARCHAR(10) DEFAULT 'medium',
    created_at TIMESTAMP DEFAULT NOW(),

    -- Constraints
    CONSTRAINT admin_tasks_type_check CHECK (task_type IN ('credential_provision', 'renewal', 'cancellation', 'support', 'verification', 'manual_monthly_upgrade')),
    CONSTRAINT admin_tasks_priority_check CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    CONSTRAINT admin_tasks_completion_check CHECK (completed_at IS NULL OR completed_at >= created_at)
);

-- Add table comments
COMMENT ON TABLE admin_tasks IS 'Manual administrative tasks requiring human intervention';
COMMENT ON COLUMN admin_tasks.assigned_admin IS 'Admin user responsible for completing the task';
COMMENT ON COLUMN admin_tasks.priority IS 'Task priority level for queue management';

-- =====================================================
-- BASIC INDEXES
-- =====================================================

-- Users table indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Subscriptions table indexes
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_service_type ON subscriptions(service_type);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- Credits table indexes
CREATE INDEX idx_credits_user_id ON credits(user_id);
CREATE INDEX idx_credits_transaction_type ON credits(transaction_type);
CREATE INDEX idx_credits_created_at ON credits(created_at);

-- Admin tasks table indexes
CREATE INDEX idx_admin_tasks_subscription_id ON admin_tasks(subscription_id);
CREATE INDEX idx_admin_tasks_assigned_admin ON admin_tasks(assigned_admin);
CREATE INDEX idx_admin_tasks_due_date ON admin_tasks(due_date);

COMMIT;

-- Down Migration
BEGIN;

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS admin_tasks CASCADE;
DROP TABLE IF EXISTS credits CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop extensions (optional - be careful in production)
-- DROP EXTENSION IF EXISTS "pgcrypto";

COMMIT;
