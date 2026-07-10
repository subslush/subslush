# QA Run A — Automated Gates, Security, and Fix Verification

**Date:** 2026-07-10  
**Repository:** `/home/yuri/projects/ss`  
**Branch / commit:** `Admin-UI-and-Logic-implementation` / `5779b0c Implement admin next fulfillment and checkout flows`  
**Mode:** report-only; no application source changes made. Backend was started on port 3101 with `EMAIL_PROVIDER=console JOBS_ENABLED=false` and stopped before this report.

## Verdict: FAIL — Run B must not launch

All automated gates passed, but required live stateful coverage was not completed. This is a blocking QA gap: FV-1 and FV-4 live verification, IDOR with User A against User B-owned state, rules-gate/handshake state transitions, at-rest credential inspection, exact-limit success boundaries, and manual mark-paid state cases have no live evidence. No evidence has been fabricated.

## Environment and workspace state

HEAD was exactly the requested commit. The worktree already contained unrelated untracked Telegram source/test/migration files before this run; they were preserved. The migration set presented to the runner contained 62 migrations, including the untracked 20260617 Telegram migration.

## Pre-flight MMU anchor hygiene

Initial diagnostic output: [initial run](./qa-artifacts/run-a-20260710/final-mmu-diagnostic.json) (the initial and final results were identical).

| Subscription | Classification | Evidence |
|---|---|---|
| `9b619566-b9df-442d-a1ed-d45de0e42241` | (b) pre-existing fixture | Non-QA email `hifegib740@wivstore.com`; order `2b2e5ed6-c0a5-4de0-a926-cd7534eb0e79` created 2026-07-10 00:43:45.965797 local DB time. Prior report classifies it as preserved. |
| `a84c8871-b58a-4f8b-99fa-193ebf476277` | (b) pre-existing corruption | Non-QA email `69mkyypvtyho@teacher.unbox.edu.pl`; order `f3a388fe-e96d-45c8-92d3-4a936684daf1` created 2026-04-23 01:28:51.924933 local DB time. Prior report identifies this historical fixture. |
| `abb2499c-4d4e-4f95-82f9-9f71b685b05d` | (b) pre-existing corruption | Same non-QA customer/order family as the first fixture. Prior report preserves it as a repair-script fixture. |

No category-(a) QA subscription existed, so no QA subscription/order/task/payment/evidence deletion was performed. The inherited exclusion list is exactly the three IDs above.

Final diagnostic: [full JSON](./qa-artifacts/run-a-20260710/final-mmu-diagnostic.json). It reports `scanned: 3`, exactly those IDs, and no `QA-RA-` subscriptions.

## Part A — automated verification

| Gate | Result | Retained output |
|---|---|---|
| `npm test -- --runInBand` | PASS — 96/96 suites, 400/400 tests | [backend test log](./qa-artifacts/run-a-20260710/backend-test.log) |
| Required suites | PASS — `mmuSchedule`, `adminOrderActions`, `orderRulesReveal`, `paymentManualAndSweep`, `stripeWebhookOrderFlow`, `adminSchemaCompatibilitySmoke`, `dashboardOrdersFirstLoadSource`, `adminChangedSurfaceInputValidation`, and `multiItemPricingLocks.integration` all passed | [backend test log](./qa-artifacts/run-a-20260710/backend-test.log) |
| D12 suite | PASS — D12 is implemented inside `multiItemPricingLocks.integration.test.ts`: guest reserve, max-one contention, signed Stripe finalization, Payop/Antom sweep release, and compatibility cases. It passed as part of the full suite. | [backend test log](./qa-artifacts/run-a-20260710/backend-test.log) |
| Backend build | PASS | [backend build](./qa-artifacts/run-a-20260710/backend-build.log) |
| Backend lint | PASS — 0 errors, 10 warnings (baseline 10) | [backend lint](./qa-artifacts/run-a-20260710/backend-lint.log) |
| Frontend check | PASS — 0 errors, 0 warnings | [frontend check](./qa-artifacts/run-a-20260710/frontend-check.log) |
| Frontend lint | PASS — 0 errors, 79 warnings (baseline 79) | [frontend lint](./qa-artifacts/run-a-20260710/frontend-lint.log) |
| Frontend build | PASS — build completed in 1m14s | [final frontend build](./qa-artifacts/run-a-20260710/frontend-build-final.log) |
| Migration validation | PASS — 62 legacy migrations grandfathered; all valid | [validation log](./qa-artifacts/run-a-20260710/migration-validate.log) |
| Fresh disposable DB apply | PASS — all 62 applied, disposable dropped | [fresh apply log](./qa-artifacts/run-a-20260710/migration-fresh-apply.log) |
| Dev dump/restore disposable | PASS — 62 applied, 0 pending; the expected non-fatal `transaction_timeout` setting warning occurred | [restore/status log](./qa-artifacts/run-a-20260710/migration-restore-retry.log) |

Jest emitted a force-exit/open-handle warning after the green run. This is a test-harness hygiene observation, not a failing test. The first frontend build capture ended prematurely due terminal collector behavior; it was discarded and rerun in isolation, with the successful final output retained above.

## Part B — live security probes

The backend was live at `http://127.0.0.1:3101/api/v1`.

