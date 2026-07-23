# QA Run B — Full Browser Walkthrough (QA-B2)

## Verdict

**FAIL — not ready for human QA or the cleanup task.**

The end-to-end checkout, signed-webhook fulfillment, claim, per-item delivery/reveal, strict-rules gate, activation restart, MMU schedules, manual mark-paid, Antom expiry, registered checkout, legacy console, and cross-surface consistency flows completed. Release remains blocked by two Critical findings:

1. the configured strict-rules body is changed before persistence, so the exact configured `<script>alert(1)</script>` fragment never reaches the customer as inert text; and
2. fulfillment credentials and activation-link secrets are emitted in plaintext to the backend log.

A Medium coupon-list defect was also found. Payop could not be verified because the external provider rejected the configured JWT after the supported FX setup completed.

## Environment and scope

| Item | Result |
|---|---|
| Repository | `/home/yuri/projects/ss` |
| Required/tested commit | `887c5851099db2a6b1fc6830e3306d77186ebbff` — confirmed before testing and unchanged |
| Commit subject | `Fix MMU diagnostics and admin-next polish` |
| Run window | 2026-07-11 19:57:50–20:58:07 Europe/Stockholm |
| Browser | Headless system Google Chrome via Playwright, 1440×1000; reveal UA `QA-B2-Chromium-UA/1.0` |
| Backend | Production `dist/server.js`, port 3001, console email, scheduled jobs disabled |
| Frontend | Existing production build served by Vite preview, port 3000 |
| Payment flags | Stripe, PayPal checkout, Payop and Antom enabled |
| Database/cache | Local PostgreSQL and Redis |
| Evidence root | [`qa-artifacts/run-b-20260711-195750`](qa-artifacts/run-b-20260711-195750) |
| Application changes | None. Only QA fixtures, permitted simulation writes, and evidence artifacts were created. Tracked worktree remained clean. |

Per the QA-B2 brief, full suites, builds, and migrations were not rerun.

## Pre-flight gate

`npm run smoke:admin-next` was run exactly once and passed, including fixture cleanup. Full output: [`preflight-smoke.log`](qa-artifacts/run-b-20260711-195750/preflight-smoke.log).

## Principal QA-B2 records

| Record | Identifier |
|---|---|
| P1 QA-B2 Streaming | product `6d6cb1c1-e3a0-4b98-8beb-b1f60a7a08cc`; variant `1e72ee05-1282-4d04-aae0-27b4c3281dd6`; snapshot `5e0d6c67-7a43-497e-836c-2c89eb4fdb80` |
| P2 QA-B2 AI Tool | product `9cba9694-b34d-49de-8cd7-fe4d2d947730`; variant `a8cca186-6fbf-4750-8c79-7dee0f8016fa`; snapshot `42b192aa-c728-4a07-a11b-dd65b9b2ec11` |
| P3 QA-B2 Link Product | product `73687c87-8018-4b35-8dd3-866d4ded59ca`; variant `b619c54d-e1cc-413c-b332-92f52a06a65a`; snapshot `90cd2cf0-b9ca-4d73-b941-26c05b3562e2` |
| Coupon | `QA-B2-TEST15`, 15%, highest eligible item, 1/5 redeemed |
| Main guest order | `f1a571a5-64e7-48ad-891e-ff2ded33696c`; $2,706; signed event `evt_QA_B2_1783793094945` |
| Manual-pay order | `42066d1e-be37-4fe9-97b7-7237017e7697` |
| Registered/legacy order | `367a279a-fbfe-4fd6-9da3-870fa7354b9f`; signed event `evt_QA_B2_REG_1783795500611` |
| Antom expiry order | `bcc2a101-e19d-4ba3-927d-a727d2f96435`; payment `4c1d0dc4-1a9e-438e-ae3b-3613edc63c02` |

