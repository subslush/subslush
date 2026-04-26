# PayPal Checkout Migration Runbook

## Scope
- Replace checkout card provider flow with PayPal hosted checkout.
- Keep compatibility aliases for legacy card/stripe/pay4bit checkout endpoints.
- Keep historical Stripe/Pay4bit records intact.
- Disable Stripe auto-renew paths while keeping deprecated API endpoints returning `410`.

## Preflight Gates (Required)
1. Freeze payment-flow deploys during migration/cutover window.
2. Snapshot provider usage:

```sql
SELECT payment_provider, status, COUNT(*)
FROM orders
GROUP BY 1,2
ORDER BY 1,2;

SELECT provider, status, COUNT(*)
FROM payments
GROUP BY 1,2
ORDER BY 1,2;

SELECT
  COUNT(*) FILTER (WHERE auto_renew=true) AS auto_renew_true,
  COUNT(*) FILTER (WHERE renewal_method='stripe') AS renewal_method_stripe,
  COUNT(*) FILTER (WHERE billing_payment_method_id IS NOT NULL) AS billing_method_linked
FROM subscriptions;
```

3. Confirm no critical Stripe renewal intents remain:

```sql
SELECT COUNT(*)
FROM payments
WHERE provider='stripe'
  AND status IN ('pending','processing','requires_action','requires_payment_method')
  AND (metadata->>'renewal') IN ('true','1');
```

4. If count is non-zero, delay cutover and drain/reconcile first.

## Sandbox-First Rollout
1. Deploy DB migration:
   - `database/migrations/20260422_120000_add_paypal_provider_constraints.sql`
2. Deploy backend/frontend with PayPal flow enabled in sandbox:
   - `PAYPAL_ENABLED=true`
   - `PAYPAL_MODE=sandbox`
   - sandbox `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`
   - `PAYPAL_WEBHOOK_ID=<sandbox webhook id>` if `/api/v1/payments/paypal/webhook` is enabled
3. Keep Stripe/Pay4bit env vars present for transition safety, but disabled in runtime traffic paths.
4. Execute sandbox E2E:
   - Create checkout session via `/checkout/paypal/session`
   - Complete hosted approval flow
   - Confirm via `/checkout/paypal/confirm`
   - Validate order/payment/subscription states and email/fulfillment side effects
   - Validate stale checkout sweep/cancel behavior

## Production Cutover
1. Swap PayPal credentials:
   - `PAYPAL_MODE=live`
   - live `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`
   - `PAYPAL_WEBHOOK_ID` for webhook signature verification on `/api/v1/payments/paypal/webhook`
2. Redeploy backend/frontend.
3. Keep compatibility aliases active:
   - `/checkout/card/*`, `/checkout/stripe/*`
   - `/payments/checkout` card/stripe/pay4bit request mapping

## Post-Cutover Validation
1. Verify new payment mix:

```sql
SELECT payment_provider, status, COUNT(*)
FROM orders
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY 1,2
ORDER BY 1,2;

SELECT provider, status, COUNT(*)
FROM payments
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY 1,2
ORDER BY 1,2;
```

2. Confirm no expanding backlog of `pending_payment` PayPal orders.
3. Review PayPal operational logs:
   - session create success/failure
   - capture success/failure
   - amount/currency mismatch failures
   - webhook signature verification failures (if webhook used)

## Rollback Strategy
1. If live cutover fails:
   - set `PAYPAL_ENABLED=false`
   - restore legacy card path handling if required via prior release artifact
2. Do **not** remove Stripe/Pay4bit DB constraint values during rollback window.
3. Preserve all historical rows; no destructive schema cleanup in migration window.

## Deferred Cleanup (Post-Observation Window)
- Remove remaining unused Stripe renewal internals after stability window.
- Evaluate retirement of legacy compatibility aliases once all clients are confirmed migrated.
- Plan separate data-retention cleanup for legacy Stripe fields/tables.
