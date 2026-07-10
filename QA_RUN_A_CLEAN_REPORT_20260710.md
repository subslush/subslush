# QA Run A — clean baseline report

**Commit:** `e7c769261dc5850ec37e300a08c6c4c91998f0d6`  
**Branch:** `Admin-UI-and-Logic-implementation`  
**Verdict:** **FAIL — Run B must not launch.**

## Blocking findings

1. **Critical — required admin-next mutation-form browser/component smoke suite is absent.** Package scripts expose no runnable admin-next smoke command; repository discovery found only source-level tests (`adminNextProductsLoaderSource.test.ts` and `adminNextMmuTimelineSource.test.ts`), not the required product → variant → term → price → activation-form suite.
2. **Critical — guest-order claim flow failed.** A QA-A1 guest draft was paid through a correctly signed `checkout.session.completed` webhook (200), credentials were saved and the item was delivered (both 200), and the console-delivered claim link was submitted by the registered same-email user. `POST /api/v1/checkout/claim` returned **410** / `CLAIM_LINK_UNAVAILABLE`. The order therefore remained hidden from the customer token (404), preventing valid completion of the owner-only live probes.

## Pre-flight

- Commit was clean before new QA artifacts; no untracked application source, test, or migration was present.
- Canonical tracked migration count: **61**.
- Pre-flight diagnostic: [JSON](./qa-artifacts/run-a-clean-20260710/preflight-mmu-diagnostic.json). It reported exactly the three pre-existing exclusions: `9b619566-b9df-442d-a1ed-d45de0e42241`, `a84c8871-b58a-4f8b-99fa-193ebf476277`, and `abb2499c-4d4e-4f95-82f9-9f71b685b05d`.
- Closing diagnostic is identical: [JSON](./qa-artifacts/run-a-clean-20260710/final-mmu-diagnostic.json). No QA-A1 subscription was flagged.

## Automated gates

| Check | Result | Evidence |
|---|---|---|
| Backend Jest | PASS — 94 suites / 394 tests | [footer](./qa-artifacts/run-a-clean-20260710/backend-test-final-footer.log) |
| Backend build | PASS | [log](./qa-artifacts/run-a-clean-20260710/backend-build.log) |
| Backend lint | PASS — 0 errors, 10 warnings | [log](./qa-artifacts/run-a-clean-20260710/backend-lint.log) |
| Frontend check | PASS; Browserslist stale-data warning | [log](./qa-artifacts/run-a-clean-20260710/frontend-check.log) |
| Frontend lint | PASS — 0 errors, 79 warnings | [log](./qa-artifacts/run-a-clean-20260710/frontend-lint.log) |
| Frontend build | PASS; Browserslist stale-data warning | [log](./qa-artifacts/run-a-clean-20260710/frontend-build.log) |
| Migration validator | PASS — 61 grandfathered / 61 tracked | [footer](./qa-artifacts/run-a-clean-20260710/migration-validate-footer.log) |
| Fresh disposable migration apply | PASS — 61 applied, 0 pending; disposable dropped | [summary](./qa-artifacts/run-a-clean-20260710/migration-fresh-status-summary.log) |
| Dev-copy restore | PASS after known `transaction_timeout` restore incompatibility was omitted; 61 applied, 0 pending, 0 unknown/unapplied versions; disposable dropped | [summary](./qa-artifacts/run-a-clean-20260710/migration-restore-summary.log) |

Relevant passing backend suites include `mmuSchedule.test.ts`, `orderRulesReveal.test.ts`, `auditLoggingRoutes.test.ts`, `adminChangedSurfaceInputValidation.test.ts`, `multiItemPricingLocks.integration.test.ts`, `paymentManualAndSweep.test.ts`, `stripeWebhookOrderFlow.test.ts`, and `adminSchemaCompatibilitySmoke.test.ts`.

## Live verification

Supported HTTP setup created the QA-A1 strict-rules product, active variant, one-month term, current price, two registered users, guest identity/draft, signed Stripe event, credentials, and delivery. The initial webhook attempt against a Stripe-disabled server returned 404 and made no payment write; after restarting with `STRIPE_ENABLED=true`, the signed webhook returned 200.

The claim failure blocks the required user-A ownership/reveal/rules/readiness verification and the coupon, manual-mark-paid, exact-boundary, SQLi/filter, and expiry/reusability probes from being counted as passes. The attempted user-B resource calls returned 404, as did subsequent owner calls after claim failure; those responses are not accepted as validation because ownership was never transferred.

## DB write log

- **Permitted setup:** HTTP registration for `qa-a1-a-1783698168@example.test` and `qa-a1-b-1783698168@example.test`; admin product/variant/term/current-price creation and activation; guest identity/draft; signed Stripe webhook; admin credential save and delivery.
- **Permitted probe:** guest claim submission; customer/admin authorization, rules, reveal, and handshake requests.
- **Read-only verification:** migration state/catalog queries, diagnostic script, subscription/payment/evidence reads.
- **No prohibited writes:** no subscription term anchor/start/end or task due-date mutation; no direct pricing publish run, price-history metadata, or price-history starts-at write; no pre-flight exclusion subscription was modified.

Server port 3103 was stopped. Worktree contains only this QA report and `qa-artifacts/run-a-clean-20260710/`.
