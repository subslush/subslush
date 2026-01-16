# Phase 1 - Schema Alignment

Date: 2026-01-05
Owner: Tech Lead
Scope: Database schema alignment for dashboard accuracy, PIN support, and audit

This document records the Phase 1 schema alignment work completed for the
dashboard rebuild. It summarizes the fields, tables, and indexes required by
the product spec and confirms what was already present vs. newly added.

---

## 1) Goals

- Ensure dashboard accuracy fields exist on subscriptions and orders.
- Add PIN support schema on users.
- Add credential reveal audit logging.
- Validate indexes needed for dashboard queries.
- Keep changes additive and safe.

---

## 2) Summary of Existing Schema (Already Present)

The following fields were already present in `database/migrations/20251015_120000_schema_alignment_admin.sql`:

### Subscriptions (existing)
- `next_billing_at`
- `renewal_method`
- `price_cents`
- `currency`
- `status_reason`

### Orders (existing)
- `payment_provider`
- `payment_reference`
- `paid_with_credits`
- `status`
- `status_reason`

Also present:
- `admin_audit_logs` table from `database/migrations/20260105_120000_add_admin_audit_logs.sql`.

---

## 3) New Migrations Added in Phase 1

### 3.1 Add `renewal_date` to subscriptions
File: `database/migrations/20260105_125000_add_subscriptions_renewal_date.sql`

Purpose:
- Ensure `subscriptions.renewal_date` exists for dashboard and renewal workflows.
- Align environments where this column was missing (e.g., Supabase).

Changes:
- `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS renewal_date TIMESTAMP;`
- Comment added: `Next renewal date for the subscription`

### 3.2 PIN support + credential reveal audit logs + dashboard indexes
File: `database/migrations/20260105_130000_add_pin_support_and_dashboard_indexes.sql`

#### Users: PIN support
New columns:
- `users.pin_hash`
- `users.pin_set_at`
- `users.pin_failed_attempts` (default 0, non-negative check)
- `users.pin_locked_until`

Constraint:
- `users_pin_failed_attempts_check` enforces `pin_failed_attempts >= 0`.

#### Audit: credential reveal attempts
New table:
- `credential_reveal_audit_logs`
  - `user_id`, `subscription_id`, `success`, `failure_reason`
  - request context fields: `ip_address`, `user_agent`, `request_id`
  - `metadata` JSONB and `created_at`

Indexes:
- `idx_credential_reveal_audit_logs_user_id`
- `idx_credential_reveal_audit_logs_subscription_id`
- `idx_credential_reveal_audit_logs_created_at`
- `idx_credential_reveal_audit_logs_success`

#### Dashboard query indexes
Indexes added:
- `idx_subscriptions_user_status_renewal_date`
  - supports dashboard queries by user + status + renewal date
- `idx_orders_user_created_at`
  - supports recent orders list by user + created date

---

## 4) Rollout Notes

- All changes are additive and safe for zero-downtime rollout.
- `renewal_date` was missing in some environments; it is now explicitly created.
- Credential reveal auditing uses a dedicated table separate from `admin_audit_logs`.

---

## 5) Validation Checks

Recommended checks after applying migrations:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema='public' AND table_name='users'
  AND column_name IN ('pin_hash','pin_set_at','pin_failed_attempts','pin_locked_until')
ORDER BY column_name;

SELECT to_regclass('public.credential_reveal_audit_logs') AS audit_table;

SELECT indexname
FROM pg_indexes
WHERE schemaname='public' AND tablename='subscriptions'
  AND indexname='idx_subscriptions_user_status_renewal_date';
```

---

## 6) Phase 1 Exit Criteria

- `subscriptions.renewal_date` exists in all target environments.
- PIN-related columns exist on `users` with default + constraint.
- `credential_reveal_audit_logs` exists with indexes.
- Dashboard query indexes exist on subscriptions and orders.

