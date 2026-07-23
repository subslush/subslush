# Durable product identity rollout

## Contract

`product_id` is the durable sellable-item identity. A fixed product is bought by
product ID and does not need a variant. Retained `product_variant_id` values are
compatibility evidence, not the identity of a new purchase.

Purchase-time presentation and commercial facts are immutable snapshots:
product name and slug, duration, unit and total price, currency, catalog mode,
and fulfillment configuration. Catalog rows remain the source for future
purchases only; renames, deletions, price changes, and metadata changes must not
rewrite those snapshots.

For legacy rows that never captured a presentation field, the backfill records
the best currently verifiable catalog value and its source in the audit table.
That reconstruction is not represented as an exact purchase-time fact.
Historical monetary columns are never reconstructed from the current catalog.

Product foreign keys use `ON DELETE RESTRICT`: catalog retirement is a soft
status change, while hard deletion of a referenced product is rejected. Thus a
renamed or retired product keeps its durable ID, and every historical screen can
still render from snapshots even if the live catalog row is no longer public.

Read precedence is explicit `product_id`, strong parent (`order_item` or
`subscription`), retained variant ownership, then metadata only after the
backfill proves that metadata names an existing product. A disagreement is a
conflict and is never silently overwritten. Legacy fallback and unresolved
reads emit `catalog_product_identity_fallback` and
`catalog_product_identity_unresolved`; disagreements emit
`catalog_product_identity_conflict`.

## Dependency map

| Surface | Legacy identity | Expanded identity and compatibility behavior |
| --- | --- | --- |
| Browser cart and checkout draft | `variantId` / `variant_id` (fixed products used their product UUID in this field) | Persist and send `productId` / `product_id`; fixed products omit `variant_id`. Legacy carts may retain it only as a deprecated compatibility locator, and the backend rejects an explicit mismatch. |
| Pricing locks and coupons | Variant/term locator and plan metadata; coupons already have `product_id` | Pricing resolves the canonical product and validates the supplied product ID. Price locks and coupon allocations remain immutable. |
| `order_items` | Nullable `product_variant_id`; product ID/name often only in JSON | Direct indexed `product_id`; name, slug, duration, fulfillment and catalog-mode snapshots. Existing monetary columns remain authoritative and are never repriced. |
| `payments` | Optional variant/order/subscription references and metadata | Nullable root `product_id` only for a single-product payment. A multi-product aggregate deliberately remains null. |
| `payment_items` | `order_item_id` plus allocated money | Direct `product_id` copied atomically from each order item; allocations remain unchanged on replay. |
| `subscriptions` | Variant plus service/plan codes, order relationship | Direct `product_id` and complete purchase snapshots copied from the locked order item in the same transaction. Service/plan and variant stay readable for legacy records. |
| `order_entitlements` | Order/item/subscription parent only | Direct product identity plus immutable name/slug/fulfillment snapshots. Upsert/replay preserves an existing snapshot. |
| `subscription_renewals` | Subscription parent only | Direct product copied by `INSERT … SELECT` from the subscription in the lock transaction. Retry also fills a missing product without changing cycle identity. |
| `admin_tasks` / MMU jobs | Subscription/order and free-form notes | Product copied from the subscription; order-wide tasks receive a product only when the order has exactly one. User-wide tasks remain null. |
| Credential reveal audit | Subscription only | Product copied from the owned subscription at insert; authorization remains subscription/user based. |
| Compliance evidence | Order and JSON metadata | Optional owned order item plus product. Order-wide/multi-product evidence remains aggregate/null. Item product IDs are accepted only if present on the same order. |
| Credit ledger | Order/variant and metadata | Direct product is dual-written when the transaction represents one sellable item; aggregate order debits remain null. Monetary history is untouched. |
| Refunds | Payment only | Product copied from the payment when unambiguous. Multi-product refunds remain payment-scoped/null; refund amount is never recomputed. |
| Customer/admin order and subscription views, emails, fulfillment | Joins through variant or mutable product name/metadata | Join `product_id` first, retain variant fallback, and prefer purchase snapshots for labels and fulfillment presentation. Ownership filters still use user/order/subscription relationships. |
| Reports/analytics | Slug, plan, variant, or content metadata | New browser and server events can carry product ID; old dimensions stay as labels. Historical JSON is not rewritten. Aggregate reports must group by direct product first and label with snapshots. |
| Webhooks/retries | Provider payment/order idempotency keys | Existing provider/order keys are unchanged. Payment-item, subscription, and entitlement dual-writes happen inside existing fulfillment transactions and replay upserts do not replace snapshots. |

Tables that do not require their own product FK retain strong parents: payment
events belong to payments; upgrade selections belong to order items or
subscriptions; notification/event outboxes and email logs retain their source
entity; coupon redemptions retain coupon/order/product scope; provider webhook
payloads remain immutable raw evidence. Adding a copied product ID there would
create another mutable value without improving ownership or lifecycle identity.

## Deployment

1. Deploy `20260721_130000_expand_durable_product_identity.sql`. It only adds
   nullable columns, `NOT VALID` foreign keys/checks, indexes, and the audit
   table.
2. Deploy dual-read/dual-write application code. Watch the three structured
   telemetry event names above.
3. Run `20260721_140000_backfill_durable_product_identity.sql`. It is
   transaction-scoped and idempotent. Candidate sets are derived from direct
   identity, order/subscription parents, and `product_variants.product_id`;
   metadata is considered only when it joins to a real product. Conflicts and
   orphans are recorded, not guessed.
4. Run `database/scripts/audit_product_identity_rollout.sql` before and after
   each repair. Export its result with the deployment record.
5. Forward-fix unresolved rows by repairing the strongest missing parent or by
   setting the verified direct product and recording evidence in
   `product_identity_backfill_audit`; rerun the backfill and verification.

The backfill down section removes only its audit observations. It intentionally
does not clear populated `product_id` values because live dual-writes may have
occurred after deployment. Rolling back the expand migration is safe only before
new application code is allowed to write these columns and after exporting the
audit table. After traffic starts, roll the application forward instead.

## Constraint and legacy-column gate

Do not add `NOT NULL`, validate all FKs, or drop any legacy column until all of
the following hold for at least one complete renewal/refund retention window:

- zero unresolved/conflicting order items and subscriptions;
- zero direct-versus-variant conflicts;
- every active writer version dual-writes product identity;
- fallback telemetry is zero except explicitly allow-listed historical reads;
- webhook retry, renewal/MMU, refund, fulfillment and authorization tests are
  green against mixed data;
- multi-product aggregate payments/tasks/evidence are documented and remain
  intentionally nullable;
- snapshot coverage is complete for records that require historical display;
- production verification output and repair evidence have been reviewed.

Dropping `product_variant_id`, variant terms, or historical prices is a separate
contract migration. This rollout never deletes or rewrites them.
