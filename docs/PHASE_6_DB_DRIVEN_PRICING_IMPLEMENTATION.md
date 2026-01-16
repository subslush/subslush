# Phase 6 - DB-Driven Pricing Implementation

## Overview
Phase 6 makes `price_history` the authoritative source of pricing for catalog
listings and purchase flows. Price metadata and handler fallbacks are no longer
used for published pricing. Admins can now set a current price for a variant
and optionally close the previous price window in a single action.

This phase also resolves build-time warnings in the frontend toolchain by
aligning Svelte and related dependencies to Svelte 5 and updating the baseline
browser mapping dataset.

## Scope and Intent
- Use `price_history` as the single source of truth for pricing.
- Hide listings when no current price exists.
- Block purchase and checkout flows when no current price exists.
- Add an admin "set current price" action that can end-date the previous price.
- Remove build warnings by aligning Svelte dependencies.

## Backend Changes

### Catalog service additions
File: `src/services/catalogService.ts`

Added:
- `setCurrentPrice(input, options?)`
  - Transactionally inserts a new `price_history` row.
  - Optionally end-dates any overlapping price entry for the same variant.
  - Ensures the new price is the current price as of `starts_at`.

Existing:
- `getCurrentPrice(variantId, atDate?)`
  - Used as the authoritative source of current pricing.

### Listing pricing now uses `price_history`
File: `src/routes/subscriptions.ts`

`GET /subscriptions/available` now:
- Fetches current prices with `catalogService.getCurrentPrice` for each listing.
- Uses `price_cents / 100` as the displayed price.
- Skips listings with no current price and creates an admin task:
  - `task_category`: `catalog_missing_price`
  - `task_type`: `support`
  - `priority`: `high`
  - `due_date`: now + 24h
  - `notes`: includes product/variant ids, service type, plan code.
- Removes metadata and handler-based pricing fallbacks for listing output.

### Purchase validation uses `price_history`
File: `src/routes/subscriptions.ts`

`POST /subscriptions/validate-purchase` now:
- Resolves variant via `catalogService.findVariantForServicePlan`.
- Loads current price from `price_history`.
- Returns `can_purchase: false` if no current price exists.
- Sets `required_credits` based on `price_cents` and requested duration.
- Returns `plan_details` with the resolved price.

### Purchase flow uses `price_history`
File: `src/routes/subscriptions.ts`

`POST /subscriptions/purchase` now:
- Requires a resolvable variant and current price.
- Uses `price_history.currency` for order and subscription currency.
- Uses `price_history.price_cents` for:
  - Order totals
  - Credit debits
  - Subscription `price_cents`
- Blocks purchase when price is missing or invalid.

### Unified checkout uses `price_history`
File: `src/routes/payments.ts`

`POST /payments/checkout` now:
- Requires a resolvable variant and current price.
- Uses `price_history.currency` and `price_cents`.
- Blocks checkout when price is missing or invalid.

### Admin endpoint: set current price
File: `src/routes/admin/catalog.ts`

Added:
- `POST /admin/price-history/current`
  - Body:
    - `product_variant_id` (string, required)
    - `price_cents` (number, required)
    - `currency` (string, required)
    - `starts_at` (string, optional)
    - `end_previous` (boolean, optional, default true)
    - `metadata` (object, optional)
  - Writes a new `price_history` row and optionally end-dates the previous one.
  - Emits `catalog.price_history.set_current` audit logs.

## Frontend Changes

### Admin product detail pricing UI
File: `frontend/src/routes/admin/products/[productId]/+page.svelte`

Updates:
- "Set Price History" panel renamed to "Set Current Price".
- Adds an "End previous price when this takes effect" toggle.
- Calls `adminService.setCurrentPrice` instead of `createPrice`.

### Admin API client + types
Files:
- `frontend/src/lib/api/admin.ts`
- `frontend/src/lib/types/admin.ts`

Additions:
- `AdminSetCurrentPriceInput` type
- `setCurrentPrice(payload)` API method

## Tooling and Dependency Updates

### Baseline warning removal
The warning from `baseline-browser-mapping` was eliminated by adding the latest
package to dev dependencies.

### Svelte `untrack` warning removal
The build warning caused by Svelte 4 lacking `untrack` was resolved by aligning
Svelte and SvelteKit versions to the current Svelte 5 compatible toolchain.

Updated versions:
- `svelte` -> `^5.46.1`
- `@sveltejs/kit` -> `^2.49.3`
- `@sveltejs/adapter-auto` -> `^7.0.0`
- `@sveltejs/vite-plugin-svelte` -> `^4.0.4`
- `svelte-check` -> `^4.3.5`
- `typescript` -> `^5.9.2`
- `lucide-svelte` -> `^0.562.0` (Svelte 5 compatible)
- `baseline-browser-mapping` -> `^1.0.0`

### Svelte check warning cleanup
File: `frontend/src/lib/components/dashboard/SubscriptionCard.svelte`

Fix:
- Replaced a self-closing `span` with an explicit closing tag to comply with
  Svelte 5 template parsing.

## Pricing Rules (Current Price)
- A "current price" exists when:
  - `starts_at <= now`
  - `ends_at IS NULL OR ends_at > now`
  - The most recent `starts_at` wins.
- Listings and purchases only proceed when a current price exists.
- Currency is sourced from `price_history.currency`.

## Tests and Smoke Checks (Phase 6)

Backend:
- `npm run build` (backend)
- `npm test` (backend Jest)

Frontend:
- `npm run check` (frontend)
- `npm run build` (frontend)

Live API smoke (local dev):
- Inserted test products/variants and price history for one variant.
- Set current price via `POST /api/v1/admin/price-history/current`.
- Confirmed `/subscriptions/available` only returns priced listings.
- Confirmed `catalog_missing_price` admin task created for missing price variant.
- Confirmed `validate-purchase` uses DB price (credits required).
- Confirmed `purchase` uses DB price and sets `price_cents`.
- Cleaned up all inserted data and Redis sessions.

## API Request/Response Shapes

### POST /admin/price-history/current
Request:
```
{
  "product_variant_id": "uuid",
  "price_cents": 7000,
  "currency": "usd",
  "starts_at": "2026-01-05T18:53:10Z",
  "end_previous": true
}
```
Response:
```
{
  "id": "uuid",
  "product_variant_id": "uuid",
  "price_cents": 7000,
  "currency": "usd",
  "starts_at": "2026-01-05T18:53:10Z",
  "ends_at": null,
  "created_at": "2026-01-05T18:53:10Z"
}
```

### GET /subscriptions/available (pricing behavior)
Price is always sourced from `price_history` for each variant.
Listings without current price are skipped and create admin tasks.

## Operational Notes
- `price_history` is now required for publishing a listing.
- Admin task creation for missing price continues to surface gaps.
- Purchase flows now block on missing `price_history` entries.
- `price_history.currency` is the authoritative currency in orders and
  subscriptions.

## Follow-On Work (per plan)
- Phase 7 will replace handler-based validation with DB rules and open
  the service type/plan types to new values.
- Phase 8 will refine admin product detail UX for full catalog workflows.
