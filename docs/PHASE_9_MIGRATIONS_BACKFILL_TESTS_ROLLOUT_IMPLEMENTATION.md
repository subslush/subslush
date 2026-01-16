# Phase 9 - Migrations, Backfill, Tests, Rollout Implementation

## Goals
- Add publishing fields to products and backfill existing data safely.
- Relax legacy subscription enum checks to support catch-all products.
- Validate DB-driven listings/pricing and label mapping with integration tests.
- Provide a safe rollout toggle to switch pricing sources while listings stay DB-driven.

## Scope
This phase focuses on migrations, data backfill, rollout controls, and tests. No new UI features were added beyond the phased work completed earlier.

## High-Level Summary
- Added a backfill migration to populate new publishing fields and remove subscription enum constraints.
- Added a feature flag (`CATALOG_DB_PRICING`) to control pricing source while listings remain DB-driven.
- Implemented a legacy pricing resolver for safe fallback when the flag is disabled.
- Added integration tests for listings, label attach/detach, and purchase validation.
- Ran automated and API-level smoke tests, including credits, Stripe, and NOWPayments mock top-up flows.

## Implementation Details

### 1) Migrations and Backfill
Two migrations are required in order:

1. Add publishing columns to products:
   - `database/migrations/20260105_160000_add_product_publishing_fields.sql`
   - Adds `logo_key`, `category`, `default_currency`, `max_subscriptions`.

2. Backfill defaults + relax subscription constraints:
   - `database/migrations/20260105_170000_backfill_product_publishing_defaults.sql`
   - Drops legacy `subscriptions_service_type_check` and `subscriptions_service_plan_check`.
   - Backfills:
     - `logo_key` from metadata or service_type defaults.
     - `category` from metadata or service_type defaults.
     - `default_currency` from latest `price_history`, then metadata, then `USD`.
     - `max_subscriptions` from metadata or service_type defaults.

Ordering matters: the backfill assumes the new columns exist.

### 2) Rollout Toggle: CATALOG_DB_PRICING
Added `CATALOG_DB_PRICING` to the runtime config with default `true`:
- Files:
  - `src/config/environment.ts`
  - `src/types/environment.ts`
  - `src/tests/setup.ts` (test override)

Behavior:
- Listings always come from DB (`products` + `product_variants`).
- When `true`, pricing comes from current `price_history`.
- When `false`, pricing falls back to handler/metadata-derived values.

### 3) Legacy Pricing Fallback Helper
New helper for resolving legacy pricing and currency when DB-driven pricing is disabled:
- File: `src/utils/catalogPricing.ts`
- Behavior:
  - Resolves price from `variant.metadata`, then `product.metadata`, then handler price.
  - Resolves currency from metadata or falls back to product default or `USD`.

### 4) Listings and Pricing Integration
Key updates to align listing and checkout behavior with the feature flag:

- `src/routes/subscriptions.ts`
  - `/subscriptions/available` uses `catalogService.listActiveListings`.
  - Pricing comes from `price_history` when `CATALOG_DB_PRICING=true`.
  - Missing plan codes or prices trigger admin tasks to keep catalog hygiene.
  - Handler plans are used only when `metadata.use_handler = true` (or when pricing fallback is active).

- `src/routes/payments.ts`
  - Checkout now loads product + variant and validates active status.
  - DB-driven pricing uses `catalogService.getCurrentPrice`.
  - Legacy fallback uses `resolveLegacyPriceCents` + `resolveLegacyCurrency` when flag is off.

## Testing and Smoke Verification

### Automated Tests
- Backend build: `npm run build`
- Backend tests: `npm test`
- Frontend typecheck: `npm run check`
- Frontend build: `npm run build`

### Integration Tests Added
- `/subscriptions/available` DB-driven output:
  - `src/tests/subscriptionAvailableRoutes.test.ts`
- Label attach/detach (product_label_map):
  - `src/tests/adminProductLabels.test.ts`
- Purchase validation using DB rules:
  - `src/tests/subscriptionValidationRoutes.test.ts`

### API Smoke Tests Performed
- Verified `/health` for DB + Redis connectivity.
- Verified `/api/v1/subscriptions/available`.
- Verified `/api/v1/subscriptions/validate-purchase` with auth.
- Verified label attach/detach via admin endpoints.
- Verified `/` and `/browse` frontend routes via HTTP response checks.

### Purchase Flow Smoke Tests
- Credits purchase flow (admin credit add and credit checkout).
- Stripe payment intent flow with webhook handling.
- NOWPayments mock top-up flow (local mock server + signed webhook).

Note: UI-driven manual browser testing was not performed in this phase.

## Rollout Notes
Recommended rollout sequence:
1. Apply migrations in order:
   - `20260105_160000_add_product_publishing_fields.sql`
   - `20260105_170000_backfill_product_publishing_defaults.sql`
2. Ensure `CATALOG_DB_PRICING=true` (default) for DB-driven pricing.
3. Verify listings via `/api/v1/subscriptions/available`.
4. Verify checkout pricing with a known product variant.
5. Monitor admin tasks for missing plan codes or prices.

## Verification Queries (Optional)
These are useful after running the migrations:

```sql
-- Confirm columns exist
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'products'
  AND column_name IN ('logo_key', 'category', 'default_currency', 'max_subscriptions');

-- Confirm no missing publishing fields
SELECT
  COUNT(*) FILTER (WHERE logo_key IS NULL OR logo_key = '') AS missing_logo_key,
  COUNT(*) FILTER (WHERE category IS NULL OR category = '') AS missing_category,
  COUNT(*) FILTER (WHERE default_currency IS NULL OR default_currency = '') AS missing_default_currency,
  COUNT(*) FILTER (WHERE max_subscriptions IS NULL) AS missing_max_subscriptions
FROM products;

-- Confirm legacy constraints are removed
SELECT conname
FROM pg_constraint
WHERE conname IN ('subscriptions_service_type_check', 'subscriptions_service_plan_check');
```

## Files Touched
- `database/migrations/20260105_160000_add_product_publishing_fields.sql`
- `database/migrations/20260105_170000_backfill_product_publishing_defaults.sql`
- `src/config/environment.ts`
- `src/types/environment.ts`
- `src/utils/catalogPricing.ts`
- `src/routes/subscriptions.ts`
- `src/routes/payments.ts`
- `src/tests/setup.ts`
- `src/tests/subscriptionAvailableRoutes.test.ts`
- `src/tests/adminProductLabels.test.ts`
- `src/tests/subscriptionValidationRoutes.test.ts`
