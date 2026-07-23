-- Migration: Expand durable product identity and purchase-time snapshots
-- Created: 2026-07-21T13:00:00.000Z
-- Strategy: expand only; all new columns remain nullable during rollout.

-- Up Migration
BEGIN;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS product_id UUID,
  ADD COLUMN IF NOT EXISTS product_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS product_slug_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS duration_months_snapshot INTEGER,
  ADD COLUMN IF NOT EXISTS fulfillment_config_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS catalog_mode_snapshot VARCHAR(32);

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS product_id UUID,
  ADD COLUMN IF NOT EXISTS product_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS product_slug_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS duration_months_snapshot INTEGER,
  ADD COLUMN IF NOT EXISTS unit_price_cents_snapshot INTEGER,
  ADD COLUMN IF NOT EXISTS total_price_cents_snapshot INTEGER,
  ADD COLUMN IF NOT EXISTS currency_snapshot VARCHAR(10),
  ADD COLUMN IF NOT EXISTS fulfillment_config_snapshot JSONB;

ALTER TABLE payments ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE payment_items ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE payment_refunds ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE order_entitlements
  ADD COLUMN IF NOT EXISTS product_id UUID,
  ADD COLUMN IF NOT EXISTS product_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS product_slug_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS fulfillment_config_snapshot JSONB;
ALTER TABLE subscription_renewals ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE admin_tasks ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE credential_reveal_audit_logs ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE order_compliance_evidence_logs
  ADD COLUMN IF NOT EXISTS order_item_id UUID,
  ADD COLUMN IF NOT EXISTS product_id UUID;

DO $$
DECLARE
  v_relation_name TEXT;
  v_constraint_name TEXT;
BEGIN
  FOR v_relation_name, v_constraint_name IN
    SELECT * FROM (VALUES
      ('order_items', 'order_items_product_id_fkey'),
      ('subscriptions', 'subscriptions_product_id_fkey'),
      ('payments', 'payments_product_id_fkey'),
      ('payment_items', 'payment_items_product_id_fkey'),
      ('credit_transactions', 'credit_transactions_product_id_fkey'),
      ('payment_refunds', 'payment_refunds_product_id_fkey'),
      ('order_entitlements', 'order_entitlements_product_id_fkey'),
      ('subscription_renewals', 'subscription_renewals_product_id_fkey'),
      ('admin_tasks', 'admin_tasks_product_id_fkey'),
      ('credential_reveal_audit_logs', 'credential_reveal_audit_logs_product_id_fkey'),
      ('order_compliance_evidence_logs', 'order_compliance_evidence_logs_product_id_fkey')
    ) AS constraints(relation_name, constraint_name)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = v_constraint_name) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT NOT VALID',
        v_relation_name,
        v_constraint_name
      );
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'order_compliance_evidence_logs_order_item_id_fkey'
  ) THEN
    ALTER TABLE order_compliance_evidence_logs
      ADD CONSTRAINT order_compliance_evidence_logs_order_item_id_fkey
      FOREIGN KEY (order_item_id) REFERENCES order_items(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END $$;

ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_duration_months_snapshot_check;
ALTER TABLE order_items ADD CONSTRAINT order_items_duration_months_snapshot_check
  CHECK (duration_months_snapshot IS NULL OR duration_months_snapshot > 0) NOT VALID;
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_duration_months_snapshot_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_duration_months_snapshot_check
  CHECK (duration_months_snapshot IS NULL OR duration_months_snapshot > 0) NOT VALID;
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_snapshot_prices_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_snapshot_prices_check
  CHECK (
    (unit_price_cents_snapshot IS NULL OR unit_price_cents_snapshot >= 0)
    AND (total_price_cents_snapshot IS NULL OR total_price_cents_snapshot >= 0)
  ) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_product_id ON subscriptions(product_id);
CREATE INDEX IF NOT EXISTS idx_payments_product_id ON payments(product_id);
CREATE INDEX IF NOT EXISTS idx_payment_items_product_id ON payment_items(product_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_product_id ON credit_transactions(product_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_product_id ON payment_refunds(product_id);
CREATE INDEX IF NOT EXISTS idx_order_entitlements_product_id ON order_entitlements(product_id);
CREATE INDEX IF NOT EXISTS idx_subscription_renewals_product_id ON subscription_renewals(product_id);
CREATE INDEX IF NOT EXISTS idx_admin_tasks_product_id ON admin_tasks(product_id);
CREATE INDEX IF NOT EXISTS idx_credential_reveal_audit_logs_product_id
  ON credential_reveal_audit_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_order_compliance_evidence_product_id
  ON order_compliance_evidence_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_order_compliance_evidence_order_item_id
  ON order_compliance_evidence_logs(order_item_id);

CREATE TABLE IF NOT EXISTS product_identity_backfill_audit (
  id BIGSERIAL PRIMARY KEY,
  migration_key TEXT NOT NULL,
  entity_table TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('resolved', 'unresolved', 'conflict', 'aggregate')
  ),
  chosen_product_id UUID,
  candidate_product_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  sources JSONB NOT NULL DEFAULT '{}'::jsonb,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  observed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (migration_key, entity_table, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_product_identity_backfill_audit_status
  ON product_identity_backfill_audit(migration_key, status, entity_table);

COMMIT;

-- Down Migration
BEGIN;

DROP TABLE IF EXISTS product_identity_backfill_audit;

ALTER TABLE order_compliance_evidence_logs
  DROP COLUMN IF EXISTS product_id,
  DROP COLUMN IF EXISTS order_item_id;
ALTER TABLE credential_reveal_audit_logs DROP COLUMN IF EXISTS product_id;
ALTER TABLE admin_tasks DROP COLUMN IF EXISTS product_id;
ALTER TABLE subscription_renewals DROP COLUMN IF EXISTS product_id;
ALTER TABLE order_entitlements
  DROP COLUMN IF EXISTS product_id,
  DROP COLUMN IF EXISTS product_name_snapshot,
  DROP COLUMN IF EXISTS product_slug_snapshot,
  DROP COLUMN IF EXISTS fulfillment_config_snapshot;
ALTER TABLE payment_refunds DROP COLUMN IF EXISTS product_id;
ALTER TABLE credit_transactions DROP COLUMN IF EXISTS product_id;
ALTER TABLE payment_items DROP COLUMN IF EXISTS product_id;
ALTER TABLE payments DROP COLUMN IF EXISTS product_id;
ALTER TABLE subscriptions
  DROP COLUMN IF EXISTS product_id,
  DROP COLUMN IF EXISTS product_name_snapshot,
  DROP COLUMN IF EXISTS product_slug_snapshot,
  DROP COLUMN IF EXISTS duration_months_snapshot,
  DROP COLUMN IF EXISTS unit_price_cents_snapshot,
  DROP COLUMN IF EXISTS total_price_cents_snapshot,
  DROP COLUMN IF EXISTS currency_snapshot,
  DROP COLUMN IF EXISTS fulfillment_config_snapshot;
ALTER TABLE order_items
  DROP COLUMN IF EXISTS product_id,
  DROP COLUMN IF EXISTS product_name_snapshot,
  DROP COLUMN IF EXISTS product_slug_snapshot,
  DROP COLUMN IF EXISTS duration_months_snapshot,
  DROP COLUMN IF EXISTS fulfillment_config_snapshot,
  DROP COLUMN IF EXISTS catalog_mode_snapshot;

COMMIT;
