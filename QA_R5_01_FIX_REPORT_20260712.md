# QA-R5-01 resolution — 2026-07-12

## Verdict

**Harness defect, resolved. No application code was changed.**

On a real browser against an admin-next fulfillment detail for a mark-paid,
undelivered order, the Save button was present and enabled. The captured trace
shows:

```
POST http://127.0.0.1:3000/api/v1/admin/subscriptions/<subscription-id>/credentials
200
GET  /api/v1/admin/fulfillment/orders/<order-id>
200
```

The client logged successful API responses and rendered `Credentials saved ✓`.
Evidence: `qa-artifacts/r5-01-20260712/credential-save-browser-trace-detail.log`.

The earlier smoke navigated with `domcontentloaded` and clicked server-rendered
controls before Svelte hydration attached their handlers. The smoke was updated
to wait for `networkidle` on each interactive detail/dashboard page and to
associate an awaited response with the matching outgoing request rather than a
standalone response matcher.

Commit: `98a6fbb0637c2b0d1817b655d0f6e2ae56fd3dfa`
(`test: wait for admin-next smoke hydration`).

## Verification

Both sequential enabled-provider runs passed and cleaned their `SMOKE-*`
fixtures:

1. `qa-artifacts/r5-01-20260712/smoke-run-1.log`
2. `qa-artifacts/r5-01-20260712/smoke-run-2.log`

Both logs end in `PASS admin-next smoke`.
