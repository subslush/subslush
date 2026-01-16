# Phase 2 - Catalog API + Label Mapping Implementation

## Overview
Phase 2 adds a unified product detail API and full label mapping support using
`product_label_map`. The admin product detail page now supports attach/detach
label operations and loads product detail data in a single call.

## Backend Changes

### Catalog service additions
File: `src/services/catalogService.ts`
- `getProductDetail(productId)`
  - Returns `{ product, variants, labels, media, price_history }`
  - Uses existing list methods and the new label mapping helpers
- `listProductLabels(productId)`
  - Returns labels mapped to the product via `product_label_map`
- `addProductLabel(productId, labelId)`
  - Inserts mapping with `ON CONFLICT DO NOTHING`
  - Returns updated label list
- `removeProductLabel(productId, labelId)`
  - Deletes mapping row
  - Returns updated label list
- `getLabelById(labelId)`
  - Supports input validation for label map actions

### New/updated admin routes
File: `src/routes/admin/catalog.ts`
- `GET /admin/products/:id`
  - Returns product detail bundle
- `GET /admin/products/:id/labels`
  - Returns `{ labels: ProductLabel[] }`
- `POST /admin/products/:id/labels`
  - Body: `{ label_id: string }`
  - Returns `{ labels: ProductLabel[] }`
- `DELETE /admin/products/:id/labels/:labelId`
  - Returns `{ labels: ProductLabel[] }`

### Audit logging
- Label attach/detach actions emit `catalog.product.label.attach` and
  `catalog.product.label.detach` events via `logAdminAction`.

### Backward compatibility
- Existing list/create endpoints were kept unchanged.
- No DB schema changes introduced in Phase 2.

## Frontend Changes

### Admin types and client
Files:
- `frontend/src/lib/types/admin.ts`
- `frontend/src/lib/api/admin.ts`

Additions:
- `AdminProductDetail` type
- `getProductDetail(productId)`
- `listProductLabels(productId)`
- `attachProductLabel(productId, labelId)`
- `detachProductLabel(productId, labelId)`

### Product detail loader
File: `frontend/src/routes/admin/products/[productId]/+page.server.ts`
- Loads product detail bundle in one call
- Loads full label catalog separately for selection
- Exposes `assignedLabels` (mapped labels) plus `labels` (all labels)

### Product detail UI
File: `frontend/src/routes/admin/products/[productId]/+page.svelte`
- Label panel now interactive:
  - Attach/detach buttons per label
  - Assigned state display
  - Success/error feedback

### API client fix (stable behavior)
File: `frontend/src/lib/api/client.ts`
- Only sets `Content-Type: application/json` when a request body exists.
- Prevents Fastify from rejecting DELETE requests with empty bodies.

## API Response Shapes

### GET /admin/products/:id
Returns:
```
{
  product: Product,
  variants: ProductVariant[],
  labels: ProductLabel[],
  media: ProductMedia[],
  price_history: PriceHistory[]
}
```

### GET /admin/products/:id/labels
Returns:
```
{ labels: ProductLabel[] }
```

### POST /admin/products/:id/labels
Body:
```
{ label_id: string }
```
Returns:
```
{ labels: ProductLabel[] }
```

### DELETE /admin/products/:id/labels/:labelId
Returns:
```
{ labels: ProductLabel[] }
```

## Smoke Tests (Phase 2)
Smoke tests ran against the API with jobs disabled.
- Server: `JOBS_ENABLED=false PAYMENT_MONITORING_AUTO_START=false npm run dev`
- Result: PASS

Artifacts created during tests:
- product_id: `9e9fceb7-5fc7-4be2-b50f-93bf32857b04`
- label_id: `38b207a7-8cf4-4301-a1f7-2b41542df04c`
- variant_id: `660a88a1-63da-4524-965f-131bdf95e6de`
- audit_user_id (inserted into `users` for audit FK):
  `1a299a98-a500-4644-99cb-300dda217018`

Cleanup (optional): delete the above rows from `products`, `product_variants`,
`product_labels`, `product_label_map`, `product_media`, `price_history`,
`admin_audit_logs`, and `users` where needed.

