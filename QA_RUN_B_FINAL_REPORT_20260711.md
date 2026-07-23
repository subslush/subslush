# QA Run B — Full Browser Walkthrough (QA-B1)

## Verdict

**FAIL — not ready for human QA or the cleanup task.**

The signed-webhook fulfillment path, per-item delivery/auditing, claim flow, bounded MMU task generation, manual mark-paid transaction, Antom expiry sweep, registered checkout, and all old-admin pages were exercised successfully. Release is blocked by four Critical defects and multiple High defects, chiefly: no public term selector, non-idempotent coupon reservation, paid orphan orders when product capacity defaults to zero, missing strict-rules payload/XSS evidence, broken activation restart completion, Payop quote failure, and duplicate legacy delivery emails.

## Environment and scope

| Item | Result |
|---|---|
| Repository | `/home/yuri/projects/ss` |
| Required commit | `f6d6dec34021335997ebd733aeab6c730f033131` — confirmed |
| Run start | 2026-07-11 09:51:47 Europe/Stockholm |
| Browser | Headless system Google Chrome via Playwright, 1440×1000; customer reveal UA `QA-B1-Chromium-UA/1.0` |
| Backend | `dist/server.js`, port 3001, console email transport, scheduled jobs disabled for deterministic direct invocation |
| Frontend | production Vite build/preview, port 3000 |
| Database/cache | local PostgreSQL and Redis, healthy |
| Evidence root | [`qa-artifacts/run-b-20260711-095147`](qa-artifacts/run-b-20260711-095147) |
| Application fixes | None. Only QA data, permitted simulations, and artifact scripts were written. |

## Pre-flight

`npm run smoke:admin-next` was run exactly once and passed (exit 0). It created and cleaned its own smoke fixtures. Full output: [`preflight-smoke.log`](qa-artifacts/run-b-20260711-095147/preflight-smoke.log).

Frontend production build for the browser preview also passed: [`frontend-vite-build.log`](qa-artifacts/run-b-20260711-095147/frontend-vite-build.log). Per the Run-B brief, the broader suites/build/migration/security rerun was not repeated; Run B was the fresh browser walkthrough.

## Test catalog and principal records

| Fixture | IDs / evidence |
|---|---|
| P1 QA-B1 Streaming | product `36920bc8-0477-4bd3-8a0e-e18acf1db130`; variant `7827f724-79d9-4663-9b15-4c2496360fba`; snapshot `83351ac4-9ce0-4abf-8770-54bf35502e16` |
| P2 QA-B1 AI Tool | product `7a5ba660-d52d-4a3a-b15d-652932899929`; variant `2119cf9b-6b8b-4492-bd19-9311d2f4fdad`; snapshot `e264255b-ea7d-4704-bd31-8c7036ada25a` |
| P3 QA-B1 Link Product | product `5e220741-d926-45cf-a40e-39dc3674aabe`; variant `cdf7afec-195f-4c05-901b-92d0d9971192`; snapshot `1d7594af-404d-4114-bd2e-e32426b3d6c6` |
| Coupon | `QA-B1-TEST15`, 15%, highest eligible item, max 5; ultimately 2/5 due the paid-orphan defect |
| Main guest order | `b4c15ca5-c4ec-4970-8467-2acd1963da6d`; $2,706 after $216 discount; signed Stripe event `evt_QA_B1_1783757838901` |
| Manual-pay order | `9d9bf9a1-abb9-4acf-b353-ab5a30b9aa10` |
| Registered/old-console order | `0e72a4d2-00e0-4bc9-9e54-9f532331b6fe`; signed Stripe event `evt_QA_B1_REG_1783760944902` |
| Antom expiry order | `a8747ea7-5537-49d7-bda1-b753eed132e8`; payment `964643bf-3de4-4572-a0c2-10a0b5dac424` |

Snapshot DB proof: [`phase0-snapshot-db.json`](qa-artifacts/run-b-20260711-095147/phase0-snapshot-db.json). All three supported UI price saves produced distinct, succeeded snapshots attached to current prices.

## Complete Phase 0–6 walkthrough

