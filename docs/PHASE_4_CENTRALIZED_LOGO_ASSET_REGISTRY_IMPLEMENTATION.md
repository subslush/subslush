# Phase 4 - Centralized Logo Asset Registry Implementation

## Overview
Phase 4 centralizes logo assets in a single registry so the database stores
only `logo_key`, and frontend components resolve the real asset at render time.
This reduces scattered logo maps and allows admins to pick from consistent,
codebase-backed assets.

## Scope and Intent
- Create a single registry that maps `logo_key` -> imported asset.
- Replace scattered logo maps in:
  - `SubscriptionGrid.svelte`
  - `SubscriptionHero.svelte`
  - `RelatedPlans.svelte`
  - `SubscriptionBrowseCard.svelte`
- Update the admin product detail page to select `logo_key` from a dropdown.
- Keep the DB as the source of truth by storing only `logo_key`.

## Implementation Summary

### Central logo registry
File: `frontend/src/lib/assets/logoRegistry.ts`

Introduced:
- `logoRegistry`: the canonical mapping of `logo_key` to asset import.
- `logoKeys`: list of available keys for UI dropdowns.
- `resolveLogoKey(logoKey)`: resolves a key to its asset path (case-insensitive).

Current registry keys:
- `netflix`
- `spotify`
- `tradingview`
- `hbo`

This file is the single source of truth for logo assets in the UI.

### Component updates to use the registry
Replaced component-local logo maps with `resolveLogoKey`:
- `frontend/src/lib/components/home/SubscriptionGrid.svelte`
  - Uses `logoKey`/`logo_key` from plan data when present.
  - Falls back to service type as a key for backwards compatibility.
- `frontend/src/lib/components/subscription/SubscriptionHero.svelte`
  - Resolves the hero logo from `logoKey`/`logo_key` or service type.
- `frontend/src/lib/components/subscription/RelatedPlans.svelte`
  - Resolves logos per related plan using the registry.
- `frontend/src/lib/components/browse/SubscriptionBrowseCard.svelte`
  - Resolves logo from registry first, then falls back to `logoUrl`.
  - Adds a stable `on:error` handler to display the fallback if the image fails.

### Admin product detail logo selector
File: `frontend/src/routes/admin/products/[productId]/+page.svelte`

Updates:
- Added `logo_key` to the product form payload.
- Added a dropdown populated by `logoKeys` from the registry.
- The admin UI now stores `logo_key` only; the UI resolves the asset.

### Types updated to include logo keys
Files:
- `frontend/src/lib/types/subscription.ts`
- `frontend/src/lib/types/browse.ts`

Added optional `logoKey` / `logo_key` fields to relevant types so
typed consumers can carry `logo_key` through to the UI.

## Data Flow
- Admin selects a `logo_key` on the product detail page.
- Backend stores `logo_key` on the product.
- Frontend components resolve the asset by calling `resolveLogoKey(logo_key)`.
- The asset mapping remains centralized in `logoRegistry.ts`.

## Compatibility Notes
- Components still render when `logo_key` is missing by:
  - falling back to service type, or
  - falling back to `logoUrl` (browse card), or
  - showing a text initial fallback.

## Testing (Phase 4)
Executed:
- `npm run check` in `frontend/`

Result:
- PASS (0 errors); warnings remain for unrelated a11y/CSS items.

## Additional Fixes Required to Pass Smoke Test
While running the Phase 4 smoke test (`npm run check`), existing
TypeScript errors unrelated to logo registry surfaced. These were
addressed to make the check reliable:

- `frontend/src/lib/api/client.ts`
  - Added `HEAD` to the allowed request methods for CSRF checks.
- `frontend/src/lib/stores/auth.ts`
  - Made user name fields optional to match backend types.
- `frontend/src/lib/utils/debounce.ts`
  - Added explicit `this` typing to debounce/throttle wrappers.
- `frontend/src/lib/components/browse/SubscriptionGrid.svelte`
  - Added the `filters:clear` event to the dispatcher typing.
- `frontend/src/lib/components/subscription/SubscriptionCard.svelte`
  - Made the pricing map index-safe with a general `Record` type.
- `frontend/src/routes/admin/products/[productId]/+page.svelte`
  - Defaulted `priceHistory` to an empty array.
- `frontend/src/routes/browse/+page.svelte`
  - Added a local plan type for typed filtering.
- `frontend/src/routes/dashboard/+layout.svelte`
  - Typed `data` from layout load for safe access.
- `frontend/src/routes/dashboard/+page.svelte`
  - Asserted the overview type for stable keyed access.
- `frontend/src/lib/components/browse/SubscriptionBrowseCard.svelte`
  - Replaced `onerror` attribute with `on:error` + fallback state.

These changes were required for a stable, repeatable smoke test and do
not alter the Phase 4 logo registry behavior.
