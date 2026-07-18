# Task 1 — claim-side guest-order fix

## Design decision

Guest orders remain guest orders until a claim link is submitted. Checkout does not look up or attach a registered account by email, so registered and unregistered checkout emails follow the same identity/draft response path and do not expose an account-enumeration signal.

The claim endpoint now requires both a valid token and a matching authenticated account email. A valid, already-used token submitted by the same account that already owns the claimed identity returns a successful idempotent response (`already_claimed: true`); another account remains refused. Expired links still return the explicit expired state. There is no resend endpoint, which remains a follow-up recommendation.

## Root cause and provenance

`CLAIM_LINK_UNAVAILABLE` originates when a token hash is absent, while `claim_link_used` and other claim-state failures were also collapsed to that 410 response by the checkout route. The token issuance/claim flow and this mapping pre-date the admin-next branch: `5dee3e8` is reachable from `main` before the branch merge base. Therefore production may contain stranded paid guest orders if users encounter this legacy 410 path.

The fix makes the valid-token happy path and double-submit state deterministic and adds an explicit email match. Claim tokens are only consumed by `claimGuestIdentity` in production; the standalone `consumeClaimToken` helper is test-only.

## Verification

- Focused claim suite: 5 passing tests.
- Full backend suite before the final focused-test addition: 94 suites / 394 tests (baseline). The final suite is expected to be **94/395** because one claim-email security regression was added.
- Backend lint: 0 errors, 10 existing warnings.
- Backend build: passed.
- Migration validator: 61 grandfathered migrations, all valid.

## Files changed

- `src/services/guestCheckoutService.ts` — restores guest-only checkout behavior, enforces email matching, and implements same-owner idempotent claim success.
- `src/routes/checkout.ts` — returns 403 for a cross-email claim and exposes the idempotent result flag.
- `src/tests/guestCheckoutService.test.ts` — covers same-owner repeat claim and valid-token cross-email refusal.