The three UI price saves produced distinct succeeded snapshots attached to current price metadata: [`phase0-snapshot-db.json`](qa-artifacts/run-b-20260711-195750/phase0-snapshot-db.json).

## Complete Phase 0–6 walkthrough

The canonical action → expected → actual → result records contain 160 browser/simulation assertions. Raw records are preserved in [`phase0-steps.jsonl`](qa-artifacts/run-b-20260711-195750/phase0-steps.jsonl), [`phase1-steps.jsonl`](qa-artifacts/run-b-20260711-195750/phase1-steps.jsonl), [`phase2-steps.jsonl`](qa-artifacts/run-b-20260711-195750/phase2-steps.jsonl), [`phase3-steps.jsonl`](qa-artifacts/run-b-20260711-195750/phase3-steps.jsonl), [`phase4-steps.jsonl`](qa-artifacts/run-b-20260711-195750/phase4-steps.jsonl), [`phase5-steps.jsonl`](qa-artifacts/run-b-20260711-195750/phase5-steps.jsonl), and [`phase6-steps.jsonl`](qa-artifacts/run-b-20260711-195750/phase6-steps.jsonl). The tables below adjudicate harness timing/casing retries using their later corrective evidence.

### Phase 0 — Catalog setup: PASS

| Action | Expected | Actual | Result / evidence |
|---|---|---|---|
| Create P1/P2/P3 and their variants/terms in `/admin-next` | Supported UI creation and distinct prices | All forms issued successful requests; three separate snapshot-backed prices | PASS — screenshots 001–009; snapshot JSON |
| MMU negative `(6,4)` | Visible divisibility rejection | HTTP 400 with exact visible error; interval restored to 1 | PASS — screenshot 010 |
| Snapshot-less activation negative | Refuse activation | HTTP 400 after the sole permitted direct price insert | PASS — screenshots 011–012 |
| D01 date-bounded coupon | UI sends acceptable dates | `QA-B2-TEST15` returned HTTP 201 and listed with its active window | PASS — screenshot 013 |
| Bind P1 storefront listing to six months | Public listing purchases six months natively | UI save HTTP 200 | PASS — screenshot 014 |

### Phase 1 — Guest checkout and payment: PASS

| Action | Expected | Actual | Result / evidence |
|---|---|---|---|
| Browse home/category/P1–P3 | Catalog, prices and purchase controls render | All products were browsed and added. Initial harness price/control checks used base-price assumptions; subsequent cart/network evidence resolved them. | PASS — screenshots 015–022 |
| D02 six-month listing | Six months reaches cart/order without storage manipulation | Native cart item `termMonths=6`; no localStorage workaround | PASS — screenshot 020 |
| Cart add/remove and own credentials | Three intended lines remain | Browser confirmation removed the extra line; P1 own credentials persisted | PASS — screenshot 021 |
| D03 coupon re-drafts | Discount retained and one reservation only | Three HTTP 200 drafts, $216 discount, $2,706 total, exactly one reserved row | PASS — screenshot 022; pre-webhook DB/network evidence |
| Signed main webhook | Three subscriptions/tasks, per-line locks, redemption, confirmation | Order `in_process`; 3/3 subscriptions and tasks; null header snapshot; each line matched its own snapshot; coupon redeemed 1/5 | PASS — [`phase1-db-assertions.json`](qa-artifacts/run-b-20260711-195750/phase1-db-assertions.json) |
| D04 default capacity | Supported UI defaults still fulfill | Main paid order fully fulfilled without a capacity workaround | PASS |
| D04 failure guard | Incomplete fulfillment cannot silently confirm | Read-only permitted inspection found subscription/task count guards, explicit cancelled/`payment_succeeded_fulfillment_failed`, urgent operator issue, coupon void, and failure return before normal success continuation | PASS by permitted inspection — [`phase1-d04-atomicity-guard-inspection.json`](qa-artifacts/run-b-20260711-195750/phase1-d04-atomicity-guard-inspection.json) |
| Create unpaid P1 order | Pending checkout for Phase 4 | Browser cart created; native Antom session later persisted `pending_payment` | PASS — screenshot 023 |

