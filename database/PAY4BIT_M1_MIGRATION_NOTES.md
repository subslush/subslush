# Pay4bit + FX Foundations (Milestone 1)

## Migration Order

Apply the existing migration chain in timestamp order, then apply:

1. `20260223_120000_add_pay4bit_fx_pricing_foundations.sql`

This migration is additive for runtime behavior and is intended to be deployed
before any Pay4bit routing or FX publishing jobs are enabled.

## What This Migration Adds

- New tables:
  - `fx_rate_fetches`
  - `fx_rate_cache`
  - `pricing_publish_runs`
  - `subscription_reminder_events`
- New order columns:
  - `orders.pricing_snapshot_id`
  - `orders.settlement_currency`
  - `orders.settlement_total_cents`
- New order item settlement columns:
  - `order_items.settlement_currency`
  - `order_items.settlement_unit_price_cents`
  - `order_items.settlement_base_price_cents`
  - `order_items.settlement_coupon_discount_cents`
  - `order_items.settlement_total_price_cents`
- Provider constraint updates to allow `pay4bit` in:
  - `payments.provider`
  - `credit_transactions.payment_provider`
  - `orders.payment_provider` (guardrail check constraint)

## Rollback Notes

Rollback command:

```bash
cd database
npm run migrate:down
```

Rollback removes:

- All Milestone 1 tables listed above.
- All Milestone 1 settlement/snapshot columns on `orders` and `order_items`.
- `pay4bit` from provider check constraints.

Operational caveat:

- If rows with `provider = 'pay4bit'` (or `payment_provider = 'pay4bit'`) are
  present at rollback time, constraint reversion can fail. Clean those rows or
  remap provider values before rollback.
