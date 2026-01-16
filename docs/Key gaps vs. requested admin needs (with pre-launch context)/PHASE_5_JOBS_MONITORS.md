# Phase 5 - Jobs and Monitors

This document describes the Jobs/Schedule phase that implements background jobs,
payment monitoring, subscription renewal/expiry automation, and admin visibility.
It is written for future maintainers to understand the logic, data flow, and
operational expectations of the phase.

## Scope

Delivered in this phase:

- Background job scheduler with Redis-based locks.
- Subscription renewal sweep (credits + Stripe one-time payments).
- Subscription expiry sweep.
- NOWPayments monitoring loop (polling + credit allocation).
- Contest prize runner and viral metrics job.
- Admin endpoints to view/trigger monitoring and retries.
- Hardening fixes around JSON parsing and stale failure cleanup.

Not in scope (by plan or intentionally deferred):

- Stripe subscription APIs (billing portal / subscription objects).
- Calendar reward status job (optional).

## Architecture Overview

### Job Scheduler

The scheduler is implemented in `src/services/jobs/jobScheduler.ts` and wired
from `src/services/jobs/index.ts` via `startJobs()` and `stopJobs()` called in
`src/server.ts`.

Key behavior:

- Jobs are registered once and scheduled with intervals (via `setInterval`).
- Each job acquires a Redis lock (if configured) to avoid parallel execution
  across multiple app instances.
- If Redis is unavailable, locked jobs are skipped (fail-closed for safety).
- A job can run on start with an initial delay to avoid startup stampede.

### Jobs Registered

The following jobs are registered in `src/services/jobs/index.ts`:

- `subscription-renewal`
- `subscription-expiry`
- `subscription-data-quality`
- `pin-lockout-monitor`
- `contest-prizes`
- `viral-metrics`

Payment monitoring is not a scheduled job; it is a continuous service that can
auto-start alongside jobs when enabled.

## Subscription Renewal Job

File: `src/services/jobs/subscriptionJobs.ts`

### Candidate selection

The renewal sweep selects subscriptions where:

- `status = 'active'`
- `auto_renew = true`
- Renewal is due when either:
  - `next_billing_at <= NOW()`, or
  - `next_billing_at IS NULL` and `end_date <= NOW() + lookahead`

The lookahead window is configurable (`SUBSCRIPTION_RENEWAL_LOOKAHEAD_MINUTES`).

### Renewal inputs and fallback logic

For each candidate, the job resolves:

- `renewal_method` (lowercased string).
- `price_cents` (from subscription, order item, or order total).
- `currency` (from subscription/order, default `usd`).
- `duration_months` (from subscription metadata, order metadata, or
  inferred from start/end dates).

If critical data is missing:

- Missing `renewal_method`:
  - Create an admin task (`task_type = 'renewal'`, `task_category =
    'renewal_missing_method'`).
  - Update subscription `status_reason = 'auto_renew_missing_method'`.
  - Push `next_billing_at` forward by `SUBSCRIPTION_RENEWAL_RETRY_MINUTES`.

- Missing `price_cents`:
  - Create an admin task (`task_category = 'renewal_missing_price'`).
  - Update `status_reason = 'auto_renew_missing_price'`.
  - Push `next_billing_at` by retry minutes.

Admin tasks are inserted idempotently to avoid duplicates.

### Renewal via credits

If `renewal_method = 'credits'`:

1. The job calls `creditService.spendCredits()` for `price_cents / 100`.
2. On success:
   - Subscription `end_date`, `renewal_date`, and `next_billing_at` are moved
     forward by the detected duration.
   - `status_reason = 'auto_renewed_credits'`.
   - `price_cents`, `currency`, and `renewal_method` are normalized.
3. On failure:
   - Create an admin task (`task_category = 'renewal_credit_failed'`).
   - Update `status_reason = 'auto_renew_credit_failed'`.
   - Push `next_billing_at` by retry minutes.

### Renewal via Stripe (one-time payments)

If `renewal_method = 'stripe'`:

1. Check for an existing pending Stripe renewal payment in `payments`:
   - Query matches `provider = 'stripe'` and metadata `subscription_id`.
   - If pending payment exists, create an admin task
     (`task_category = 'renewal_payment_pending'`) and push `next_billing_at`.
