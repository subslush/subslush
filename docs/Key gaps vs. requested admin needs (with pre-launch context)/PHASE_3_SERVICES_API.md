# Phase 3 - Services/API Implementation

Date: 2025-12-30

This document summarizes the Services/API phase implementation, the code paths affected, and the tests executed (automated and manual) during validation.

## Scope and Intent

- Add service-layer modules and internal interfaces for catalog, orders, and perks.
- Integrate orders into checkout and purchase flows (credits and Stripe).
- Keep pricing source of truth in `serviceHandlerRegistry`, while snapshotting `price_cents` and metadata to orders and payments.
- Defer all `/api/v1/admin` routes and admin UI to later phases.
- Keep audit logging as structured `Logger` entries (DB audit table deferred to Hardening phase).

## Key Implementation Changes

### New/Expanded Services

- `src/services/orderService.ts`
  - Creates orders and order_items together in a transaction.
  - Updates order payment metadata and status.
- `src/services/catalogService.ts`
  - Lookups for product variants by `service_type` + `service_plan` (used for optional linkage).
- `src/services/perkService.ts`
  - Applies user perks to subscriptions (kept internal; no auto-redemption).
- `src/services/subscriptionService.ts`
  - Enforces subscription limits per service using `serviceHandlerRegistry.getMaxSubscriptions()`.
  - Validates plan compatibility via handler registry.
- `src/services/paymentService.ts`
  - Stripe webhook handling now creates subscriptions and updates orders.
  - Updates unified `payments` table status and linkage.
- `src/services/paymentRepository.ts`
  - Stores `order_id`, `product_variant_id`, `price_cents`, and renewal metadata on `payments`.
- `src/services/paymentMonitoringService.ts`
  - Returns explicit success/failure from `monitorPayment`.
  - Startup no longer blocks on the initial monitoring cycle.

### Service Handlers

- `src/services/handlers/spotifyHandler.ts`
  - `basic` plan removed from valid/available plans.
  - Spotify is limited to max 1 subscription per user.

### Types

- New: `src/types/order.ts`, `src/types/catalog.ts`, `src/types/perk.ts`
- Updated: `src/types/payment.ts`, `src/types/credit.ts`, `src/types/subscription.ts`

### Routes (no admin routes added)

- `POST /api/v1/payments/checkout`
  - Unified checkout for Stripe and credits.
  - Creates `orders` and `order_items` first, then:
    - Credits path: spends credits, creates subscription, updates order to `paid`.
    - Stripe path: creates PaymentIntent, stores `payments` row, updates order to `pending_payment`.
- `POST /api/v1/subscriptions/purchase`
  - Credits-only direct purchase (creates order -> spends credits -> creates subscription).
  - Enforces max subscriptions per service.
- `POST /api/v1/subscriptions/validate-purchase`
  - Validates plan and balance for credit purchase.
- `POST /api/v1/payments/stripe/webhook`
  - Creates subscription on success and marks order as `paid`.
- Existing user and credit routes remain unchanged in contract.

## Data Model Expectations (from Schema Phase)

This phase assumes the following columns/tables exist (from `database/migrations/20251015_120000_schema_alignment_admin.sql`):

- `orders` and `order_items`
- `payments.order_id`, `payments.product_variant_id`, `payments.price_cents`, `payments.auto_renew`,
  `payments.next_billing_at`, `payments.renewal_method`, `payments.status_reason`
- `credit_transactions.order_id`, `credit_transactions.product_variant_id`, `credit_transactions.price_cents`,
  `credit_transactions.currency`, `credit_transactions.auto_renew`, `credit_transactions.next_billing_at`,
  `credit_transactions.renewal_method`, `credit_transactions.status_reason`,
  `credit_transactions.referral_reward_id`, `credit_transactions.pre_launch_reward_id`
- `subscriptions.order_id`, `subscriptions.product_variant_id`, `subscriptions.price_cents`,
  `subscriptions.currency`, `subscriptions.auto_renew`, `subscriptions.next_billing_at`,
  `subscriptions.renewal_method`, `subscriptions.status_reason`,
  `subscriptions.referral_reward_id`, `subscriptions.pre_launch_reward_id`

