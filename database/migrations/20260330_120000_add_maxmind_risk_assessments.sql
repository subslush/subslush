-- Migration: Add MaxMind risk assessment persistence
-- Created: 2026-03-30T12:00:00.000Z
-- Description: Stores MaxMind Factors runs and trigger decisions for order fraud checks.

BEGIN;

CREATE TABLE IF NOT EXISTS maxmind_risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger_type VARCHAR(40) NOT NULL DEFAULT 'repeat_material_change',
  trigger_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  should_run BOOLEAN NOT NULL DEFAULT TRUE,
  decision VARCHAR(20) NOT NULL DEFAULT 'allow',
  risk_score NUMERIC(5,2),
  risk_score_reason TEXT,
  ip_address TEXT,
  country_code VARCHAR(2),
  device_fingerprint TEXT,
  payment_fingerprint TEXT,
  amount_cents INTEGER,
  currency VARCHAR(10),
  is_first_order BOOLEAN NOT NULL DEFAULT FALSE,
  provider VARCHAR(30),
  local_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
  maxmind_request JSONB,
  maxmind_response JSONB,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  evaluated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT maxmind_risk_trigger_type_check CHECK (
    trigger_type IN ('first_order', 'repeat_material_change', 'manual_review')
  ),
  CONSTRAINT maxmind_risk_decision_check CHECK (
    decision IN ('allow', 'review', 'block', 'skipped', 'error')
  ),
  CONSTRAINT maxmind_risk_score_range_check CHECK (
    risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 100)
  )
);

CREATE INDEX IF NOT EXISTS idx_maxmind_risk_assessments_order_id_created_at
  ON maxmind_risk_assessments(order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_maxmind_risk_assessments_user_id_created_at
  ON maxmind_risk_assessments(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_maxmind_risk_assessments_decision_created_at
  ON maxmind_risk_assessments(decision, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_maxmind_risk_assessments_trigger_created_at
  ON maxmind_risk_assessments(trigger_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_maxmind_risk_assessments_should_run
  ON maxmind_risk_assessments(should_run, created_at DESC);

COMMIT;