### Phase 2 — New-console fulfillment: PASS

| Action | Expected | Actual | Result / evidence |
|---|---|---|---|
| Overview / D10 | Paid order in fulfillment activity; unpaid absent | Correct feed/KPI and exclusion | PASS — screenshot 024 |
| Queue / D09 | One group, three methods, Own account badge | Correct group/count/badges; unpaid absent | PASS — screenshot 025 |
| P1 Show/save/deliver | Audited Show; only P1 activates | Audit 0→1, task completed, P1-only email, order remained `in_process` | PASS — screenshots 026–028 |
| P2 strict save/deliver | Rules separated from credentials | Strict strip visible; item delivered; order stayed `in_process` | PASS — screenshot 029 |
| P3 instructions | Configured template and `awaiting_customer` | Template visible; DB `awaiting_customer/pending`; not counted delivered | PASS — screenshot 030 |

### Phase 3 — Claim, reveal, rules, handshake: FAIL

| Action | Expected | Actual | Result / evidence |
|---|---|---|---|
| Register, email-verify, login, claim | Claim-side attachment only | Real console-email link verified; claim `reassigned:true`; repeat returned `already_claimed:true` | PASS — screenshots 031–034 |
| First dashboard paint | Three independent rows without reload | All three rows appeared immediately | PASS — screenshot 035 |
| P1 reveal | Exact per-item credential with UA evidence | Correct credential; reveal audit and compliance evidence carried IP/UA | PASS — screenshot 036 |
| D05 configured rules/XSS proof | Exact `<script>alert(1)</script>` appears as inert text | Modal got the configured distinctive prose but only `alert(1)`; tags had already been stripped from product/selection snapshots | **FAIL QA-B2-D05A (Critical)** — screenshots 037/039 |
| Rules gate/evidence | Checkbox gate, versioned acceptance | Gate worked; version 2 and IP/UA persisted; no alert executed | PASS apart from payload alteration |
| D06 second reveal | Skip modal but audit reveal | Modal skipped and audit incremented | PASS — screenshot 038 |
| P3 ready | Checkbox, evidence, Customer Ready queue action | Passed; initial lowercase locator miss resolved by screenshot | PASS — screenshots 040–041 |
| D07 first link | Same-page refresh | Page updated to 3/3, Delivered, and exposed Restart without reload | PASS — screenshot 042 |
| D08/D11 restart cycle | Reopen parent, requeue, second delivery/reveal | Restart changed parent to `in_process`; second readiness/link returned it to `delivered`; both reveals audited | PASS — screenshots 043–046 |
| Secret handling in logs | No credentials or activation links in logs | Full first/second activation URLs and sensitive credential-update payloads appear in `backend.log` | **FAIL QA-B2-S01 (Critical)** |

### Phase 4 — Manual mark-paid: PASS

| Action | Expected | Actual | Result / evidence |
|---|---|---|---|
| Pending visibility | Order visible only after native payment session | Initial cart-only absence was correct; Antom session created the pending order | PASS — screenshot 047 |
| Note gate and mark-paid | Disabled empty; atomic single allocation | Disabled empty; HTTP 200 with one subscription/task; audit stored exact QA-B2 note | PASS — screenshot 047 |
| Deliver all | Single-item convenience path | HTTP 200 and order `delivered` | PASS — screenshot 048 |

### Phase 5 — MMU: PASS

No subscription anchor, start/end date, or task due date was modified.

