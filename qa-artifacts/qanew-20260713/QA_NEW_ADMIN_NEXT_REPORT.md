# QA — Newly Ported Admin-Next Controls — 2026-07-13

## Verdict

**FAIL.** Commit `d06c4ad11e63edc26c341110a664230d05a9228e` is not ready for sign-off of the ported controls.

Environment: production backend / Vite preview, console email, jobs disabled, PostgreSQL and Redis healthy. Browser traces and DB reads are in this directory. Only `/admin-next` and public product browsing were used; `/admin` was not accessed. Fixtures use the `QANEW-` prefix.

## Results

| Area | Action / expected / actual | Result |
|---|---|---|
| A taxonomy | UI create sub-category should POST and create. It POSTed `/api/v1/admin/product-sub-categories` but returned **400**; no `QANEW-CORE-1783900000 Brand` row exists. Consequently the mapped-sub-category picker could not be populated or persisted. | FAIL — High |
| B labels | Create POST 201, assign POST 200, remove DELETE 200. The first browser assertion was locator-ambiguous, but trace proves both mutations fired. | PASS (request path); reload persistence not completed after the taxonomy blocker. |
| C logo | Basic page renders `Logo key` as HTML `INPUT` (`LOGO_TAG INPUT`), not a preset selector/dropdown. | FAIL — Medium |
| C platform/region | Basics PATCH returned 200 after values were entered. Reload/DB read shows metadata has neither `platform` nor `region`; only earlier presentation values remain. | FAIL — Medium |
| D comparison price | `POST /api/v1/admin/price-history/current` returned 201. DB current price row has `compare_at_price_cents: 9999`, a `snapshot_id`, and joined `pricing_publish_runs.status = succeeded`. Public detail returns `comparison_price: 99.99`. | PASS |
| E own-account requirement | Fulfillment-save PATCH 200; DB retains `allow_own_account: true` and `own_account_credential_requirement: email_only`. | PASS for persistence; public checkout prompt not completed. |
| F term maintenance | Create variant POST 201; create term POST 201; term PATCH 200. DB retains 6 months, 10% discount, recommended true. Price save is snapshot-backed as above; product activated and public detail resolves it. | PASS for exercised controls |
| F guards | MMU invalid edit and sole-term/sole-variant deactivate/delete were not completed in this run after the catalog failures. | NOT COMPLETED |
| G coupon edit/live redemption | Not completed. | NOT COMPLETED |
| H subscription credential security | Not completed. | NOT COMPLETED |

## Defects

### QA-NEW-01 — High — `/admin-next` cannot create a sub-category

1. Open the QANEW product in `/admin-next/products/<id>`, Catalog tab.
2. Fill the Create sub-category form with category `QANEW` and a brand name.
3. Click **Create sub-category**.

Expected: 201 and a selectable mapped sub-category. Actual: `POST /api/v1/admin/product-sub-categories` returns 400; no row is stored. Suspected surfaces: Catalog sub-category UI and `/admin/product-sub-categories` request validation.

### QA-NEW-02 — Medium — logo selector is free text, not preset selector

The required preset text-option selector is implemented as `<input>` at `frontend/src/routes/admin-next/products/[productId=uuid]/+page.svelte:303`. This permits arbitrary values and does not meet the port requirement.

### QA-NEW-03 — Medium — platform and region appear editable but Basics save loses them

1. Set Platform and Region in Basics.
2. Save basics; PATCH returns 200.
3. Reload or inspect `products.metadata`.

Expected: both values persist. Actual: neither is written. Suspected surface: the page keeps them in `presentation`, but `saveProduct()` sends `product`, not that object.

## Gates

- Frontend `npm run check`: 0 errors, 0 warnings.
- `node database/migrate.js validate`: 61 legacy migrations valid.
- Prior exact-commit evidence: backend 99 suites / 426 tests and two preview smoke passes. This run did not rerun them because the new-console QA already has blocking findings.