The granular machine-readable action/expected/actual/result records are preserved in [`phase0-steps.jsonl`](qa-artifacts/run-b-20260711-095147/phase0-steps.jsonl), [`phase1-steps.jsonl`](qa-artifacts/run-b-20260711-095147/phase1-steps.jsonl), [`phase2-steps.jsonl`](qa-artifacts/run-b-20260711-095147/phase2-steps.jsonl), [`phase3-steps.jsonl`](qa-artifacts/run-b-20260711-095147/phase3-steps.jsonl), [`phase4-steps.jsonl`](qa-artifacts/run-b-20260711-095147/phase4-steps.jsonl), [`phase5-steps.jsonl`](qa-artifacts/run-b-20260711-095147/phase5-steps.jsonl), and [`phase6-steps.jsonl`](qa-artifacts/run-b-20260711-095147/phase6-steps.jsonl). The table below resolves harness retries to the final observed application result.

### Phase 0 — Catalog setup

| Action | Expected | Actual | Result / evidence |
|---|---|---|---|
| Create P1, P2, P3 in `/admin-next` | Correct service features and variants | Created through browser UI; MMU 1/2, strict rules, handshake template persisted | PASS — screenshots 001–009 |
| Save each price separately | Three distinct snapshot-backed prices | Three distinct snapshot IDs, all current and succeeded | PASS — [`phase0-snapshot-db.json`](qa-artifacts/run-b-20260711-095147/phase0-snapshot-db.json) |
| Set P1 interval 4 against 6-month term | Visible divisibility rejection | HTTP 400 and visible divisibility message | PASS — screenshot 010 |
| Activate snapshot-less throwaway | Refused | Refused HTTP 400 after sole permitted direct price insert | PASS — screenshots 011–012 |
| Create date-bounded coupon | Browser saves active window | `datetime-local` omitted timezone; API rejected valid UI values. Coupon could only be created with blank optional dates. | **FAIL D01** — screenshot 013, HAR |

### Phase 1 — Public site and guest checkout

| Action | Expected | Actual | Result / evidence |
|---|---|---|---|
| Browse home/category/P1–P3 | Public catalog renders | All pages rendered and prices were visible | PASS — screenshots 014–018 |
| Select P1 6-month term | Term selector available | No term/variant selector exists; page hard-selects first term | **FAIL D02** — screenshot 019 |
| Build/edit three-line cart | Add, remove, own-account credentials | Add/remove worked. A documented localStorage change was required solely to reach the intended P1 6-month downstream case. | PASS with workaround — screenshot 020; [`simulations.log`](qa-artifacts/run-b-20260711-095147/simulations.log) |
| Apply coupon | Highest eligible P2 discounted $216; total $2,706 | Initial draft correct, but continuing created a second reservation attempt, returned 400, silently removed coupon, then hit a unique constraint on reapply | **FAIL D03** — screenshot 021; [`network/phase1.har`](qa-artifacts/run-b-20260711-095147/network/phase1.har) |
| Signed webhook on supported UI-created catalog | Paid/in-process plus 3 subscriptions/tasks atomically | First paid replacement committed payment/coupon/email but created zero subscriptions/tasks because UI products had `max_subscriptions=0` | **FAIL D04** |
| Repeat after changing capacity through supported UI | 3 subscriptions/tasks and redeemed coupon | Main order succeeded: header snapshot NULL, each line matched its own snapshot, 3 subscriptions, 3 tasks, coupon redeemed | PASS — [`phase1-db-assertions.json`](qa-artifacts/run-b-20260711-095147/phase1-db-assertions.json), screenshot 025 |
| Create unpaid single P1 | Pending order, no queue entry | Native Antom session, pending order | PASS — [`phase1-pending.json`](qa-artifacts/run-b-20260711-095147/phase1-pending.json), screenshot 026 |

### Phase 2 — New-console fulfillment

