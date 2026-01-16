-- Migration: Supabase schema alignment
-- Created: 2026-01-19T12:00:00.000Z
-- Description: Add missing tables/columns/indexes/constraints for marketplace schema alignment.

-- Up Migration
BEGIN;

-- =====================================================
-- MISSING COLUMNS
-- =====================================================

ALTER TABLE admin_tasks
  ADD COLUMN IF NOT EXISTS mmu_cycle_index INTEGER,
  ADD COLUMN IF NOT EXISTS mmu_cycle_total INTEGER;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS credentials_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS term_start_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW();

-- Backfill term_start_at where possible (same logic as migration)
UPDATE subscriptions
SET term_start_at = CASE
  WHEN term_start_at IS NOT NULL THEN term_start_at
  WHEN term_months IS NOT NULL AND term_months > 0 THEN end_date - (term_months || ' months')::interval
  ELSE start_date
END
WHERE term_start_at IS NULL;

-- Ensure updated_at is populated
UPDATE subscriptions
SET updated_at = COALESCE(updated_at, created_at, NOW());

-- Ensure UUID defaults align with local schema
ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE subscriptions ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- =====================================================
-- MISSING TABLES
-- =====================================================

CREATE TABLE IF NOT EXISTS subscription_upgrade_selections (
    subscription_id UUID PRIMARY KEY REFERENCES subscriptions(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    selection_type VARCHAR(50),
    account_identifier TEXT,
    credentials_encrypted TEXT,
    manual_monthly_acknowledged_at TIMESTAMP,
    submitted_at TIMESTAMP,
    locked_at TIMESTAMP,
    reminder_24h_at TIMESTAMP,
    reminder_48h_at TIMESTAMP,
    auto_selected_at TIMESTAMP,
    upgrade_options_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT subscription_upgrade_selections_type_check CHECK (
      selection_type IS NULL OR selection_type IN ('upgrade_new_account', 'upgrade_own_account')
    )
);

CREATE INDEX IF NOT EXISTS idx_upgrade_selections_order_id
  ON subscription_upgrade_selections(order_id);
CREATE INDEX IF NOT EXISTS idx_upgrade_selections_submitted_at
  ON subscription_upgrade_selections(submitted_at);
CREATE INDEX IF NOT EXISTS idx_upgrade_selections_locked_at
  ON subscription_upgrade_selections(locked_at);

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
    metadata JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE payment_refunds DROP CONSTRAINT IF EXISTS payment_refunds_reason_check;
ALTER TABLE payment_refunds ADD CONSTRAINT payment_refunds_reason_check
    CHECK (reason IN ('user_request', 'payment_error', 'service_issue', 'overpayment', 'admin_decision', 'dispute'));

ALTER TABLE payment_refunds DROP CONSTRAINT IF EXISTS payment_refunds_status_check;
ALTER TABLE payment_refunds ADD CONSTRAINT payment_refunds_status_check
    CHECK (status IN ('pending', 'approved', 'processing', 'completed', 'failed', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment_id ON payment_refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_user_id ON payment_refunds(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_status ON payment_refunds(status);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_created_at ON payment_refunds(created_at);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_approved_by ON payment_refunds(approved_by);

-- =====================================================
-- FUNCTIONS + TRIGGERS
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_payment_refunds_updated_at ON payment_refunds;
CREATE TRIGGER update_payment_refunds_updated_at
  BEFORE UPDATE ON payment_refunds
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION subscriptions_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subscriptions_set_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_set_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION subscriptions_set_updated_at();

-- =====================================================
-- MISSING VIEWS
-- =====================================================

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

GRANT SELECT ON payment_monitoring_dashboard TO PUBLIC;
GRANT SELECT ON refund_management_dashboard TO PUBLIC;

-- =====================================================
-- MISSING CONSTRAINTS (SAFE ADD + CONDITIONAL VALIDATION)
-- =====================================================

ALTER TABLE admin_tasks DROP CONSTRAINT IF EXISTS admin_tasks_type_check;
ALTER TABLE admin_tasks ADD CONSTRAINT admin_tasks_type_check CHECK (
  task_type IN (
    'credential_provision',
    'renewal',
    'cancellation',
    'support',
    'verification',
    'manual_monthly_upgrade'
  )
) NOT VALID;

ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_amount_sign_check;
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_amount_sign_check
  CHECK (
    (type IN ('deposit', 'bonus', 'refund') AND amount >= 0)
    OR (type IN ('purchase', 'withdrawal', 'refund_reversal') AND amount <= 0)
  ) NOT VALID;

ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_purchase_amount_check;
ALTER TABLE referrals ADD CONSTRAINT referrals_purchase_amount_check
  CHECK (purchase_amount >= 0) NOT VALID;

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_date_order_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_date_order_check
  CHECK (start_date <= end_date) NOT VALID;

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_renewal_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_renewal_check
  CHECK (renewal_date >= start_date) NOT VALID;

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'expired', 'cancelled', 'pending')) NOT VALID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_user_id_fkey'
  ) THEN
    ALTER TABLE subscriptions
      ADD CONSTRAINT subscriptions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_format_check;
ALTER TABLE users ADD CONSTRAINT users_email_format_check
  CHECK (email ~* E'^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$') NOT VALID;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;
ALTER TABLE users ADD CONSTRAINT users_status_check
  CHECK (status IN ('active', 'inactive', 'suspended', 'deleted')) NOT VALID;

-- Validate constraints only when no violations exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_tasks_type_check' AND NOT convalidated
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM admin_tasks
      WHERE task_type NOT IN (
        'credential_provision',
        'renewal',
        'cancellation',
        'support',
        'verification',
        'manual_monthly_upgrade'
      )
    ) THEN
      ALTER TABLE admin_tasks VALIDATE CONSTRAINT admin_tasks_type_check;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'credit_transactions_amount_sign_check' AND NOT convalidated
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM credit_transactions
      WHERE NOT (
        (type IN ('deposit', 'bonus', 'refund') AND amount >= 0)
        OR (type IN ('purchase', 'withdrawal', 'refund_reversal') AND amount <= 0)
      )
    ) THEN
      ALTER TABLE credit_transactions VALIDATE CONSTRAINT credit_transactions_amount_sign_check;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'referrals_purchase_amount_check' AND NOT convalidated
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM referrals WHERE purchase_amount < 0
    ) THEN
      ALTER TABLE referrals VALIDATE CONSTRAINT referrals_purchase_amount_check;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_date_order_check' AND NOT convalidated
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM subscriptions WHERE start_date > end_date
    ) THEN
      ALTER TABLE subscriptions VALIDATE CONSTRAINT subscriptions_date_order_check;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_renewal_check' AND NOT convalidated
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM subscriptions WHERE renewal_date IS NOT NULL AND renewal_date < start_date
    ) THEN
      ALTER TABLE subscriptions VALIDATE CONSTRAINT subscriptions_renewal_check;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_status_check' AND NOT convalidated
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM subscriptions
      WHERE status IS NOT NULL AND status NOT IN ('active', 'expired', 'cancelled', 'pending')
    ) THEN
      ALTER TABLE subscriptions VALIDATE CONSTRAINT subscriptions_status_check;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_user_id_fkey' AND NOT convalidated
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM subscriptions s
      LEFT JOIN users u ON u.id = s.user_id
      WHERE u.id IS NULL
    ) THEN
      ALTER TABLE subscriptions VALIDATE CONSTRAINT subscriptions_user_id_fkey;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_email_format_check' AND NOT convalidated
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM users
      WHERE email IS NOT NULL
        AND email !~* E'^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$'
    ) THEN
      ALTER TABLE users VALIDATE CONSTRAINT users_email_format_check;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_status_check' AND NOT convalidated
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM users
      WHERE status IS NOT NULL
        AND status NOT IN ('active', 'inactive', 'suspended', 'deleted')
    ) THEN
      ALTER TABLE users VALIDATE CONSTRAINT users_status_check;
    END IF;
  END IF;