## Stripe vs NOWPayments Behavior

- Stripe payments are stored in the `payments` table and linked to orders and subscriptions.
- `GET /api/v1/payments/status/:paymentId` and `GET /api/v1/payments/history` currently read from
  `credit_transactions` and are oriented around NOWPayments (crypto). Stripe payments do not appear there yet.
- When Stripe succeeds but subscription creation fails (e.g., due to max subscription limit),
  the order moves to `in_process` with `subscription_create_failed`.

## Test Configuration Notes

- Test environment overrides apply for monitoring intervals to avoid slow backoffs:
  `PAYMENT_MONITORING_INTERVAL`, `PAYMENT_RETRY_ATTEMPTS`, `PAYMENT_RETRY_DELAY`.
- `paymentMonitoringService.monitorPayment()` now returns a boolean so manual triggers can signal failure.

## Automated Tests Run (Targeted)

Executed during phase validation:

- `npx jest src/tests/subscriptionService.test.ts`
- `npx jest src/tests/paymentMonitoringService.test.ts`
- `npx jest src/tests/paymentWorkflowIntegration.test.ts`
- `npx jest src/tests/creditService.test.ts`
- `npx jest src/tests/creditRoutes.test.ts`
- `npx jest src/tests/creditAllocationService.test.ts`

## Manual Test Walkthrough (Executed)

Summary of the manual validation steps that were performed:

1. **Auth**
   - `POST /api/v1/auth/register`
   - `GET /api/v1/auth/profile`

2. **Plan listing and validation**
   - `GET /api/v1/subscriptions/available`
   - `POST /api/v1/subscriptions/validate-purchase`
   - Confirmed `spotify/basic` is invalid.

3. **Credits deposit**
   - `POST /api/v1/credits/deposit`
   - `GET /api/v1/credits/balance/:userId`

4. **Credits purchase**
   - `POST /api/v1/subscriptions/purchase` (Spotify premium)
   - Attempted second Spotify subscription; rejected with max limit.

5. **Unified checkout (credits)**
   - `POST /api/v1/payments/checkout` (Netflix basic)

6. **Order and linkage checks**
   - Verified `orders`, `order_items`, `subscriptions`, and `credit_transactions`
     link via `order_id` and `payment_reference`.

7. **Stripe checkout + webhook**
   - `POST /api/v1/payments/checkout` (TradingView pro, Stripe)
   - `stripe listen --forward-to http://localhost:3001/api/v1/payments/stripe/webhook`
   - `stripe payment_intents confirm ... --return-url https://example.com/return`
   - Verified:
     - `payments.status = succeeded`
     - `orders.status = paid`
     - subscription created with `renewal_method = stripe`

8. **Operational checks**
   - `GET /api/v1/credits/history/:userId`
   - `GET /api/v1/payments/monitor-status`

## Known Limitations / Notes

- Stripe payments are not returned by `GET /api/v1/payments/status/:paymentId` or
  `GET /api/v1/payments/history` because those endpoints currently read from `credit_transactions`.
  Admin APIs will address unified views later.
- Stripe CLI confirmation requires a `return_url` due to `automatic_payment_methods.allow_redirects=always`.
  This is expected behavior.
- If a Stripe payment succeeds but subscription creation fails (e.g., max subscription reached),
  orders move to `in_process` with `subscription_create_failed`.

## Files Touched (High-Level)

- `src/services/orderService.ts`
- `src/services/catalogService.ts`
- `src/services/perkService.ts`
- `src/services/subscriptionService.ts`
- `src/services/paymentService.ts`
- `src/services/paymentMonitoringService.ts`
- `src/services/paymentRepository.ts`
- `src/services/handlers/spotifyHandler.ts`
- `src/routes/payments.ts`
- `src/routes/subscriptions.ts`
- `src/types/order.ts`
- `src/types/catalog.ts`
- `src/types/perk.ts`
- `src/types/payment.ts`
- `src/types/credit.ts`
- `src/types/subscription.ts`

