-- Up Migration
BEGIN;

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_provider_check;
ALTER TABLE payments ADD CONSTRAINT payments_provider_check CHECK (
  provider IN ('nowpayments', 'stripe', 'pay4bit', 'paypal', 'payop', 'antom', 'manual', 'admin')
);

ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_payment_provider_check;
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_payment_provider_check CHECK (
  payment_provider IS NULL
  OR payment_provider IN ('nowpayments', 'stripe', 'pay4bit', 'paypal', 'payop', 'antom', 'manual', 'admin')
);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_provider_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_provider_check CHECK (
  payment_provider IS NULL
  OR payment_provider IN ('credits', 'nowpayments', 'stripe', 'pay4bit', 'paypal', 'payop', 'antom', 'manual', 'admin')
);

COMMIT;

-- Down Migration
BEGIN;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_provider_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_provider_check CHECK (
  payment_provider IS NULL
  OR payment_provider IN ('credits', 'nowpayments', 'stripe', 'pay4bit', 'paypal', 'payop', 'manual', 'admin')
);

ALTER TABLE credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_payment_provider_check;
ALTER TABLE credit_transactions ADD CONSTRAINT credit_transactions_payment_provider_check CHECK (
  payment_provider IS NULL
  OR payment_provider IN ('nowpayments', 'stripe', 'pay4bit', 'paypal', 'payop', 'manual', 'admin')
);

ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_provider_check;
ALTER TABLE payments ADD CONSTRAINT payments_provider_check CHECK (
  provider IN ('nowpayments', 'stripe', 'pay4bit', 'paypal', 'payop', 'manual', 'admin')
);

COMMIT;
