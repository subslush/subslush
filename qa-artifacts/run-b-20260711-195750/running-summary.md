# QA-B2 running summary

## Pre-flight

- HEAD `887c5851099db2a6b1fc6830e3306d77186ebbff`: PASS.
- Admin-next smoke run exactly once: PASS; cleanup completed.

## Phase 0 — PASS

- Created QA-B2 P1/P2/P3 entirely through `/admin-next` browser UI.
- Separate price saves produced three distinct succeeded snapshot IDs.
- MMU 6/4 divisibility save visibly rejected; interval restored to 1.
- Snapshot-less inactive fixture activation visibly refused after the sole permitted direct price insert.
- D01 regression: date-bounded `QA-B2-TEST15` created through the UI with HTTP 201 and listed.
- Evidence: `phase0-steps.jsonl`, `phase0-snapshot-db.json`, screenshots 001–013, Phase-0 HAR.

## Phase 1 — PASS after harness expectation correction

- D02: native public listing/cart/draft retained P1 term 6 without localStorage manipulation.
- D03: three browser re-drafts returned 200, retained the $216 discount/$2,706 total, and kept exactly one reservation.
- Signed Stripe webhook produced order `f1a571a5…`, three subscriptions/tasks, null header snapshot, matching per-line snapshots, redeemed coupon 1/5, and confirmation email.
- Pending one-month P1 order `42066d1e…` created through browser and left unpaid.
- Initial expected-price selectors used base prices rather than term totals and timed out on an obsolete heading; DB/network/screenshot continuation resolved those as harness errors.

## Phase 2 — PASS

- Overview and queue include the paid order and exclude pending order; D09 Own account and D10 recent fulfillment feed pass.
- P1/P2 delivered independently with audited credential show and per-item email; order remained in process.
- P3 custom instructions delivered and state became awaiting_customer.

## Phase 3 — FAIL (blocking defects found; remaining phases continue)

- Registration, real Supabase email verification, claim reassignment, idempotent re-claim, first paint, P1 reveal/audits, D06 second reveal, P3 readiness, both link delivery/reveal cycles, D07 same-page refresh, and D08/D11 restart/order recomputation passed.
- Critical `QA-B2-D05A`: configured literal `<script>` tags are stripped before persistence; modal shows only `alert(1)`, so the mandated exact inert-render contract fails.
- Critical `QA-B2-S01`: backend logs complete credentials/activation-link secrets through `subscriptionService.ts:796`.
- Harness retries caused an auth-rate-limit 429 and used a documented short-lived customer-token injection only after the real claim flow passed.

## Phase 4 — PASS

- Initial cart-only order was correctly absent from Orders; native browser Antom session transitioned it to the intended unpaid pending state.
- Manual mark-paid stayed disabled without a note, then transactionally created exactly one subscription/task with an auditable QA-B2 note.
- Single-item Deliver all convenience path returned 200 and moved the order to delivered.

## Phase 5 — PASS

- Reference-time-only sweeps created P1 cycles `[1,2,3,4,5]` and P2 cycles `[2,4,6,8,10]`; extra post-term sweep created zero.
- Every completion preserved original `term_start_at`; D12 next message displayed Month 3 of 6.
- Issue/resolve path and inline credential audit passed.
- D14 schedule section contains Initial delivery + Month 2–6 only. Generic credential provisioning remains correctly visible only in the separate Task history section.
- D13 diagnostic: both QA-B2 subscriptions and `9b619566…` clean; `a84c8871…` retains genuine corruption flags; expired `abb2499c…` excluded.

## Phase 6 — FAIL (walkthrough complete)

- Payments, Antom expiry/coupon release, newsletter, user/order evidence, announcements, global search, every old-admin page, registered checkout, D16/D17 single-email/customer projection, and final cross-consistency passed.
- D15 Payop remains an environment gap: supported FX fetch/publish succeeded (191 rates, 1,460 prices), but the configured Payop JWT was rejected by the provider with HTTP 401 before quote/session completion.
- Medium `QA-B2-D18`: an already-expired coupon is created and remains in PostgreSQL, but the server-loaded coupon list omits it, making the checked Include expired toggle ineffective.
- Run verdict remains FAIL because Phase 3 found Critical `QA-B2-D05A` and `QA-B2-S01`; D18 is additional non-blocking UI behavior.