| Action | Expected | Actual | Result / evidence |
|---|---|---|---|
| Overview | KPI and both relevant feeds correct; unpaid absent | KPI/payment activity correct and unpaid absent, but fulfillment activity omitted main paid order | **FAIL D10** — screenshot 027 |
| Grouped queue | One group, 3 rows, correct badges, 0/3 | Grouped once and correct count; P1 own-account row incorrectly labeled New account | **FAIL D09** — screenshot 028 |
| P1 Show/save/deliver | Exact submitted credential; one audit per click; only P1 activates | Exact credential, audit count increment, task complete, P1-only email; order stayed in-process | PASS — screenshots 029–031; [`phase2-db-final.json`](qa-artifacts/run-b-20260711-095147/phase2-db-final.json) |
| P2 strict save/deliver | Rules strip separate; P2-only delivery | Passed; order stayed in-process | PASS — screenshot 032 |
| P3 instructions | Template, awaiting_customer, not delivered | Passed; instruction email sent and count stayed 2/3 | PASS — screenshot 033 |

### Phase 3 — Claim, reveal, rules, handshake

| Action | Expected | Actual | Result / evidence |
|---|---|---|---|
| Register guest delivery email and claim | Real email verification; claim reassigned; repeat idempotent | Verification and claim succeeded; repeat returned graceful already-claimed success | PASS — screenshots 034–037 |
| First dashboard paint | Three independent rows without reload | Three rows present immediately | PASS — screenshot 038 |
| P1 reveal | Exact P1 credential and UA-bearing audit/evidence | Exact P1 credential; audit and compliance rows recorded IP/UA | PASS — screenshot 039 |
| P2 strict reveal/XSS | Configured literal script appears inert; checkbox gates reveal | Entitlement omitted configured text and displayed fallback, so mandatory render-XSS proof was impossible | **FAIL D05** — screenshot 040 |
| P2 accept and second reveal | Acceptance version logged; second reveal skips modal; reveal audited | Acceptance/audits passed; second reveal opened modal again | **FAIL D06** — screenshot 041 |
| P3 customer ready | Mandatory checkbox, customer_ready evidence, queue ready flag | Customer transition/evidence passed | PASS — screenshot 042 |
| Deliver first link | Encrypted at rest; no link in email; order delivered | Passed. Email contained no link; reveal audited. Detail stayed stale until reload. | PASS with **D07** — screenshots 043–044; [`phase3-link-email-excerpt.log`](qa-artifacts/run-b-20260711-095147/phase3-link-email-excerpt.log) |
| Restart and second cycle | Browser restart then complete another link cycle | Restart control absent. After documented API restart, customer reached `customer_ready`, but order remained `delivered` and admin could not access link delivery | **FAIL D08/D11** — screenshot 045; [`phase6-cross-consistency.tsv`](qa-artifacts/run-b-20260711-095147/phase6-cross-consistency.tsv) |

### Phase 4 — Manual mark-paid

| Action | Expected | Actual | Result / evidence |
|---|---|---|---|
| Pending order visibility | Pending on Orders, absent from queue | Passed | PASS |
| Note gate and manual mark-paid | Disabled without note; one subscription/task; audit | Passed with note `QA-B1 manual provider verification: Antom sandbox checkout confirmed for Phase 4`; exact audit action `orders.mark_paid.manual` | PASS — screenshot 047 |
| New-console single-item Deliver all | Save then one-click delivery | Passed; order delivered | PASS — screenshots 048–049 |

### Phase 5 — MMU, explicit reference-time only

No subscription anchor, start/end date, or task due date was mutated.

| Action | Expected | Actual | Result / evidence |
|---|---|---|---|
| P1 (6,1) first task | Month 2 of 6; inline audited credentials | Passed; immutable anchor remained `2026-07-11T08:23:42.842Z` | PASS — screenshot 050 |
| P1 complete first | Next message references Month 3 | Completion passed but banner omitted next-month reference | **FAIL D12** — screenshot 051 |
| P1 all cycles + extra sweep | Cycles 1–5 = Month 2–6; none beyond | Exactly `[1,2,3,4,5]`; extra post-term sweep created zero | PASS — [`phase5-counts.json`](qa-artifacts/run-b-20260711-095147/phase5-counts.json) |
| P2 (12,2) | Cycles 2,4,6,8,10 only | Exactly five tasks: Months 3–4 through 11–12; none beyond; anchor unchanged `2026-07-11T08:25:09.206Z` | PASS — [`phase5-sweeps.log`](qa-artifacts/run-b-20260711-095147/phase5-sweeps.log) |
| Issue/resolve | Issues tab and history | Passed | PASS — screenshot 052 |
| Subscription row/drawer | Month labels and Initial + Month 2–6 schedule | Labels/tasks correct, but drawer adds a duplicate generic `credential_provision` node | **FAIL D14** — screenshots 053/074; [`phase5-subscription-drawer.json`](qa-artifacts/run-b-20260711-095147/phase5-subscription-drawer.json) |
| Required diagnostic | No QA-B1 flags | Both QA-B1 schedules falsely flagged for repeat overdelivery despite bounded observed tasks | **FAIL D13** — [`phase5-diagnostic.json`](qa-artifacts/run-b-20260711-095147/phase5-diagnostic.json) |

