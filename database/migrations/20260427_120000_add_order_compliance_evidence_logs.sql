-- Migration: Add order compliance evidence logs for payment, delivery, and credential access
-- Description:
--   - Stores chargeback/fulfillment evidence for PayPal and order delivery lifecycle
--   - Captures customer email, PayPal transaction references, request IP, delivery snapshot,
--     delivery timestamp, and account-access evidence (credential reveal interactions)

-- Up Migration
BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS order_compliance_evidence_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  customer_email TEXT,
  paypal_order_id TEXT,
  paypal_transaction_id TEXT,
  ip_address TEXT,
  product_delivered JSONB,
  delivery_timestamp TIMESTAMP,
  license_account_access_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT order_compliance_evidence_logs_event_type_check
    CHECK (event_type IN ('paypal_payment_capture', 'order_delivery', 'credential_reveal'))
);

CREATE INDEX IF NOT EXISTS idx_order_compliance_evidence_logs_order_id
  ON order_compliance_evidence_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_order_compliance_evidence_logs_event_type_created_at
  ON order_compliance_evidence_logs(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_compliance_evidence_logs_paypal_transaction
  ON order_compliance_evidence_logs(paypal_transaction_id)
  WHERE paypal_transaction_id IS NOT NULL;

COMMENT ON TABLE order_compliance_evidence_logs IS
  'Compliance evidence for payment, delivery, and credential-access actions';
COMMENT ON COLUMN order_compliance_evidence_logs.product_delivered IS
  'JSON array snapshot of delivered products';
COMMENT ON COLUMN order_compliance_evidence_logs.license_account_access_evidence IS
  'Evidence payload for account access/license reveal actions';

COMMIT;

-- Down Migration
BEGIN;

DROP TABLE IF EXISTS order_compliance_evidence_logs;

COMMIT;
