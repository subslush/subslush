# Product-only catalog compatibility and recovery

## Canonical and legacy surfaces

`products.duration_months`, `products.fixed_price_cents`, and
`products.fixed_price_currency` are the canonical sellable configuration. The
current pricing window and its audit metadata live in
`product_fixed_price_history`. USD is the platform's canonical settlement
currency; regional prices continue to be produced by the FX publisher.

`product_variants`, `product_variant_terms`, and `price_history` are legacy
compatibility tables. The classic `/admin` API and UI may still manage them for
incomplete legacy products while historical clients are supported, but their
mutation endpoints reject complete fixed products. `/admin-next` does not load
or expose variant/term CRUD. Its only legacy surface is a read-only dependency
summary and the product-level recovery action described below.

Historical variant rows must not be deleted. Terms and legacy prices use
`ON DELETE CASCADE`; order items, subscriptions, payments, and credit
transactions use `ON DELETE SET NULL`. Deleting a variant would therefore
destroy pricing/term history and weaken links from commercial evidence.

Migration `20260721_120000_backfill_fixed_product_price_history.sql` fills only
complete fixed products that lack a current USD price-history window. It is
idempotent, runs in one transaction, emits candidate/remaining counts, and tags
its publish run and history rows. To dry-run it manually, execute its Up section
inside a transaction and replace the final `COMMIT` with `ROLLBACK`. Its Down
section retains any snapshot already referenced by an order.

## Dry-run / pre-check

Replace `:product_id` using the parameter syntax of the SQL client. This query
is read-only and identifies both the fixed listing and every dependent legacy
row before recovery:

```sql
WITH variants AS (
  SELECT id, name, is_active
  FROM product_variants
  WHERE product_id = :product_id
)
SELECT
  p.id,
  p.name,
  p.status,
  p.duration_months,
  p.fixed_price_cents,
  p.fixed_price_currency,
  (SELECT count(*) FROM variants) AS variant_count,
  (SELECT count(*) FROM variants WHERE is_active) AS active_variant_count,
  (SELECT count(*) FROM product_variant_terms WHERE product_variant_id IN (SELECT id FROM variants)) AS term_count,
  (SELECT count(*) FROM price_history WHERE product_variant_id IN (SELECT id FROM variants)) AS legacy_price_count,
  (SELECT count(*) FROM order_items WHERE product_variant_id IN (SELECT id FROM variants)) AS order_item_count,
  (SELECT count(*) FROM subscriptions WHERE product_variant_id IN (SELECT id FROM variants)) AS subscription_count,
  (SELECT count(*) FROM payments WHERE product_variant_id IN (SELECT id FROM variants)) AS payment_count,
  (SELECT count(*) FROM credit_transactions WHERE product_variant_id IN (SELECT id FROM variants)) AS credit_count
FROM products p
WHERE p.id = :product_id;
```

After `20260721_130000_expand_durable_product_identity.sql` is applied, also
verify direct identity coverage (these columns intentionally do not exist in a
pre-expand database):

```sql
SELECT
  (SELECT count(*) FROM order_items WHERE product_id = :product_id) AS direct_order_item_count,
  (SELECT count(*) FROM subscriptions WHERE product_id = :product_id) AS direct_subscription_count,
  (SELECT count(*) FROM payment_items WHERE product_id = :product_id) AS direct_payment_item_count;
```

Verify price continuity before changing anything:

```sql
SELECT product_id, price_cents, currency, starts_at, ends_at, metadata
FROM product_fixed_price_history
WHERE product_id = :product_id
ORDER BY starts_at DESC, created_at DESC;
```

Recovery is blocked unless the product has a positive whole-month duration, a
positive USD fixed price, and USD as `fixed_price_currency`.

## Apply

In `/admin-next/products/:product_id`, use **Restore fixed catalog mode**. The
button invokes `POST /admin/products/:product_id/fixed-catalog/recover`.

The service starts a transaction, locks the product and all its legacy variant
rows, re-validates the fixed catalog fields, and sets only active variants to
inactive. It never deletes a variant, term, price, order reference,
subscription, payment, or credit record. Repeating the operation is safe and
returns `already_product_only: true`. The response and admin audit entry record
the exact `deactivated_variant_ids` and post-operation dependency counts.

Public catalog queries prefer a complete fixed product even before recovery,
so the deactivation does not create a listing gap.

After the durable-identity expand migration is deployed, first run
`database/scripts/audit_product_identity_rollout.sql`. Recovery only deactivates
catalog rows; it does not change either the retained variant reference or the
new direct product reference. The `products` foreign keys restrict hard deletion
of referenced products.

## Post-check

```sql
SELECT p.id, p.status, p.duration_months, p.fixed_price_cents,
       p.fixed_price_currency,
       count(*) FILTER (WHERE pv.is_active) AS active_variant_count,
       count(pv.id) AS retained_variant_count
FROM products p
LEFT JOIN product_variants pv ON pv.product_id = p.id
WHERE p.id = :product_id
GROUP BY p.id;

SELECT count(*) AS retained_terms
FROM product_variant_terms
WHERE product_variant_id IN (
  SELECT id FROM product_variants WHERE product_id = :product_id
);

SELECT count(*) AS retained_legacy_prices
FROM price_history
WHERE product_variant_id IN (
  SELECT id FROM product_variants WHERE product_id = :product_id
);

SELECT price_cents, currency, starts_at, ends_at,
       metadata->>'snapshot_id' AS snapshot_id
FROM product_fixed_price_history
WHERE product_id = :product_id
ORDER BY starts_at DESC, created_at DESC;
```

Expected results are zero active legacy variants, unchanged retained legacy
counts, and one current fixed-price window for the canonical USD price.

## Controlled rollback

Recovery is reversible because rows are only deactivated. Retrieve the exact
IDs from the `catalog.fixed_product.recover` admin audit entry, verify their
active terms and current USD legacy prices, then reactivate only those IDs in a
transaction:

```sql
BEGIN;

SELECT id, product_id, is_active
FROM product_variants
WHERE product_id = :product_id
  AND id = ANY(:deactivated_variant_ids)
FOR UPDATE;

UPDATE product_variants
SET is_active = TRUE, updated_at = NOW()
WHERE product_id = :product_id
  AND id = ANY(:deactivated_variant_ids);

COMMIT;
```

Reactivation restores the prior data state but does not override public fixed
catalog precedence. A return to public legacy selling requires a separately
reviewed rollback of the product's fixed fields and is intentionally not
available in `/admin-next`.
