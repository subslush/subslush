# E2E Test Matrix - 2026-01-07

## Environment
- Backend: `http://localhost:3001` (npm run dev)
- Frontend: `http://localhost:3000` (npm run dev)
- Admin account: `qa-admin-1767759211297@example.com`
- Verified flow user: `qa-flow-1767805032499@example.com`
- Unverified user: `qa-unverified-1767759211297@example.com`
- New registered user: `e2e-1767805032498@example.com`
- Run timestamp: `2026-01-07T16:57:17.157Z`
- DB reset: drop/recreate `public`, migrations applied, baseline catalog/pricing/users seeded

## Exploratory E2E Pass Instructions
You are running an exploratory, end-to-end QA pass focused on core user and admin flows. This is NOT a fully matrixed test. It is a broad, fast sweep to validate the most critical journeys.

Requirements:
- Perform a full DB cleanup and start from a clean slate.
- Seed fresh baseline data (catalog items, pricing, admin account readiness).
- Start fresh backend and frontend servers/instances. Confirm services are healthy.
- DO NOT kill or disrupt any ports that WSL:Ubuntu is running on. Killing those ports crashes the VS Code IDE. If a port conflict appears, ask before taking action.

Test scope (exploratory, core flows):
- User: register, login, view profile, browse plans, validate purchase, purchase with credits, view subscriptions, set PIN, reveal credentials, logout.
- Admin: login, create product/variant/price, view subscriptions, update subscription status, add credits.
- Payments: initiate Stripe checkout (mock/no live charge), create NOWPayments top-up (mock), verify status endpoints.
- NOWPayments webhook success path steps:
  1. Create a NOWPayments payment to obtain a real `payment_id` (via `POST /api/v1/payments/create-payment`).
  2. Build the raw JSON payload for the webhook with that `payment_id` and a success status (for example `payment_status: "finished"`), keeping the exact raw JSON string used for signing.
  3. Compute the HMAC SHA512 signature of the raw JSON using `NOWPAYMENTS_IPN_SECRET`, and set it in the `x-nowpayments-sig` header.
  4. `POST /api/v1/payments/webhook` with the signed payload; confirm `200` response, status update, and credits allocation for the user.
- Notifications and dashboard: load overview, check recent orders and alerts.

Reporting:
- Document all findings, gaps, errors, or unexpected behavior.
- Note any blockers or missing configurations.
- Include concise steps to reproduce and expected vs actual behavior.

## Test setup
- Redis rate-limit DB flushed.
- Admin login + CSRF token captured.
- Catalog seed: product + variant + label + media + current price.
- Credits: admin grant of 20 credits to flow user.

