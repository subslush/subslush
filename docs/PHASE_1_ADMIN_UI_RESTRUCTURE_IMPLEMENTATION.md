# Phase 1 - Admin UI Restructure Implementation

## Overview
Phase 1 restructured the admin catalog UI to reduce the /admin/products page to
product/label creation plus a product list with Edit actions. All product
specific operations moved into a dedicated product detail page.

## Scope and Intent
- Simplify /admin/products to:
  - Create Product
  - Create Label
  - Product list with Edit links
- Move product editing (variants, media, pricing) to /admin/products/:id
- Keep existing list/create endpoints intact for backward compatibility

## Frontend Changes

### /admin/products list page
- Path: `frontend/src/routes/admin/products/+page.svelte`
- Server loader trimmed to only load products:
  - `frontend/src/routes/admin/products/+page.server.ts`
- UI now contains:
  - Create Product form
  - Create Label form
  - Product table with Edit links to `/admin/products/:id`
- Removed variant/media/price history panels from the list page

### Product detail page
- New route: `frontend/src/routes/admin/products/[productId]/+page.svelte`
- Loader added:
  - `frontend/src/routes/admin/products/[productId]/+page.server.ts`
- Panels included:
  - Edit product fields (name, slug, description, service type, status)
  - Create variant
  - Add media
  - Set price history
  - List existing variants/media/price entries
  - Label panel initially read-only (Phase 2 wires it to attach/detach)

### Admin client support
- Admin API client expanded in Phase 1 to support product detail fetching.
- This was later replaced by a richer `getProductDetail` in Phase 2.

## Backend Changes (Phase 1)
- Added `GET /admin/products/:id` endpoint for product detail loading
  - Initial Phase 1 implementation returned only the product record.
  - Phase 2 expanded this endpoint to return full product detail; see Phase 2 doc.

## Data Flow
- /admin/products list page calls `GET /admin/products`.
- Product detail page calls `GET /admin/products/:id` and related list endpoints
  for variants/media/price history (Phase 1 behavior).

## Compatibility and Risk
- No database migrations were introduced in Phase 1.
- Existing list/create endpoints remain unchanged.
- No breaking changes to public APIs.

## Follow-on Work (handled in Phase 2)
- Label mapping endpoints and attach/detach UI wiring.
- Product detail endpoint returning a full bundle in one call.

## Testing
- No automated tests added or run in Phase 1.

