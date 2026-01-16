# Phase 3 - Data Model for Publishing + Rules Implementation

## Overview
Phase 3 adds product-level publishing fields to the catalog data model and wires
those fields through the admin create/update flows. It also establishes the
rules strategy by using `products.metadata.rules` so future rule changes can be
admin-editable without new migrations.

## Scope and Intent
- Add publishing configuration fields to `products`:
  - `logo_key` (string)
  - `category` (string)
  - `default_currency` (string)
  - `max_subscriptions` (integer)
- Keep rules in `products.metadata.rules` to avoid schema churn.
- Update product create/update payloads and mappings to include the new fields.

## Database Changes
### Migration
File: `database/migrations/20260105_160000_add_product_publishing_fields.sql`

Adds the following columns to `products`:
- `logo_key VARCHAR(150)`
- `category VARCHAR(100)`
- `default_currency VARCHAR(10)`
- `max_subscriptions INTEGER`

The migration is additive and includes `-- Up Migration` / `-- Down Migration`
blocks to align with the repo migration runner.

### How to Apply
From the repo root:
```
node database/migrate.js up
```

## Backend Changes
### Catalog Types
File: `src/types/catalog.ts`

`Product`, `CreateProductInput`, and `UpdateProductInput` now include:
- `logo_key?: string | null`
- `category?: string | null`
- `default_currency?: string | null`
- `max_subscriptions?: number | null`

### Catalog Service
File: `src/services/catalogService.ts`

- `mapProduct` now includes the new columns.
- `createProduct` inserts the new columns.
- `updateProduct` allows updating the new columns.

### Admin Routes
File: `src/routes/admin/catalog.ts`

- Product create (`POST /admin/products`) and update
  (`PATCH /admin/products/:productId`) schemas now accept:
  - `logo_key`, `category`, `default_currency`, `max_subscriptions`.

## Frontend Types
File: `frontend/src/lib/types/admin.ts`

`AdminProduct` now includes:
- `logo_key` / `logoKey`
- `category`
- `default_currency` / `defaultCurrency`
- `max_subscriptions` / `maxSubscriptions`

This supports the admin UI payload shape for the new fields.

## Rules Strategy
Rules are stored under `products.metadata.rules`. This allows admin-editable
rule changes without additional migrations. Schema validation will be enforced
in Phase 7, when the rule engine is introduced.

## API Compatibility
- Existing list/create endpoints remain backward compatible.
- All added fields are optional and default to `NULL` in the database.

## Smoke Tests
- Ran `npm run build` to validate TypeScript compilation.
- Executed a catalog service smoke test that:
  - created a product with the new fields and `metadata.rules`,
  - verified the values on read,
  - updated the new fields,
  - verified the updated values,
  - cleaned up the test row.

## Follow-On Work (per plan)
- Phase 4: introduce centralized logo registry and admin dropdown.
- Phase 5: switch listings to DB-driven catalog publishing.
- Phase 7: enforce rules with schema validation at runtime.