2. If no pending payment exists, create a **new one-time** Stripe payment
   intent using `paymentService.createStripePayment()`:
   - On failure: create an admin task (`renewal_payment_failed`) and push
     `next_billing_at`.
   - On success: create an admin task (`renewal_payment_pending`) and mark
     the subscription with `status_reason = 'renewal_payment_pending'`.

Stripe subscriptions are not used in this phase. Stripe renewals are always
initiated as one-time payment intents.

### Unsupported renewal method

If the method is not `credits` or `stripe`, the job:

- Creates an admin task (`task_category = 'renewal_manual_review'`).
- Sets `status_reason = 'auto_renew_manual_review'`.
- Pushes `next_billing_at` by retry minutes.

## Subscription Expiry Job

File: `src/services/jobs/subscriptionJobs.ts`

`runSubscriptionExpirySweep()` calls
`subscriptionService.updateExpiredSubscriptions()` which:

- Marks `status = 'expired'` and `status_reason = 'expired'`
  for subscriptions where `end_date < NOW()` and `status = 'active'`.
- Clears subscription and user caches for affected records.

## PIN Lockout Monitor

File: `src/services/jobs/monitoringJobs.ts`

`runPinLockoutMonitor()` scans for users with `pin_locked_until > NOW()` and
creates admin tasks (`task_category = 'pin_lockout'`) to surface active
lockouts. When a lockout expires, the monitor auto-completes the task to keep
the queue current.

## Subscription Data-Quality Monitor

File: `src/services/jobs/monitoringJobs.ts`

`runSubscriptionDataQualityMonitor()` flags active auto-renew subscriptions
missing `renewal_method`, `price_cents`, or `next_billing_at`. It creates admin
tasks (`task_category = 'data_quality_missing_billing_fields'`) with notes that
capture missing fields and auto-completes tasks once the data is repaired or the
subscription no longer requires auto-renew monitoring.

## Payment Monitoring (NOWPayments)

File: `src/services/paymentMonitoringService.ts`

### Pending queue

Pending payments are tracked in Redis at
`payment_monitoring:pending_payments` with a 1 hour TTL.

On startup, the service loads recent pending payments from
`credit_transactions` where `payment_status` is one of:

```
pending, waiting, confirming, confirmed, sending, partially_paid
```

When a crypto invoice is created, the payment is immediately enqueued via
`paymentMonitoringService.addPendingPayment()` to avoid waiting for the cache
refresh window.

### Polling and status updates

The monitor polls NOWPayments on a fixed interval
(`PAYMENT_MONITORING_INTERVAL`) and processes payments in batches
(`PAYMENT_MONITORING_BATCH_SIZE`).

For each payment:

- The NOWPayments status is fetched and compared to current DB status.
- On status change:
  - `credit_transactions` is updated.
  - `payments` is updated through `paymentRepository.updateStatusByProviderPaymentId()`.
  - `metadata` is updated with `actuallyPaid` and `lastMonitoredAt`.

### Success path

If a payment transitions to `finished`:

- `creditAllocationService.allocateCreditsForPayment()` runs.
- The payment is removed from the pending queue.
- Any stale failure record is cleared via
  `paymentFailureService.resolveFailure()`.

### Failure path

If a payment transitions to `failed`, `expired`, or `refunded`:

- The failure service records the issue (Redis + metrics).
- The payment is removed from the pending queue.

### Retries

Each payment is retried up to `PAYMENT_RETRY_ATTEMPTS` with exponential
backoff using `PAYMENT_RETRY_DELAY`. This retry logic is **only** for
re-checking payment status (not re-charging).

## Credit Allocation

File: `src/services/creditAllocationService.ts`

Credits are allocated when a payment is marked `finished`:

- The original `credit_transactions` row is updated with:
  - `amount` (positive credit)
  - `balance_before` / `balance_after`
  - metadata fields (paymentCompleted, actuallyPaid, allocationTimestamp)
- Duplicate allocations are prevented with:
  - Redis key `credit_allocation:completed:<paymentId>`
  - DB check for `metadata->>'paymentCompleted' = 'true'`

## Payment Failure Handling

File: `src/services/paymentFailureService.ts`

