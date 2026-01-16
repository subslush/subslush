# Phase 8 - Admin Product Detail UX Implementation

## Goals
- Move product-specific operations into a dedicated admin product detail page.
- Provide a complete admin UX for publishing fields, variants, labels, pricing, and media.
- Make the product detail page self-sufficient for ongoing catalog maintenance.

## Scope
This phase focuses on the admin product detail UX in the frontend and any related admin SSR fixes discovered during smoke testing. No backend API changes or database migrations are introduced here.

## High-Level Summary
- Product detail form now includes all publishing fields: name, slug, description, service type, status, category, logo key, max subscriptions, and default currency.
- Variants can be created with optional metadata (display name, features, badges) and edited in-place via expandable panels.
- Labels are attached/detached directly from the product detail page using the label mapping endpoints.
- Pricing supports setting a current price with optional end-dating of the previous price; price history is listed below.
- Media upload remains available for product assets.
- SSR admin loads now forward cookies to backend API calls to avoid missing-token errors.

## Implementation Details

### 1) Product Details Form (Publishing Fields)
The product edit panel was expanded to cover all publishing-related fields required by the plan:
- `name`, `slug`, `description`
- `service_type`, `status`
- `category`, `logo_key`
- `max_subscriptions`, `default_currency`

Notes:
- `max_subscriptions` is parsed from string input to a number and omitted if blank.
- The logo dropdown is populated by `logoKeys` from the centralized logo registry.
- Values are normalized using `pickValue` to support both camelCase and snake_case payloads.

File:
- `frontend/src/routes/admin/products/[productId]/+page.svelte`

### 2) Variant Create + Update with Metadata
The variant workflow now supports admin-editable display metadata and inline updates:
- Create form includes `display_name`, `features`, `badges` (stored in `metadata`).
- Existing variants are rendered in expandable `<details>` panels with a full edit form.
- Metadata is merged with existing metadata to avoid overwriting unrelated keys.
- List-style inputs are normalized to arrays by splitting on newlines or commas.

Metadata mapping rules:
- `display_name` is stored as a string.
- `features` and `badges` are stored as string arrays.
- If a field is cleared, the corresponding metadata key is removed.

File:
- `frontend/src/routes/admin/products/[productId]/+page.svelte`

### 3) Label Assignment Panel
Label assignment now happens directly on the product detail page:
- All labels are listed with assigned status.
- Attach/detach uses the product label mapping endpoints.
- UI updates the assigned list on success and surfaces errors inline.

File:
- `frontend/src/routes/admin/products/[productId]/+page.svelte`

### 4) Pricing: Set Current Price + History
Pricing UX aligns with the DB-driven pricing model:
- Admin selects a variant, sets amount + currency, optional start date, and whether to end the previous price.
- New prices are posted to `/admin/price-history/current` and prepended to the history list.
- Currency defaults to the product’s `default_currency` when present.

File:
- `frontend/src/routes/admin/products/[productId]/+page.svelte`

### 5) Media Panel
Media creation remains available and unchanged in scope:
- Supports image/video type, URL, alt text, sort order, and primary flag.
- Existing media assets are listed with primary/secondary status badges.

File:
- `frontend/src/routes/admin/products/[productId]/+page.svelte`

### 6) Admin SSR Cookie Forwarding (Auth Fix)
During smoke tests, admin SSR loads failed because API requests used an absolute URL in SSR and did not forward cookies. To resolve this:
- `ApiClient` now accepts default headers which are merged into every request.
- `createAdminService` accepts a `cookie` option and passes it through to the API client.
- All admin server loaders now build a cookie header and supply it to `createAdminService`.

Files:
- `frontend/src/lib/api/client.ts`
- `frontend/src/lib/api/admin.ts`
- `frontend/src/routes/admin/+page.server.ts`
- `frontend/src/routes/admin/products/+page.server.ts`
- `frontend/src/routes/admin/products/[productId]/+page.server.ts`
- `frontend/src/routes/admin/orders/+page.server.ts`
- `frontend/src/routes/admin/payments/+page.server.ts`
- `frontend/src/routes/admin/credits/+page.server.ts`
- `frontend/src/routes/admin/rewards/+page.server.ts`
- `frontend/src/routes/admin/tasks/+page.server.ts`
- `frontend/src/routes/admin/subscriptions/+page.server.ts`

## Testing and Smoke Verification

### Automated
- Backend: `npm run build`
- Backend: `npm test`
- Frontend: `npm run check`
- Frontend: `npm run build`

### Live Smoke
- Started backend and frontend locally and verified admin flows with an authenticated session.
- Created a product, updated publishing fields, created/updated a variant with metadata, set a current price, and confirmed `/admin/products/:id` returned the updated payload.
- Verified SSR rendering of `/admin/products/:id` with auth cookies after the cookie-forwarding fix.

## Notes and Compatibility
- No new migrations are required for Phase 8.
- Product detail UX depends on prior phases’ admin endpoints (product detail, labels, media, price history).
- Variant metadata is stored under `metadata` and does not affect non-admin consumers unless explicitly referenced.

## Files Touched
- `frontend/src/routes/admin/products/[productId]/+page.svelte`
- `frontend/src/lib/api/client.ts`
- `frontend/src/lib/api/admin.ts`
- `frontend/src/routes/admin/+page.server.ts`
- `frontend/src/routes/admin/products/+page.server.ts`
- `frontend/src/routes/admin/products/[productId]/+page.server.ts`
- `frontend/src/routes/admin/orders/+page.server.ts`
- `frontend/src/routes/admin/payments/+page.server.ts`
- `frontend/src/routes/admin/credits/+page.server.ts`
- `frontend/src/routes/admin/rewards/+page.server.ts`
- `frontend/src/routes/admin/tasks/+page.server.ts`
- `frontend/src/routes/admin/subscriptions/+page.server.ts`