## Test matrix
| Area | Scenario | Endpoint | Expected | Actual | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Health | Health check | GET /health | 200 + healthy payload | 200 | PASS |  |
| Health | API health alias | GET /api/v1/health | 200 + healthy payload | 200 | PASS |  |
| Auth | Register user | POST /api/v1/auth/register | 201 + session | 201 Registration successful | PASS | e2e-1767805032498@example.com |
| Auth | Login invalid password | POST /api/v1/auth/login | 401 | 401 Invalid email or password | PASS |  |
| Auth | Login admin | POST /api/v1/auth/login | 200 + session | 200 Login successful | PASS |  |
| Auth | Login user | POST /api/v1/auth/login | 200 + session | 200 Login successful | PASS |  |
| Auth | Profile via auth | GET /api/v1/auth/profile | 200 profile | 200 | PASS |  |
| Auth | Password reset (unverified user) | POST /api/v1/auth/password-reset | 400 with verify-email gate | 400 Please verify your email before requesting a password reset | PASS |  |
| Auth | Password reset (verified user) | POST /api/v1/auth/password-reset | 200 | 400 Email address "qa-flow-1767805032499@example.com" is invalid | FAIL |  |
| Auth | Logout | POST /api/v1/auth/logout | 200 | 200 Logout successful | PASS |  |
| Auth | Session expiry after logout | GET /api/v1/auth/profile | 401 | 401 Authentication token required | PASS |  |
| Auth | Re-login user | POST /api/v1/auth/login | 200 + session | 200 Login successful | PASS |  |
| Users | Profile endpoint | GET /api/v1/users/profile | 200 profile | 200 Profile retrieved successfully | PASS |  |
| Users | Profile update | PUT /api/v1/users/profile | 200 | 200 Profile updated successfully | PASS |  |
| Users | Access control (user status update as non-admin) | PATCH /api/v1/users/status/585c185d-ed09-43af-949d-8819cbde8745 | 403 | 403 Admin privileges required for status management | PASS |  |
| Users | PIN set before paid order | POST /api/v1/users/pin/set | 403 (requires paid order) | 403 PIN setup requires a completed paid order | PASS |  |
| Catalog (Admin) | Create product | POST /api/v1/admin/products | 201 | 201 Product created | PASS |  |
| Catalog (Admin) | Update product | PATCH /api/v1/admin/products/350c9bc7-e04a-491e-a420-d012d4312432 | 200 | 200 Product updated | PASS |  |
| Catalog (Admin) | Create product (invalid payload) | POST /api/v1/admin/products | 400 | 400 | PASS |  |
| Catalog (Admin) | Create variant | POST /api/v1/admin/product-variants | 201 | 201 Variant created | PASS |  |
| Catalog (Admin) | Update variant | PATCH /api/v1/admin/product-variants/cf609e01-2f2a-4786-9005-bb6484e62a0b | 200 | 200 Variant updated | PASS |  |
| Catalog (Admin) | Create label | POST /api/v1/admin/product-labels | 201 | 201 Label created | PASS |  |
| Catalog (Admin) | Attach label | POST /api/v1/admin/products/350c9bc7-e04a-491e-a420-d012d4312432/labels | 200 | 200 | PASS |  |
| Catalog (Admin) | Create media | POST /api/v1/admin/product-media | 201 | 201 Media created | PASS |  |
| Catalog (Admin) | Set current price | POST /api/v1/admin/price-history/current | 201 | 201 Current price set | PASS |  |
| Catalog (Admin) | List products | GET /api/v1/admin/products | 200 | 200 | PASS |  |
| Catalog (Admin) | List variants | GET /api/v1/admin/product-variants?product_id=350c9bc7-e04a-491e-a420-d012d4312432 | 200 | 200 | PASS |  |
| Catalog (Admin) | List labels | GET /api/v1/admin/product-labels | 200 | 200 | PASS | No update endpoint for labels/media |
| Admin Security | Missing CSRF header | POST /api/v1/admin/products | 403 | 403 Invalid or missing CSRF token | PASS |  |
| Admin Security | Mismatched CSRF header | POST /api/v1/admin/products | 403 | 403 Invalid or missing CSRF token | PASS |  |
| Admin | Role enforcement (user accessing admin) | GET /api/v1/admin/orders | 403 | 403 Admin access required | PASS |  |
| Catalog | Available plans | GET /api/v1/subscriptions/available | 200 | 200 | PASS |  |
| Subscriptions | Validate invalid plan | POST /api/v1/subscriptions/validate-purchase | 400 | 400 Subscription plan is not available | PASS |  |
| Subscriptions | Validate insufficient credits | POST /api/v1/subscriptions/validate-purchase | can_purchase=false | 200 | PASS |  |
| Credits (Admin) | Add credits | POST /api/v1/admin/credits/add | 201 | 201 Credits added | PASS |  |
| Credits | Balance | GET /api/v1/credits/balance/529aacdb-15ac-41f5-83ba-fefa740a500b | 200 | 200 | PASS |  |
| Credits | Access other user balance | GET /api/v1/credits/balance/585c185d-ed09-43af-949d-8819cbde8745 | 403 | 403 Cannot access other users credit data | PASS |  |
| Credits | Credit history | GET /api/v1/credits/history/529aacdb-15ac-41f5-83ba-fefa740a500b | 200 | 200 | PASS |  |
| Credits | Credit summary | GET /api/v1/credits/summary/529aacdb-15ac-41f5-83ba-fefa740a500b | 200 | 200 | PASS |  |
| Credits | Spend credits | POST /api/v1/credits/spend | 200 | 200 Credits spent successfully | PASS |  |
| Subscriptions | Validate purchase (sufficient credits) | POST /api/v1/subscriptions/validate-purchase | can_purchase=true | 200 | PASS |  |
| Subscriptions | Purchase with credits | POST /api/v1/subscriptions/purchase | 201 + order/subscription | 201 Subscription purchased successfully | PASS |  |
| Subscriptions | Purchase with credits (2nd) | POST /api/v1/subscriptions/purchase | 201 + order/subscription | 201 Subscription purchased successfully | PASS |  |
| Subscriptions | My subscriptions | GET /api/v1/subscriptions/my-subscriptions | 200 list | 200 | PASS |  |
| Subscriptions | Subscription by id | GET /api/v1/subscriptions/823b6c7d-41a6-49a3-870e-0c2ec6f16dd0 | 200 | 200 | PASS | credentials_encrypted omitted |
| Users | PIN set (after paid order) | POST /api/v1/users/pin/set | 200 | 200 PIN set successfully | PASS |  |
| Users | PIN verify invalid | POST /api/v1/users/pin/verify | 401 + attempts remaining | 401 The PIN you entered is incorrect | PASS |  |
| Users | PIN verify valid | POST /api/v1/users/pin/verify | 200 + pin_token | 200 | PASS |  |
| Users | PIN reset request | POST /api/v1/users/pin/reset-request | 200 + support_url | 200 PIN reset requires support assistance | PASS |  |
| Subscriptions (Admin) | Update credentials | POST /api/v1/admin/subscriptions/823b6c7d-41a6-49a3-870e-0c2ec6f16dd0/credentials | 200 | 200 Subscription credentials updated | PASS |  |
| PIN/Reveal | Reveal with short token | POST /api/v1/subscriptions/823b6c7d-41a6-49a3-870e-0c2ec6f16dd0/credentials/reveal | 400 | 400 | PASS |  |
| PIN/Reveal | Reveal with invalid token | POST /api/v1/subscriptions/823b6c7d-41a6-49a3-870e-0c2ec6f16dd0/credentials/reveal | 401 | 401 PIN verification required | PASS |  |
| PIN/Reveal | Reveal credentials (active) | POST /api/v1/subscriptions/823b6c7d-41a6-49a3-870e-0c2ec6f16dd0/credentials/reveal | 200 | 200 | PASS |  |
| Subscriptions (Admin) | Update status invalid transition | PATCH /api/v1/admin/subscriptions/3ddb6f7d-79dd-4e6e-bc70-72b7774d7596/status | 400 | 400 Invalid status transition from active to pending | PASS |  |
| Subscriptions (Admin) | Update status valid transition | PATCH /api/v1/admin/subscriptions/3ddb6f7d-79dd-4e6e-bc70-72b7774d7596/status | 200 | 200 Subscription status updated | PASS |  |
| Subscriptions | Cancel subscription | DELETE /api/v1/subscriptions/823b6c7d-41a6-49a3-870e-0c2ec6f16dd0 | 200 | 200 | PASS |  |
| Subscriptions | Cancel already-cancelled | DELETE /api/v1/subscriptions/823b6c7d-41a6-49a3-870e-0c2ec6f16dd0 | 400 | 400 Invalid status transition from cancelled to cancelled | PASS |  |
| Users | PIN verify valid (post-cancel) | POST /api/v1/users/pin/verify | 200 | 200 | PASS |  |
| PIN/Reveal | Reveal after cancel | POST /api/v1/subscriptions/823b6c7d-41a6-49a3-870e-0c2ec6f16dd0/credentials/reveal | 403 | 403 Subscription is not eligible for credential reveal | PASS |  |
| Subscriptions | Health | GET /api/v1/subscriptions/health | 200 | 200 | PASS |  |
| Orders | List orders (user) | GET /api/v1/orders?include_items=true | 200 | 200 | PASS |  |
| Orders (Admin) | List orders | GET /api/v1/admin/orders | 200 | 200 | PASS |  |
| Orders (Admin) | Order items | GET /api/v1/admin/orders/35ec3e7c-66f4-4a34-bb5b-f6c138b783ba/items | 200 | 200 | PASS |  |
| Orders (Admin) | Update order status invalid | PATCH /api/v1/admin/orders/35ec3e7c-66f4-4a34-bb5b-f6c138b783ba/status | 400 | 400 Invalid order status | PASS |  |
| Orders (Admin) | Update order status | PATCH /api/v1/admin/orders/35ec3e7c-66f4-4a34-bb5b-f6c138b783ba/status | 200 | 200 Order status updated | PASS |  |
| Payments | Stripe checkout | POST /api/v1/payments/checkout | 201 + paymentId | 201 Resource created successfully | PASS |  |
| Payments | Stripe webhook missing signature | POST /api/v1/payments/stripe/webhook | 400 | 400 Webhook handling failed | PASS |  |
| Payments | NOWPayments create payment (valid) | POST /api/v1/payments/create-payment | 201 | 400 Currency USDTTRC20 is not supported | FAIL |  |
| Payments | NOWPayments webhook missing signature | POST /api/v1/payments/webhook | 401 | 401 Missing webhook signature | PASS |  |
| Payments | NOWPayments webhook invalid signature | POST /api/v1/payments/webhook | 401 | 401 Invalid webhook signature | PASS |  |
| Payments | Supported currencies | GET /api/v1/payments/currencies | 200 | 200 | PASS |  |
| Payments | Payment status (NOWPayments ID) | GET /api/v1/payments/status/{paymentId} | 200 | BLOCKED (create-payment failed) | FAIL | NOWPayments create-payment did not return paymentId |
| Payments | Payment status (Stripe ID) | GET /api/v1/payments/status/pi_3Sn02rBH0OzDZCqh0imaPRJ3 | 404 | 404 Payment not found | PASS |  |
| Admin Payments | List payments | GET /api/v1/admin/payments | 200 | 200 | PASS |  |
| Admin Payments | Pending queue | GET /api/v1/admin/payments/pending | 200 | 200 | PASS |  |
| Admin Payments | Monitoring dashboard | GET /api/v1/admin/payments/monitoring | 200 | 200 | PASS |  |
| Admin Payments | Monitoring stop | POST /api/v1/admin/payments/monitoring/stop | 200 | 200 Payment monitoring service stopped | PASS |  |
| Admin Payments | Monitoring start | POST /api/v1/admin/payments/monitoring/start | 200 | 200 Payment monitoring service started | PASS |  |
| Notifications | List notifications | GET /api/v1/notifications | 200 | 200 | PASS |  |
| Notifications | Mark notifications read | POST /api/v1/notifications/read | 200 | 200 | PASS |  |
| Notifications | Clear notifications | DELETE /api/v1/notifications | 200 | 200 | PASS |  |
| Notifications | Unauthorized list attempt | GET /api/v1/notifications | 401 | 401 Authentication token required | PASS |  |
| Admin Rewards | Referral rewards list | GET /api/v1/admin/rewards/referral | 200 | 200 | PASS |  |
| Admin Rewards | Prelaunch rewards list | GET /api/v1/admin/rewards/prelaunch | 200 | 200 | PASS |  |
| Admin Tasks | List tasks | GET /api/v1/admin/tasks | 200 | 200 | PASS |  |
| Admin Tasks | Complete invalid task | POST /api/v1/admin/tasks/invalid/complete | 400 | 400 | PASS |  |
| Admin Migration | Preview migration | POST /api/v1/admin/migration/preview | 200 | 500 Failed to run migration preview | FAIL | Preview only |