| Probe | Result |
|---|---|
| Unauthenticated per-item reveal | PASS — 401 when sent without a content-type/body. |
| Unauthenticated customer actions | PASS — accept-rules and activation-ready returned 401. |
| Unauthenticated admin actions / credentials / admin-next aggregates / fulfillment | PASS — all returned 401. |
| Customer token on admin actions / credentials / admin-next aggregates / fulfillment | PASS — all returned 403. |
| Customer token on nonexistent reveal / accept-rules / activation-ready | 404. This is the expected ownership-hiding behavior for customer-owned routes, not 403; the blanket prompt expectation of 403 conflicts with legitimate customer reveal/accept/ready functionality. |
| Old `/admin` vs `/admin-next` role set | PASS by source comparison — both use `authPreHandler, adminPreHandler`; `adminPreHandler` permits exactly `admin` and `super_admin`. |
| Oversized D10 payloads | PASS — credentials 4000, activation instructions 4000, mark-paid note 1000, strict rules 8000. All 6001/8001/1001 probes returned Fastify schema 400 with “must NOT have more than N characters.” |
| SQLi and script search strings | PASS — `' OR 1=1 --` and `<script>alert(1)</script>` returned 200 with empty results and no SQL error. |

Raw artifacts: [AuthZ matrix](./qa-artifacts/run-a-20260710/authz-probes.tsv), [input-validation matrix](./qa-artifacts/run-a-20260710/input-validation-probes.tsv), [backend log](./qa-artifacts/run-a-20260710/live-backend.log).

## Part C — targeted fixes

| Target | Result | Evidence |
|---|---|---|
| FV-1 / D7-R1 reveal audit UA/null-UA correlation | GAP | No safe, disposable live order/subscription fixture was available. Not executed. |
| FV-2 / D10 rejection limits | PASS | Live schema rejection evidence retained in [input-validation matrix](./qa-artifacts/run-a-20260710/input-validation-probes.tsv). Exact-limit success needs valid stateful targets and was not run. |
| FV-3 / D11 pricing locks | PASS | `multiItemPricingLocks.integration.test.ts` passed in a fresh PostgreSQL DB against the production checkout route. |
| FV-4 / D12 live reservation lifecycle | GAP | Automated lifecycle cases pass, but no separate live guest draft / signed webhook / expiry-sweep execution was run. |
| Anchor baseline | PASS | [Final diagnostic JSON](./qa-artifacts/run-a-20260710/final-mmu-diagnostic.json) contains only inherited exclusions. |

## Coverage gaps / findings

1. **High — required live FV-1 and FV-4 verification missing.** Repro: no live execution exists for the specified two-reveal audit/evidence comparison or coupon reserve/finalize/release flow. Suspected areas: `src/routes/orders.ts`, `src/services/auditLogService.ts`, `src/services/couponService.ts`, `src/services/paymentService.ts`.
2. **High — live IDOR/rules-gate/handshake state-machine probes missing.** Repro: no User A versus User B-owned order item fixture was created, so no no-write evidence comparison exists. Suspected areas: `src/routes/orders.ts`, `src/routes/admin/orders.ts`.
3. **High — credential at-rest/list aggregate audit and exactly-one audit-row assertions missing.** Repro: no disposable delivered credential fixture was created; AES-GCM/list-redaction behavior was not verified against live DB values.
4. **Medium — exact-at-limit success and manual mark-paid state cases missing.** Repro: only oversized failures were safe to execute against nonexistent IDs; exact-limit payloads and pending/already-paid/cancelled order state flows have no live result.
5. **Low — Jest force-exit/open-handle warning.** Repro: run `npm test -- --runInBand`; all tests pass, then Jest prints its force-exit warning. Suspected test/Redis lifecycle cleanup.

## DB-manipulation log

| Classification | Exact SQL / command | Result |
|---|---|---|
| Permitted setup | `INSERT INTO users (id, email, status, is_guest) VALUES ('00000000-0000-4000-8000-000000090001', 'qa-ra-owner-a@example.test', 'active', FALSE), ('00000000-0000-4000-8000-000000090002', 'qa-ra-owner-b@example.test', 'active', FALSE), ('00000000-0000-4000-8000-000000090003', 'qa-ra-admin@example.test', 'active', FALSE);` | Inserted three probe-only identities. |
| Permitted setup / cleanup | `createdb -h localhost -p 5432 -U subscription_user qa_run_a_fresh_20260710`; `DB_DATABASE=qa_run_a_fresh_20260710 DB_PORT=5432 node database/migrate.js up`; `dropdb -h localhost -p 5432 -U subscription_user --force qa_run_a_fresh_20260710` | Fresh migration verification; dropped. Repeated once for retained output using `qa_run_a_fresh_capture_20260710`; dropped. |
| Permitted probe | Initial disposable DB attempt through port 6432, then migration runner | No DB created: the pooler lacks `template1`. Retried correctly on direct PostgreSQL port 5432. |
| Permitted setup / cleanup | `createdb ... qa_run_a_restore_20260710`; `pg_dump --no-owner --no-privileges subscription_platform | psql ...`; migration status; `dropdb ... --force` | Strict first restore stopped on known `transaction_timeout` setting warning; copy dropped. |
| Permitted setup / cleanup | Same dump/restore sequence using `qa_run_a_restore_retry_20260710` without `ON_ERROR_STOP` | Expected warning; 62 applied / 0 pending; dropped. |
| Permitted cleanup | `DELETE FROM users WHERE email = ANY(ARRAY['qa-ra-owner-a@example.test','qa-ra-owner-b@example.test','qa-ra-admin@example.test']);` | Deleted all three temporary probe identities. |

No `subscriptions.term_start_at`, `subscriptions.start_date`, or `subscriptions.end_date` values were changed. No `pricing_publish_runs` rows were inserted and no `price_history.metadata` or `price_history.starts_at` values were edited. No prohibited QA data deletion occurred.