Lifecycle-aware diagnostic interpretation: preserved fixture `9b619566…` remained unflagged; preserved `a84c8871…` retained its prior anchor flags; the expected aged-out fixture was absent. The failure is specifically the new QA-B1 false positives.

### Phase 6 — Payments, sweeps, remaining pages, regressions

| Action | Expected | Actual | Result / evidence |
|---|---|---|---|
| Payments ledger/drawer | QA payments, correct timeline, retry only if flagged, no removed financial UI | Ledger passed; signed event drawer showed `checkout.session.completed`; no monitoring/refund/credit UI | PASS — screenshots 054–055; [`phase6-payment-drawer.json`](qa-artifacts/run-b-20260711-095147/phase6-payment-drawer.json) |
| Antom expiry | >72h pending becomes expired/cancelled | Direct sweep scanned 1/cancelled 1/errors 0; payment expired and order cancelled | PASS — [`phase6-expiry-sweep.log`](qa-artifacts/run-b-20260711-095147/phase6-expiry-sweep.log), [`phase6-expiry-results.tsv`](qa-artifacts/run-b-20260711-095147/phase6-expiry-results.tsv) |
| Backdated succeeded payment | Untouched | Main succeeded Stripe payment remained succeeded and delivered | PASS |
| Payop expiry | Native pending Payop order | Local Payop provider rejected configured external JWT, so a supported Payop pending session could not be created. No prohibited provider-row fabrication was used. | BLOCKED / environment gap |
| Payop multi-snapshot and legacy quote | Both quote | Both returned empty arrays due missing FX metadata on supported UI-published USD snapshots | **FAIL D15** — [`phase6-payop-quote.json`](qa-artifacts/run-b-20260711-095147/phase6-payop-quote.json) |
| Coupon/list/order file | 2/5, redeemed coupon retained | Passed | PASS — screenshots 056/059 |
| Past-expiry coupon filtering | Create in UI, hidden/default and visible/toggle | Could not create a date-bounded coupon because of D01; independent toggle rendered | BLOCKED by D01 |
| Newsletter | Public subscribe, console coupon email, admin stats | HTTP 200, generated `NEWSLETTER12-30411208`, email sent; newsletter stats/list rendered | PASS — screenshots 057/071; [`phase6-newsletter.json`](qa-artifacts/run-b-20260711-095147/phase6-newsletter.json), [`phase6-newsletter-db.tsv`](qa-artifacts/run-b-20260711-095147/phase6-newsletter-db.tsv) |
| User support lookup | Account/orders/subscriptions/evidence IP/UA; no financial legacy concepts | Passed | PASS — screenshot 058 |
| Order file | Coupon/payment/evidence/emails/claim history | Rendered and coupon/evidence/email/claim sections present | PASS — screenshot 059 |
| Announcement | Publish, history, customer notification | POST 200; appeared in history and customer notification menu | PASS — screenshots 061/075 |
| Global search | Order ID, payment ref, email | All three returned visible results | PASS — screenshot 060 |
| Old console pages | Every listed old page loads | Overview/products/orders/payments/subscriptions/users/coupons/tasks/notifications all HTTP 200 | PASS — screenshots 062–070 |
| Registered checkout | Non-guest checkout succeeds | Browser login/draft attached to `is_guest=false` user; signed webhook produced exactly 1 subscription/task | PASS — screenshot 072; [`phase6-registered.json`](qa-artifacts/run-b-20260711-095147/phase6-registered.json), [`phase6-registered-db.tsv`](qa-artifacts/run-b-20260711-095147/phase6-registered-db.tsv) |
| Old-console single-item delivery | One email, delivered order, active customer item | DB order/subscription delivered/active, but two delivery emails emitted and the customer row still displayed Pending | **FAIL D16/D17** — screenshots 073/075 |
| Cross-consistency | Identical state everywhere | P1/P2 consistent; restarted P3 is `customer_ready` under a delivered order and absent from actionable fulfillment | **FAIL D11** |

