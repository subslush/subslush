# Full System QA Rerun — 2026-07-12

## Verdict

**FAIL — blocking defect QA-R3-01.**

The requested branch is now verified: local `HEAD` and
`origin/Admin-UI-and-Logic-implementation` both resolve to
`24611ee09f91af04ee5ecfb63cf81e2d1b6177d4`.

## Environment

- Fastify production build on local port 3001; SvelteKit preview on port 3000.
- PostgreSQL 16 and Redis local; `EMAIL_PROVIDER=console`, `JOBS_ENABLED=false`.
- Fresh fixtures use the `QA-R3` prefix. Evidence: `qa-artifacts/full-r3-20260712/`.
- No product code was changed. Fresh/copy migration databases and dumps were removed.

## Part A

| Check | Result |
|---|---|
| Backend test suite | PASS — 98 suites, 418 tests |
| Frontend test suite | PASS — 7 files, 17 tests |
| Backend build / TypeScript | PASS |
| Frontend check / production build | PASS — 0 Svelte errors/warnings |
| Backend lint | 0 errors, 10 warnings |
| Frontend lint | 0 errors, 79 warnings |
| Fresh migrations | PASS — 61 migrations applied to `qa_r3_fresh_20260712` |
| Dev-copy migrations | PASS — PostgreSQL-16 dump/restore copy had no pending migrations |

Task-1 guard tests are present and passed: coverage sums `(6,1)`, `(12,1)`,
`(12,2)`, `(6,2)`, `(12,3)`; non-divisible MMU rejection; per-item
delivery/reveal; strict-rules gate; handshake transitions; and expiry sweep.

Test-hygiene finding: Jest force-exits due to open handles, and the inherited
test environment attempts SMTP delivery rather than forcing console transport.

## Part B — security

Previously executed live probes were rerun against this HEAD before the R3
flow: anonymous requests returned 401 and regular-user requests returned 403
for per-item admin delivery, handshake actions, MMU detail, aggregates, slim
users, newsletter, global search and admin credential routes. Guessed customer
item IDs returned 404. Both `/admin` and `/admin-next` redirect a regular user
to `/dashboard`.

R3 customer checks:

- P1 and P2 credentials are stored in AES-256-GCM versioned envelopes.
- Strict reveal is rejected before acceptance; missing/false confirmation is
  rejected; accepted rules are evidence-logged.
- Owned P1/P2 reveal returns the correct item credential and writes reveal
  audit rows (one each after the successful verification).
- Handshake ready, encrypted link delivery, customer link reveal, and restart
  were exercised. Restart clears the link and returns `awaiting_customer`.
- Redaction and literal-script strict-rules regression tests pass.

## Part C / D execution log

| Phase | Action / expected / actual | Result |
|---|---|---|
| 0 | Create P1/P2/P3 through `/admin-next`, variants, terms, prices, fulfillment options, coupon; reject P1 6/4 MMU; verify three succeeded snapshots. | PASS |
| 1 | Public category listed all three products. P1 public detail initially expected to render after normal Phase-0 setup. It returned 404. Setting `duration_months=6` through the Product UI made it render; cart retained native 6-month P1 and webhook created 3 subscriptions/tasks, per-item snapshots and redeemed the coupon. | **FAIL — QA-R3-01** |
| 2 | P1 and P2 credentials saved and delivered independently; each active/task-complete; parent remained `in_process`. P3 instructions moved it to `awaiting_customer`. | PASS |
| 3 | P1/P2 owned reveal, rules acceptance, readiness, link delivery/reveal and restart were exercised. | PASS (API evidence) |
| 4–6 | Fresh pending-order/manual-paid, full MMU cycle/count walk, stale Payop/Antom sweep, newsletter, all legacy mutations and final cross-surface comparison were not continued after the blocking Phase-1 defect. | NOT RUN |

The signed payment simulation was a correctly HMAC-signed
`checkout.session.completed` Stripe webhook for order
`41da5108-df84-49cc-b3d1-ecdc22c8a183`. It produced `in_process`, 3
subscriptions, 3 tasks and a redeemed `QA-R3-TEST15` coupon (1/5).

## DB/date manipulation log

| Use | Exact scope |
|---|---|
| Fresh migration | Create/drop `qa_r3_fresh_20260712`; run `DB_DATABASE=qa_r3_fresh_20260712 node database/migrate.js up`. |
| Dev-copy migration | PostgreSQL-16 `pg_dump -Fc --no-owner --no-acl subscription_platform`; restore to/drop `qa_r3_copy_20260712`; run migration `up`. |
| Snapshot negative | The harness inserted one snapshot-less `price_history` row for the documented activation-refusal scenario. |
| Date SQL | None. |

## Defects

### QA-R3-01 — High: activated multi-term product is publicly unpurchasable until a hidden extra configuration is set

Reproduction:

1. In `/admin-next`, create an active product with one active variant and
   active one-month and six-month terms, prices, and otherwise-valid P1
   fulfillment settings.
2. Activate it successfully in the Product UI.
3. Open `/browse/products/<slug>`.

Expected: the configured public product page renders with an available term
selection or a deterministic listing term.

Actual: `GET /api/v1/subscriptions/products/<slug>` returns 404 `Product not
available`; the browser shows Page not found. Server log states `Ambiguous
product listing term configuration` with active terms `[1, 6]`. Manually
saving P1's listing duration as six months through a separate pricing control
is a workaround and restores the page.

Suspected locations: `src/routes/admin/catalog.ts` activation validation
accepts the configuration without requiring `duration_months`; the public
detail endpoint in `src/routes/subscriptions.ts` rejects it when
`listingTerms.length !== 1`.

### QA-R3-02 — Medium: automated test environment is not deterministic for email and handles

`npm test -- --runInBand` passes but inherits SMTP configuration, attempts
external mail, and force-exits due to open handles. Suspected locations:
`src/tests/setup.ts`, `src/services/emailService.ts`, Redis teardown.

## Coverage gaps

The rerun did not complete all mandated fresh Phase 4–6 flows after QA-R3-01.
In particular: two-real-user IDOR/guest cross-access, all MMU interval cycles,
live stale Payop/Antom backdate sweep, registered checkout, newsletter,
announcement, all old-console mutations, and final cross-surface consistency
remain required before a PASS verdict.
