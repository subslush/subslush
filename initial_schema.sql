-- =====================================================
-- Subscription Platform Database Schema
-- =====================================================
-- Description: Comprehensive PostgreSQL schema for a subscription upgrade platform
-- Version: 1.0
-- Created: 2025-09-19

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clean up existing tables (in reverse dependency order)
DROP TABLE IF EXISTS admin_tasks CASCADE;
DROP TABLE IF EXISTS credits CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- =====================================================
-- USERS TABLE
-- =====================================================
-- Stores user account information
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active' NOT NULL,

    -- Check constraints
    CONSTRAINT users_status_check CHECK (status IN ('active', 'inactive', 'suspended', 'deleted')),
    CONSTRAINT users_email_format_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Add table comment
COMMENT ON TABLE users IS 'Stores user account information and authentication status';
COMMENT ON COLUMN users.email IS 'Unique email address for user login';
COMMENT ON COLUMN users.status IS 'User account status: active, inactive, suspended, deleted';

-- =====================================================
-- SUBSCRIPTIONS TABLE
-- =====================================================
-- Stores subscription details for various services
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_type VARCHAR(50) NOT NULL,
    service_plan VARCHAR(50) NOT NULL,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    renewal_date TIMESTAMP NOT NULL,
    credentials_encrypted TEXT,
    status VARCHAR(20) DEFAULT 'active' NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),

    -- Check constraints
    CONSTRAINT subscriptions_service_type_check CHECK (service_type IN ('spotify', 'netflix', 'tradingview')),
    CONSTRAINT subscriptions_service_plan_check CHECK (service_plan IN ('premium', 'family', 'individual', 'basic', 'standard', 'pro')),
    CONSTRAINT subscriptions_status_check CHECK (status IN ('active', 'expired', 'cancelled', 'pending')),
    CONSTRAINT subscriptions_date_order_check CHECK (start_date <= end_date),
    CONSTRAINT subscriptions_renewal_check CHECK (renewal_date >= start_date)
);

-- Add table comment
COMMENT ON TABLE subscriptions IS 'Stores subscription details for streaming and trading services';
COMMENT ON COLUMN subscriptions.credentials_encrypted IS 'Encrypted login credentials provided by admin';
COMMENT ON COLUMN subscriptions.metadata IS 'Service-specific configuration and settings in JSON format';

-- =====================================================
-- CREDITS TABLE
-- =====================================================
-- Tracks user credit transactions and cryptocurrency deposits
CREATE TABLE credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL,
    transaction_hash VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    description TEXT,

    -- Check constraints
    CONSTRAINT credits_amount_positive_check CHECK (amount > 0),
    CONSTRAINT credits_transaction_type_check CHECK (transaction_type IN ('deposit', 'purchase', 'refund', 'bonus', 'withdrawal'))
);

-- Add table comment
COMMENT ON TABLE credits IS 'Tracks all credit transactions including crypto deposits and subscription purchases';
COMMENT ON COLUMN credits.transaction_hash IS 'Blockchain transaction hash for cryptocurrency deposits';
COMMENT ON COLUMN credits.amount IS 'Transaction amount in USD (positive values only)';

-- =====================================================
-- ADMIN_TASKS TABLE
-- =====================================================
-- Manages manual administrative tasks for subscription management
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

    -- Check constraints
    CONSTRAINT admin_tasks_type_check CHECK (task_type IN ('credential_provision', 'renewal', 'cancellation', 'support', 'verification')),
    CONSTRAINT admin_tasks_priority_check CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    CONSTRAINT admin_tasks_completion_check CHECK (completed_at IS NULL OR completed_at >= created_at)
);

-- Add table comment
COMMENT ON TABLE admin_tasks IS 'Manages manual administrative tasks requiring human intervention';
COMMENT ON COLUMN admin_tasks.assigned_admin IS 'Admin user responsible for completing the task';
COMMENT ON COLUMN admin_tasks.priority IS 'Task priority level for queue management';

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Users table indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Subscriptions table indexes
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_service_type ON subscriptions(service_type);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_renewal_date ON subscriptions(renewal_date);
CREATE INDEX idx_subscriptions_end_date ON subscriptions(end_date);
CREATE INDEX idx_subscriptions_service_plan ON subscriptions(service_type, service_plan);