## Console-email inventory

Run-specific console emails (smoke messages excluded):

| Recipient | Subject | Classification / result |
|---|---|---|
| `qa-b1-final-…@example.test` | Your SubSlush order is confirmed | Main order confirmation; all 3 items and $2,706 total — PASS |
| same | Your QA-B1 Streaming … 6 months is ready | P1 per-item — PASS |
| same | Your QA-B1 AI Tool … 12 months is ready | P2 per-item — PASS |
| same | Your QA-B1 Link Product … 12 months is ready | Handshake instructions — PASS |
| same | Confirm your SubSlush email | Registration verification — PASS |
| same | Your SubSlush order is now linked to your account | Claim — PASS |
| same | Your activation link is ready | Link-ready notice; no secret/link in body — PASS |
| same | Confirm when you are ready to activate | Restart notice — PASS |
| `qa-b1-pending-…@example.test` | Your SubSlush order is confirmed | Manual-pay confirmation — PASS |
| same | Your QA-B1 Streaming … 1 month is ready | Per-item delivery — PASS |
| same | Action required: claim your delivered SubSlush order | Guest claim notice — PASS |
| `qa-b1-newsletter-…@example.test` | Your 12% off first-order coupon from SubSlush | Newsletter coupon — PASS |
| registered QA-B1 account | Your SubSlush order is confirmed | Registered order confirmation — PASS |
| same | Your QA-B1 Streaming … 1 month is ready | Legacy delivery message 1 — unexpected |
| same | Your SubSlush order is delivered | Legacy delivery message 2 — unexpected duplicate, D16 |

Raw inventory: [`email-inventory-lines.log`](qa-artifacts/run-b-20260711-095147/email-inventory-lines.log). The failed paid-orphan replacement also emitted a confirmation before fulfillment creation failed; this is part of D04.

## DB manipulation and simulation audit

### DB writes

1. **Permitted snapshot-less negative (the sole pricing-data insert):**

   ```sql
   INSERT INTO price_history (id, product_variant_id, price_cents, currency, metadata)
   VALUES ('db8fbb5d-3982-4f26-b005-e595a793e280',
           '31a70eed-ebf0-4bdc-a787-9130ae0c49db',
           999, 'USD', '{}'::jsonb);
   ```

2. **Permitted expiry timestamp mutation:**

   ```sql
   UPDATE payments SET created_at = NOW() - INTERVAL '73 hours'
   WHERE id = '964643bf-3de4-4572-a0c2-10a0b5dac424';
   ```

3. **Permitted succeeded-payment control mutation:**

   ```sql
   UPDATE payments SET created_at = NOW() - INTERVAL '73 hours'
   WHERE id = '113d889c-ffa2-4c61-ae5d-b40994ce8de1';
   ```

No prohibited MMU anchor/start/end/due-date mutation occurred. No pricing publish run, price metadata, or price start-time was inserted/edited. Full log: [`db-manipulations.log`](qa-artifacts/run-b-20260711-095147/db-manipulations.log).

### Other documented simulations/workarounds

- Browser cart localStorage P1 `termMonths: 1 → 6` only after D02 made the required selection impossible; exact before/after payload is logged.
- Correctly HMAC-signed Stripe `checkout.session.completed` events were sent for the paid-orphan diagnostic, final main order, and registered regression order. Signature values are redacted in evidence.
- Admin activation restart API was invoked only after D08 proved the UI control unreachable, to test the independent downstream second-cycle behavior.
- MMU used explicit reference-time parameters exclusively.

Full log: [`simulations.log`](qa-artifacts/run-b-20260711-095147/simulations.log).

## Teardown

