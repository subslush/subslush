# Full System QA R5 — corrected provider environment

## Verdict

**FAIL — full Phase 1–6 walkthrough is still incomplete.**

Tested local commit `3c5fee68ac877f8955927f2046ae791565a11a39` with
`EMAIL_PROVIDER=console`, `JOBS_ENABLED=false`, `STRIPE_ENABLED=true`,
`PAYPAL_ENABLED=true`, `PAYPAL_CHECKOUT_ENABLED=true`, `PAYOP_ENABLED=true`,
and `ANTOM_ENABLED=true`. No source was changed.

## R4 503 root-cause confirmation

R4's 503 was environmental, not an application defect. Card checkout is
explicitly gated by `PAYPAL_ENABLED && PAYPAL_CHECKOUT_ENABLED` in
`src/routes/payments.ts`; R4 started with checkout disabled.

With the corrected flags, `POST /api/v1/payments/checkout` returned **201**
and supplied a PayPal sandbox redirect. Before browser handoff, it persisted:

```
order 904a8c3b-f348-4e4d-9e53-1e2f4d258b25: pending_payment
payment: paypal / pending / 48F661647T360874F
```

The pending order is therefore created before provider redirect handoff. No
resilience recommendation is warranted from this run.

## Completed R5 evidence

- R4 Part A automated/static/migration evidence is cited as permitted:
  backend 99 suites/424 tests, frontend 7/17, builds/checks pass, fresh and
  copied migration databases pass.
- R4 live R3-01 listing proof is still applicable: ambiguous 1+6 listing is
  rejected; sole active term activates and renders publicly.
- Corrected-provider browser smoke progressed through catalog creation,
  price/fulfillment setup, MMU divisibility rejection, coupon, announcement,
  pending checkout, signed Stripe fixture creation, task creation and MMU
  fixture setup.
- Manual-paid flow was completed directly against the persisted pending order:
  admin mark-paid 200 created one subscription/open task; credential save 200;
  per-item delivery 200; resulting order `delivered`, subscription `active`.

## Blocking QA finding

### QA-R5-01 — High: admin-next smoke stops at credential-save interaction

The corrected-provider smoke no longer fails at checkout. It then times out at
`frontend/scripts/admin-next-smoke.mjs:632`, waiting for the credential-save
response on the fulfillment detail page. Fixture cleanup reports six orders,
five subscriptions, six tasks and six payments before cleanup.

This prevents the smoke from completing its scripted per-item delivery,
customer rules/reveal/readiness, handshake link/restart, MMU UI, and final
manual-mark-paid UI assertions. Evidence:
`qa-artifacts/full-r5-20260712/admin-next-smoke.log`.

The direct admin credential endpoint returned 200 in the manual-paid
verification, so this is an admin-next UI/smoke interaction failure, not a
provider failure. Suspected surface:
`frontend/src/routes/admin-next/fulfillment/orders/[orderId]/+page.svelte`
and/or the smoke response matcher.

## Remaining mandatory coverage gaps

The browser-smoke stop means a fresh R5 record still lacks the complete
multi-item webhook-to-task execution, all three per-item fulfillment methods,
claim/reveal/rules XSS, handshake link/restart, both complete MMU interval
cycles, Payop/Antom backdate sweep, newsletter, legacy-console mutations and
cross-surface final-state comparison. These remain required for a PASS.

## Evidence

`qa-artifacts/full-r5-20260712/checkout-status.txt`,
`checkout-body.json`, `checkout-persistence.txt`,
`manual-mark-paid-*`, `manual-paid-delivery.txt`, and
`admin-next-smoke.log`.