| Action | Expected | Actual | Result / evidence |
|---|---|---|---|
| P1 first renewal | Month 2 of 6 and audited inline credential | Correct label/timeline; audit 0→1 | PASS — screenshot 050 |
| D12 next guidance | Month 3 of 6 in success state | Displayed | PASS — screenshot 051 |
| P1 all cycles | `[1,2,3,4,5]`, none beyond | Exactly five tasks; extra sweep created zero; anchor stayed `2026-07-11T18:07:03.638Z` | PASS — [`phase5-counts.json`](qa-artifacts/run-b-20260711-195750/phase5-counts.json) |
| P2 interval two | `[2,4,6,8,10]`, none between/beyond | Exactly five tasks; anchor stayed `2026-07-11T18:07:04.038Z` | PASS — sweep log |
| Issue/resolve | Issues tab and completion history | Passed | PASS — screenshot 052 |
| D14 drawer | Initial delivery + actual Month 2–6 only | MMU Schedule contains exactly those nodes; credential task appears only in separate Task History | PASS — screenshots 053–054 |
| D13 diagnostic | QA-B2 clean; known fixtures classify correctly | QA-B2 P1/P2 and `9b619566…` have no flags; `a84c8871…` retains three genuine flags; expired `abb2499c…` excluded | PASS — diagnostic JSON |

Diagnostic source: [`phase5-diagnostic.json`](qa-artifacts/run-b-20260711-195750/phase5-diagnostic.json). Reference-time commands and results: [`phase5-sweeps.log`](qa-artifacts/run-b-20260711-195750/phase5-sweeps.log).

### Phase 6 — Admin surfaces and regressions: FAIL

| Action | Expected | Actual | Result / evidence |
|---|---|---|---|
| Payments | QA entries, event timeline, no removed controls | Signed event and linked order rendered; no monitoring/refund/credit UI | PASS — screenshots 062 payment views |
| Antom expiry | Expire/cancel/void; succeeded untouched | Sweep scanned 1/cancelled 1/errors 0; reservation voided; succeeded Stripe remained succeeded/delivered | PASS — [`phase6-expiry-results.json`](qa-artifacts/run-b-20260711-195750/phase6-expiry-results.json) |
| Payop enablement / D15 | FX setup then multi/legacy quotes | Supported job fetched 191 rates and published 1,460 prices. Provider returned HTTP 401 `Authorization token invalid`, blocking quote/session completion. | **BLOCKED — environment gap**, not an application defect |
| Coupon usage/order record | 1/5 and redeemed coupon retained | Passed | PASS — screenshots 062 coupon/order file |
| Past-expiry filtering | Hidden default, visible with toggle | HTTP 201 and DB row exists; remains absent when Include expired is checked | **FAIL QA-B2-D18 (Medium)** — screenshot 074 |
| Newsletter | Public subscription, generated email/coupon, admin row | HTTP 200; `NEWSLETTER12-DEC03065`; console email and newsletter tab row present | PASS — screenshot 080 |
| Users/order file | Account, items, payment, coupon, claim, evidence, emails | All rendered with IP/UA; no credits/deposits/rewards | PASS — screenshots 062 users/order file |
| Announcement | Publish/history/customer notification | HTTP 200 and visible to customer | PASS — screenshots 062/075 |
| Global search | ID, payment ref, email | All returned results | PASS — screenshot 062 |
| Old `/admin` pages | Every existing page loads | Overview/products/orders/payments/subscriptions/users/coupons/tasks/notifications all HTTP 200 | PASS — screenshots 063–071 |
| Registered checkout | Non-guest order plus signed webhook | `is_guest=false`, exactly one subscription/task | PASS — screenshot 076; registered JSON |
| D16/D17 old delivery | Exactly one email; no Pending customer item | One `Your SubSlush order is delivered` email; customer projection not Pending | PASS — screenshots 077–078 |
| Cross-consistency | Same final state everywhere | Orders, Order file, Subscriptions, Users, Overview, queue exclusion, dashboard and DB all agree | PASS — [`phase6-cross-consistency.json`](qa-artifacts/run-b-20260711-195750/phase6-cross-consistency.json) |

## Prior-defect regression matrix

