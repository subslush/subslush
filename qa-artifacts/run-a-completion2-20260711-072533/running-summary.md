# QA Run A completion session 2 — running summary

Commit: `f6d6dec34021335997ebd733aeab6c730f033131`
Fixture prefix: `QA-A3-`

This file is appended immediately after each priority-ordered probe finishes.


## 01-inverse-claim-visibility

**PASS** — 200/reassigned; order df633a9e-9fe4-4544-8acf-8190a9065bfe and subscription 4d9c233a-c4d7-4115-b511-d9b4450c8778 visible through supported dashboard reads.

Evidence: `01-inverse-claim-visibility.json`

## 02-registered-coupon

**FAIL** — logged-in checkout: expected 201, got 503: {"error":"Service Unavailable","message":"Card checkout is temporarily unavailable. Please try again later.","code":"SERVICE_UNAVAILABLE"}

Evidence: `02-registered-coupon.json`

## 02-registered-coupon

**FAIL** — registered coupon redemption mismatch

Evidence: `02-registered-coupon.json`

## 02-registered-coupon

**PASS** — non-guest checkout reserved exactly one QA-A3-REG redemption, then signed webhook changed it to redeemed (reverified after evidence-query alias correction).

Evidence: `02-registered-coupon.json`

## 03-expiry-release-reuse

**FAIL** — Payop options: expected 200, got 503: {"error":"Service Unavailable","message":"Payment methods are temporarily unavailable. Please try again later.","code":"SERVICE_UNAVAILABLE"}

Evidence: `03-expiry-release-reuse.json`

## 03-expiry-release-reuse

**FAIL** — Database pool not initialized. Call createDatabasePool first.

Evidence: `03-expiry-release-reuse.json`

## 03-expiry-release-reuse

**FAIL** — QA-A3-REL was not reusable

Evidence: `03-expiry-release-reuse.json`

## 03-expiry-release-reuse

**PASS** — stale pending payment swept to expired, order cancelled, reservation voided, and QA-A3-REL reused by new draft 499ee6e6-5e28-4e48-bdcf-722359b8f045 (reverified).

Evidence: `03-expiry-release-reuse.json`

## 04-legacy-reveal-bypass

**PASS** — legacy order-level reveal returned 400 and refused credentials because strict rules were unaccepted.

Evidence: `04-legacy-reveal-bypass.json`

## 05-cancelled-mark-paid

**PASS** — mark-paid returned 409; order stayed cancelled with zero succeeded payments.

Evidence: `05-cancelled-mark-paid.json`

## 06-activation-link-authz

**PASS** — valid payload returned 401 unauthenticated, 403 customer, and 200 admin; state became link_delivered.

Evidence: `06-activation-link-authz.json`

## Closing anchor diagnostic

**FAIL** — diagnostic scanned only preserved IDs
`9b619566-b9df-442d-a1ed-d45de0e42241` and
`a84c8871-b58a-4f8b-99fa-193ebf476277`; required preserved ID
`abb2499c-4d4e-4f95-82f9-9f71b685b05d` is absent. There are no QA-A*
findings. Read-only follow-up found the absent preserved subscription currently
has status `expired`, which excludes it from this active-only diagnostic.

Evidence: `closing-diagnostic.json`
