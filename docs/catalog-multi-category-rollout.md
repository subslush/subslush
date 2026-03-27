# Catalog Multi-Category Rollout (Two-Phase)

## Goal

Enable a product to belong to multiple catalog sub-categories while keeping backward compatibility with existing `products.category` and `products.sub_category` fields during rollout.

## Phase 1 (Implemented Here)

### Database

- Add mapping table: `product_sub_category_map`
  - `product_id` -> `products.id`
  - `sub_category_id` -> `product_sub_categories.id`
  - `is_primary` flag (one primary per product via partial unique index)
- Backfill mapping rows from existing `products.category` + `products.sub_category`.
- Keep legacy columns in place and populated.

### Backend

- Dual-write product taxonomy changes:
  - `products.category` + `products.sub_category` (legacy primary fields)
  - `product_sub_category_map` (new source for many-to-many membership)
- Backward-compatible reads:
  - if `product_sub_category_map` exists, reads use mapping-table membership
  - if it does not exist yet, reads safely fall back to legacy category fields
- `createProduct` / `updateProduct` now support `sub_category_ids`.
- Primary sub-category is persisted back to legacy columns for compatibility.
- Product/sub-category filtering supports mapping-table membership with legacy fallback.
- Sub-category product counts now use mapping table.
- Browse listing payload now includes `category_keys` for multi-category client filtering.

### Admin UI

- Product edit page now supports:
  - selecting multiple sub-categories
  - choosing one primary sub-category
- Sub-category workspace product creation now sends `sub_category_ids` with the selected sub-category.

## Two-Phase Deployment Plan

### Phase A: Schema + Backfill (No app behavior switch)

1. Apply migration:
   - `database/migrations/20260327_130000_add_product_sub_category_map.sql`
2. Verify DB state:
   - table exists: `product_sub_category_map`
   - row count is non-zero after backfill for existing categorized products
   - unique primary invariant holds per product (`uq_product_sub_category_map_primary_per_product`)

### Phase B: App Rollout (API + Admin + Browse/Home)

1. Deploy backend + frontend from this branch.
2. Run smoke tests:
   - existing products still load in admin and storefront
   - product edit can assign multiple sub-categories and set one primary
   - `/browse` category filters include products assigned through mapping table
   - home category rails include products in all assigned categories
3. Regression check:
   - legacy single-category products continue to render correctly
   - category/sub-category filters still work when mapping rows are absent

## Phase 2 (Follow-Up)

### Objectives

- Make mapping table the sole taxonomy source.
- Remove dependency on legacy category columns in reads/writes.

### Recommended Steps

1. Remove legacy fallback reads in backend filters.
2. Remove direct editing of `products.category` and `products.sub_category`.
3. Keep legacy columns as derived/read-only for one release (optional).
4. When fully stable, drop or deprecate legacy columns in a separate migration.

### Guardrails

- No data-destructive operations in same release as behavior switch.
- Keep observability on browse/category mismatch for at least one release before removing fallback logic.
