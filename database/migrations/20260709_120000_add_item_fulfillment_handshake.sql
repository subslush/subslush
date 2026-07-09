-- Migration: Add item-level fulfillment delivery and activation handshake state
-- Created: 2026-07-09T12:00:00.000Z
-- Description:
--   - Adds item/subscription delivery timestamps and activation-link handshake state
--   - Expands compliance evidence event types for item delivery, activation, and strict rules

BEGIN;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS delivered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_email_sent_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS activation_handshake_state VARCHAR(40) NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS activation_instructions_delivered_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS activation_customer_ready_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS activation_link_delivered_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS activation_handshake_restarted_at TIMESTAMP;

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_activation_handshake_state_check;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_activation_handshake_state_check CHECK (
    activation_handshake_state IN (
      'none',
      'instructions_delivered',
      'awaiting_customer',
      'customer_ready',
      'link_delivered'
    )
  );

CREATE INDEX IF NOT EXISTS idx_subscriptions_order_item_delivery
  ON subscriptions(order_id, order_item_id, status, delivered_at);

CREATE INDEX IF NOT EXISTS idx_subscriptions_activation_handshake_state
  ON subscriptions(activation_handshake_state)
  WHERE activation_handshake_state <> 'none';

ALTER TABLE order_compliance_evidence_logs
  DROP CONSTRAINT IF EXISTS order_compliance_evidence_logs_event_type_check;
ALTER TABLE order_compliance_evidence_logs
  ADD CONSTRAINT order_compliance_evidence_logs_event_type_check
  CHECK (
    event_type IN (
      'paypal_payment_capture',
      'order_delivery',
      'credential_reveal',
      'item_delivery',
      'activation_customer_ready',
      'activation_restart',
      'strict_rules_acceptance'
    )
  );

COMMIT;

-- Down Migration
BEGIN;

-- Additive migration - no rollback included.

COMMIT;