END $$;

-- =====================================================
-- MISSING INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_admin_tasks_type_priority ON admin_tasks(task_type, priority);
CREATE INDEX IF NOT EXISTS idx_admin_tasks_assigned_due ON admin_tasks(assigned_admin, due_date);
CREATE INDEX IF NOT EXISTS idx_admin_tasks_incomplete ON admin_tasks(due_date, priority)
  WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_admin_tasks_completion_stats ON admin_tasks(task_type, completed_at, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS ux_credit_transactions_payment_id
  ON credit_transactions(payment_id)
  WHERE payment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_payments_provider_payment_id
  ON payments(provider, provider_payment_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_subscriptions_order_id
  ON subscriptions(order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_service ON subscriptions(user_id, service_type);
CREATE INDEX IF NOT EXISTS idx_subscriptions_service_plan ON subscriptions(service_type, service_plan);
CREATE INDEX IF NOT EXISTS idx_subscriptions_renewal_date ON subscriptions(renewal_date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date ON subscriptions(end_date);
CREATE INDEX IF NOT EXISTS idx_subscriptions_active_user ON subscriptions(user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_subscriptions_active_service ON subscriptions(service_type) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_subscriptions_metadata_gin ON subscriptions USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_subscriptions_region ON subscriptions((metadata->>'region'))
  WHERE metadata->>'region' IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_payment_method ON subscriptions((metadata->>'payment_method'))
  WHERE metadata->>'payment_method' IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_count ON subscriptions(user_id)
  WHERE status IN ('active', 'pending');
CREATE INDEX IF NOT EXISTS idx_subscriptions_term_start_at
  ON subscriptions(term_start_at) WHERE term_start_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login DESC) WHERE last_login IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_active ON users(created_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_users_name ON users(first_name, last_name);

COMMIT;

-- Down Migration
BEGIN;

-- No rollback included. Apply down steps manually if needed.

COMMIT;
