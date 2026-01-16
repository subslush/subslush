-- Migration: Add Stripe auto-renewal support
-- Created: 2026-01-11 12:00:00 UTC
-- Description:
--   - Add stripe_customer_id to users
--   - Add user_payment_methods table for saved Stripe cards
--   - Add billing_payment_method_id + auto-renew timestamps to subscriptions

BEGIN;

-- Users: Stripe customer tracking
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(150);

CREATE UNIQUE INDEX IF NOT EXISTS ux_users_stripe_customer_id
  ON users(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Payment methods per user/provider (Stripe only for now)
CREATE TABLE IF NOT EXISTS user_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL,
  provider_customer_id VARCHAR(150),
  provider_payment_method_id VARCHAR(150) NOT NULL,
  brand VARCHAR(50),
  last4 VARCHAR(4),
  exp_month INTEGER,
  exp_year INTEGER,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  setup_intent_id VARCHAR(150),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT user_payment_methods_provider_check CHECK (provider IN ('stripe')),
  CONSTRAINT user_payment_methods_status_check CHECK (
    status IN ('active', 'revoked', 'expired', 'requires_action')
  )
);

CREATE INDEX IF NOT EXISTS idx_user_payment_methods_user_id
  ON user_payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_user_payment_methods_provider_customer
  ON user_payment_methods(provider_customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_payment_methods_provider_payment
  ON user_payment_methods(provider, provider_payment_method_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_user_payment_methods_default
  ON user_payment_methods(user_id, provider)
  WHERE is_default = TRUE;

-- updated_at trigger
CREATE OR REPLACE FUNCTION user_payment_methods_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_payment_methods_set_updated_at ON user_payment_methods;
CREATE TRIGGER trg_user_payment_methods_set_updated_at
  BEFORE UPDATE ON user_payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION user_payment_methods_set_updated_at();

-- Subscriptions: default billing method + auto-renew timestamps
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS billing_payment_method_id UUID REFERENCES user_payment_methods(id) ON DELETE SET NULL;
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS auto_renew_enabled_at TIMESTAMP;
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS auto_renew_disabled_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_subscriptions_billing_payment_method
  ON subscriptions(billing_payment_method_id);

COMMIT;
