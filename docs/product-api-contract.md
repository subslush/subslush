# Product-centric catalog API contract

Status: additive rollout on `/api/v1`. The repository does not generate OpenAPI; Fastify JSON schemas, Zod schemas, TypeScript interfaces, and this document are the contract sources. Monetary values are integer cents. `variant_id` is a deprecated compatibility input and is not the identity of a new purchase.

## Current/target contract matrix

| Surface | Legacy contract | Canonical contract | Compatibility behavior |
| --- | --- | --- | --- |
| Catalog list/detail | Variant arrays, term choices, float prices | `product_id`, `catalog_mode`, fixed `duration_months`, `price_cents`, `comparison_price_cents`, `currency`, `pricing_snapshot_id`, availability | Existing float and variant-shaped response fields remain additive and read-only. Invalid products are omitted or return item-local not-found, with `catalog_diagnostics` on lists. |
| Cart pricing | `variant_id` + `term_months` | `product_id`; duration is derived from the fixed product; response uses cents and a catalog price snapshot | Legacy-only input is resolved by the compatibility adapter. Every skipped line has `code` and `message`; other lines still succeed. |
| Guest draft checkout | Variant or product, but browser historically persisted variants | `product_id`, optional matching `pricing_snapshot_id`; server snapshots product, duration, price, currency, and fulfillment configuration | Saved entries without a durable product are quarantined in the browser with a recoverable message. Legacy variant requests receive deprecation headers. |
| Authenticated validation/credit purchase | Required `variant_id` and duration | Required `product_id`, optional duration assertion and price snapshot | `variant_id` remains accepted. Both identifiers must resolve to the same product. |
| Payment quote/checkout | Required `variant_id` and duration | Required `product_id`, optional duration assertion and price snapshot | Pricing locks, checkout keys, provider replay handling, coupons, and order idempotency are unchanged; checkout keys now use product identity. |
| Orders/subscriptions/fulfillment/refunds | Variant and plan labels used as lookup/fallback | Durable `product_id` plus immutable purchase-time snapshots | Existing variant columns and plan metadata remain readable. New writes dual-write product identity and snapshots. No history is rewritten from mutable catalog data. |
| Renewals/MMU/jobs/webhooks | Service plan or variant fallback | Existing order/subscription product identity and snapshots first | Provider webhooks remain keyed by provider payment/order references. Legacy lookup is retained only for old rows and emits the existing identity fallback telemetry. |
| Admin catalog | Variant/term CRUD | Product fixed fields and product fixed price history | `/admin-next` uses product-only operations. Classic variant routes are isolated legacy administration surfaces and are not called by the new UI. |

## Rollout sequence

1. **Expand:** nullable product identity columns and immutable snapshots are added without removing variant references.
2. **Backfill and verify:** the idempotent backfill derives product IDs only through trustworthy foreign keys, reports unresolved/conflicting rows, and leaves ambiguous rows untouched. See `durable-product-identity-rollout.md`.
3. **Dual-write/read:** all new order, subscription, fulfillment, payment, credit, refund, evidence, and renewal records write product identity. Reads prefer direct `product_id`, then an order-item product snapshot/reference, then the legacy variant relationship; every legacy fallback is observable.
4. **Client migration:** public catalog responses expose canonical fields; browser cart and all current checkout clients send product identity only for fixed products.
5. **Contract gate:** make stricter database/API requirements only after the removal gates below have held for the complete retention window. Dropping a legacy column is a separate migration and release.

## Canonical resolver and precedence

`resolveSellableProduct` is the authoritative canonical resolver for product identity, fixed duration, current price history/fallback, comparison price, display currency/FX, availability, and the purchase-time pricing snapshot. Product catalog list/detail, cart, guest checkout, authenticated validation/purchase, and payment quote/checkout use it for fixed products. `resolveVariantPricing` is a deliberately narrow adapter for unchanged legacy consumers.

Request precedence is deterministic:

1. If only `product_id` is supplied, resolve the active product and its fixed fields. No variant is created or inferred.
2. If both are supplied, `variant_id` must belong to `product_id`; otherwise return `LEGACY_IDENTIFIER_CONFLICT`. A valid fixed product is priced from the product, never from the variant.
3. If only `variant_id` is supplied, resolve `product_variants.product_id`, then use legacy price/term data. This is the deprecated adapter path.
4. A supplied duration is an assertion. For a fixed product it must equal `products.duration_months`; it never selects a term.
5. A supplied catalog pricing snapshot must equal the current snapshot or checkout returns `STALE_PRICE`. Provider settlement locks remain separate and immutable.

Canonical fixed offer fields are:

```json
{
  "product_id": "uuid",
  "variant_id": null,
  "catalog_mode": "fixed_product",
  "duration_months": 12,
  "price_cents": 12900,
  "comparison_price_cents": 14900,
  "currency": "USD",
  "pricing_snapshot_id": "uuid",
  "availability": "available"
}
```

## Endpoints

- `GET /api/v1/subscriptions/available`: canonical fields are additive per item; `catalog_diagnostics` and `X-Catalog-Diagnostics-Count` describe omitted items.
- `GET /api/v1/subscriptions/products/available`: one entry per product, with product duration and total fixed price in cents.
- `GET /api/v1/subscriptions/products/:slug`: `offer` is canonical. `variants` remains a response-compatibility projection and is not an instruction to create/manage a variant.
- `POST /api/v1/subscriptions/cart-pricing-preview`: each item requires `product_id` or deprecated `variant_id`. Fixed-product clients omit `variant_id`.
- `POST /api/v1/checkout/draft`: each item requires `product_id` or deprecated `variant_id`; `pricing_snapshot_id` detects a race with a catalog price change.
- `POST /api/v1/subscriptions/validate-purchase` and `/purchase`: `product_id` is canonical; fixed duration is derived when omitted.
- `POST /api/v1/payments/quote` and `/checkout`: `product_id` is canonical. Responses include product identity, duration, catalog mode, catalog price snapshot, and the separate settlement pricing lock.
- `GET /api/v1/admin-next/catalog-compatibility`: authenticated administrator view of process-local counters and authoritative structured-log event names.

