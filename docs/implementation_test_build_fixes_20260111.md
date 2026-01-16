# Subscription Catalog + Pricing Snapshot Implementation (Full Record)

## Overview
This document records the full production-ready implementation for the catalog restructure (product + variants + terms), pricing snapshots, variant_id-only purchases, and multi-currency enforcement. It also captures the test/build remediation work and verification results.

## Confirmed Decisions
- Purchases and checkout are variant_id-only. No service_type/service_plan fallback for purchases.
- Renewals are price-locked: renewals reuse the stored purchase snapshot, not current catalog pricing.
- Duration options come from DB terms. No hardcoded 1-12 month caps.
- Discounts are admin-controlled and applied in pricing logic (not display-only).
- No ratings/reviews or mock pricing content in production UI.
- Old browse route (/browse/subscriptions/...) and legacy API route (GET /subscriptions/:serviceType/:planId) are removed.
- All 4 currencies (USD, GBP, CAD, EUR) are required before a product can be activated/published.

## Data Model and Migrations
- Added `product_variant_terms` table with term months, discounts, and sort order.
  - Cascade cleanup on variant delete is enforced with `ON DELETE CASCADE`.
- Added snapshot columns to preserve purchase terms:
  - `orders.term_months`
  - `order_items.term_months`, `order_items.base_price_cents`, `order_items.discount_percent`
  - `payments.term_months`, `payments.base_price_cents`, `payments.discount_percent`
  - `subscriptions.term_months`, `subscriptions.base_price_cents`, `subscriptions.discount_percent`
- Backfill migration populates `term_months` using order/item/payment metadata (no date delta inference).

Relevant migrations:
- `database/migrations/20260112_120000_add_variant_terms_and_pricing_snapshot.sql`
- `database/migrations/20260112_130000_backfill_term_months.sql`

## Backend Implementation
### Pricing Resolver
- `resolveVariantPricing` fetches:
  - Product + variant by `variant_id`
  - Term by `term_months`
  - Price from `price_history` by currency
  - Computes a term pricing snapshot (base, discount, total) in cents
- Used consistently in credit checkout and Stripe checkout to ensure math parity.

### Catalog Listing and Product Detail
- `/subscriptions/products/available` returns product listings with derived minimum effective monthly price based on variant terms.
- `/subscriptions/products/:slug` returns product detail with variants and term options (discounted totals).

### Variant_id-only Enforcement
- Purchase validation and purchase endpoints accept `variant_id` only.
- `SubscriptionService.canPurchaseSubscription` now resolves by `variant_id` only.
- `SubscriptionService.createSubscription` requires `product_variant_id`.
- `findProductVariantByServicePlan` now returns null if the lookup is ambiguous (multiple variants share the same plan code).

### Price Locking and Renewals
- Pricing snapshots (base price, discount, term) are persisted on orders, payments, and subscriptions at purchase time.
- Auto-renew and manual renewals use the stored snapshot (price lock).

### Multi-currency Enforcement
- Admin activation blocks publish if any active variant is missing prices for USD/GBP/CAD/EUR.
- Checkout and validation already fail for missing currency in the pricing resolver.

## Frontend Implementation
- Removed legacy browse route `/browse/subscriptions/[serviceType]/[planId]`.
- Updated browse/detail links to use `/browse/products/:slug` only.
- Removed mock ratings/reviews and mock pricing in subscription browse cards and legacy cards.
- Admin product creation defaults to `inactive` to align with publish requirements.

## Compatibility and Deprecations
- Removed GET `/subscriptions/:serviceType/:planId`.
- Removed `/browse/subscriptions/...` Svelte route.
- Any remaining service_type/plan lookup is limited to admin validation; ambiguous matches return null.

## Test and Build Remediation
### Jest Failures (Resolved)
1. `subscriptionValidationRateLimit.integration.test.ts`
   - Symptom: unexpected response codes (used legacy inputs).
   - Fix: tests updated to send `variant_id` and mock new catalog lookups.
2. `subscriptionValidationRoutes.test.ts`
   - Symptom: expected 200 but received 400.
   - Fix: update payload to `variant_id` and mock pricing resolver inputs.
3. `subscriptionAvailableRoutes.test.ts`
   - Symptom: expected 200 but received 500.
   - Fix: mock term + price maps used by DB-driven listing.

### TypeScript Build Errors (Resolved)
- Unused imports removed.
- `exactOptionalPropertyTypes` issues resolved via conditional spreads.
- Metadata index-signature access corrected to bracket notation.
- Term updates persisted during subscription activation.
- Guarded optional `atDate` parameters.
- Fixed unsafe Date casts.

### New Build Error (Resolved)
- `src/routes/admin/catalog.ts`: TS2532 possible undefined currency map.
  - Fix: guard `currencyMaps[index]` before `.has()`.

## Verification Results
- `npm test` - PASS (33 suites, 180 tests). Jest still reports forced exit (pre-existing behavior).
- `npm run build` - PASS after fixing TS2532 in admin catalog currency enforcement.

## Files Changed in This Implementation
### Backend
- `src/services/catalogService.ts`
- `src/services/subscriptionService.ts`
- `src/services/variantPricingService.ts`
- `src/routes/subscriptions.ts`
- `src/routes/payments.ts`
- `src/routes/admin/catalog.ts`
- `src/services/creditService.ts`
- `src/services/paymentService.ts`
- `src/services/jobs/subscriptionJobs.ts`
- `src/services/renewalNotificationService.ts`
- `src/schemas/subscription.ts`
- `src/utils/termPricing.ts`

### Frontend
- `frontend/src/routes/browse/products/[slug]/+page.ts`
- `frontend/src/routes/browse/+page.svelte`
- `frontend/src/lib/api/subscriptions.ts`
- `frontend/src/lib/components/subscription/SubscriptionCard.svelte`
- `frontend/src/lib/components/subscription/RelatedPlans.svelte`
- `frontend/src/lib/components/browse/SubscriptionBrowseCard.svelte`
- `frontend/src/routes/admin/products/+page.svelte`

### Database Migrations
- `database/migrations/20260112_120000_add_variant_terms_and_pricing_snapshot.sql`
- `database/migrations/20260112_130000_backfill_term_months.sql`

### Tests
- `src/tests/subscriptionValidationRateLimit.integration.test.ts`
- `src/tests/subscriptionValidationRoutes.test.ts`
- `src/tests/subscriptionAvailableRoutes.test.ts`
- `src/tests/subscriptionService.test.ts`

### Removed
- `frontend/src/routes/browse/subscriptions/[serviceType]/[planId]/+page.ts`
- `frontend/src/routes/browse/subscriptions/[serviceType]/[planId]/+page.svelte`

### Documentation
- `docs/implementation_test_build_fixes_20260111.md` (this file, expanded to full implementation record)