Backend PIDs `196749`, frontend launcher `196852`, preview shell `196864`, and preview node `196865` were stopped. Ports 3000/3001 were no longer reachable, and the process table contained zero Chrome/Chromium processes. Evidence: [`server-stop-confirmation.log`](qa-artifacts/run-b-20260711-095147/server-stop-confirmation.log). The earlier `headless_chromium_matches=4` line counted the inspection shell/regex itself; the subsequent process-name check is the authoritative zero-process result.

## Defect list

| ID | Severity | Reproduction / actual | Suspected file or endpoint |
|---|---|---|---|
| D01 | High | Enter valid start/end in `/admin-next/coupons`, submit; UI sends timezone-less values and API returns 400 | `frontend/src/routes/admin-next/coupons/+page.svelte`; `POST /api/v1/admin/coupons` schema |
| D02 | **Critical** | Open P1 with 1/6-month terms; only first term is purchasable and no selector renders | `frontend/src/routes/browse/products/[slug]/+page.svelte` selected term/variant logic |
| D03 | **Critical** | Apply coupon then Continue; second draft says already redeemed, silently reprices couponless, and reapply hits unique constraint | `POST /api/v1/checkout/draft`; checkout draft refresh/fallback |
| D04 | **Critical** | Create supported product without editing optional max capacity, pay via signed webhook; payment/coupon/email commit but zero subscriptions/tasks | admin-next product max default; Stripe success/subscription transaction boundary |
| D05 | **Critical** | Reveal delivered strict-rules P2; modal receives fallback instead of configured rules, preventing mandatory XSS proof | entitlement payload from `GET /api/v1/orders/:order/subscriptions`; dashboard modal |
| D06 | Medium | Accept P2 rules, hide, reveal again; acknowledgment modal repeats | dashboard `revealCredentials` modal branch |
| D07 | Medium | Deliver activation link; success appears while count/state/input remain stale until reload | admin-next fulfillment detail invalidation |
| D08 | High | Deliver link and reload; Restart control is absent because delivered-item branch wins | `frontend/src/routes/admin-next/fulfillment/orders/[orderId]/+page.svelte` branch order |
| D09 | Medium | Own-account P1 shows New account badge in grouped queue | fulfillment aggregate/method badge mapping |
| D10 | Medium | Main paid order appears in payment activity but not Overview fulfillment activity | admin-next overview aggregate/feed |
| D11 | High | API restart then customer ready: parent stays delivered; item is customer_ready and no second link input is actionable | activation restart order-status recomputation / queue eligibility |
| D12 | Medium | Complete Month 2; success omits expected Month 3 next reference | MMU detail completion message |
| D13 | High | Run required diagnostic after exact bounded cycles; both QA-B1 subscriptions falsely flagged overdelivery | `database/diagnose-mmu-anchors.js` lifecycle calculation |
| D14 | Medium | Open completed P1 drawer; Initial delivery and generic credential_provision both render before Month 2 | admin-next subscription schedule construction |
| D15 | High | Quote mixed per-line and legacy header snapshot shapes; both return no methods despite valid current USD snapshot rows | `src/services/payments/payopQuoteService.ts` FX/fee resolution |
| D16 | High | Confirm one-item delivery in old console; console emits per-item ready plus order-delivered emails | old order-status delivery path and per-item/legacy email interaction |
| D17 | Medium | After old-console delivery, customer dashboard shows Delivered order containing a Pending item while DB subscription is active | legacy delivery entitlement/status projection or dashboard cache |

Machine-readable defects with full reproduction arrays: [`defects.jsonl`](qa-artifacts/run-b-20260711-095147/defects.jsonl).

## Final assessment

Core positive evidence is strong: the final signed webhook created correct per-line entities from three distinct locks, credential isolation and audits worked, the claim was idempotent, MMU generation itself stopped exactly at the purchased coverage, Antom expiration behaved correctly, and the old pages rendered. Those successes do not offset the release blockers: customers cannot choose advertised terms; coupon checkout can lose discounts and produce invalid redemption state; payment success can commit without fulfillment entities; strict rules are not delivered for enforcement/XSS verification; activation restart cannot finish; and legacy delivery duplicates customer email.

**Final verdict: FAIL (blocking defects D02, D03, D04, D05 and High-severity flow regressions listed above).**
