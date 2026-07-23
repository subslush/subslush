# QA Run A — final rerun report

**Commit:** `f6d6dec34021335997ebd733aeab6c730f033131`  
**Branch:** `Admin-UI-and-Logic-implementation`  
**Verdict:** **FAIL — Run B must not launch.**

## Pre-flight

- HEAD matches the required `f6d6dec` commit. Worktree contains QA reports and
  artifacts only; no untracked application source, test, or migration file.
- 61 migrations are tracked.
- Pre-flight, post-smoke, and closing MMU diagnostics all contain exactly the
  preserved IDs `9b619566-b9df-442d-a1ed-d45de0e42241`,
  `a84c8871-b58a-4f8b-99fa-193ebf476277`, and
  `abb2499c-4d4e-4f95-82f9-9f71b685b05d`. No QA-A1 finding was created.

## Part A

| Gate | Result |
|---|---|
| Backend Jest | PASS — 95 suites / 397 tests |
| Backend build/lint | PASS — 0 errors / 10 warnings |
| Frontend check/lint/build | PASS — 0 check errors; 0 lint errors / 79 warnings; build passed |
| Migration validator | PASS — 61 grandfathered / 61 tracked |
| Fresh disposable migration | PASS — 61 applied / 0 pending; dropped |
| Dev-copy restore | PASS — 61 applied / 0 pending / 0 unknown or unapplied; dropped; only known `transaction_timeout` SET omitted |
| Admin-next smoke | PASS — prefix cleanup began at zero, teardown removed its fixtures; post-smoke diagnostic stayed at three IDs |

Passing suite coverage includes `mmuSchedule.test.ts`, `orderRulesReveal.test.ts`,
`paymentManualAndSweep.test.ts`, `stripeWebhookOrderFlow.test.ts`,
`adminSchemaCompatibilitySmoke.test.ts`, `adminChangedSurfaceInputValidation.test.ts`,
`multiItemPricingLocks.integration.test.ts`, dashboard payload guards, claim-side
regressions, and `emailServiceConsole.test.ts`.

## Completed live probes

- QA-A1 catalog setup via supported APIs passed: product, active variant,
  six-month term, current price, and succeeded pricing-publish snapshot.
- Guest checkout using registered User A email remained a guest identity until
  claim. Registered/unregistered identity responses had identical status and
  field shape.
- Signed Stripe completion, credential save, and item delivery passed.
- Full 64-character console claim token was recovered from the console email.
  Mismatched owner claim returned 403; no-token returned 401; rightful claim
  returned 200/reassigned; double rightful claim returned 200/already_claimed.
- Strict-rules gate: reveal-before-acceptance 400; false/missing acceptance
  400; accepted 200; two owner reveals 200. IDOR reveal/accept/ready from User
  B all returned 404. Ready-confirm outside awaiting state returned 409;
  customer admin-instructions 403; admin instructions and double customer
  readiness each returned 200.
- Credentials at rest were AES-GCM JSON with ciphertext/IV/tag and no fixture
  plaintext. Audit rows retained one distinctive UA and one SQL NULL UA.
- Oversized credentials/instructions/note/rules returned schema 400s with the
  exact 4,000/4,000/1,000/8,000 limits. SQLi and script global-search probes
  returned 200 normal empty result shapes.
- Manual mark-paid: empty note 400; pending single-item non-empty note 200,
  creating one task; repeat attempt 409.
- Coupon CAP1: first guest draft reserved one redemption; second draft was
  rejected for max redemptions; signed webhook changed it to redeemed.

## Blocking unexecuted probes

The following required probes were not executed and are therefore blocking by
the Run-A instruction: full admin/customer AuthZ matrix and old/new guard
source comparison; admin aggregate credential-material inspection; exact-limit
success cases; cancelled-order mark-paid case; legacy order-level reveal bypass;
coupon expiry/release/reuse and registered-user coupon lifecycle; inverse-order
guest-then-registration claim; and customer-order visibility assertion after
claim through a supported customer read route.

## DB write log

- **Permitted migration simulation:** fresh disposable create/apply/status/drop
  and dev dump/restore/status/drop.
- **Permitted setup/probe:** QA-A1 registrations; product/variant/term/current
  price/activation; guest identities/drafts; signed Stripe webhooks; credential
  save, delivery, claim, strict-rule/handshake probes; manual checkout and
  mark-paid; coupon creation/drafts/webhook.
- **Read-only verification:** price snapshot, audit/evidence, credential
  encryption, migration-state, and MMU diagnostics.
- **No prohibited writes:** no direct subscription anchor/start/end or task due
  date mutation; no direct pricing publish run or price-history metadata/
  starts-at write; preserved subscriptions untouched.

All services were stopped; `live-server-stop.log` confirms no port-3104 listener.