## Stable errors

Catalog contract failures use the normal API error envelope and one of these machine codes:

| Code | HTTP | Meaning/recovery |
| --- | --- | --- |
| `PRODUCT_UNAVAILABLE` | 404 | Product is missing/inactive; remove the item and return to catalog. |
| `INVALID_FIXED_CONFIGURATION` | 400 | Product cannot be sold until fixed duration/price/currency is corrected. |
| `STALE_PRICE` | 409 | Reprice and ask the user to confirm the new total. |
| `UNSUPPORTED_CURRENCY` | 400 | Select a supported display/settlement currency. |
| `LEGACY_IDENTIFIER_CONFLICT` | 409 | Do not guess; discard the stale identifier pair and reload the product. |
| `INVALID_DURATION` | 400 | Reload the fixed product and use its duration. |
| `PRICE_UNAVAILABLE` | 400 | No current/convertible price exists for this currency. |
| `PRODUCT_ID_REQUIRED` | 400 | Supply canonical product identity (legacy identifier only during the window). |

Catalog list and cart-preview batch operations fail closed per item. One invalid product is never promoted to a global catalog 500/503.

## Legacy variant compatibility

Responses to requests containing `variant_id` include `Deprecation: true`, `Sunset: Wed, 31 Mar 2027 23:59:59 GMT`, a deprecation `Link`, and `X-API-Deprecated-Fields: variant_id`. Successful adapter use logs `catalog_api_legacy_variant_used`; conflicts log `catalog_api_legacy_identifier_conflict`. In-memory counters are diagnostic only; aggregate structured logs across all processes/pods for operational decisions.

Legacy identity remains intentionally present in:

- `product_variants`, `product_variant_terms`, and variant price history;
- historical order/subscription/payment/credit/refund/evidence references and snapshots;
- renewal/MMU/fulfillment records created before product identity was available;
- provider webhook metadata needed to replay historical payments;
- classic admin/read views and response aliases required by staged clients.

These surfaces must not be used to create a new fixed catalog item. The safe accidental-variant recovery procedure is documented in `product-only-catalog-recovery.md`.

## Identity/snapshot dependency inventory

| Layer | Durable identity | Immutable snapshot / compatibility |
| --- | --- | --- |
| Catalog models/repositories | `products.id` | Variants/terms/history are compatibility data; fixed price history audits product price changes. |
| Browser stores and API DTOs | `productId` / `product_id` | Optional legacy variant; cart stores current catalog snapshot and sanitizes records without product identity. |
| Order creation, coupons, risk | `order_items.product_id` | Name, slug, duration, unit/total cents, currency, catalog mode, fulfillment config; coupon eligibility is evaluated against the resolved product in the same transaction. |
| Payments and provider metadata | Payment/order IDs plus product identity on related order items | Provider amount/currency and pricing lock are never recomputed on webhook replay. Free-form plan labels remain display/fallback only. |
| Subscriptions and renewals | `subscriptions.product_id`, source order/item IDs | Purchase-time product name/slug, duration, cents, currency, fulfillment/upgrade configuration. Renewals inherit the subscription snapshot rather than current catalog fields. |
| Fulfillment/MMU/perks/evidence | Direct product and source order/subscription references | Product/fulfillment snapshots preserve deleted/renamed product history; legacy variant joins are fallback only. |
| Refunds/credits/audit/analytics | Order/payment/subscription product references | Historical money, item names, content IDs, and provider references remain immutable. Analytics prefers product/slug and falls back to old variant/plan metadata only for old events. |
| Admin/customer views, emails, reports | Direct product reference when available | Display uses purchase snapshots first, then current product, then legacy metadata; ownership is always constrained by user/order/subscription, never by caller-supplied product alone. |

## Security and operational guarantees

- Existing authentication, administrator authorization, ownership predicates, CSRF/CORS, rate limits, and audit logging remain on the same routes.
- Product IDs do not authorize access. Customer queries continue to bind records to the authenticated user; admin routes retain `adminPreHandler`.
- Order creation stores product identity and all monetary/fulfillment snapshots in the same transaction. Payment webhooks remain idempotent on provider/order references and do not re-resolve the mutable catalog.
- Comparison/display FX does not change settlement snapshots. Integer cents are authoritative; legacy floats are derived response aliases only.

## Removal gates

Do not remove `variant_id`, response aliases, or legacy tables until all of the following are true for at least one complete client/session retention window and one renewal window:

1. Aggregated `catalog_api_legacy_variant_used` is zero for supported client versions, with endpoint/context dimensions verified.
2. No unresolved/conflicting rows remain in the durable-product verification queries; backfill coverage is 100% for rows in the contract scope.
3. All writers and webhook retry paths are proven to dual-write product identity, including dead-letter replay.
4. Browser cart-version telemetry shows no retained variant-only carts, or the compatibility lifetime has expired.
5. Mixed-data, renewal/MMU, refund, authorization, deleted/renamed product, and webhook replay suites pass against a production-like restored dataset.
6. A separately reviewed contract migration has rollback/forward-fix instructions and confirms no foreign-key dependency still needs the legacy column.