-- Credits table indexes
CREATE INDEX idx_credits_user_id ON credits(user_id);
CREATE INDEX idx_credits_transaction_type ON credits(transaction_type);
CREATE INDEX idx_credits_created_at ON credits(created_at);
CREATE INDEX idx_credits_transaction_hash ON credits(transaction_hash) WHERE transaction_hash IS NOT NULL;

-- Admin tasks table indexes
CREATE INDEX idx_admin_tasks_subscription_id ON admin_tasks(subscription_id);
CREATE INDEX idx_admin_tasks_assigned_admin ON admin_tasks(assigned_admin);
CREATE INDEX idx_admin_tasks_due_date ON admin_tasks(due_date);
CREATE INDEX idx_admin_tasks_task_type ON admin_tasks(task_type);
CREATE INDEX idx_admin_tasks_priority ON admin_tasks(priority);
CREATE INDEX idx_admin_tasks_incomplete ON admin_tasks(due_date) WHERE completed_at IS NULL;

-- =====================================================
-- SAMPLE DATA FOR TESTING
-- =====================================================

-- Insert sample users
INSERT INTO users (email, status) VALUES
    ('john.doe@example.com', 'active'),
    ('jane.smith@example.com', 'active'),
    ('admin@subscriptionplatform.com', 'active'),
    ('mike.jones@example.com', 'inactive');

-- Insert sample subscriptions
INSERT INTO subscriptions (user_id, service_type, service_plan, start_date, end_date, renewal_date, status, metadata) VALUES
    ((SELECT id FROM users WHERE email = 'john.doe@example.com'), 'spotify', 'premium', '2025-01-01', '2025-12-31', '2025-12-15', 'active', '{"region": "US", "payment_method": "crypto"}'),
    ((SELECT id FROM users WHERE email = 'jane.smith@example.com'), 'netflix', 'family', '2025-02-01', '2026-01-31', '2026-01-15', 'active', '{"region": "US", "screens": 4}'),
    ((SELECT id FROM users WHERE email = 'john.doe@example.com'), 'tradingview', 'pro', '2025-03-01', '2025-09-01', '2025-08-15', 'expired', '{"charts": "unlimited", "alerts": 1000}');

-- Insert sample credit transactions
INSERT INTO credits (user_id, amount, transaction_type, transaction_hash, description) VALUES
    ((SELECT id FROM users WHERE email = 'john.doe@example.com'), 50.00, 'deposit', '0x1234567890abcdef', 'Bitcoin deposit'),
    ((SELECT id FROM users WHERE email = 'john.doe@example.com'), 9.99, 'purchase', NULL, 'Spotify Premium subscription'),
    ((SELECT id FROM users WHERE email = 'jane.smith@example.com'), 100.00, 'deposit', '0xabcdef1234567890', 'Ethereum deposit'),
    ((SELECT id FROM users WHERE email = 'jane.smith@example.com'), 15.99, 'purchase', NULL, 'Netflix Family subscription');

-- Insert sample admin tasks
INSERT INTO admin_tasks (subscription_id, task_type, due_date, assigned_admin, notes, priority) VALUES
    ((SELECT id FROM subscriptions WHERE service_type = 'spotify' LIMIT 1), 'credential_provision', NOW() + INTERVAL '1 day', (SELECT id FROM users WHERE email = 'admin@subscriptionplatform.com'), 'Provide Spotify Premium credentials to new user', 'high'),
    ((SELECT id FROM subscriptions WHERE service_type = 'netflix' LIMIT 1), 'renewal', NOW() + INTERVAL '30 days', (SELECT id FROM users WHERE email = 'admin@subscriptionplatform.com'), 'Netflix family plan renewal due', 'medium'),
    ((SELECT id FROM subscriptions WHERE service_type = 'tradingview' LIMIT 1), 'cancellation', NOW() + INTERVAL '7 days', NULL, 'Process cancellation for expired TradingView subscription', 'low');

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify table creation and data insertion
SELECT 'Users created:' as info, COUNT(*) as count FROM users
UNION ALL
SELECT 'Subscriptions created:', COUNT(*) FROM subscriptions
UNION ALL
SELECT 'Credits created:', COUNT(*) FROM credits
UNION ALL
SELECT 'Admin tasks created:', COUNT(*) FROM admin_tasks;

-- Display sample data relationships
SELECT
    u.email,
    s.service_type,
    s.service_plan,
    s.status as subscription_status,
    s.renewal_date
FROM users u
JOIN subscriptions s ON u.id = s.user_id
ORDER BY u.email;

COMMIT;

-- Schema creation completed successfully
SELECT 'Database schema created successfully!' as result;