-- Migration: Enforce credit transaction sign rules and payment ID uniqueness
-- Created: 2025-10-20 12:00:00 UTC

-- Up Migration
BEGIN;

ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_amount_sign_check;
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_amount_sign_check
  CHECK (
    (type IN ('deposit', 'bonus', 'refund') AND amount >= 0)
    OR (type IN ('purchase', 'withdrawal', 'refund_reversal') AND amount <= 0)
  );

CREATE UNIQUE INDEX IF NOT EXISTS ux_credit_transactions_payment_id
  ON credit_transactions(payment_id)
  WHERE payment_id IS NOT NULL;

COMMIT;

-- Down Migration
BEGIN;

DROP INDEX IF EXISTS ux_credit_transactions_payment_id;
ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_amount_sign_check;

COMMIT;
