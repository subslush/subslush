# Phase 4: Admin UI (Implementation Summary)

This document summarizes all Phase 4 (Admin UI) work performed so far, including the backend wiring, UI pages, reward redemption updates, migration tooling, seed data, and the latest UI panel additions (refunds, credit transactions, order items).

---

## Scope and Goals

Phase 4 introduced a dedicated admin surface and API for operational management:

- Admin UI in SvelteKit under `/admin`.
- Admin API surface under `/api/v1/admin` with role gating.
- Admin workflows for catalog, orders, payments, subscriptions, credits, rewards, tasks, and migration utilities.
- Reward redemption options (credits and subscription extensions).
- Migration preview/apply for pre-launch to live user alignment.

---

## Backend: Admin API Wiring and Endpoints

Admin routes are registered in `src/routes/api.ts` under `/api/v1/admin` with an admin pre-handler. The following route modules are wired:

- `src/routes/admin/catalog.ts`
- `src/routes/admin/orders.ts`
- `src/routes/admin/payments.ts`
- `src/routes/admin/subscriptions.ts`
- `src/routes/admin/credits.ts`
- `src/routes/admin/rewards.ts`
- `src/routes/admin/tasks.ts`
- `src/routes/admin/migration.ts`

Additional admin middleware:

- `src/middleware/adminMiddleware.ts` to require `admin` or `super_admin` roles.

### Endpoints Added (not previously available)

These endpoints were added as part of the phase (or expanded beyond existing credit admin routes):

- `GET /api/v1/admin/payments` (list payments with filters)
- `GET /api/v1/admin/products`, `POST /api/v1/admin/products`, `PATCH /api/v1/admin/products/:id`
- `GET /api/v1/admin/product-variants`, `POST /api/v1/admin/product-variants`, `PATCH /api/v1/admin/product-variants/:id`
- `GET /api/v1/admin/product-labels`, `POST /api/v1/admin/product-labels`
- `GET /api/v1/admin/product-media`, `POST /api/v1/admin/product-media`
- `GET /api/v1/admin/price-history`, `POST /api/v1/admin/price-history`
- `GET /api/v1/admin/orders`, `PATCH /api/v1/admin/orders/:id/status`, `GET /api/v1/admin/orders/:id/items`
- `GET /api/v1/admin/subscriptions`, `PATCH /api/v1/admin/subscriptions/:id`
- `GET /api/v1/admin/credits/balances`, `GET /api/v1/admin/credits/transactions`
- `POST /api/v1/admin/credits/add`, `POST /api/v1/admin/credits/withdraw`
- `GET /api/v1/admin/rewards/referral`, `GET /api/v1/admin/rewards/prelaunch`
- `POST /api/v1/admin/rewards/referral/:id/redeem`, `POST /api/v1/admin/rewards/prelaunch/:id/redeem`
- `GET /api/v1/admin/rewards/contest-status`, `GET /api/v1/admin/rewards/leaderboard`
- `GET /api/v1/admin/tasks`, `POST /api/v1/admin/tasks/:id/complete`
- `POST /api/v1/admin/migration/preview`, `POST /api/v1/admin/migration/apply`

---

## Reward Redemption Enhancements

Reward redemption endpoints now support **two paths**:

1) **Credits-based redemption**  
   - Requires `appliedValueCents > 0`.  
   - Creates a credit transaction and marks the reward as redeemed.

2) **Subscription extension redemption**  
   - Send `subscriptionId` to extend `end_date` / `renewal_date` by `free_months`.  
   - Updates `next_billing_at` for auto-renew subscriptions.  
   - Marks the reward as redeemed and links the reward to the subscription.

This logic is implemented in:

- `src/routes/admin/rewards.ts`

---

## Admin UI Surface

Admin UI lives under `frontend/src/routes/admin/*`.

### Admin pages

- `/admin` (overview)
- `/admin/products`
- `/admin/orders`
- `/admin/payments`
- `/admin/subscriptions`
- `/admin/credits`
- `/admin/rewards`
- `/admin/tasks`
- `/admin/migration`

Supporting UI components:

- `frontend/src/lib/components/admin/AdminShell.svelte`
- `frontend/src/lib/components/admin/AdminSidebar.svelte`
- `frontend/src/lib/components/admin/StatusBadge.svelte`
- `frontend/src/lib/components/admin/AdminEmptyState.svelte`

Admin API client and types:

