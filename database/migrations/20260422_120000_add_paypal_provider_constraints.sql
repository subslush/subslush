-- Migration: Add PayPal provider to payment constraints
-- Description:
--   - Extends provider check constraints for orders, payments, and credit transactions
--   - Keeps historical providers (stripe, pay4bit) for legacy rows and rollback safety

-- Up Migration
BEGIN;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_provider_check;
ALTER TABLE payments ADD CONSTRAINT payments_provider_check
  CHECK (
    provider IN ('nowpayments', 'stripe', 'pay4bit', 'paypal', 'manual', 'admin')
  );

ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_payment_provider_check;
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_payment_provider_check
  CHECK (
    payment_provider IS NULL
    OR payment_provider IN ('nowpayments', 'stripe', 'pay4bit', 'paypal', 'manual', 'admin')
  );

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_provider_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_provider_check
  CHECK (
    payment_provider IS NULL
    OR payment_provider IN ('credits', 'nowpayments', 'stripe', 'pay4bit', 'paypal', 'manual', 'admin')
  );

COMMIT;

-- Down Migration
BEGIN;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_provider_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_provider_check
  CHECK (
    payment_provider IS NULL
    OR payment_provider IN ('credits', 'nowpayments', 'stripe', 'pay4bit', 'manual', 'admin')
  );

ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_payment_provider_check;
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_payment_provider_check
  CHECK (
    payment_provider IS NULL
    OR payment_provider IN ('nowpayments', 'stripe', 'pay4bit', 'manual', 'admin')
  );

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_provider_check;
ALTER TABLE payments ADD CONSTRAINT payments_provider_check
  CHECK (
    provider IN ('nowpayments', 'stripe', 'pay4bit', 'manual', 'admin')
  );

COMMIT;
