# Phase 5 - DB-Driven Listings Implementation

## Overview
Phase 5 switches `/subscriptions/available` to be database-driven. Active
products and variants are now the source of truth for browse listings, with
guardrails that hide listings missing price or plan codes. When a listing
cannot be safely published, an admin task is created to surface the issue.

## Scope and Intent
- Use `products` + `product_variants` as the publish gate for listings.
- Keep the response shape compatible with existing UI consumers.
- Hide listings without a resolvable price or plan code.
- Create admin tasks when listings are skipped for missing data.
- Update browse/home loaders to use the DB-driven `/subscriptions/available`.

## Backend Changes

### Catalog listing query
File: `src/services/catalogService.ts`

Added:
- `listActiveListings({ service_type? })`
  - Joins `products` + `product_variants` for active listings only.
  - Filters by `products.status = 'active'` and `product_variants.is_active = true`.
  - Optional filter by `service_type`.
  - Returns `{ product, variant }` pairs via the new `CatalogListing` type.

### Listing endpoint
File: `src/routes/subscriptions.ts`

`GET /subscriptions/available` now:
- Pulls listings from `catalogService.listActiveListings`.
- Derives plan codes from:
  - `product_variants.service_plan`, then
  - `product_variants.variant_code`.
- Resolves price in order:
  1) `variant.metadata.price` or `variant.metadata.price_cents`,
  2) `product.metadata.price` or `product.metadata.price_cents`,
  3) handler plan price (if handler exists).
- Resolves features in order:
  1) `variant.metadata.features`,
  2) `product.metadata.features`,
  3) handler plan features (if handler exists).
- Builds listing fields:
  - `service_type` from product
  - `service_name` from product name
  - `plan` from variant plan code
  - `display_name`/`name` from variant name (fallback to handler name/product name)
  - `description` from variant/product/handler
  - `logo_key` from product
  - `category` from product

### Admin task creation on missing data
File: `src/routes/subscriptions.ts`

When a listing cannot be published:
- Missing price (no metadata price and no handler price)
  - Listing is skipped
  - Creates an admin task:
    - `task_category`: `catalog_missing_price`
    - `task_type`: `support`
    - `priority`: `high`
    - `due_date`: now + 24h
    - `notes`: includes product/variant ids, service type, plan code
- Missing plan code (`service_plan` and `variant_code` both null)
  - Listing is skipped
  - Creates an admin task:
    - `task_category`: `catalog_missing_plan_code`
    - `task_type`: `support`
    - `priority`: `high`
    - `due_date`: now + 24h
    - `notes`: includes product/variant ids, service type

Tasks are deduped by `task_category` + `notes` for open tasks.

## Frontend Changes

### Browse loader
File: `frontend/src/routes/browse/+page.ts`

- Now calls `/subscriptions/available`.
- Flattens `services` into plan cards.
- Passes through `logo_key`/`logoKey` and `service_name`.

### Home loader
File: `frontend/src/routes/+page.ts`

- Uses `service_name` for display.
- Passes through `logo_key`/`logoKey` for the home grid logo registry.

### Types
File: `frontend/src/lib/types/subscription.ts`

- `ServicePlanDetails` extended with optional fields:
  - `name`, `service_name`, `logo_key`, `logoKey`, `category`.

## API Response Shape (unchanged)

`GET /subscriptions/available`
```
{
  services: {
    [service_type]: [
      {
        plan: string,
        name: string,
        display_name: string,
        description: string,
        price: number,
        features: string[],
        service_type: string,
        service_name: string,
        logo_key?: string,
        logoKey?: string,
        category?: string,
        product_id: string,
        variant_id: string
      }
    ]
  },
  total_plans: number
}
```

## Operational Notes
- Listings are now controlled by:
  - `products.status = 'active'`
  - `product_variants.is_active = true`
- Missing price/plan data is handled via admin tasks (no silent failures).
- Handler-based fallbacks are used only for features/price, never for publish gate.

## Smoke Tests (Phase 5)
Executed:
- `npm run build` (backend) - PASS
- `npm test` (backend Jest) - PASS
- `npm run check` (frontend) - PASS

Live API smoke (local dev):
- Inserted 3 products/variants:
  1) Valid listing with price
  2) Missing price
  3) Missing plan code
- Verified:
  - `/api/v1/subscriptions/available` includes only the priced listing
  - Admin tasks created for missing price + missing plan code
  - `/browse` renders the DB-driven listing
- Cleanup:
  - Removed inserted products/variants and admin tasks

## No Migrations
No new migrations introduced in Phase 5.
