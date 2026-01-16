# Phase 10 - Catalog Cleanup + Pricing Flag Normalization Implementation

## Overview
This phase cleans up catalog behavior around pricing, service type normalization,
and browse metadata so the platform behaves consistently without introducing
new workflows. It also completes the centralized logo registry usage.

## Goals
- Make the pricing feature flag explicit and correctly named.
- Normalize service types at write time and use case-insensitive lookups.
- Enforce `max_subscriptions` per product with a safe legacy fallback.
- Prefer DB-provided product categories in the browse UI.
- Surface variant display metadata (display name, badges) in listings.
- Finish logo registry adoption in remaining components.

## Scope
Backend and frontend changes only. No DB migrations are added in this phase.

## Implementation Summary

### 1) Pricing Feature Flag Rename (Clarity)
Renamed `CATALOG_DB_LISTINGS` -> `CATALOG_DB_PRICING` to reflect that listings
remain DB-driven and only pricing source is toggled.

Files:
- `src/config/environment.ts`
- `src/types/environment.ts`
- `src/routes/subscriptions.ts`
- `src/routes/payments.ts`
- `src/tests/setup.ts`
- `docs/PHASE_9_MIGRATIONS_BACKFILL_TESTS_ROLLOUT_IMPLEMENTATION.md`
- `.env.example`

Behavior:
- Listings always come from DB (`products` + `product_variants`).
- `CATALOG_DB_PRICING=true` uses `price_history`.
- `CATALOG_DB_PRICING=false` uses metadata/handler-derived pricing.

Additional logging in `/subscriptions/available` now reports listing/pricing
sources for visibility.

### 2) Service Type Normalization
Service type is normalized to lowercase on write, and lookups are case-insensitive.
This avoids mixed-case mismatches without introducing new constraints.

Files:
- `src/services/catalogService.ts`

Updates:
- Normalized `service_type` in `createProduct` and `updateProduct`.
- Normalized and lowercased lookups in:
  - `getProductByServiceType`
  - `listActiveListings` filter
  - `findProductVariantByServicePlan`
  - `findVariantForServicePlan`

### 3) Per-Product Max Subscriptions
`max_subscriptions` is now enforced per product instead of per service type,
with a fallback for legacy rows that lack `product_variant_id`.

Files:
- `src/services/subscriptionService.ts`
- `src/tests/subscriptionService.test.ts`

Updates:
- Added `getActiveSubscriptionsCountByProduct`:
  - Counts active subscriptions via `subscriptions.product_variant_id` ->
    `product_variants.product_id`.
  - Adds a fallback count for legacy rows where `product_variant_id` is null,
    filtered by `service_type`.
- `canPurchaseSubscription` now uses the new per-product count.

### 4) Browse UI Category Source
Browse filtering now prefers DB-provided category values, falling back to the
legacy map only when category is missing.

Files:
- `frontend/src/routes/browse/+page.ts`
- `frontend/src/routes/browse/+page.svelte`

Updates:
- Loader passes through `plan.category`.
- UI uses `plan.category` when present, otherwise uses the legacy map.

### 5) Variant Display Metadata in Listings
Listings now honor `variant.metadata.display_name` before the variant name,
and optionally return `badges` for UI consumption.

Files:
- `src/routes/subscriptions.ts`
- `frontend/src/lib/types/subscription.ts`

Updates:
- `display_name`/`name` resolution prefers `metadata.display_name`.
- `badges` array included in listings when available.

### 6) Centralized Logo Registry Completion
`BundleCard` now resolves logos via the shared registry.

Files:
- `frontend/src/lib/assets/logoRegistry.ts`
- `frontend/src/lib/components/home/BundleCard.svelte`

Updates:
- Added `resolveLogoKeyFromName` helper with alias support.
- Removed local logo map from `BundleCard`.

## Testing

### Backend
- `npm test`
  - PASS (19 suites, 146 tests)
  - Jest reported open handles; optional follow-up with `--detectOpenHandles`.

### Frontend
- `cd frontend && npm run check`
  - PASS

## Rollout Notes
- Update runtime env var name from `CATALOG_DB_LISTINGS` to `CATALOG_DB_PRICING`.
- Remove or ignore the old flag to avoid confusion.
- No database migrations required for this phase.

## Files Touched (Highlights)
- `src/routes/subscriptions.ts`
- `src/routes/payments.ts`
- `src/services/catalogService.ts`
- `src/services/subscriptionService.ts`
- `frontend/src/routes/browse/+page.ts`
- `frontend/src/routes/browse/+page.svelte`
- `frontend/src/lib/assets/logoRegistry.ts`
- `frontend/src/lib/components/home/BundleCard.svelte`
- `.env.example`

