# Phase 2 - Data Migration / Backfill

Date: 2026-01-05
Owner: Tech Lead
Scope: Backfill subscription billing fields + normalization sweeps

This document captures Phase 2 implementation and verification steps for
backfilling subscription billing fields and running normalization jobs.

---

## 1) Goals

- Backfill subscription billing fields needed for dashboard accuracy:
  - `price_cents`, `currency`, `renewal_method`, `next_billing_at`.
- Use existing orders/payments/credit transaction data without overwriting
  already populated values.
- Provide a safe, one-off runner for normalization jobs.

---

## 2) Implemented Changes

### 2.1 Backfill migration
File: `database/migrations/20260105_140000_backfill_subscription_billing_fields.sql`

Backfill strategy:
- Primary source: `orders` + `order_items` (unit/total price, currency).
- Secondary sources: `payments` and `credit_transactions` tied to `order_id`.
- Fallback: for `next_billing_at`, use `renewal_date` when `auto_renew = true`.
- Separate path for subscriptions linked directly to payments via
  `payments.subscription_id` (no `order_id`).

Safety:
- Only fills fields that are currently `NULL`.
- Does not overwrite existing values.
- Transactional and additive (no destructive rollback).

### 2.2 Normalization runner
File: `src/scripts/runSubscriptionNormalization.ts`

Purpose:
- Run existing subscription jobs on demand.

Behavior:
- Default: runs expiry sweep only.
- Optional `--include-renewals`: also runs renewal sweep.
- Uses existing job logic to normalize status and billing windows.

---

## 3) How to Run

### 3.1 Apply migration (local)
```
node database/migrate.js up
```

### 3.2 Apply migration (Supabase SQL editor)
Paste and run:
```
database/migrations/20260105_140000_backfill_subscription_billing_fields.sql
```

### 3.3 Run normalization jobs (local)
Expiry sweep only:
```
npx ts-node --transpile-only src/scripts/runSubscriptionNormalization.ts
```

Include renewal sweep (will attempt renewals):
```
npx ts-node --transpile-only src/scripts/runSubscriptionNormalization.ts --include-renewals
```

---

## 4) Verification Queries

Check missing fields summary:
```
SELECT
  COUNT(*) AS total_subs,
  COUNT(*) FILTER (WHERE price_cents IS NULL) AS missing_price,
  COUNT(*) FILTER (WHERE currency IS NULL) AS missing_currency,
  COUNT(*) FILTER (WHERE renewal_method IS NULL) AS missing_renewal_method,
  COUNT(*) FILTER (WHERE auto_renew = true AND next_billing_at IS NULL) AS missing_next_billing_at
FROM subscriptions;
```

Check missing fields by `order_id` linkage:
```
SELECT
  CASE WHEN s.order_id IS NULL THEN 'no_order' ELSE 'has_order' END AS order_link,
  COUNT(*) AS subs,
  COUNT(*) FILTER (WHERE s.price_cents IS NULL) AS missing_price,
  COUNT(*) FILTER (WHERE s.currency IS NULL) AS missing_currency,
  COUNT(*) FILTER (WHERE s.renewal_method IS NULL) AS missing_renewal_method
FROM subscriptions s
GROUP BY 1;
```

List remaining gaps for manual review:
```
SELECT
  s.id, s.user_id, s.service_type, s.service_plan, s.order_id,
  s.price_cents, s.currency, s.renewal_method, s.auto_renew, s.next_billing_at,
  s.created_at
FROM subscriptions s
WHERE s.price_cents IS NULL
   OR s.currency IS NULL
   OR s.renewal_method IS NULL
ORDER BY s.created_at DESC;
```

---

## 5) Known Gaps (Expected)

Subscriptions with `order_id IS NULL` and no linked `payments.subscription_id`
cannot be backfilled automatically. These require manual remediation or
Phase 5 data-quality monitoring.

---

## 6) Phase 2 Exit Criteria

- Backfill migration applied in target environments.
- Normalization runner available and successfully executed.
- Remaining gaps identified and attributed to missing linkage data.

