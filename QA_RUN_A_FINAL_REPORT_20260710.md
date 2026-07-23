# QA Run A — final report

**Commit:** `c7c9316ed84adafbe81fa6a0050c6b47c47eaa22`  
**Branch:** `Admin-UI-and-Logic-implementation`  
**Verdict:** **FAIL — Run B must not launch.**

## Blocking findings

1. **Critical — required smoke suite creates a new MMU-anchor diagnostic finding.**
   Pre-flight `diagnose-mmu-anchors.js` returned 21 exclusions. The required
   `npm run smoke:admin-next` passed, but its fixture MMU workflow persisted a
   new flagged subscription (`1c052bbf-165f-4d59-9319-78fee1ebe9c1`, order
   `99ae7177-e743-437c-9322-6983cba63192`, guest `guest+4663b540-8758-462f-a479-174b0b7f0719@guest.local`).
   The closing diagnostic therefore returned 22 findings, including the new
   `repeat_schedule_can_overdeliver_by_5_months` finding. This violates the
   Run-A closing invariant and demonstrates that the supposed self-cleaning
   smoke fixture leaks MMU data. The new subscription predates the separately
   created QA-A1 fixture, tying it to the smoke run rather than the live probe.

2. **Critical — the mandatory claim happy-path cannot be evidenced with the
   configured console email provider.** The delivery email logger truncates
   `payload.text` to 200 characters (`src/services/emailService.ts`), leaving
   only the first 16 characters of the 64-character one-time claim token in
   `textPreview`. The raw token is intentionally not exposed by API/admin
   aggregates and can only be recovered by a prohibited direct write/service
   bypass. Claim happy-path, mismatch/no-token/double-claim, and inverse-order
   probes are therefore blocked. The attempted truncated-token request is not
   counted as a claim result.

3. **Run-A stopping rule:** after the two Critical findings, remaining live
   Part-B/C probes were not run to avoid further fixture writes. Under the
   supplied protocol, each is an unexecuted blocking probe, not a pass.

## Pre-flight

- Worktree contained only QA artifacts; no untracked application source, test,
  or migration was found.
- Tracked SQL migrations: **61**.
- Pre-flight anchor diagnostic: **21** findings, frozen as exclusions for this
  run. Closing diagnostic: **22**; comparison and new finding are retained.

## Part A — completed gates

| Check | Result | Evidence |
|---|---|---|
| Backend Jest | PASS — 94 suites / 396 tests | `qa-artifacts/run-a-20260710-232201/backend-test.log` |
| Backend build | PASS | `backend-build.log` |
| Backend lint | PASS — 0 errors / 10 warnings | `backend-lint.log` |
| Frontend check | PASS — 0 errors / 0 warnings | `frontend-check.log` |
| Frontend lint | PASS — 0 errors / 79 warnings | `frontend-lint.log` |
| Frontend build | PASS | `frontend-build.log` |
| Migration validator | PASS — 61 grandfathered / 61 tracked | `migration-validate.log` |
| Fresh disposable migrations | PASS — 61 applied / 0 pending; dropped | `migration-fresh-*` |
| Dev-copy restore | PASS — 61 applied / 0 pending / 0 unknown or unapplied; dropped. Only known `transaction_timeout` SET omitted. | `migration-restore-*` |
| Admin-next smoke | PASS — complete harness, products interactive in 1220ms | `smoke.log` |

The required backend coverage files ran in the passing suite, including
`mmuSchedule.test.ts`, `orderRulesReveal.test.ts`, `paymentManualAndSweep.test.ts`,
`stripeWebhookOrderFlow.test.ts`, `adminSchemaCompatibilitySmoke.test.ts`,
`adminChangedSurfaceInputValidation.test.ts`, `multiItemPricingLocks.integration.test.ts`,
and dashboard/claim regression coverage.

## Partial live evidence (not sufficient to pass Run A)

- Supported API setup successfully created a QA-A1 strict-rules product, active
  variant, six-month term and current price. Read-only verification confirms
  its price snapshot is attached to a `succeeded` `pricing_publish_runs` row.
- Guest checkout using User A's registered email remained a guest order after
  signed Stripe payment; credentials were stored and delivery succeeded.
- Stored credentials were created through the supported admin endpoint only.
- Literal identity response bytes for registered and unregistered emails were
  not equal because each response includes a distinct generated
  `guest_identity_id`; normalized response shapes were equal. This is not
  accepted as the requested byte-for-byte claim-enumeration proof.

## DB/write log

- **Permitted migration simulation:** disposable fresh database create/apply/status/drop; dev dump/restore/status/drop.
- **Permitted smoke setup:** the required smoke suite's supported local HTTP
  API fixture creation and its own signed webhook workflow. It is also the
  source of the leaked MMU diagnostic fixture above.
- **Permitted QA-A1 setup:** `POST /auth/register` (QA-A1 users), admin product,
  variant, term, current-price and activation endpoints; guest identity/draft;
  signed Stripe webhook; credential save; item delivery.
- **Permitted read-only verification:** pricing snapshot/status, encryption and
  diagnostic reads.
- **No prohibited direct writes:** no mutation of subscription anchors/start/end
  dates or task due dates; no direct pricing publish run or price-history
  metadata/starts-at mutation; no pre-flight exclusion subscription modified.

## Server shutdown

The preview/smoke backend and the dedicated live backend were stopped by their
recorded process groups. `smoke-stop.log` and `live-server-stop.log` confirm no
listeners remained.