Failures are stored in Redis under `payment_failure:<paymentId>` with a TTL.
Key features:

- Categorizes failures (expired, failed, network, monitoring, etc.).
- Supports retry action (manual or scheduled).
- Provides admin metrics and failure lists.
- Clears records when a payment later succeeds (`resolveFailure`).

## Contest Prize and Viral Metrics Jobs

File: `src/services/jobs/contestJobs.ts`

- `runContestPrizeJob()` calls `calculate_contest_prizes()` and logs
  summary metrics.
- `runViralMetricsJob()` writes daily metrics into `viral_metrics` with
  upsert behavior.

The contest function was updated to use timestamp-safe comparisons (see
migrations below).

## Admin Endpoints (Payments)

File: `src/routes/admin/payments.ts`

Key endpoints:

- `GET /api/v1/admin/payments/monitoring`
  - Monitoring + allocation + failure metrics.
- `POST /api/v1/admin/payments/monitoring/start`
- `POST /api/v1/admin/payments/monitoring/stop`
- `GET /api/v1/admin/payments/pending`
  - Pending allocations and failed payments.
- `POST /api/v1/admin/payments/retry/:paymentId`
  - Manual retry for a failed payment.
- `POST /api/v1/admin/payments/metrics/reset`
- `POST /api/v1/admin/payments/cleanup`

All routes require admin authentication via the existing middleware.

## Configuration

The key environment variables for this phase live in `.env` and
`.env.example`:

```
JOBS_ENABLED=true
PAYMENT_MONITORING_AUTO_START=true
PAYMENT_MONITORING_INTERVAL=30000
PAYMENT_MONITORING_BATCH_SIZE=50
PAYMENT_RETRY_ATTEMPTS=3
PAYMENT_RETRY_DELAY=5000
SUBSCRIPTION_RENEWAL_INTERVAL=300000
SUBSCRIPTION_RENEWAL_LOOKAHEAD_MINUTES=4320
SUBSCRIPTION_RENEWAL_BATCH_SIZE=50
SUBSCRIPTION_RENEWAL_RETRY_MINUTES=60
SUBSCRIPTION_EXPIRY_INTERVAL=3600000
PIN_LOCKOUT_MONITOR_INTERVAL=300000
SUBSCRIPTION_DATA_QUALITY_INTERVAL=3600000
CONTEST_PRIZE_INTERVAL=86400000
VIRAL_METRICS_INTERVAL=86400000
```

The defaults above reflect the production cadence in `.env.example`.

## Migrations Added in This Phase

- `database/migrations/20251231_140000_fix_contest_prize_time_comparison.sql`
  - Fixes timestamp comparisons inside contest prize functions.
- `database/migrations/20251231_141000_add_subscriptions_updated_at.sql`
  - Adds `updated_at` to `subscriptions` with an update trigger.

## Redis Keys Used (Jobs/Monitoring)

- Job locks: `jobs:subscription_renewal`, `jobs:subscription_expiry`,
  `jobs:subscription_data_quality`, `jobs:pin_lockout_monitor`,
  `jobs:contest_prizes`, `jobs:viral_metrics`
- Pending payments queue: `payment_monitoring:pending_payments`
- Failure records: `payment_failure:<paymentId>`
- Duplicate allocation guard: `credit_allocation:completed:<paymentId>`
- Notifications (future use): `notification:<userId>:*`,
  `credit_allocation:notification:<userId>:*`

## Smoke Tests Executed

The following smoke tests were run during Phase 5 validation:

- Build and Jest smoke tests (`npm run build`, `npm test`).
- NOWPayments monitoring with a local mock server:
  - status transitions to `finished`
  - credits allocated
  - monitoring queue cleanup
- Subscription renewal:
  - Missing `renewal_method` -> admin task + status reason
  - Credits renewal -> credit spend + subscription date extension
- Admin endpoints:
  - `GET /monitoring`, `GET /pending`
  - manual retry (`/retry/:paymentId`)
  - metrics reset and cleanup

## Known Limitations

- Stripe subscriptions are not used; Stripe renewals are one-time payment intents.
- Calendar reward status monitoring is not implemented in this phase.
- Notifications are logged and cached, but no real delivery system is wired.