## Findings / Issues
1. Password reset for a verified user fails with `400 Email address "qa-flow-1767805032499@example.com" is invalid`.
   - Repro: login as a verified user, `POST /api/v1/auth/password-reset` with `{ "email": "qa-flow-1767805032499@example.com" }`.
   - Expected: 200 + reset flow; Actual: 400 invalid email.
2. NOWPayments create-payment rejects a valid crypto ticker.
   - Repro: authenticated user, `POST /api/v1/payments/create-payment` with `{ "creditAmount": 10, "price_currency": "usd", "pay_currency": "usdttrc20" }`.
   - Expected: 201 + paymentId; Actual: 400 `Currency USDTTRC20 is not supported`.
3. NOWPayments payment-status check is blocked because create-payment fails.
   - Repro: call `GET /api/v1/payments/status/{paymentId}` using the create-payment response; no paymentId is returned.
   - Expected: 200 status payload; Actual: blocked due to missing paymentId.
4. Admin migration preview fails on clean DB.
   - Repro: admin session with CSRF header, `POST /api/v1/admin/migration/preview`.
   - Expected: 200 preview counts; Actual: 500 `Failed to run migration preview` (backend log: relation `calendar_vouchers` does not exist).

## Endpoint gaps / inconsistencies
- Catalog labels/media have create and list endpoints, but no update endpoint is exposed (observed in admin catalog flow).

## Coverage gaps / blocked items
- NOWPayments end-to-end flow (create-payment + status) is blocked by unsupported currency; webhook success path not tested.
- Stripe webhook success path not tested (no local signature secret).
- Admin migration apply not executed (would modify data).
- True session expiry (token TTL) not tested; only logout invalidation covered.
- UI-only flows in the browser not exercised in this pass.
