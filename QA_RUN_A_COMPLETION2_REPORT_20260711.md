# QA Run A — completion session 2 final addendum

**Base reports:** `QA_RUN_A_FINAL_RERUN_REPORT_20260711.md` and
`QA_RUN_A_COMPLETION_REPORT_20260711.md`  
**Commit:** `f6d6dec34021335997ebd733aeab6c730f033131`  
**Verdict:** **FAIL — Run B must not launch.**

This is the final addendum to Run A on `f6d6dec`. HEAD matched exactly and no
application source, test, migration, or configuration file was changed.

## Priority-ordered probe results

1. **PASS — inverse-order claim and post-claim visibility.** An unregistered
   QA-A3 guest email checked out, the signed Stripe webhook paid the order, and
   the item was delivered. The full 64-character claim token was recovered from
   the retained console email. A new account was then registered with the same
   email; claim returned 200 with `reassigned: true`. Supported dashboard reads
   returned order `df633a9e-9fe4-4544-8acf-8190a9065bfe` and subscription
   `4d9c233a-c4d7-4115-b511-d9b4450c8778`. DB ownership matched the new
   non-guest user for both records.
2. **PASS — registered-user coupon lifecycle.** A supported logged-in checkout
   by a non-guest user applied `QA-A3-REG` and created exactly one `reserved`
   redemption. The signed webhook returned 200, the payment became `succeeded`,
   and the redemption became `redeemed`.
3. **PASS — coupon expiry, release, and reuse.** A guest draft reserved
   `QA-A3-REL`. A supported hosted payment created the pending payment; the only
   direct SQL write backdated that payment row's `created_at` and `updated_at`
   by 73 hours. The production sweep reported scanned 1, cancelled 1,
   reconciled 0, skipped 0, errors 0. The order became `cancelled`, payment
   `expired`, and redemption `voided`; a new guest draft successfully reserved
   the same coupon.
4. **PASS — legacy reveal bypass.** The order-level legacy reveal endpoint on
   the strict-rules item returned 400 without acceptance and did not reveal
   credentials.
5. **PASS — cancelled-order mark-paid.** Mark-paid with a non-empty note
   returned 409; the order stayed cancelled and had zero succeeded payments.
6. **PASS — valid activation-link AuthZ.** After supported instruction and
   customer-ready transitions, the same valid activation-link payload returned
   401 unauthenticated, 403 with the customer token, and 200 with the admin
   token. The subscription reached `link_delivered`.

The registered-coupon probe initially encountered the disabled PayPal checkout
compatibility gate. The backend was stopped and confirmed before it was
relaunched with the prescribed environment plus `PAYPAL_CHECKOUT_ENABLED=true`.
The later live checkout passed. Intermediate evidence checks also produced two
false negatives: a duplicate SQL result-column name hid the redeemed status,
and a case-sensitive assertion rejected the normalized lowercase coupon code.
Read-only reverification confirmed both underlying lifecycles had passed; every
attempt is preserved in the running summary.

## Closing anchor diagnostic — blocking

The closing diagnostic has no QA-A* finding, but it is not the required exact
three-ID result. It scanned only:

- `9b619566-b9df-442d-a1ed-d45de0e42241`
- `a84c8871-b58a-4f8b-99fa-193ebf476277`

Required preserved ID `abb2499c-4d4e-4f95-82f9-9f71b685b05d` is absent.
Read-only follow-up found it currently has status `expired` (status reason
`expired`), so the active-only diagnostic excludes it. The preserved record was
not mutated. Because the required clean closing diagnostic did not pass, Run A
is not complete across all three reports and Run B must not launch.

## DB-write log and shutdown

All fixture writes except the expressly permitted timestamp backdate used
supported APIs, signed webhook processing, or the production sweep. The direct
SQL changed only `payments.created_at` and `payments.updated_at` for the QA-A3
stale-payment fixture. No subscription anchors/start/end dates, task due dates,
pricing publish metadata, or preserved records were directly changed.

The detached backend was stopped with SIGTERM. PID absence and a failed bounded
curl returning HTTP 000 confirm no listener remains on port 3104.

Retained evidence is under
`qa-artifacts/run-a-completion2-20260711-072533/`.
