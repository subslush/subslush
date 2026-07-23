# QA Run A completion addendum

**Base report:** `QA_RUN_A_FINAL_RERUN_REPORT_20260711.md` on `f6d6dec`  
**Verdict:** **FAIL — Run B must not launch.**

HEAD matched `f6d6dec`. The closing MMU diagnostic contains exactly the three
preserved IDs and no QA-A1/QA-A2 finding.

Completed additions passed: authenticated admin surfaces returned 401 without
credentials and 403 for a customer token (deliver, instructions, restart, MMU
credential view, admin-next orders/subscriptions/slim users/newsletter/search,
and fulfillment queue); customer-owned routes returned 401 unauthenticated.
Admin subscription list/detail and fulfillment detail contained no encrypted
credential material; audited Show returned 200 and added exactly one audit row.
Exact 4,000 credentials and 8,000 rules text returned 200; exact instructions
and note reached documented 409 business-state checks, proving schema acceptance.

The completion remains blocking because the following mandatory probes were not
completed: valid-payload activation-link AuthZ check, old/new route-guard source
parity, legacy strict-rules reveal bypass, cancelled-order mark-paid, coupon
expiry/release/reuse, registered-user coupon redemption, inverse-order claim,
and dashboard customer visibility after inverse claim. Under the prescribed
rules, these unexecuted probes require FAIL.

The server was stopped; retained evidence is under
`qa-artifacts/run-a-completion-20260711-002206/`.