- `frontend/src/lib/api/admin.ts`
- `frontend/src/lib/types/admin.ts`

---

## UI Coverage Matrix (Wired vs Partial)

### Fully wired to real APIs

- **Overview**: pulls recent orders/payments/products/subscriptions/tasks.
- **Products**: CRUD for products, variants, labels, media, price history.
- **Orders**: list orders + update status + view order items.
- **Payments**: list payments, monitoring start/stop, pending/failed, retry, manual credit allocation.
- **Refunds**: list refunds, pending approvals, approve/reject, manual refund, refund stats.
- **Subscriptions**: list/edit, toggle auto-renew.
- **Credits**: list balances, add/withdraw, list transactions.
- **Rewards**: list/referral + prelaunch rewards, redeem, contest status, leaderboard.
- **Tasks**: list + complete.
- **Migration**: preview/apply pre-launch migration.

### Partial or informational panels

- **Overview metrics** are counts from limited lists (not total counts).
- **Subscriptions "Renewal Timeline"** is informational text only.

---

## Missing Panels Added in This Update

The following panels were added to complete UI coverage:

- **Payments**: Refund Overview, Pending Refunds, Refund Ledger, Manual Refund form.
- **Credits**: Credit Transactions list with filters.
- **Orders**: Order Items viewer (expand per order).

Files updated:

- `frontend/src/routes/admin/payments/+page.svelte`
- `frontend/src/routes/admin/payments/+page.server.ts`
- `frontend/src/routes/admin/credits/+page.svelte`
- `frontend/src/routes/admin/credits/+page.server.ts`
- `frontend/src/routes/admin/orders/+page.svelte`
- `frontend/src/lib/api/admin.ts`
- `frontend/src/lib/types/admin.ts`

---

## Migration Utilities

Admin migration endpoints:

- `POST /api/v1/admin/migration/preview`
- `POST /api/v1/admin/migration/apply`

Notes:

- Preview runs a dry-run summary (duplicate emails, mappable rewards/vouchers/raffles).
- Apply runs `database/migrations/20251016_121000_prelaunch_data_migration_apply.sql`.
- The SQL file must be present in the runtime container for apply to succeed.
- Apply is idempotent (uses `ON CONFLICT DO NOTHING`).

---

## Seed Data for Testing

Seed script (new):

- `database/test_data/prelaunch_seed_data.sql`

This script provides:

- Pre-registrations linked to live users.
- Referral rewards and pre-launch rewards (mixed redeemed/pending).
- Calendar vouchers + raffle entries.
- Subscriptions used for redemption tests.

After seeding, run:

```
database/migrations/20251016_121000_prelaunch_data_migration_apply.sql
```

---

## Local Dev Notes (Pre-launch Migrations)

Some pre-launch migrations reference Supabase-specific `auth.*` functions and a `supabase_auth_id` column.

For local Postgres:

- Add auth columns: `database/prelaunch_migrations/add-auth-columns.sql`
- Provide stub auth functions (local-only) if needed.

These are required for `database/prelaunch_migrations/migration-006-christmas-calendar.sql` to run locally.

---

## Summary of Phase 4 Changes

1) Admin API wiring and middleware added to expose `/api/v1/admin`.
2) Admin UI built with pages for catalog, orders, payments, subscriptions, credits, rewards, tasks, migration.
3) Reward redemption enhanced to support subscription extensions.
4) Migration preview/apply endpoints added (SQL-driven).
5) Seed data script created for realistic test coverage.
6) Missing UI panels added (refunds, credit transactions, order items).

---

## Current Known Limitations

- Overview metrics are not global totals.
- Some panels depend on existing data (empty state otherwise).

---

## Next Optional Enhancements

- Add global count endpoints for real totals on overview.
- Add refunds UI for detailed audit trail.
- Add order items drawer + payment/refund linking on orders.

---

## Primary Files Involved

Backend:

- `src/routes/admin/*`
- `src/middleware/adminMiddleware.ts`
- `src/services/catalogService.ts`
- `src/services/orderService.ts`
- `src/services/subscriptionService.ts`
- `src/routes/admin/rewards.ts`

Frontend:

- `frontend/src/routes/admin/*`
- `frontend/src/lib/api/admin.ts`
- `frontend/src/lib/types/admin.ts`

Database:

- `database/migrations/20251016_121000_prelaunch_data_migration_apply.sql`
- `database/test_data/prelaunch_seed_data.sql`
