# QA Run A (rerun) — report

**Commit:** `5779b0cadb698f5f08b5afe402a859b6af36056b`  
**Branch:** `Admin-UI-and-Logic-implementation`  
**Verdict:** **FAIL — Run B must not launch.**

## Critical finding

HEAD tracks **61** SQL migrations and the working tree contains **61**. The rerun migration validator reports **61** grandfathered migrations, while this QA baseline explicitly requires **62**. The current dev DB had previously recorded 62, so the missing tracked migration makes the code/migration-history contract unreconcilable. Repro: `git ls-files 'database/migrations/*.sql' | wc -l` and `node database/migrate.js validate`. Suspected surface: `database/migrations/`; the removed untracked `20260617_120000_add_telegram_order_notifications.sql` had been the 62nd file but was not part of the requested commit.

The tree is otherwise clean apart from QA artifacts: `QA_RUN_A_REPORT_20260710.md` and `qa-artifacts/`. No untracked application source, test, or migration remains.

## Anchor diagnostics

Both [pre-write JSON](./qa-artifacts/run-a-20260710/rerun-initial-mmu-diagnostic.json) and [final JSON](./qa-artifacts/run-a-20260710/rerun-final-mmu-diagnostic.json) contain exactly:
- `9b619566-b9df-442d-a1ed-d45de0e42241`
- `a84c8871-b58a-4f8b-99fa-193ebf476277`
- `abb2499c-4d4e-4f95-82f9-9f71b685b05d`

No QA-RA MMU finding was created.

## Completed live evidence

- Supported admin APIs created a QA strict-rules product, active variant, one-month term, and current price. [Price evidence](./qa-artifacts/run-a-20260710/rerun-price.json) has snapshot `9352e6f1-5a07-44ac-b11f-1521f24be07c`; direct inspection confirmed its publish run is `succeeded`.
- Two users were created through `POST /auth/register`; guest checkout draft(s) and correctly signed Stripe events created paid/delivered fixtures. [User bootstrap](./qa-artifacts/run-a-20260710/rerun-user-bootstrap.jsonl), [owner draft](./qa-artifacts/run-a-20260710/rerun-owner-a-draft.json), [webhook](./qa-artifacts/run-a-20260710/rerun-owner-a-webhook.json).
- Real User B → User A item IDOR: accept-rules and ready-confirm returned 404; audit/evidence counts were unchanged. The initially malformed content-type-only reveal request is discarded; the corrected reveal returned 404. [Probe log](./qa-artifacts/run-a-20260710/rerun-idor-rules-probes.log).
- Rules gate: owner reveal before acceptance returned 400; false/missing acceptance returned 400; accepted rules returned 200. Ready-confirm outside `awaiting_customer` returned 409.
- Handshake: customer → admin instructions returned 403; admin instructions returned 200; first and second customer readiness confirmations returned 200, confirming idempotency. [Handshake log](./qa-artifacts/run-a-20260710/rerun-handshake.log).
- FV-1: two owner reveals returned 200; audit count increased from 1 to 3 (exactly one per successful reveal). One row retained `QA-RA-UA-DISTINCT/1.0`; the second has SQL NULL UA. Evidence JSON contains the identical UA and explicit `null`. Stored credentials are AES-GCM JSON with ciphertext/IV/tag and no plaintext substring. Admin credential Show returned 200 and wrote one `subscriptions.credentials.view` audit row. [FV-1 log](./qa-artifacts/run-a-20260710/rerun-fv1-reveal.log), [storage inspection](./qa-artifacts/run-a-20260710/rerun-credential-storage.log).
- D12 first lifecycle: CAP1 already existed from prior QA data, so `QA-RA-CAP1-RERUN` was created. First guest draft created one `reserved` redemption; second draft was rejected with `max redemptions`; a unique signed Stripe event changed the row to `redeemed` and retained coupon code/100-cent discount. [Lifecycle log](./qa-artifacts/run-a-20260710/rerun-cap1-lifecycle.log).

## Unexecuted probes — blocking

- D12 expiry/release/reusability sweep and registered-user coupon regression.
- Exact-limit success cases and manual mark-paid state matrix.
- Fresh Part A rerun (backend/frontend gates and disposable migration apply/restore); the earlier captured runs remain available, but this rerun did not repeat them after the migration-file change.
- New RB-2 admin-next browser/component smoke suite was not located or explicitly run.

These are blocking under the rerun instruction. The migration count mismatch is independently Critical.

## DB write log

All writes were permitted fixture setup through supported HTTP endpoints except the application's own signed webhook processing and read-only verification queries:
- `POST /api/v1/auth/register`: `qa-ra-rerun-a@example.test`, `qa-ra-rerun-b@example.test`.
- `POST /api/v1/admin/products`: QA strict product; `POST /admin/product-variants`; `POST /admin/product-variant-terms`; `POST /admin/price-history/current` (`price_cents=1000,currency=USD`); `PATCH /admin/products/:id` active.
- `POST /checkout/identity`, `POST /checkout/draft`, and correctly HMAC-signed `POST /payments/stripe/webhook` for QA fixtures.
- `POST /admin/subscriptions/:id/credentials`, `POST /admin/orders/:order/items/:subscription/deliver`, acceptance/reveal/readiness probes.
- `POST /admin/coupons` for `QA-RA-CAP1-RERUN`; two coupon draft attempts; unique signed Stripe webhook.

No subscription term/start/end dates or task due dates were manually mutated; no pricing-publish run was directly inserted; no price-history metadata/starts_at field was edited; preserved anchor fixtures were not modified. Server port 3102 was stopped.