| Prior ID | Result |
|---|---|
| D01 coupon date serialization | PASS |
| D02 six-month storefront binding | PASS |
| D03 coupon draft idempotency | PASS |
| D04 fulfillment creation + atomicity guard | PASS; guard half verified via the explicitly permitted inspection option |
| D05 configured strict-rules payload/inert rendering | **FAIL — QA-B2-D05A** |
| D06 repeat reveal modal | PASS |
| D07 link-delivery invalidation | PASS |
| D08/D11 restart/reopen/re-deliver | PASS |
| D09 fulfillment method badge | PASS |
| D10 Overview fulfillment feed | PASS |
| D12 MMU next-cycle message | PASS |
| D13 diagnostic lifecycle | PASS |
| D14 duplicate MMU schedule node | PASS |
| D15 Payop quote | BLOCKED by external invalid JWT after supported local setup |
| D16/D17 legacy delivery email/projection | PASS |

## Console-email inventory

Smoke-suite mail is excluded. Raw inventory: [`email-inventory-lines.log`](qa-artifacts/run-b-20260711-195750/email-inventory-lines.log).

| Recipient | Subject | Classification / result |
|---|---|---|
| Main guest | Your SubSlush order is confirmed | Three-item payment confirmation — PASS |
| Main guest | Your QA-B2 Streaming … 6 months is ready | P1 per-item delivery — PASS |
| Main guest | Your QA-B2 AI Tool … 12 months is ready | P2 per-item delivery — PASS |
| Main guest | Your QA-B2 Link Product … 12 months is ready | Handshake instructions — PASS |
| Main guest | Confirm your SubSlush email | Account verification — PASS |
| Main guest | Your SubSlush order is now linked to your account | Claim notification — PASS |
| Main guest | Your activation link is ready | First per-item link-ready; no secret in email — PASS |
| Main guest | Confirm when you are ready to activate | Restart notification — PASS |
| Main guest | Your activation link is ready | Second per-item link-ready; no secret in email — PASS |
| Pending guest | Your SubSlush order is confirmed | Manual-payment confirmation — PASS |
| Pending guest | Your QA-B2 Streaming … 1 month is ready | Per-item delivery — PASS |
| Pending guest | Action required: claim your delivered SubSlush order | Guest claim notice — PASS |
| Newsletter email | Your 12% off first-order coupon from SubSlush | Newsletter coupon — PASS |
| Registered account | Your SubSlush order is confirmed | Registered checkout confirmation — PASS |
| Registered account | Your SubSlush order is delivered | Sole legacy delivery email — PASS |

The activation-link emails did not contain either dummy link. The same secrets nevertheless appeared in general backend logging, which is Critical finding `QA-B2-S01`.

## DB manipulation and simulation audit

Full exact log: [`db-manipulations.log`](qa-artifacts/run-b-20260711-195750/db-manipulations.log). Simulation log: [`simulations.log`](qa-artifacts/run-b-20260711-195750/simulations.log).

### Permitted DB writes

1. Sole snapshot-less activation negative:

   ```sql
   INSERT INTO price_history (id, product_variant_id, price_cents, currency, metadata)
   VALUES ('ef7e0a2d-6997-4688-95b8-b92fb22e7278',
           '5c13e522-0514-4a49-a3c6-14e3512888cf',
           999, 'USD', '{}'::jsonb);
   ```

2. Strict-rules evidence reset used only to reopen the already-tested modal after a harness locator correction; the browser immediately re-accepted and recreated evidence:

   ```sql
   DELETE FROM order_compliance_evidence_logs
   WHERE order_id='f1a571a5-64e7-48ad-891e-ff2ded33696c'
     AND event_type='strict_rules_acceptance'
     AND metadata->>'subscription_id'='e869bdd6-d17e-49a2-a602-964dbec01785'
   RETURNING id;
   ```

3. Pending Antom expiry simulation:

   ```sql
   UPDATE payments SET created_at=NOW()-INTERVAL '73 hours'
   WHERE id='4c1d0dc4-1a9e-438e-ae3b-3613edc63c02';
   ```

4. Succeeded-payment control:

   ```sql
   UPDATE payments SET created_at=NOW()-INTERVAL '73 hours'
   WHERE id='934738ce-b5c8-4cbb-92e5-da7455abb4a8';
   ```

### Other simulations and supported jobs

- Correctly HMAC-signed Stripe events were used for the main guest and registered orders.
- A short-lived locally signed customer JWT was injected only after real registration, console-email verification, login, claim, and idempotent reclaim passed; retries had triggered the local auth limiter. The token files were deleted during teardown.
- Payop local enablement used the supported FX fetch/publish jobs. No FX or pricing rows were manually fabricated. The first documented command lacked DB-pool initialization; the initialized retry succeeded.
- MMU used explicit reference-time parameters exclusively. No MMU anchor/start/end/task due date was changed.

**Prohibition audit:** no prohibited pricing normalization, anchor mutation, or fabricated provider row occurred.

## Defects

### QA-B2-D05A — Critical — configured strict-rules body is altered

Reproduction:

1. Create a strict-rules product through `/admin-next` with `QA-B2 DISTINCTIVE RULES … <script>alert(1)</script>`.
2. Deliver, claim, and open the customer Rules acknowledgement modal.
3. Inspect the modal and product/selection snapshots.

Expected: the complete configured text reaches the payload and Svelte displays the literal script fragment as inert text. Actual: only `alert(1)` remains; both tags are stripped before persistence. The gate, acceptance version, and evidence work, but the customer does not acknowledge the exact configured document. Suspected: [`src/utils/upgradeOptions.ts`](src/utils/upgradeOptions.ts) `normalizeStrictRulesText()` calls `normalizePlainText`; its existing unit test explicitly expects tag stripping.

### QA-B2-S01 — Critical — plaintext credentials and links in backend logs

Reproduction:

1. Save fulfillment credentials or deliver an activation link.
2. Inspect the backend console log.

Expected: secrets are encrypted at rest and never logged. Actual: `updates.credentials_encrypted` contains complete first/second dummy activation URLs, including their secret tokens; the same update logger covers credential saves. Suspected: [`src/services/subscriptionService.ts`](src/services/subscriptionService.ts) line 796 logs the entire `updates` object before encryption/storage handling.

### QA-B2-D18 — Medium — Include expired toggle lacks expired data

Reproduction:

1. Create an already-expired coupon through `/admin-next/coupons`.
2. Confirm HTTP 201 and the row in PostgreSQL.
3. Check Include expired.

Expected: hidden by default, visible with the toggle. Actual: it remains hidden because it is absent from server-loaded `data.coupons`. Suspected: [`frontend/src/routes/admin-next/coupons/+page.server.ts`](frontend/src/routes/admin-next/coupons/+page.server.ts) calls `listCoupons({limit: 200})` without an include-expired option, while the client can only filter the rows it received.

Machine-readable defects: [`defects.jsonl`](qa-artifacts/run-b-20260711-195750/defects.jsonl).

## Teardown

Backend PID `34740`, frontend launcher PID `34799`, preview PID `34827`, and all browser contexts were stopped. Ports 3000/3001 had zero listeners, zero headless browser processes remained, and both temporary token files were deleted. Evidence: [`server-stop-confirmation.log`](qa-artifacts/run-b-20260711-195750/server-stop-confirmation.log).

## Final assessment

Most of the prior Run-B remediation now passes in an integrated browser flow, including the high-risk payment/fulfillment counts, coupon idempotency, activation restart, bounded MMU generation/diagnosis, and legacy single-item delivery. It is not releasable while secrets are written to logs and the strict-rules contract alters the configured text.

**Final verdict: FAIL (blocking Critical defects QA-B2-D05A and QA-B2-S01; Medium QA-B2-D18 also listed).**
