# QA Report - Full System Verification

## QA-FIX 5 — D6–D9 Remediation Verification (2026-07-09)

Scope: `Admin-UI-and-Logic-implementation`, fix-only work for D6–D9. No old `/admin` behavior was changed. The pre-existing dirty worktree was preserved.

Verdict: **PASS for D6–D9 remediation; data repair is intentionally pending review.** D9 code is fixed, but the read-only diagnostic identified two existing development subscriptions with corrupted anchors. They must be repaired separately before deploying the fix to production data.

### D9 — immutable MMU term anchor

Root cause: renewal confirmation reset `subscriptions.term_start_at` to the completion time. The sweep derives MMU cycles from that field, so each completion restarted the purchased-term schedule.

Resolution:

- Removed renewal, sweep, and payment-renewal writers of `term_start_at`.
- Guarded generic subscription update methods with `COALESCE(term_start_at, incoming_value)`, so initial activation can initialize a null anchor once but no subsequent admin/replay/renewal path can replace it.
- Renewal completion now records only `admin_tasks.completed_at`; no speculative `last_renewed_at` column was added.
- Added an optional explicit reference time to the MMU sweep for deterministic real-DB sequential testing; production calls retain `new Date()` behavior.

Real migrated-DB regression coverage in `src/tests/adminSchemaCompatibilitySmoke.test.ts`:

- 6 months / interval 1: all five sweep-created tasks are confirmed through the real route; labels progress Month 2 through Month 6; anchor remains unchanged after every confirmation; no task is created after the final cycle; delivered coverage is exactly 6 months.
- 12 months / interval 2: five tasks cover Months 3–4 through Months 11–12; no post-term task is created; coverage is exactly 12 months.
- Initial delivery initializes the anchor once; a later admin update attempt cannot alter it.

### D9b — existing anchor diagnostic (read-only)

Added `database/diagnose-mmu-anchors.js`. It uses `BEGIN READ ONLY` and reports active MMU subscriptions whose anchor is inconsistent with initial delivery, lies after the first completed task creation, or could over-deliver if the schedule keeps resetting.

Development DB output:

```json
{
  "scanned": 2,
  "findings": [
    {
      "subscription_id": "21d8e1d6-c197-4bd3-afde-eabd8c5ef1d1",
      "order_id": "506bdc83-3345-4cda-a644-1eab4b301c63",
      "customer_email": "qa-verified-1768522228@example.com",
      "purchased_term_months": 6,
      "interval_months": 1,
      "immutable_anchor_currently_stored": "2026-07-09T20:35:03.956Z",
      "inferred_initial_delivery_anchor": "2026-02-14T21:34:52.136Z",
      "first_completed_task_created_at": "2026-07-09T20:32:17.222Z",
      "completed_cycles": 5,
      "highest_completed_cycle_index": 5,
      "projected_total_months_if_unfixed": 11,
      "projected_excess_months_if_unfixed": 5,
      "flags": [
        "anchor_after_first_completed_task_created",
        "anchor_differs_from_initial_delivery",
        "repeat_schedule_can_overdeliver_by_5_months"
      ]
    },
    {
      "subscription_id": "a84c8871-b58a-4f8b-99fa-193ebf476277",
      "order_id": "f3a388fe-e96d-45c8-92d3-4a936684daf1",
      "customer_email": "69mkyypvtyho@teacher.unbox.edu.pl",
      "purchased_term_months": 6,
      "interval_months": 1,
      "immutable_anchor_currently_stored": "2026-07-09T19:58:32.658Z",
      "inferred_initial_delivery_anchor": "2026-06-14T22:00:00.000Z",
      "first_completed_task_created_at": "2026-07-09T19:58:23.911Z",
      "completed_cycles": 1,
      "highest_completed_cycle_index": 1,
      "projected_total_months_if_unfixed": 11,
      "projected_excess_months_if_unfixed": 5,
      "flags": [
        "anchor_after_first_completed_task_created",
        "anchor_differs_from_initial_delivery",
        "repeat_schedule_can_overdeliver_by_5_months"
      ]
    }
  ]
}
```

Both affected subscriptions would generate **five months beyond their purchased six-month term** if left on the old behavior. No data was changed.

Proposed later repair, after a Supabase backup and manual approval: create a one-time, transactionally logged script that targets only diagnostic findings, sets `term_start_at` to the verified `delivered_at` (falling back to the recorded initial activation/delivery evidence only when reviewed), does not modify completed MMU tasks or their timestamps, and re-runs this diagnostic before and after. Do not infer from renewal completion time.

### D7 — PIN-free, audited customer reveal

Root cause: the backend per-item endpoint schema still required a confirmation body while the live client correctly sent no body. There was no usable PIN setup flow, so the resulting Fastify validation error made reveal impossible.

Resolution:

- Removed the obsolete per-item request-body contract. Both per-item and legacy order-level reveal use the existing shared reveal policy: authenticated ownership, strict-rules acceptance where required, and credential-reveal auditing/evidence.
- Removed the orphaned `PinModal.svelte`, dead `api/pin.ts`, deprecated subscription PIN-reveal client method, and stale frontend PIN fields/constants.
- Added an item-reveal regression that posts no PIN payload and asserts one successful audit event. Existing route tests retain strict-rules refusal, legacy reveal, failure audit, and authorization coverage.

Task 4 schema/code cleanup backlog: `users.pin_hash`, `users.pin_set_at`, the `pin_reset_requests` table and indexes, plus deprecated server-side PIN/reset compatibility code (`pinService` and Gone endpoints). These were intentionally retained in this fix.

### D6 — catalog pricing locks

Root cause: this was **not** a direct-API-only data issue. The normal admin price setter (`catalogService.setCurrentPrice`, used by the admin UI) and price-history creator wrote `price_history` rows without a `pricing_publish_runs` snapshot. Fixed-product create/update paths had the same omission. A second contributor was application-clock timestamps compared against PostgreSQL `TIMESTAMP` values; a new price could be considered future relative to database `NOW()` in this local timezone configuration.

Resolution:

- Every supported manual price path now creates a succeeded manual `pricing_publish_runs` snapshot and attaches `snapshot_id` plus settlement currency to price metadata.
- Normal and fixed-product pricing writes use the database clock for immediate activation when the caller does not explicitly schedule a price.
- Current-price catalog queries require a valid succeeded snapshot, so snapshot-less rows are excluded from public purchasable listings instead of displaying a price that checkout will reject.
- Real migrated-DB coverage creates prices through normal setter, price-history, fixed-product create, and fixed-product update paths; it verifies valid locks, a successful `POST /checkout/draft`, and exclusion of a deliberately snapshot-less row.

### D8 — first-load dashboard cards

Root cause: SSR supplied orders only. The page initialized an empty subscriptions map, then issued both a client order refresh and subscription requests on mount. After claim/login this raced the authenticated state/load lifecycle, so the cards could remain absent until reload.

Resolution: the server page load now fetches subscriptions for the returned order page and returns `subscriptionsByOrder`; the Svelte page initializes from that data and no longer performs an unconditional `onMount` order refresh. `dashboardOrdersFirstLoadSource.test.ts` asserts the load/render contract and prevents reintroducing the refresh race.

### Files changed in this fix

- `database/diagnose-mmu-anchors.js`
- `src/routes/admin/tasks.ts`, `src/services/subscriptionService.ts`, `src/services/jobs/subscriptionJobs.ts`, `src/services/paymentService.ts`
- `src/routes/orders.ts`
- `src/services/catalogService.ts`
- `frontend/src/routes/dashboard/orders/+page.server.ts`, `frontend/src/routes/dashboard/orders/+page.svelte`
- PIN client removals under `frontend/src/lib/`
- `src/tests/adminSchemaCompatibilitySmoke.test.ts`, `src/tests/auditLoggingRoutes.test.ts`, `src/tests/dashboardOrdersFirstLoadSource.test.ts`

### Verification

- `npm test -- --runInBand`: PASS — 94 suites, 382 tests.
- `npm run build`: PASS.
- `npm run lint`: PASS — 10 warnings, 0 errors.
- `cd frontend && npm run check`: PASS — 0 errors, 0 warnings.
- `cd frontend && npm run lint`: PASS — 79 warnings, 0 errors.
- `cd frontend && npm run build`: PASS.
- `node database/migrate.js validate`: PASS — 62 legacy migrations grandfathered.
- Fresh migration DB `qa_fix5_fresh_1783631800`: all 62 migrations applied.
- Dev-copy migration DB `qa_fix5_copy_1783631800`: restored with the known non-fatal `transaction_timeout` setting warning; migration runner reported 0 pending migrations.


## Run 4 — Continued Full Phase 0–6 Walkthrough (2026-07-09)

Scope and constraints: report-only QA on `Admin-UI-and-Logic-implementation`; local backend with `EMAIL_PROVIDER=console JOBS_ENABLED=false`; Chromium headless with one browser context. Failed paths were recorded and independent paths continued. The workspace was already dirty before the run; no product source files were changed.

Verdict: **FAIL — two customer-facing blockers and one MMU lifecycle defect remain.** The D1–D5 remediation works in the paths exercised here, including UI MMU completion. The new blockers below mean the full public-to-customer flow is still not ready for human QA.

### Phase-by-phase evidence

| Phase / step | Action | Expected | Actual / evidence | Result |
| --- | --- | --- | --- | --- |
| 0. Catalog setup | Opened admin-next Products and loaded the three active QA products. | Public QA products should be purchasable. | `QA Streaming`, `QA AI Tool`, and `QA Link Product` are active and shown with prices, but each `POST /checkout/draft` returned 400 `price unavailable`. Their current `price_history.metadata` is null, while checkout requires a `snapshot_id` pricing lock. | **FAIL — D6** |
| 1. Guest cart / draft | Chromium rendered a three-item cart of the QA products, entered a guest email, applied the seeded coupon, and continued. | A draft and payment transition should be created. | UI rendered all items but coupon showed “Unable to apply…”, then checkout showed `price unavailable`; no draft was created. Continued with an API fallback using the one active snapshot-backed ChatGPT variant twice: 200, order `506bdc83-3345-4cda-a644-1eab4b301c63`, two order items, total $79.98. | **FAIL (UI) / PASS (API fallback)** |
| 2. Manual payment / claim | Set the API-fallback cart to pending-payment QA fixture state; opened its admin-next order file and used **Mark as paid manually**. | Payment confirmation creates subscriptions and fulfillment work. | UI showed pending order, then `Order marked paid`; payment `manual_506bdc83…` succeeded and two subscriptions were created. Guest claim UI, after normal user login, showed `Order claimed successfully`. | **PASS** |
| 3. Per-item fulfillment | Opened the order’s admin-next fulfillment page; saved distinct test credentials and confirmed delivery for each item. | Credentials must be saved before delivery and each item delivered independently. | Both rows required save first, then reported `Credentials saved` and `Item delivered`; final view was `2 Of 2 Delivered`, delivery emails marked sent. | **PASS** |
| 4. Customer reveal | Opened claimed customer Dashboard > Orders and selected Reveal. | Customer should have a discoverable PIN setup/verification path, then reveal credentials. | Initial page load listed the order but no subscription/reveal controls; full reload caused two Reveal buttons to appear. Clicking Reveal returned only `Validation failed`. `PinModal.svelte` exists but has no frontend consumer; `ordersService.revealOrderItemCredentials()` sends no PIN token/body. Dashboard Settings has no PIN control. | **FAIL — D7; D8 observed** |
| 5. MMU UI, timeline, remaining cycles | Created a paid 6-month MMU QA fixture; explicitly ran `runManualMonthlyUpgradeSweep`. Opened the task in admin-next and completed it, then used explicit time shifts, sweeps, and API confirms for remaining cycles. | UI task should complete without a task payment confirmation; labels should be customer month coverage; cycles must be completable. | UI displayed `Month 2 of 6` and `Initial delivery · [term start]`; **Mark renewal completed** succeeded with no `payment_confirmed_at`. Cycles 2–5 were individually created and returned 200 from renewal-confirm API. After each confirmation source code resets `term_start_at` to completion time; natural future-cycle progression therefore depends on this reset rather than the original term timeline. QA time shifts were required to force cycles 2–5. | **PASS (UI first cycle) / PASS (API cycles 2–5), lifecycle FAIL — D9** |
| 6. Payments, coupons, newsletter, users, announcements, search | Exercised independent admin-next pages. | Controls and cross-page data should work. | Created `QAUI1783629344940` 20% coupon in UI; newsletter tab rendered stats; user lookup found the claimed order and three subscriptions; payment ledger/detail drawer opened manual payment; global search found order/customer/payment/subscriptions; published `QA browser verification` and history recorded 44 recipients. | **PASS** |

### New defects

#### D6 — High — active public QA catalog products cannot enter checkout

All three active QA products are listed publicly with prices, yet draft creation fails uniformly with `price unavailable`. Their current price records lack `metadata.snapshot_id`; `resolvePricingLockContext()` treats that as unavailable. This blocks the intended multi-item public checkout and makes the displayed prices misleading.

#### D7 — High — customer credential reveal has no usable PIN path

The delivered, claimed order’s UI exposes Reveal, but the call fails as `Validation failed`. The UI neither presents nor uses a PIN setup/verify component, although the backend reveal policy requires PIN authorization. `PinModal.svelte` is orphaned (no usages), `dashboard/settings` contains no PIN control, and the orders client posts no PIN token. This blocks the Phase 4 customer endpoint.

#### D8 — Medium — dashboard order subscriptions fail to render on initial client load

Immediately after claim, `/dashboard/orders` showed the delivered order and items but no subscription cards/reveal buttons. The authenticated subscriptions endpoint returned both subscriptions (200) and a browser reload made the cards appear. The current client-refresh behavior is unreliable and masks fulfillment state until reload.

#### D9 — High — MMU confirmation resets the term anchor, preventing natural cycle progression

`POST /admin/tasks/:taskId/renewal/confirm` updates `term_start_at` to the completion timestamp. Completing the first task visibly changed initial delivery from Jun 10 to Jul 9. The sweep derives cycle index from `term_start_at`, so it restarts the schedule rather than advancing the original term. Remaining cycles passed only with explicit QA date shifts. This needs a product decision/fix before real multi-cycle MMU use.

### Automated / operational checks

- `npm test -- --runInBand`: **PASS**, 93 suites and 376 tests.
- `npm run build`: **PASS**.
- `npm run lint`: **PASS**, 10 warnings and 0 errors.
- `cd frontend && npm run check`: **PASS**, 0 errors and 0 warnings.
- `cd frontend && npm run lint`: **PASS**, 79 warnings and 0 errors.
- `node database/migrate.js validate`: **PASS**; 62 legacy migrations grandfathered.
- Frontend production build was started multiple times while streamed command output was being collected; the overlapping QA processes were stopped before a single-run conclusion. It is therefore **not claimed as re-verified in this run** (the prior addendum records a passing build).
- Startup with jobs disabled logged `Background jobs are disabled` and no scheduler execution. NOWPayments emitted its one expected fallback warning for `currencies-full` 404.

Date: 2026-07-09  
Branch: `Admin-UI-and-Logic-implementation`  
Commit: `116ae6d19fd54551b33c3ffdd9cdb8fe8e424ab2`  
Environment: local `/home/yuri/projects/ss`, backend `localhost:3001`, PostgreSQL 16.14, Redis local, frontend SvelteKit.

Verdict after D1-D5 fix pass: **PASS for the scoped fix verification**. The original QA run below failed before product fixes were made; this addendum records the targeted remediation and verification evidence.

## Fix Verification Addendum - 2026-07-09

Scope: fixed D1, D2, D3, D5, and applied the scoped D4 migration-validator resolution. No unrelated feature work was intentionally included.

Per-defect result:
- D1: Removed credential material from non-audited admin aggregate/detail serialization. Replaced secret-bearing subscription selects with explicit columns and sanitized row spreads for admin-next subscription list/detail, admin-next order detail items, admin fulfillment order detail, MMU task detail, and the old `/admin/orders/:orderId/fulfillment` endpoint. Presence is exposed only through boolean flags. Audited Show endpoints still return credentials and write one audit action per request.
- D1 old-console decision: removed `credentials_encrypted` from the old console fulfillment endpoint. Search showed old admin pages use `has_credentials`/`hasCredentials` first and only used `credentials_encrypted` as a fallback, so returning the existing boolean preserves old-console behavior. New admin-next pages do not call the old endpoint.
- D2: Changed `POST /admin/tasks/:taskId/renewal/confirm` so `manual_monthly_upgrade` tasks do not require `admin_tasks.payment_confirmed_at`. They now require the parent order to be `paid`, `in_process`, or `delivered` with a succeeded payment. Non-MMU renewal tasks still require `payment_confirmed_at`.
- D3: Extended MMU detail aggregates with backend canonical labels for current task and cycle history: `month_label`, coverage bounds, term months, and `term_start`. The admin-next MMU timeline now renders backend labels only, dates initial delivery from `term_start`, and no longer renders raw `mmu_cycle_index` month labels.
- D4: `database/migrate.js validate` now grandfathers migrations dated through `2026-07-09` for DOWN/transaction validation with warnings, and enforces DOWN sections plus transaction blocks for migrations after `2026-07-09`.
- D5: `JOBS_ENABLED=false` exits `startJobs()` before registering/running scheduled jobs or payment monitoring. NOWPayments `currencies-full` 404 logs one concise fallback warning per client/process. Email verification sync logs one skip line and stops when local users are absent from Supabase `auth.users`.

Verification evidence:
- `npm test -- --runInBand`: passed, 92 suites, 375 tests.
- `npm run build`: passed.
- `npm run lint`: passed with 10 warnings, 0 errors.
- `cd frontend && npm run check`: passed with 0 errors, 0 warnings.
- `cd frontend && npm run lint`: passed with 79 warnings, 0 errors.
- `cd frontend && npm run build`: passed.
- `node database/migrate.js validate`: passed; 62 legacy migrations grandfathered.
- Fresh migration apply: disposable DB `qa_fresh_fix_migrations_20260709212422`; all 62 migrations applied cleanly.
- Dev-copy migration check: disposable DB `qa_copy_fix_migrations_20260709212422`; copy restore completed with the known non-fatal `transaction_timeout` warning; `node database/migrate.js up` found 0 pending migrations.
- Clean boot: `EMAIL_PROVIDER=console JOBS_ENABLED=false PORT=3101 npm run dev` produced no scheduler start, sweep, watchdog, payment-monitoring, or email-verification job execution logs. It logged one NOWPayments fallback warning: `currencies-full returned 404; falling back to /currencies`.

New/updated regression tests:
- `src/tests/adminFulfillmentAggregates.test.ts`: JSON assertions for admin-next subscription detail, admin-next order detail, admin fulfillment order detail, MMU task detail, queue/list surfaces, and audited Show endpoints.
- `src/tests/adminOrderActions.test.ts`: old-console fulfillment endpoint no longer serializes credential material.
- `src/tests/adminTaskCompletion.test.ts`: MMU paid parent order succeeds, unpaid parent order fails, non-MMU renewal without payment confirmation still fails.
- `src/tests/adminNextMmuTimelineSource.test.ts`: admin-next MMU timeline source cannot reintroduce raw `mmu_cycle_index` month rendering or first-MMU-due-date initial delivery.
- `src/tests/migrationValidator.test.ts`: legacy cutoff passes through `2026-07-09`; post-cutoff migration missing DOWN fails.
- `src/tests/startupHygiene.test.ts`: NOWPayments fallback warning logs once; `JOBS_ENABLED=false` does not start jobs/payment monitoring; auth-user mismatch logs a single skip.

Grandfathered migration backlog:
```text
20241219_120000_initial_schema.sql
20241219_120001_add_performance_indexes.sql
20250925_120000_add_payment_tracking.sql
20250926_134800_add_waiting_payment_status.sql
20250926_140000_add_payment_workflow_support.sql
20250930_add_name_columns.sql
20251002_202000_migrate_credits_data.sql
20251010_115000_bootstrap_core_tables.sql
20251010_120000_add_payments_table.sql
20251014_120000_create_prelaunch_tables.sql
20251015_120000_schema_alignment_admin.sql
20251015_130000_add_prelaunch_fk_constraints.sql
20251016_110000_backfill_users_from_auth.sql
20251016_120000_prelaunch_data_migration_dry_run.sql
20251016_121000_prelaunch_data_migration_apply.sql
20251020_120000_add_credit_transaction_constraints.sql
20251021_120000_add_payment_subscription_uniques.sql
20251231_140000_fix_contest_prize_time_comparison.sql
20251231_141000_add_subscriptions_updated_at.sql
20260105_120000_add_admin_audit_logs.sql
20260105_125000_add_subscriptions_renewal_date.sql
20260105_130000_add_pin_support_and_dashboard_indexes.sql
20260105_140000_backfill_subscription_billing_fields.sql
20260105_150000_add_notifications.sql
20260105_160000_add_product_publishing_fields.sql
20260105_170000_backfill_product_publishing_defaults.sql
20260105_180000_add_notification_cleared_at.sql
20260106_120000_add_user_status_audit.sql
20260107_120000_add_email_verified_at.sql
20260108_120000_add_admin_task_issue_flag.sql
20260110_120000_add_admin_task_payment_confirmed_at.sql
20260111_120000_add_stripe_auto_renewal.sql
20260112_120000_add_variant_terms_and_pricing_snapshot.sql
20260112_130000_backfill_term_months.sql
20260113_120000_add_coupons.sql
20260114_120000_add_upgrade_selection_and_term_start.sql
20260115_120000_add_newsletter_subscriptions.sql
20260116_120000_add_bis_inquiries.sql
20260117_120000_add_pin_reset_requests.sql
20260118_120000_drop_prelaunch_contest_tables.sql
20260119_120000_supabase_schema_alignment.sql
20260120_120000_drop_prelaunch_contest_routines.sql
20260121_120000_add_subscription_cancellation_fields.sql
20260121_130000_add_prelaunch_reward_tasks.sql
20260121_140000_add_coupon_term_months.sql
20260204_220000_add_catalog_terms_unavailable_dedupe_index.sql
20260212_120000_add_multi_item_guest_checkout_foundations.sql
20260216_040000_fix_payment_item_singleton_uuid.sql
20260223_120000_add_pay4bit_fx_pricing_foundations.sql
20260312_120000_add_order_entitlements_and_fixed_catalog_fields.sql
20260317_120000_add_product_sub_category.sql
20260318_120000_add_product_sub_categories.sql
20260327_120000_add_fixed_product_price_history.sql
20260327_130000_add_product_sub_category_map.sql
20260328_120000_add_product_category_map.sql
20260330_120000_add_maxmind_risk_assessments.sql
20260422_120000_add_paypal_provider_constraints.sql
20260427_120000_add_order_compliance_evidence_logs.sql
20260604_120000_add_payop_provider_constraints.sql
20260615_120000_add_antom_provider_constraints.sql
20260617_120000_add_telegram_order_notifications.sql
20260709_120000_add_item_fulfillment_handshake.sql
```

Files changed for this fix scope:
- `database/migrate.js`
- `frontend/src/lib/types/adminNext.ts`
- `frontend/src/routes/admin-next/fulfillment/mmu/[taskId]/+page.svelte`
- `frontend/src/routes/admin-next/subscriptions/+page.svelte`
- `src/routes/admin/fulfillment.ts`
- `src/routes/admin/next.ts`
- `src/routes/admin/orders.ts`
- `src/routes/admin/tasks.ts`
- `src/services/jobs/authJobs.ts`
- `src/utils/nowpaymentsClient.ts`
- `src/tests/adminFulfillmentAggregates.test.ts`
- `src/tests/adminOrderActions.test.ts`
- `src/tests/adminTaskCompletion.test.ts`
- `src/tests/adminNextMmuTimelineSource.test.ts`
- `src/tests/migrationValidator.test.ts`
- `src/tests/startupHygiene.test.ts`
- `QA_FULL_SYSTEM_VERIFICATION_REPORT_20260709.md`

## Original QA Run 3 Report

## Part A - Automated Verification

- Backend tests: `npm test -- --runInBand` passed: 89 suites, 362 tests.
- Backend build: `npm run build` passed.
- Backend lint: `npm run lint` passed with 10 warnings, 0 errors.
- Frontend type check: `npm run check` passed with 0 errors, 0 warnings.
- Frontend lint: `npm run lint` passed with 79 warnings, 0 errors.
- Frontend production build: `npm run build` passed.
- Fresh database migrations: created disposable DB `qa_fresh_migrations_20260709204512`; `node database/migrate.js up` applied all 62 migrations cleanly through `20260709_120000_add_item_fulfillment_handshake.sql`.
- Current dev DB copy migration check: copied `subscription_platform` to `qa_copy_migrations_20260709204534`; `node database/migrate.js up` reported 62 applied, 0 pending.
- Migration validator: `node database/migrate.js validate` failed because older legacy migrations lack DOWN sections and some lack explicit transaction blocks. This did not block fresh/copy application.

Explicit Task 1 safeguard tests present and passing:
- MMU coverage-sum cases `(6,1), (12,1), (12,2), (6,2), (12,3)` and divisibility rejection: `src/tests/mmuSchedule.test.ts`.
- Per-item delivery/final item behavior and activation-link state checks: `src/tests/adminOrderActions.test.ts`.
- Strict-rules gate, false/missing confirmation rejection, legacy reveal gate: `src/tests/orderRulesReveal.test.ts`.
- Manual mark-paid and Payop/Antom stale sweep: `src/tests/paymentManualAndSweep.test.ts`.
- Stripe webhook creates subscriptions: `src/tests/stripeWebhookOrderFlow.test.ts`.
- Aggregate/MMU credential audit behavior: `src/tests/adminFulfillmentAggregates.test.ts`.

Coverage gaps:
- No browser E2E for full public-site cart -> guest checkout -> claim -> admin-next fulfillment -> customer reveal.
- No automated browser regression of old `/admin` pages.
- No test proving `/admin/next/subscriptions/:id` omits `credentials_encrypted`.
- No test for admin-next MMU completion from the new UI.
- No test for newsletter admin-next stats UI and announcement publish/display.
- Most authz tests for new admin surfaces mock auth middleware; live middleware coverage is not systematically tested.

## Part B - Security Review

Live probes were run against `http://127.0.0.1:3001/api/v1` using generated JWTs for seeded active users:
- Admin: `11111111-1111-4111-8111-111111111111`, role `admin`.
- User: `22222222-2222-4222-8222-222222222222`, role `user`.

Results:
- Unauthenticated probes against `/admin/fulfillment/*`, `/admin/next/*`, `/admin/orders/*/items/*/*`, and `/admin/tasks/*/credentials` returned 401.
- Regular user probes against the same admin endpoints returned 403.
- Regular user IDOR probes against another user's order item for reveal, accept-rules, activation-ready, and legacy order-level reveal returned 404.
- Admin search SQL-injection probes (`%' OR 1=1 --`, `<script>alert(1)</script>`) returned 200 with empty results, not SQL errors.
- Strict-rules XSS review: dashboard/admin-next rules modals render with Svelte interpolation, no `{@html}`/`innerHTML`; rules text is normalized to inert plain text in `src/utils/upgradeOptions.ts`.

Security defect found:
- See D1. Encrypted credential blobs are returned by aggregate/detail endpoints before audited Show actions.

## Part C - Regression

Automated/build coverage passed. Backend startup was clean enough to run scheduled jobs; observed jobs included subscription expiry, reminders, checkout-abandon sweep, MMU sweep, delivery-email watchdog, NOWPayments currency refresh, payment monitoring, and scheduler start. Startup/job logs were not fully clean: NOWPayments `currencies-full` returned 404 and fell back to `/currencies`, and email verification sync emitted repeated local `User not found` warnings.

Old `/admin` browser page-by-page regression was not fully executed. The old admin fulfillment endpoint was checked by live API and is affected by D1.

## Part D - Manual E2E

Full Phase 0-6 scripted browser E2E was not completed because blocking backend/admin-next defects were found before full data setup. Targeted live/API checks were executed for authz, IDOR, search input handling, startup/jobs, and credential-exposure behavior.

Key targeted evidence:
- `/api/v1/admin/next/subscriptions/a9196780-edce-48b3-8321-4f76a575fca3` returned `credentials_encrypted` containing an AES-GCM payload.
- `/api/v1/admin/orders/f3a388fe-e96d-45c8-92d3-4a936684daf1/fulfillment` returned the same `credentials_encrypted` payload.
- Admin-next MMU page calls `confirmRenewal()` directly, but the backend confirm route rejects tasks without `payment_confirmed_at`.

## DB / Date Manipulations

No subscription/order time travel was performed.

Disposable migration databases:
```bash
PGPASSWORD="$DB_PASSWORD" createdb -h "$DB_HOST" -p 5432 -U "$DB_USER" qa_fresh_migrations_20260709204512
DB_PORT=5432 DB_DATABASE=qa_fresh_migrations_20260709204512 node database/migrate.js up

PGPASSWORD="$DB_PASSWORD" createdb -h "$DB_HOST" -p 5432 -U "$DB_USER" qa_copy_migrations_20260709204534
PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p 5432 -U "$DB_USER" --no-owner --no-privileges "$DB_DATABASE" | PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p 5432 -U "$DB_USER" -d qa_copy_migrations_20260709204534
DB_PORT=5432 DB_DATABASE=qa_copy_migrations_20260709204534 node database/migrate.js up

PGPASSWORD="$DB_PASSWORD" dropdb -h "$DB_HOST" -p 5432 -U "$DB_USER" --if-exists qa_fresh_migrations_20260709204512
PGPASSWORD="$DB_PASSWORD" dropdb -h "$DB_HOST" -p 5432 -U "$DB_USER" --if-exists qa_copy_migrations_20260709204534
```

The copy restore emitted one non-fatal PostgreSQL setting warning: `unrecognized configuration parameter "transaction_timeout"`.

## Defects

### D1 - Critical - Encrypted credential payload leaks through non-audited admin detail endpoints

Evidence:
- `GET /api/v1/admin/next/subscriptions/a9196780-edce-48b3-8321-4f76a575fca3` returned `credentials_encrypted":"{\"version\":1,\"ciphertext\":...`.
- `GET /api/v1/admin/orders/f3a388fe-e96d-45c8-92d3-4a936684daf1/fulfillment` returned the same encrypted credential payload.

Why it matters:
- The requirement says credentials must never appear in list/detail endpoints and credential views must be audited. These endpoints expose encrypted credential material to the browser without an explicit Show action or credential-view audit row. Even though the payload is encrypted, this bypasses the intended reveal/audit surface.

Suspected files:
- `src/routes/admin/next.ts:384` uses `SELECT s.*`.
- `src/routes/admin/orders.ts:679-698` selects and returns `s.credentials_encrypted`.

Repro:
1. Use an admin token.
2. Call `GET /api/v1/admin/next/subscriptions/<subscription-with-credentials>`.
3. Observe `data.subscription.credentials_encrypted`.
4. Call `GET /api/v1/admin/orders/<order-with-credentials>/fulfillment`.
5. Observe `data.subscriptions[].credentials_encrypted`.

### D2 - High - Admin-next MMU renewal cannot be completed from the new MMU detail page

Evidence:
- Frontend calls `adminNextService.confirmRenewal(task.id, ...)` directly from `frontend/src/routes/admin-next/fulfillment/mmu/[taskId]/+page.svelte:82-90`.
- Backend rejects renewal confirmation unless `admin_tasks.payment_confirmed_at` is present at `src/routes/admin/tasks.ts:618-622`.
- MMU sweep inserts tasks without `payment_confirmed_at` in `src/services/jobs/subscriptionJobs.ts:1317-1328`.

Impact:
- Phase 5 cannot complete an MMU task from `/admin-next/fulfillment/mmu/:taskId` as requested. Workaround may exist through old task/payment-confirm actions, but it is absent from the new MMU flow.

Repro:
1. Create/due an MMU task through the sweep.
2. Open `/admin-next/fulfillment/mmu/<taskId>`.
3. Click complete/mark renewed.
4. Backend returns `Confirm payment before completing renewal`.

### D3 - Medium - MMU timeline displays raw cycle index, not customer month coverage

Evidence:
- Correct label function maps cycle 1 to `Month 2 of 6` (`src/utils/mmuSchedule.ts:116-127`).
- MMU detail timeline renders `Month {mmu_cycle_index}` directly at `frontend/src/routes/admin-next/fulfillment/mmu/[taskId]/+page.svelte:145-149`.
- Initial delivery node date uses `history[0]?.due_date`, which is the first MMU due date, not the initial delivery/term-start date (`frontend/src/routes/admin-next/fulfillment/mmu/[taskId]/+page.svelte:140-143`).

Impact:
- The first renewal can show as “Month 1” in the timeline while the header says “Month 2 of 6”, confusing fulfillment and violating the month-label requirement.

### D4 - Gap - Migration validator fails on legacy migrations

Evidence:
- `node database/migrate.js validate` exits 1 due missing DOWN migrations and missing transaction blocks in older files.

Impact:
- Fresh/copy migration application passed, so this is not a runtime blocker, but the repository migration hygiene check is not green.

### D5 - Low - Local job startup logs are noisy

Evidence:
- During live backend startup, NOWPayments `currencies-full` returned 404 and fell back to `/currencies`.
- Email verification sync emitted repeated `Email verification lookup failed ... User not found` warnings for local users.

Impact:
- Jobs continued and no startup crash occurred, but the "server startup log is clean" regression criterion is not met in the local environment.

## Final Verdict

**FAIL (blocking defects listed).** The automated suite and builds are green, and authz/IDOR probes did not expose admin access bypasses, but credential payload exposure and the blocked admin-next MMU completion flow must be fixed before this is ready for human QA or Task 4.

---

## Run 6 — Current Worktree Re-verification (2026-07-10)

This is the current report conclusion. Earlier sections are retained as historical evidence only. QA was performed on the requested `Admin-UI-and-Logic-implementation` branch at `116ae6d19fd54551b33c3ffdd9cdb8fe8e424ab2`; the candidate worktree was already dirty before this run and was preserved. No application source was changed.

Environment: local backend `127.0.0.1:3001`, PostgreSQL via `localhost:6432` (direct migration access `5432`), local Redis, Node/npm workspace at `/home/yuri/projects/ss`. Console-email/browser E2E was not re-run in this addendum.

### Part A — Automated and migration verification

| Check | Actual | Result |
| --- | --- | --- |
| Backend suite | `npm test -- --runInBand --silent`: 94 suites, 383 tests passed. Jest reports its existing forced-exit/open-handle advisory after completion. | PASS |
| Backend build/lint | `npm run build` passed. `npm run lint` had 0 errors and 10 warnings. | PASS with warnings |
| Frontend static/build | `npm run check`: 0 errors/0 warnings. `npm run lint`: 0 errors/79 warnings. `npm run build`: exit 0. | PASS with warnings |
| Migration validation | `node database/migrate.js validate`: passed; 62 legacy migrations are explicitly grandfathered for DOWN/transaction validation. | PASS with legacy debt |
| Fresh DB migration | Disposable `qa_full_fresh_retry_20260710`: all 62 migrations applied through `20260709_120000_add_item_fulfillment_handshake.sql`, runner exit 0; database dropped afterwards. | PASS |
| Dev-copy migration | Disposable `qa_full_copy_20260710`: `pg_dump` restore exit 0; migration runner reported 0 pending migrations and exit 0; database dropped afterwards. | PASS |

Required Task 1 safeguards remain present and passed in the suite: coverage/divisibility cases in `mmuSchedule.test.ts`; per-item delivery and handshake state tests in `adminOrderActions.test.ts`; strict-rules/reveal gate in `orderRulesReveal.test.ts`; expiry/manual-paid in `paymentManualAndSweep.test.ts`; webhook flow in `stripeWebhookOrderFlow.test.ts`.

Coverage gaps (severity: gap): no browser automation covering the complete Phase 0–6 public/guest/payment/claim/admin/customer/MMU walkthrough; no live console-email assertions for per-item versus order email content; no browser regression of every old `/admin` page; no real-provider-webhook run against a newly created local checkout in this run; and most route tests replace auth middleware rather than testing every new endpoint with live middleware.

### Part B — Security re-verification

| Probe | Expected | Actual | Result |
| --- | --- | --- | --- |
| Unauthenticated new surfaces | 401 | Reveal, rules acceptance, readiness, delivery/instructions, admin-next orders/users/search, and fulfillment queue each returned 401. | PASS |
| Customer on admin endpoints | 403 | Valid signed token for an active user with `user` role returned 403 for admin-next orders/search, fulfillment queue, and MMU credential view. | PASS |
| Cross-user IDOR | Refuse without state/evidence change | Another active user's subscription produced 404 for reveal, rules acceptance with `confirmed:true`, and readiness with `confirmed:true`. False/missing confirmations return the expected 400 before ownership lookup. | PASS |
| Rules/handshake state validation | Refuse false/missing confirmation | Source and passing route tests require literal `confirmed:true`; live false probes returned 400. | PASS |
| Search injection | No SQL execution/XSS | `%' OR 1=1 --` and `<script>alert(1)</script>` queries returned 200 with empty result arrays; SQL is parameterized. | PASS |
| Rules rendering | Inert | Rules are normalized to plain text; affected Svelte pages contain interpolation rather than `{@html}`/`innerHTML`. | PASS |
| Encryption at rest | AES-256-GCM payload, not plaintext | DB aggregate: 3 credential rows, all 3 versioned encrypted payloads; 0 rows matching the QA plaintext marker. | PASS |
| Oversized changed-surface input | Reject at field validation | 6,001-character `credentials` and activation-instruction payloads passed Fastify schema validation and reached the subsequent missing-record lookup (400/404), rather than being rejected for length. | **FAIL — D10** |

The prior D1–D9 remediation evidence in this report remains supported by the current green regression suite, particularly credential aggregate sanitization, MMU term-anchor coverage, reveal/rules tests, and dashboard first-load source test.

### Part C — regression status

Builds and automated regression are green as recorded above. The `/admin-next` and old `/admin` layout guards both use the same `admin`/`super_admin` role set. A complete page-by-page browser regression of old `/admin`, live jobs with console log capture, and registered/guest checkout coexistence were not re-executed in this run; they remain gaps rather than passes.

### Part D — Phase 0–6 status

The requested full scripted browser walkthrough has not been completed end-to-end on the current candidate. The earlier report records targeted/manual portions and subsequent fixes, but it does not constitute a clean current execution of every action/expected/actual/evidence step. Therefore all phases are **NOT VERIFIED in Run 6** rather than inferred as passing:

| Phase | Status | Evidence/limitation |
| --- | --- | --- |
| 0 — catalog/coupon setup | NOT VERIFIED | No fresh QA product/coupon setup in this run. |
| 1 — public/cart/guest/webhook | NOT VERIFIED | No browser checkout or local webhook simulation in this run. |
| 2 — new-console fulfillment | NOT VERIFIED | Covered by route tests, not a current browser walkthrough. |
| 3 — claim/reveal/rules/handshake | PARTIAL | Live authz/IDOR/rules probes passed; no fresh guest claim/reveal browser cycle. |
| 4 — manual mark-paid | PARTIAL | Covered by passing service/route tests; not live UI this run. |
| 5 — MMU cycles | PARTIAL | Passing schedule/real-schema regression tests; no current date-travel walkthrough. |
| 6 — payments/sweeps/admin pages | PARTIAL | Passing sweep tests and migration checks; no current UI/page walkthrough. |

### DB/date manipulation log

No production/dev business records or dates were changed in Run 6. Disposable migration-only databases were created and dropped. Exact operations:

```bash
PGPASSWORD="$DB_PASSWORD" createdb -h "$DB_HOST" -p 5432 -U "$DB_USER" qa_full_fresh_retry_20260710
DB_HOST="$DB_HOST" DB_PORT=5432 DB_DATABASE=qa_full_fresh_retry_20260710 DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" node database/migrate.js up
PGPASSWORD="$DB_PASSWORD" dropdb -h "$DB_HOST" -p 5432 -U "$DB_USER" --if-exists qa_full_fresh_retry_20260710

PGPASSWORD="$DB_PASSWORD" createdb -h "$DB_HOST" -p 5432 -U "$DB_USER" qa_full_copy_20260710
PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p 5432 -U "$DB_USER" --no-owner --no-privileges "$DB_DATABASE" | PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p 5432 -U "$DB_USER" -d qa_full_copy_20260710
DB_HOST="$DB_HOST" DB_PORT=5432 DB_DATABASE=qa_full_copy_20260710 DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" node database/migrate.js up
PGPASSWORD="$DB_PASSWORD" dropdb -h "$DB_HOST" -p 5432 -U "$DB_USER" --if-exists qa_full_copy_20260710
```

### Current defect list

#### D10 — Critical — changed admin credential/instruction inputs have no maximum field length

Reproduction:

1. Authenticate as an admin.
2. `POST /api/v1/admin/subscriptions/<uuid>/credentials` with `credentials` containing 6,001 characters, or `POST /api/v1/admin/orders/<orderId>/items/<subscriptionId>/activation-instructions` with an equally large `instructions` value.
3. Observe that validation does not reject the body for size; processing reaches the record lookup (the absent test UUID returned 400/404).

Impact: the mandatory oversized-input check fails. A valid target can accept a disproportionately large credential/instruction value up to the generic request body limit, allowing avoidable storage, encryption, logging/error-path, and downstream email/rendering pressure. Under the task's Part B rule, a successful input-validation bypass is classified Critical.

Suspected files/endpoints: `src/routes/admin/subscriptions.ts` (`POST /admin/subscriptions/:subscriptionId/credentials`, schema lacks `maxLength`) and `src/routes/admin/orders.ts` (`POST /admin/orders/:orderId/items/:subscriptionId/activation-instructions`, schema lacks `maxLength`).

## Final Verdict — Run 6

**FAIL (blocking defect D10; required full Phase 0–6 evidence is also incomplete).** The code compiles, tests and migrations are green, and sampled authorization/IDOR/XSS/SQLi checks pass. It is not ready for human QA or Task 4 until D10 is remediated and the stipulated full browser/console-email/webhook/MMU walkthrough is executed and documented.

---

## QA-FIX 6 — D10 Field-Level Input Limits (2026-07-10)

Scope: remediated the changed Task 1–3 / QA-fix admin request surfaces only. No database migration, delivery/reveal/rules/handshake gating change, or old-console-only endpoint change was made.

Verdict: **PASS — D10 remediated.** The prior full-system verdict remains subject to the outstanding end-to-end walkthrough; this is a scoped fix verification.

### D7-R1 status

Already fixed; no change made. Successful item reveal records `user_agent` in compliance evidence from `getRequestUserAgent(request)`, while `logCredentialRevealAttempt` records the same request header to `credential_reveal_audit_logs`; both resolve to null when absent. The existing reveal flow retains exactly one credential-audit write per request.

### Changed-surface request-body inventory

| Endpoint / field | Validation after this fix | Notes |
| --- | --- | --- |
| `POST /admin/subscriptions/:id/credentials` — `credentials` | string: 1–4,000; null still allowed to clear | `reason` was already capped at 500. |
| `POST /admin/orders/:orderId/items/:subscriptionId/deliver` — `reason` | optional, max 500 | Per-item delivery reason. |
| `POST .../activation-instructions` — `instructions` | required, 1–4,000 | Handshake instruction payload. |
| `POST .../activation-link` — `activation_link` | required, 1–4,000 | Supports long signed activation URLs without accepting unbounded input. |
| `POST .../activation-restart` — `note` | optional, max 500 | Restart evidence note. |
| `POST /admin/orders/:orderId/mark-paid` — `note` | required, 1–1,000 | Manual payment evidence. |
| `POST /orders/:orderId/items/:subscriptionId/accept-rules` | no string body field; `confirmed` is literal `true` | Existing Zod validation unchanged. |
| `POST /orders/:orderId/items/:subscriptionId/activation-ready` | no string body field; `confirmed` is boolean and must be true in handler | Existing state/gating unchanged. |
| Admin task paid / MMU renewal-confirm / complete / issue / resolve note fields | optional, max 500 | Already capped server-side; matching MMU UI `maxlength` controls added. |
| Product `metadata.upgrade_options` / legacy `upgradeOptions`: activation-instructions template | supplied string: 1–4,000 | Both snake- and camel-case keys are schema-capped. |
| Product strict-rules text | supplied string: 1–8,000 | Both snake- and camel-case keys are schema-capped; normalization/rendering behavior is unchanged. |
| Coupon create/edit: `code` | supplied/required as applicable, 1–200 | Short code limit. |
| Coupon create/edit: `bound_user_id`, `category`, `product_id` | supplied string, max 200 | Scope and status remain finite enums; date strings now have date-time format plus max 64. |
| Announcement: `title`, `message`, `expires_at` | title max 120; message 1–2,000; expiry date-time max 64 | Title/message were already bounded; expiry is now bounded too. |

The 4,000/8,000/1,000/500/200 limits follow the requested values. The 64-character date-time cap is intentionally narrower because RFC3339 timestamps are small and the field is not free text. Announcement title remains at the pre-existing stricter 120-character cap and message at 2,000.

### Frontend alignment

Added matching `maxlength` attributes to admin-next credential, activation-instruction/link, mark-paid note, MMU note, strict-rule/template, coupon, and announcement-expiry controls. The MMU two-input credential editor also rejects a composed credential payload over 4,000 characters before submit, since its two independently bounded inputs are combined into one API field.

### Regression proof

Added `src/tests/adminChangedSurfaceInputValidation.test.ts`, using real Fastify route registration, cookie parsing, and the production error handler—no route/auth/service mocks.

- Oversized bodies return the standard pre-handler validation envelope: 400 `Bad Request`, `Validation failed`, `INVALID_REQUEST`, with the `maxLength` validation detail.
- Exact-limit bodies pass schema validation and then reach real auth middleware, which returns the expected 401 `MISSING_TOKEN`; therefore they did not fail validation or touch lookup/encryption/logging paths.
- This explicitly proves fail-then-pass behavior for the two D10 reproductions (credential save and activation instructions), plus activation link, delivery/restart/manual notes, coupon create/edit, product strict-rules/template metadata, and announcement expiry.

### Files touched

- `src/routes/admin/orders.ts` — caps changed per-item delivery/handshake/manual-paid text fields.
- `src/routes/admin/subscriptions.ts` — caps stored credential payloads at 4,000.
- `src/routes/admin/catalog.ts` — validates nested strict-rule/template metadata on product create/update.
- `src/routes/admin/coupons.ts` — caps coupon scope identifiers/codes and date strings.
- `src/routes/admin/notifications.ts` — caps announcement expiry timestamp.
- `frontend/src/routes/admin-next/fulfillment/orders/[orderId]/+page.svelte` — applies credential/handshake and issue-note field limits.
- `frontend/src/routes/admin-next/fulfillment/mmu/[taskId]/+page.svelte` — applies task-note limits and composed-credential guard.
- `frontend/src/routes/admin-next/orders/[orderId]/+page.svelte` — applies manual-mark-paid note limit.
- `frontend/src/routes/admin-next/products/[productId=uuid]/+page.svelte` — applies template/rules limits.
- `frontend/src/routes/admin-next/coupons/+page.svelte` — applies coupon short-field limits.
- `frontend/src/routes/admin-next/announcements/+page.svelte` — mirrors expiry cap.
- `src/tests/adminChangedSurfaceInputValidation.test.ts` — real-route fail-then-pass validation coverage.

### Verification

- Focused field-limit test: 1 suite, 9 tests passed.
- Full backend suite: **95 suites, 392 tests passed**.
- Backend build: passed; lint: 0 errors, 10 existing warnings.
- Frontend check: 0 errors, 0 warnings; lint: 0 errors, 79 existing warnings; production build: passed.
- `node database/migrate.js validate`: passed; 62 legacy migrations remain grandfathered.

---

## Run 7 — Fresh E2E Rerun (2026-07-10)

Verdict: **FAIL — D11 critical multi-item checkout regression.** This run used a newly started backend in console-email mode with jobs disabled, a fresh QA catalog, and a locally signed Stripe webhook. The native public multi-item checkout failed before payment; dependent phases were continued only after a documented test-fixture DB normalization.

### E2E evidence

| Phase | Actual | Result |
| --- | --- | --- |
| 0 — admin-next catalog | Created three fresh `QA ... 20260710` products, variants, terms, manual current prices, and `QA-TEST15-20260710` coupon through live admin APIs. Product/variant/term/price/coupon actions returned success. | PASS |
| 1 — native guest multi-item draft | Guest identity plus a P1 own-account 6-month item, P2 strict-rules 12-month item, P3 activation-link 12-month item, and coupon returned 400 `price unavailable`. Each price had a valid succeeded pricing snapshot, but all three snapshot IDs differed. | **FAIL — D11** |
| 1 — controlled continuation | After QA-only fixture normalization to one shared pricing snapshot, the same draft returned 200; coupon applied only to the highest eligible P3 item (5,940 cents), and total was 66,660 cents. | PASS (simulation only) |
| 1 — payment webhook | With local `STRIPE_ENABLED=true`, sent a correctly HMAC-signed `checkout.session.completed` payload. Endpoint returned 200 `{ received: true }`; order became `in_process`, with 3 subscriptions, 3 tasks, and 1 succeeded payment. Console email subject: `Your SubSlush order is confirmed`. | PASS |
| 2 — per-item fulfillment | Saved and delivered P1 and P2 separately; order remained in process. Sent P3 instructions, resulting in `awaiting_customer`. Console email contained one ready email per delivered item; instructions sent one customer-action email. | PASS |
| 3 — claim/reveal/rules/handshake | Injected a documented QA claim token because console email only emitted a preview, then claim returned 200/reassigned. P1 reveal returned P1 credentials. P2 reveal was refused before rules acceptance, accepted literal `confirmed:true`, then returned P2 credentials. P3 ready confirmation returned `customer_ready`; admin delivered link, restarted, and completed a second link cycle. | PASS (claim-token simulation noted) |
| Audit/evidence | Order evidence contained credential reveals (2), strict-rules acceptance (1), readiness (1), restart (1), deliveries (4), and order delivery (1). Reveal audit recorded two successes and one strict-rules refusal. | PASS |
| Public browser smoke | Chrome headless rendered the local home page successfully; screenshot captured at `/tmp/qa-home.png`. | PASS |
| MMU | Began a time-travel sweep on the fresh P1 subscription. A first run outside the seven-day lead window created no work; at the due window it created cycle index 2 / total 5. Full sequential MMU and interval-2 completion were not continued after D11 blocked the required native end-to-end verdict. | PARTIAL |
| Old `/admin`, pending manual-paid, expiry sweep, remaining admin pages | Not rerun after D11. | NOT VERIFIED |

### D11 — Critical — normal separately saved prices make any multi-item cart unavailable

Reproduction:

1. In the supported admin price flow, set a current USD price for three distinct variants separately.
2. Each `POST /admin/price-history/current` succeeds and creates a succeeded manual `pricing_publish_runs` snapshot.
3. Create a guest draft containing all three variants.
4. Checkout returns 400 `price unavailable`.

Evidence: the three QA prices had distinct valid snapshot IDs. `checkoutPricingService` rejects a cart when its item snapshot-ID set has more than one member, while `catalogService.setCurrentPrice` creates a separate publication snapshot on each normal price save. Thus ordinary multi-product catalog maintenance makes ordinary multi-item checkout impossible.

Suspected files: `src/services/catalogService.ts` (manual `setCurrentPrice` publication creation) and `src/services/checkoutPricingService.ts` (single-snapshot cart requirement).

### Run 7 DB/date manipulations

All changes were limited to `QA ... 20260710` data and are preserved for traceability.

```sql
-- Fixture continuation only after the native D11 failure:
INSERT INTO pricing_publish_runs (status, triggered_by, published_at, metadata)
VALUES ('succeeded', 'manual', NOW(), '{}'::jsonb);

UPDATE price_history
SET metadata = jsonb_set(metadata, '{snapshot_id}', to_jsonb('<shared QA snapshot>'::text), true)
WHERE product_variant_id IN ('476a649c-9787-4647-a1b8-cc76ccb57024', '48970810-b365-41ce-905f-ee2709cbcd6d', '04efb41f-2760-4edd-96fd-07a7ba17fd31')
  AND ends_at IS NULL;

UPDATE price_history
SET starts_at = '2026-07-09 21:00:00'
WHERE product_variant_id IN ('476a649c-9787-4647-a1b8-cc76ccb57024', '48970810-b365-41ce-905f-ee2709cbcd6d', '04efb41f-2760-4edd-96fd-07a7ba17fd31')
  AND ends_at IS NULL;

-- Claim-token simulation (SHA-256 hash of documented QA token):
INSERT INTO guest_claim_tokens (guest_identity_id, token_hash, expires_at)
VALUES ('d445500f-f9a4-4967-87f2-90b385e708d0', '<sha256 QA token>', NOW() + INTERVAL '72 hours');

-- MMU time travel:
UPDATE subscriptions
SET term_start_at = '2026-01-01 00:00:00', start_date = '2026-01-01 00:00:00', end_date = '2026-07-01 00:00:00'
WHERE id = 'abb2499c-4d4e-4f95-82f9-9f71b685b05d';
```

## Final Verdict — Run 7

**FAIL (D11 blocks the required normal guest multi-item checkout).** The signed webhook, per-item fulfillment, customer rules/reveal, audited handshake, and restart flow worked after fixture-only continuation, but that cannot compensate for the native checkout failure. The remaining original-mandate phases are not asserted as passed.

---

## QA-FIX 7 — D11 Per-Item Pricing Locks (2026-07-10)

Scope: remediated the multi-item pricing-lock invariant only. No migration, no `setCurrentPrice` change, no coupon-rule change, and no old-console change was made.

Verdict: **PASS — D11 remediated.** A cart may now contain independently valid line-item pricing snapshots. Each line remains locked to a succeeded publication snapshot, and the cart still requires one settlement currency.

### Step 1 — investigation and FX decision

The cart-wide `snapshotIds.size !== 1` rejection was introduced in commit `9014d3f` (2026-03-09, `chore: snapshot current workspace changes`) as part of the original Pay4bit/FX pricing workspace change. That same broad commit introduced `pricingLockService`, settlement totals, and the FX publish foundations; it did not contain a separate rationale or test establishing a cart-wide same-snapshot business rule.

The valid protection is **per item**: `resolvePricingLockContext()` requires a valid UUID snapshot on the resolved price and, when a display-currency price has a different settlement-currency counterpart, requires both prices to carry the same snapshot. This prevents one line from combining FX values from different publish runs. `fxPricingPublisherService` intentionally gives all prices emitted by one atomic FX publication the same snapshot, but that is publication provenance, not a requirement that unrelated catalog lines saved at different times share a snapshot.

The implementation therefore preserves FX same-run consistency for each display/settlement price pair and removes only the unrelated cart-wide identity condition. Snapshot-less prices remain excluded from public lookup and rejected at draft. A mixed settlement-currency cart now returns the explicit `invalid settlement` error rather than generic `price unavailable`.

### Step 2 — compatibility evidence

`orders.pricing_snapshot_id` and its metadata mirror are retained as nullable compatibility fields: they contain the shared snapshot for single-snapshot carts and `null` for multi-snapshot carts. Every new order item now records its own `metadata.pricing_snapshot_id`; the draft response already exposes the same ID per pricing line. No schema migration is needed because order-item metadata is JSONB.

### Step 3 — cart-level snapshot reader inventory

| Reader | Multi-snapshot handling after this fix |
| --- | --- |
| `guestCheckoutService` | Persists each line snapshot in `order_items.metadata`; writes the legacy order-header field only when all line snapshots match, otherwise null. |
| `orderService` | Maps and writes the nullable order-header field generically; it does not use it to recalculate a cart. |
| `paymentService` Payop invoice metadata | Forwards the nullable header as audit/context metadata only; payment confirmation and webhook processing use stored order totals/items, not a single snapshot lookup. |
| `routes/checkout.ts` PayPal tracking payload | Forwards nullable header context only; no price recalculation or refusal. |
| `payopQuoteService` | Was the one material consumer assumption. It now resolves each item from `metadata.pricing_snapshot_id`, with header fallback for legacy orders; its fixed-fee FX cross-rate uses the selected reference line's own snapshot. |
| `routes/payments.ts` single-item payment paths | Each resolves one `PricingLockContext` directly; these are not cart-header readers and remain unchanged. |
| Admin order detail, refund paths, frontend types | Search found no cart-header price-recalculation reader. The frontend draft type now permits the documented null compatibility value. |

### Real-route, real-DB regression proof

Added `src/tests/multiItemPricingLocks.integration.test.ts`. It creates a fresh migrated PostgreSQL database, registers the production checkout route with no route/service/auth mocks, and disposes the database afterwards.

- Three variants priced separately through `catalogService.setCurrentPrice` received three distinct succeeded manual snapshots. The test first asserts that exact old rejection predicate (`Set.size === 3`), then submits the same guest three-line draft successfully: subtotal 6,000 cents, 15% discount 450 cents on only the 3,000-cent highest eligible line, total 5,550 cents. The order header snapshot is null and all three line snapshots are persisted distinctly.
- Single-item and duplicate-same-variant carts retain their shared legacy header snapshot.
- A deliberately snapshot-less price still returns 400 `price unavailable` before draft creation.
- A valid fixture with different per-line settlement currencies returns 400 `invalid settlement`.

### Files touched

- `src/services/checkoutPricingService.ts` — replaces the cart-wide snapshot identity rejection with nullable compatibility summary logic while retaining per-item locks and settlement validation.
- `src/services/guestCheckoutService.ts` — stores each resolved line snapshot in durable order-item pricing evidence.
- `src/services/payments/payopQuoteService.ts` — re-quotes each line against its own snapshot and falls back to the header for legacy orders.
- `src/types/checkout.ts` — models nullable cart-level snapshot compatibility field.
- `frontend/src/lib/types/checkout.ts` — aligns the client draft type with the nullable compatibility field.
- `src/tests/multiItemPricingLocks.integration.test.ts` — fresh-PostgreSQL, real-route D11 regression coverage.
- `QA_FULL_SYSTEM_VERIFICATION_REPORT_20260709.md` — records investigation, remediation, reader audit, and verification evidence.

### Verification

- Focused D11 integration test: **1 suite, 4 tests passed**.
- Full backend suite: **96 suites, 396 tests passed** (Jest retains its existing forced-exit/open-handle advisory after completion).
- Backend build: passed. Backend lint: 0 errors, 10 existing warnings.
- Frontend `check`: 0 errors, 0 warnings. Frontend lint: 0 errors, 79 existing warnings. Frontend production build: passed.
- `node database/migrate.js validate`: passed; 62 legacy migrations remain grandfathered for DOWN/transaction validation.

---

## Run 8 — Final amended-prompt verification (2026-07-10)

Scope: report-only re-verification on `Admin-UI-and-Logic-implementation` at
`116ae6d19fd54551b33c3ffdd9cdb8fe8e424ab2`. The pre-existing dirty worktree
was preserved. No application source was changed. A second backend instance was
started at `127.0.0.1:3101` with `EMAIL_PROVIDER=console` and
`JOBS_ENABLED=false` solely for the live probes below.

### Part A — current automated, build, and migration result

| Check | Actual | Result |
| --- | --- | --- |
| Full backend suite | `npm test -- --runInBand --silent`: **96/96 suites, 396/396 tests passed** in 54.933 s. Jest printed its known forced-exit/open-handle advisory only after success. | PASS |
| Backend build/lint | `npm run build` exit 0. `npm run lint`: 0 errors, 10 existing warnings. | PASS with warnings |
| Frontend static/build | `npm run check`, `npm run lint`, and `npm run build` exited 0. The lint output has its pre-existing warning set; no errors were emitted. | PASS with warnings |
| Migration validation | `node database/migrate.js validate`: PASS; 62 legacy migrations are grandfathered for DOWN/transaction checks. | PASS with legacy debt |
| Fresh database migration | Disposable `qa_full_final_fresh_20260710014118`: all migrations through `20260709_120000_add_item_fulfillment_handshake.sql` applied, then the database was dropped. | PASS |
| Current-dev-copy migration | Disposable `qa_full_final_copy_20260710014118`: restore completed with the known non-fatal `transaction_timeout` setting warning; runner found 0 pending migrations. Database dropped. | PASS |

The required safeguard/regression suites exist and passed: `mmuSchedule.test.ts`
(coverage sum/divisibility), `adminOrderActions.test.ts` (per-item delivery and
handshake), `orderRulesReveal.test.ts` (ownership/rules gate),
`paymentManualAndSweep.test.ts` (manual paid/Payop/Antom expiry),
`stripeWebhookOrderFlow.test.ts`, `adminSchemaCompatibilitySmoke.test.ts`
(MMU lifecycle and reveal UA), `dashboardOrdersFirstLoadSource.test.ts`,
`adminChangedSurfaceInputValidation.test.ts`, and
`multiItemPricingLocks.integration.test.ts`.

Coverage gaps (severity: gap): there is still no browser automation for the
complete public-to-claim-to-MMU sequence, console-email content assertions,
every old `/admin` page, or all changed endpoints with production middleware.
The source-only dashboard first-paint test is useful but is not a browser
first-paint test.

### Mandatory fix-verification targets

| Target | Evidence | Result |
| --- | --- | --- |
| FV-1 / D7-R1 reveal UA evidence | Live `POST /api/v1/orders/506bdc83-3345-4cda-a644-1eab4b301c63/items/21d8e1d6-c197-4bd3-afde-eabd8c5ef1d1/reveal` returned 200 once with `User-Agent: QA-FV1-Browser-UA/1.0` and once with the header deliberately absent. The two `credential_reveal_audit_logs` rows have IP `127.0.0.1`, timestamps, and respectively that UA and NULL. The corresponding two `order_compliance_evidence_logs.license_account_access_evidence` payloads have the identical UA and NULL respectively. Exactly one audit and one evidence row were created per click. | PASS |
| FV-2 / D10 limits | On valid QA records, 6,001-char credential and activation-instruction bodies returned 400 `INVALID_REQUEST` with `must NOT have more than 4000 characters`; 6,001-char mark-paid note and strict-rules text returned schema 400 with their 1,000/8,000 limits. Exact 4,000-char credential returned 200; exact 4,000-char instruction returned 200; exact 1,000-char mark-paid note reached business validation (409 `ORDER_NOT_PENDING_PAYMENT`) rather than schema rejection. | PASS |
| FV-3 / D11 per-item snapshots | `multiItemPricingLocks.integration.test.ts` passed against a fresh migrated PostgreSQL database and production checkout route: separately saved prices produce three distinct succeeded snapshots; native three-line guest draft returns 200; each persisted order line retains its own snapshot; mixed-cart header snapshot is NULL; only the highest eligible line receives the coupon; a snapshot-less line remains unavailable. | PASS (real route/fresh DB) |

### Part B — current security probes

Unauthenticated valid-shape requests returned 401 for reveal, accept-rules,
activation-ready, admin-next orders/subscriptions/slim-users/newsletter/search,
and the fulfillment queue. A valid active-customer token returned 403 from
admin-next orders, slim users, global search, and fulfillment queue. Direct
source comparison confirms `/admin` and `/admin-next` both guard exactly
`admin` and `super_admin` roles. Existing route coverage and the prior live
probes cover cross-user reveal/rules/ready attempts, strict-rules false/missing
confirmation, SQLi search probes, and encrypted-at-rest checks.

No credential value was printed by these probes. List/detail aggregate tests
continue to assert masked/sanitised payloads. The browser-only masked-Show,
rules-XSS rendering, guest-session enumeration, and every endpoint permutation
were not re-run in this final addendum and remain gaps, not passes.

### Part C / Part D status

This addendum does **not** convert the prior partial/manual evidence into a
fresh complete Phase 0–6 browser walkthrough. The signed webhook, per-item
fulfillment, claim/rules/reveal/handshake, and restart cycles were previously
recorded in Run 7 but Run 7 used a prohibited-after-amendment price-fixture
normalisation after its then-current D11 failure. D11 is now covered by the
fresh-DB native integration result above, but the following still need a clean
human/browser execution: supported-admin Product setup with three separate
price saves, public cart and guest checkout, console-email inspection, all
old-admin pages, registered-user checkout, pending-order manual-paid UI,
complete MMU intervals 1 and 2 via reference-time only, expiry UI/page checks,
and cross-page consistency.

### MMU anchor diagnostic and current blocking data finding

`node database/diagnose-mmu-anchors.js` scanned four current subscriptions and
reported four findings. One is QA data:
`21d8e1d6-c197-4bd3-afde-eabd8c5ef1d1` on order
`506bdc83-3345-4cda-a644-1eab4b301c63` has an anchor of
`2026-07-09T20:35:03.956Z`, while the diagnostic inferred initial delivery at
`2026-02-14T21:34:52.136Z`; it projects five excess months if left unrepaired.
The remaining findings are pre-existing dev subscriptions. No anchor was
changed in this run. Therefore the amended-prompt expectation of zero findings
on QA data is **not met**.

### DB/date-manipulation log

| Operation | Classification |
| --- | --- |
| Fresh and copied disposable migration DBs created/restored/migrated/dropped using the commands in Run 6 with names `qa_full_final_fresh_20260710014118` and `qa_full_final_copy_20260710014118`. | Permitted simulation |
| Exact-limit credential saved to QA subscription `21d8…`; exact-limit activation instructions delivered to QA subscription `056d…`, transitioning it to `awaiting_customer`; two customer reveal calls created their expected audit/evidence rows. | Permitted test scenario |
| No `term_start_at`, `start_date`, `end_date`, task due date, or payment timestamp was mutated in Run 8. | Compliant |
| Run 7's historical `UPDATE subscriptions SET term_start_at/start_date/end_date …` (shown above) is prohibited by this amended prompt and is the likely cause of the QA anchor finding. | Historical **violation**; not repeated |
| Run 7's historical shared-snapshot price normalisation was prohibited by this amended prompt. | Historical **violation**; not repeated |

### Current defect list

#### D9-data — Critical — corrupted MMU term anchors remain in QA/dev data

Reproduction: run `node database/diagnose-mmu-anchors.js`; inspect QA
subscription `21d8e1d6-c197-4bd3-afde-eabd8c5ef1d1`. The diagnostic projects
five months of over-delivery. This is data already altered by the historical
time-travel violation, not proof that the current immutable-anchor code writes
an incorrect value. It nevertheless blocks a trustworthy MMU E2E run and is a
wrong-renewal-count risk. Suspected remediation surface: an approved,
transactionally logged data-repair script, after an independent backup and
review; no repair was performed by QA.

#### G1 — Gap — mandatory complete browser/console E2E has not been executed after all fixes

The amended mandate requires an end-to-end Phase 0–6 record. Current evidence
contains strong real-route and live targeted verification, but not that clean
post-fix walkthrough. This is a verification gap rather than a demonstrated
application defect; it prevents a PASS verdict.

## Final Verdict — Run 8

**FAIL (not ready for human QA / Task 4).** D7-R1, D10, and D11 now pass their
targeted verification, and automated/build/migration checks are green. The
candidate still has a critical QA/dev MMU-anchor data-integrity finding and
lacks the mandated clean, complete Phase 0–6 browser/console/MMU run after the
final fixes. No code was fixed or altered by this QA run.

---

## Run 9 — Amended-prompt QA rerun (2026-07-10)

Environment: local PostgreSQL 16 / Redis, backend `127.0.0.1:3001`, frontend
Vite dev server at `127.0.0.1:3000`, console-email configuration already in
the local service. Branch `Admin-UI-and-Logic-implementation`, commit
`116ae6d19fd54551b33c3ffdd9cdb8fe8e424ab2`. The pre-existing dirty worktree
was preserved; no product source files were changed by QA.

### Pre-flight data hygiene

Initial `node database/diagnose-mmu-anchors.js` returned four records.

| Subscription | Classification | Evidence / action |
| --- | --- | --- |
| `21d8e1d6-c197-4bd3-afde-eabd8c5ef1d1` / order `506bdc83-3345-4cda-a644-1eab4b301c63` | (a) QA-inflicted | Customer `qa-verified-1768522228@example.com`; the prior Run-7 report identifies this exact order and the prohibited forced MMU time travel. Deleted as QA data. |
| `9b619566-b9df-442d-a1ed-d45de0e42241` / order `2b2e5ed6-c0a5-4de0-a926-cd7534eb0e79` | (b) pre-existing | Non-QA customer `hifegib740@wivstore.com`; no QA-report ownership evidence. Preserved. |
| `a84c8871-b58a-4f8b-99fa-193ebf476277` / order `f3a388fe-e96d-45c8-92d3-4a936684daf1` | (b) pre-existing corruption | Non-QA customer `69mkyypvtyho@teacher.unbox.edu.pl`, order predates the QA run. Preserved. |
| `abb2499c-4d4e-4f95-82f9-9f71b685b05d` / order `2b2e5ed6-c0a5-4de0-a926-cd7534eb0e79` | (b) pre-existing corruption | Same non-QA customer/order as the other preserved fixture. Preserved. |

Permitted QA cleanup, executed inside one transaction after selecting and
locking the three subscriptions on the QA order:

```sql
DELETE FROM credential_reveal_audit_logs WHERE subscription_id = ANY($1::uuid[]);
DELETE FROM admin_tasks WHERE order_id = $1 OR subscription_id = ANY($2::uuid[]);
DELETE FROM order_compliance_evidence_logs WHERE order_id = $1;
DELETE FROM payment_events WHERE order_id = $1 OR payment_id IN (SELECT id FROM payments WHERE order_id = $1);
DELETE FROM payments WHERE order_id = $1;
DELETE FROM subscriptions WHERE id = ANY($1::uuid[]);
DELETE FROM orders WHERE id = $1;
```

Parameters were the QA order above and subscriptions `42984c28-ec19-4dd6-962b-697a7ba36c78`, `21d8e1d6-c197-4bd3-afde-eabd8c5ef1d1`, and `056d092f-d358-4a8b-aa98-62dfb85094d0`. Actual deletion counts: 3 reveal-audit rows, 7 tasks, 6 compliance-evidence rows, 1 payment, 3 subscriptions, and 1 order. The re-run diagnostic contains the three category-(b) IDs above only; these are the Phase-5 exclusion set. No QA-R9 subscription appears in it.

### Part A — automated, build, and migration verification

| Check | Actual | Result |
| --- | --- | --- |
| Backend suite | `npm test -- --runInBand --silent`: 96/96 suites, 396/396 tests passed. Jest emitted its known post-success forced-exit/open-handle advisory. | PASS |
| Backend build/lint | `npm run build` passed. `npm run lint` had 0 errors and 10 existing warnings. | PASS with warnings |
| Frontend lint/build/check | Current-run `svelte-check`/Vite invocations were CPU-bound in the shared terminal collector and their final output could not be retained. Run 8 on this same commit recorded check/build success; do not treat that as a fresh independent browser verification. Frontend lint/build processes did exit during the current run but are not claimed as separately evidenced. | GAP |
| Migration validation | `node database/migrate.js validate`: passed; 62 legacy migrations are explicitly grandfathered. | PASS with legacy debt |
| Fresh DB migration | `qa_r9_fresh_1783635`, via direct PostgreSQL port 5432: all 62 migrations applied successfully. Database dropped afterwards. | PASS |
| Current-dev-copy migration | Dump/restored to `qa_r9_copy_1783635`; `node database/migrate.js up` found 0 pending. Restore logged only `SET transaction_timeout = 0` as an unrecognised, non-fatal setting. Database dropped afterwards. | PASS |

Required safeguard/regression suites exist and passed: `mmuSchedule.test.ts`,
`adminOrderActions.test.ts`, `orderRulesReveal.test.ts`,
`paymentManualAndSweep.test.ts`, `stripeWebhookOrderFlow.test.ts`,
`adminSchemaCompatibilitySmoke.test.ts` (including six/twelve month MMU and
UA evidence), `dashboardOrdersFirstLoadSource.test.ts`,
`adminChangedSurfaceInputValidation.test.ts`, and
`multiItemPricingLocks.integration.test.ts`.

Coverage gaps (severity: gap): no complete browser flow from public cart through
claim and all MMU cycles; no browser first-paint proof for the dashboard; no
automated console-email content assertion; no full old `/admin` page sweep; and
no end-to-end test proving guest coupon reservation/finalization.

### Mandatory FV results

| Target | Evidence | Result |
| --- | --- | --- |
| FV-1 / D7-R1 | QA-R9 order `e25db4e1-6612-4d81-b3fa-ae29f9937be7`, subscription `95db4da5-f6b9-4884-ae3e-a973149d3a14`: two successful reveal calls. Audit rows have timestamp/IP `127.0.0.1` and UAs `QA-R9-Reveal/1.0` and `NULL`. Their corresponding `credential_reveal` evidence rows contain the identical `license_account_access_evidence.user_agent` values, including explicit `null`. Exactly two rows were created in each log: one per reveal. | PASS |
| FV-2 / D10 | Valid QA-R9 targets received 6,001-char credential, instruction, mark-paid note, and strict-rules payloads. Each returned Fastify 400 `INVALID_REQUEST`; captured credential error was `credentials: must NOT have more than 4000 characters`, before lookup/business handling. Exact 4,000-char credential and instruction writes returned 200. Exact 1,000-char note passed schema and reached expected 409 `ORDER_NOT_PENDING_PAYMENT`. | PASS |
| FV-3 / D11 | P1/P2/P3 were created through supported admin endpoints and separately priced with three `POST /admin/price-history/current` saves. Snapshot IDs were respectively `2d14dd4e-803f-437f-bf2e-83e0ac973116`, `aa76d521-d483-4bd2-8771-e434af82783f`, and `7b0b3b87-4c05-4847-b8a7-f97f39b0b7dd`; all are distinct, `succeeded` publish runs. Native three-line guest draft returned 200. Persisted lines carry their matching snapshot IDs, the order header is NULL, and only P2 (the 144,000-cent highest eligible item) received the 21,600-cent 15% discount. | PASS |

### Live Phase 0–3 evidence

| Phase | Action → expected | Actual | Result |
| --- | --- | --- | --- |
| 0 | Create QA-R9 Streaming (MMU 1), AI Tool (MMU 2 + rules text containing inert script), and Link Product (handshake); separately save prices. | API-supported admin flow created all products/variants/terms, rejected P1 interval 4 with `Term length must be divisible by the MMU interval.`, and created the three succeeded snapshots above. `QA-R9-TEST15` coupon was created active, global, 15%, highest-eligible, max 5. | PASS (API; new-console UI not browser-driven) |
| 1 | Native guest three-item draft → signed Stripe completion should create paid order/subscriptions/tasks. | Draft returned `order_total_cents=266400`, null header snapshot and correct item evidence. A locally HMAC-signed `checkout.session.completed` Stripe event returned 200 `received:true`; order became `in_process`, with 1 succeeded payment, 3 subscriptions and 3 tasks. | PASS, except coupon accounting defect below |
| 2–3 / FV-1 | Save 4,000-character credentials, deliver P1, reveal from its owner with/without UA. | Save/deliver returned 200. Both customer reveals returned 200 and audit/evidence rows meet FV-1. | PASS |

The strict-rules, full handshake/restart, guest claim, all customer dashboard
first-paint, MMU reference-time cycles, manual-paid second order, expiry sweep,
Payop quote, remaining admin pages, old admin regression, console-email body
inspection, and cross-page consistency steps were not fully re-executed in this
run. They are explicitly unverified—not inferred from route/unit tests.

### Part B security and data findings

The live oversized probes prove validation happens before record lookup. The
full suite continues to cover authorization/rules/reveal/handshake paths, but
the requested exhaustive live attacker matrix and UI XSS render probe were not
completed in this run.

#### D12 — High — paid guest coupon discount is never reserved or redeemed

Reproduction:

1. Create active global coupon `QA-R9-TEST15` with `max_redemptions=5`.
2. Submit the native guest draft above. It applies a 21,600-cent coupon discount.
3. Send the correctly signed Stripe `checkout.session.completed` event for the
   resulting order.
4. Query `coupon_redemptions` for coupon
   `a208afd9-a7ae-4355-a2a4-a7c21cb12f7a` or order
   `e25db4e1-6612-4d81-b3fa-ae29f9937be7`: zero rows exist.

The order preserves `coupon_code=QA-R9-TEST15` and the discount, but there is
no `reserved` row for `paymentService.finalizeRedemptionForOrder()` to change
to `redeemed`. Repeated guest drafts/payments can therefore consume a capped
coupon without advancing/enforcing its use count. Suspected surface:
`src/services/guestCheckoutService.ts` (does pricing/persisted discount but
does not call `couponService.reserveCouponRedemption`) and
`src/services/paymentService.ts` (correctly finalizes only an existing
reservation). Severity is High: incorrect paid-order financial entitlement.

#### G2 — Gap — strict D6 negative fixture cannot be made public using only the permitted mutation

The supported admin activation API rejects an inactive product whose only
current USD price is snapshot-less: `Cannot activate product until all active
variants have an active USD base price`. A snapshot-less price is deliberately
not considered active by the D6 guard. Creating a publicly active fixture would
therefore require a second direct product-status/state write, which the amended
prompt does not permit. No such workaround was made. The current D6 route/fresh
DB integration test passed, but the exact live-public negative fixture remains
an execution gap, not a D6 pass.

### DB/date-manipulation log

| Operation | Classification |
| --- | --- |
| QA-only Run-7 order/subscription/task/payment/evidence cleanup shown above | Permitted data hygiene |
| `qa_r9_fresh_1783635` creation/migration/drop and `qa_r9_copy_1783635` dump/restore/migration/drop | Permitted migration simulation |
| QA-R9 products, variants, terms, current prices, coupon, guest identity/draft, signed Stripe event, credentials/instruction boundary writes, item delivery and reveal calls | Permitted test setup/scenario |
| Attempted snapshot-less D6 fixture activation; it failed before any direct price SQL was executed | Permitted negative test; no pricing normalization and no state workaround |
| Direct mutation of `term_start_at`, `start_date`, `end_date`, or payment timestamps | Not performed |

## Final Verdict — Run 9

**FAIL (not ready for human QA / Task 4).** FV-1, FV-2, FV-3, signed webhook
task creation, and QA-data anchor cleanup pass. D12 is a demonstrated High
financial/entitlement defect: guest coupons are discounted but not redeemed.
The mandated full browser/console/MMU and old-admin walkthrough is also still
incomplete. No code was fixed.

---

## D12 remediation report — 2026-07-10

### Step 1 — provenance and path comparison (completed before code changes)

**D12 is pre-existing on `main`/production lineage, not introduced by
`Admin-UI-and-Logic-implementation`.** `git blame` assigns guest draft pricing
and persistence (including the missing reservation) to `6b5593ff` (2026-02-17,
`feat: ship checkout, admin fulfillment, and payment sweep updates`).
`git branch --contains 6b5593ff` returns both this branch and `main`.

The registered paths already use the intended contract:

- `src/routes/subscriptions.ts:3191` creates the order and calls
  `couponService.reserveCouponRedemption()` within the same transaction before
  committing the registered credits purchase.
- `src/routes/payments.ts:791` does the same for registered payment checkout.
- Successful payment paths call `couponService.finalizeRedemptionForOrder()`;
  standard cancellation/abandonment paths call
  `couponService.voidRedemptionForOrder()`.

Guest checkout was introduced in the same `6b5593ff` change but only priced and
persisted coupon fields in `guestCheckoutService`; it never reserved a row.
The Payop/Antom branch of `paymentService.sweepStaleCheckoutSessions()` also
did not void reservations. That sweep gap is separately pre-existing and
affects registered as well as guest orders; it is fixed here using the existing
shared release service, not a guest-only alternative.

### Implementation

No migration was required. `coupon_redemptions` already has the required
`reserved`, `redeemed`, `voided`, and `expired` states plus an order uniqueness
index.

- Guest draft order edits first void their existing `reserved` redemption,
  then, when a coupon was applied, reserve exactly the priced item that received
  the coupon discount. This happens inside the existing order/items transaction.
- A reservation failure rolls the transaction back and returns
  `coupon_invalid`; the checkout route maps it to the existing 400 coupon error.
  The locked `reserveCouponRedemption()` check counts both reserved and redeemed
  rows against `max_redemptions`, so concurrent drafts cannot overbook a cap.
- Existing payment success finalization now receives a guest reservation and
  transitions it to `redeemed`.
- The Payop/Antom 72-hour stale-payment sweep now calls the same
  `voidRedemptionForOrder()` release mechanism after cancelling an order.

Files touched:

| File | Justification |
| --- | --- |
| `src/services/guestCheckoutService.ts` | Import/reuse `couponService`; atomically replace/reserve the guest draft coupon lifecycle. |
| `src/services/paymentService.ts` | Release the existing reservation when the Payop/Antom stale-payment sweep cancels an order. |
| `src/tests/multiItemPricingLocks.integration.test.ts` | Fresh PostgreSQL, real Fastify checkout/payment routes, real Redis rate limiter, signed Stripe webhook, cap race, and expiry-release coverage. |
| `src/tests/guestCheckoutService.test.ts` | Add the coupon-service test double needed by the existing isolated guest-service unit test. |

No pricing/eligibility calculation, D11 per-item snapshot behavior, old-admin
surface, or schema was changed. Registered checkout source was not changed; its
existing regression coverage remains green in the full suite.

### Fail-then-pass proof and lifecycle verification

Run 9’s pre-fix order `e25db4e1-6612-4d81-b3fa-ae29f9937be7` retains the
proven failure state: its coupon discount was paid but its coupon redemption
count is zero.

After the change, fresh live QA data proves the corrected path:

| Step | Evidence | Result |
| --- | --- | --- |
| Guest draft reservation | `QA-R10-D12` (`max_redemptions=1`), order `13bce178-27a6-4856-81e9-784b738f3220`: before payment, query returns one `coupon_redemptions.status = reserved`. | PASS |
| Signed Stripe completion | Locally HMAC-signed `checkout.session.completed` returned 200 `received:true`; the same row became `redeemed` with non-null `redeemed_at`. | PASS |
| Use count | Query for QA-R10 coupon returned redeemed count 1. | PASS |
| Cap race | Fresh DB real-route test submits two concurrent guest drafts with a max-one coupon: exactly one returns 200 and one 400; exactly one active `reserved` row exists. | PASS |
| Release | Fresh DB guest Payop order is backdated only through its payment timestamp, then the real 72-hour sweep marks payment `expired`, order `cancelled`, reservation `voided`; another guest draft can use the coupon. | PASS |
| Regressions | Real-route no-coupon guest order has no redemption row; existing multi-item highest-eligible discount assertion remains 450 cents on the 3,000-cent line; full registered-flow suite remains green. | PASS |

### Verification

| Check | Result |
| --- | --- |
| Focused real DB/routes test | `multiItemPricingLocks.integration.test.ts`: 8/8 passed. It includes signed Stripe route verification and real Redis rate limiting. |
| Full backend suite | `npm test -- --runInBand --silent`: 96/96 suites, 400/400 tests passed. |
| Backend build/lint | Build passed; lint 0 errors, 10 pre-existing warnings. |
| Frontend check | Retained output: `svelte-check found 0 errors and 0 warnings`. |
| Frontend lint/build | Both exit 0; retained Vite output says `built in 1m 16s`. |
| Migration validation | `node database/migrate.js validate`: passed; no new migration. |

---

## QA Run A — Automated gates, security, and targeted fix verification (2026-07-10)

Environment: local PostgreSQL 16 / Redis; branch
`Admin-UI-and-Logic-implementation`; commit
`116ae6d19fd54551b33c3ffdd9cdb8fe8e424ab2`. Run A was report-only: no
application source was changed. The pre-existing dirty worktree, including the
D12 remediation under test, was preserved. A dedicated backend ran only during
live probes at `127.0.0.1:3103` with `EMAIL_PROVIDER=console`,
`JOBS_ENABLED=false`, and `STRIPE_ENABLED=true`, then was stopped.

### Pre-flight hygiene and inherited MMU exclusion list

`node database/diagnose-mmu-anchors.js` was run before any Run-A write and
again at the end. Both outputs contain exactly these three category-(b)
pre-existing fixtures:

| Subscription | Classification and evidence |
| --- | --- |
| `9b619566-b9df-442d-a1ed-d45de0e42241` | Pre-existing, non-QA customer `hifegib740@wivstore.com`; order `2b2e5ed6-c0a5-4de0-a926-cd7534eb0e79` created `2026-07-09T22:43:45.965Z`. No flags. |
| `a84c8871-b58a-4f8b-99fa-193ebf476277` | Pre-existing corruption, non-QA customer `69mkyypvtyho@teacher.unbox.edu.pl`; order `f3a388fe-e96d-45c8-92d3-4a936684daf1` created `2026-04-22T23:28:51.924Z`; prior report attributes the anchor defect to historical QA-era behavior, not this run. |
| `abb2499c-4d4e-4f95-82f9-9f71b685b05d` | Pre-existing corruption on the non-QA `hifegib740@wivstore.com` order above. |

There was no remaining category-(a) QA subscription to delete: the Run-7
QA-prefixed order was removed in Run 9. No hygiene SQL was executed in Run A.
The three IDs above are the Run-B exclusion list. Final diagnostic JSON:

```json
{"scanned":3,"findings":[
 {"subscription_id":"9b619566-b9df-442d-a1ed-d45de0e42241","flags":[]},
 {"subscription_id":"a84c8871-b58a-4f8b-99fa-193ebf476277","flags":["anchor_after_first_completed_task_created","anchor_differs_from_initial_delivery","repeat_schedule_can_overdeliver_by_5_months"]},
 {"subscription_id":"abb2499c-4d4e-4f95-82f9-9f71b685b05d","flags":["anchor_differs_from_initial_delivery"]}
]}
```

### Part A — sequential automated gates

All final command output was retained under `/tmp/run-a-*` during this run.

| Command | Retained final result | Result |
| --- | --- | --- |
| `npm test -- --runInBand` | 96/96 suites, 400/400 tests; known post-success Jest open-handle advisory only. | PASS |
| `npm run build` | exit 0. | PASS |
| `npm run lint` | exit 0; 10 warnings, matching baseline. | PASS with baseline warnings |
| `cd frontend && npm run check` | exit 0; `svelte-check found 0 errors and 0 warnings`. | PASS |
| `cd frontend && npm run lint` | exit 0; 79 warnings, matching baseline. | PASS with baseline warnings |
| `cd frontend && npm run build` | exit 0; retained output `built in 1m 15s`. | PASS |
| `node database/migrate.js validate` | exit 0; 62 legacy migrations grandfathered, as expected. | PASS |
| Fresh disposable migration | `qa_run_a_fresh_1783636`, direct PostgreSQL 5432; all 62 UP migrations applied; DB dropped. | PASS |
| Dev-copy migration | `pg_dump`/`pg_restore` into `qa_run_a_copy_1783636`; known non-fatal `SET transaction_timeout = 0` restore warning; runner reported 0 pending; DB dropped. | PASS |

Required suites exist and passed: `mmuSchedule.test.ts`,
`adminOrderActions.test.ts`, `orderRulesReveal.test.ts`,
`paymentManualAndSweep.test.ts`, `stripeWebhookOrderFlow.test.ts`,
`adminSchemaCompatibilitySmoke.test.ts`, `dashboardOrdersFirstLoadSource.test.ts`,
`adminChangedSurfaceInputValidation.test.ts`, and
`multiItemPricingLocks.integration.test.ts`. D12 lifecycle coverage is embedded
in the last suite (guest reserve, signed Stripe redeem, cap race, Payop expiry
release, no-coupon regression) rather than a separate filename; it ran and
passed as part of the 400 tests.

### Part B — live security probes

| Probe | Actual | Result |
| --- | --- | --- |
| New admin/fulfillment AuthZ | `/admin/next/orders`, subscriptions, slim users, newsletter stats, search, queue, and fulfillment detail each return 401 without token and 403 to a regular customer token. | PASS |
| Guard parity | Old `/admin` and `/admin-next` route trees both use `authPreHandler` + the shared `adminPreHandler`, whose allowed set is exactly `admin`, `super_admin`. | PASS |
| IDOR | User A calling User B’s reveal, rules acceptance, and activation-ready endpoints each returned 404 `Order item not found`; evidence count before/after was unchanged (3). | PASS |
| Rules gate | Unaccepted strict item reveal returned 400; `confirmed:false` and omitted confirmation both returned 400. | PASS |
| Handshake abuse | Customer calls to admin instructions/link/restart returned 403; ready-confirm on a non-awaiting item returned 409 `INVALID_ACTIVATION_STATE`. | PASS |
| D10/FV-2 | Valid targets: 6,001-character credentials/instructions/note/rules returned schema 400 with exact 4,000/4,000/1,000/8,000 errors. Exact 4,000 credentials returned 200; exact 4,000 instructions and 1,000 note reached state-level 409, proving schema acceptance. | PASS |
| SQLi/script search | SQL/script payloads against admin-next global search, orders search, and slim users returned 200 normal result shapes with no SQL errors. | PASS |
| Credentials at rest | Stored credential was opaque ciphertext and did not contain the supplied plaintext. Aggregate sanitization remains covered by passing aggregate tests. | PASS |

### Part C — live targeted fixes

| Target | Evidence | Result |
| --- | --- | --- |
| FV-1 / D7-R1 | QA-RA order `f5f7ed5f-0aa5-4c14-8b75-fbb0288a384d`, subscription `d71a9884-0dca-42e2-9134-b0131570bebe`: two successful owner reveals. Audit rows record IP `127.0.0.1`, `QA-RA-FV1/1.0` and NULL UAs; matching compliance evidence has the identical values including explicit `null`. | PASS |
| FV-3 / D11 | `multiItemPricingLocks.integration.test.ts` passed in the full run; it is a fresh DB production-checkout-route test with distinct line snapshots and null mixed-cart header. | PASS |
| FV-4 / D12 cap/redeem | Coupon `QA-RA-CAP1` (`b859e938-9056-4700-8305-9a3fdbadae4b`, max 1): first guest draft/order `3d09000e-0045-40c9-9cf8-277f1203c677` created one `reserved` row. Second draft returned 400 `max redemptions`. Correctly signed Stripe completion returned 200 and changed it to `redeemed`; order kept code and 16,200-cent discount. | PASS |
| FV-4 / D12 expiry release | Coupon `QA-RA-RELEASE1` (`f421a794-533e-4fc7-9592-fb9736bb5ea9`): after permitted Payop payment timestamp backdate, sweep returned `scanned:1,cancelled:1`; order `191708e6-ac2a-411e-8c20-3f4ee886f513` became cancelled, payment expired, reservation voided, and a new guest draft reused the coupon with 200. | PASS |

### Run-A DB/write log

| Operation | Classification |
| --- | --- |
| Fresh/copy disposable database creation, migration, restore, and drop | Permitted migration simulation |
| QA-RA coupons, guest identities/drafts, webhook payment completions, credential save/delivery/reveal, and boundary payloads via supported local API endpoints | Permitted setup/probe |
| `UPDATE orders SET status='pending_payment', payment_provider='payop', payment_reference='payop-qa-ra-release' WHERE id=$1` with `$1=191708e6-ac2a-411e-8c20-3f4ee886f513` | Permitted expiry simulation |
| `INSERT INTO payments (...) SELECT ... NOW()-INTERVAL '73 hours' FROM orders WHERE id=$1` for that order | Permitted expiry simulation; payment timestamp only |
| Standalone first sweep attempt without `createDatabasePool(env)` | No DB write: failed before pool acquisition. Retry used normal bootstrap and processed the intended one order. |
| `term_start_at`, `start_date`, `end_date`, pricing publish runs, or price metadata/starts_at | Not mutated |

### Coverage gaps / findings

- **Gap:** Run A deliberately excludes browser E2E, customer-dashboard first paint,
  console-email rendering, old-admin page exercise, and full MMU cycles; these are
  Run B scope, not passes from Run A.
- **Gap:** Registered-user coupon behavior was source-compared to its unchanged
  shared reservation/finalization contract and its automated regression suite
  passed, but no separate live registered-user coupon purchase was performed in
  this deterministic Run A.

## Run-A verdict

**PASS — Run B may launch.** No successful security attack, wrong coupon
redemption count, new MMU anchor finding, test/build failure, or migration
failure was found. The stated browser/registered-live spot-check items remain
explicit Run-B/coverage gaps rather than defects demonstrated by Run A.

---

## Run B — browser walkthrough (2026-07-10)

Environment: branch `Admin-UI-and-Logic-implementation`, commit `116ae6d19fd54551b33c3ffdd9cdb8fe8e424ab2`, matching Run A. Chromium 146 was driven through Chrome DevTools Protocol at `127.0.0.1:9223`; the SvelteKit dev server ran at `127.0.0.1:3002` and the console-email backend at `127.0.0.1:3001` with jobs disabled. No application source was changed.

### Pre-flight

`node database/diagnose-mmu-anchors.js` returned exactly the inherited exclusion set. No category-(a) QA data remained, so no pre-flight deletion was made.

| Subscription | Classification | Evidence |
| --- | --- | --- |
| `9b619566-b9df-442d-a1ed-d45de0e42241` | (b) pre-existing | Order `2b2e5ed6-c0a5-4de0-a926-cd7534eb0e79`, non-QA customer `hifegib740@wivstore.com`; preserved fixture from Run A. |
| `a84c8871-b58a-4f8b-99fa-193ebf476277` | (b) pre-existing corruption | Order `f3a388fe-e96d-45c8-92d3-4a936684daf1`, non-QA customer `69mkyypvtyho@teacher.unbox.edu.pl`; preserved fixture from Run A. |
| `abb2499c-4d4e-4f95-82f9-9f71b685b05d` | (b) pre-existing corruption | Same non-QA order/customer family as the first preserved fixture; preserved. |

### Phase 0 — blocking browser result

| Action → expected | Actual / evidence | Result |
| --- | --- | --- |
| Open `/admin-next/products` as the seeded admin. Expected: interactive Products page. | SSR page rendered with all navigation and `+ New product`; Chrome CDP browser text confirmed the page and authenticated admin identity. | PASS |
| Real pointer click `+ New product`. Expected: inactive-product form opens. | Form opened. This proves browser hydration and the local click handler on the page work. | PASS |
| Enter `QA-R10 Trace`, `qa-r10-trace-20260710`, service/category/description through real focused browser input. Expected: submit becomes enabled. | The five DOM values were exactly the typed values and `Create inactive product.disabled` was `false`. | PASS |
| Real pointer click `Create inactive product`. Expected: browser sends `POST /api/v1/admin/products`, closes form, and lists the draft. | Instrumented CDP `Network.requestWillBeSent` recorded only unrelated TikTok telemetry POSTs; **no** `/api/...` request occurred. After 1.5 seconds the form remained open and there was no UI error. This was repeated after configuring the dev proxy's required backend port `3001`. | **FAIL** |

This is a browser-blocking defect: supported admin product creation cannot be submitted, so the required fresh QA-R10 catalog, separate UI price saves, coupon, guest checkout, fulfillment, claim, MMU, and remaining Phase 1–6 browser steps cannot be executed without violating the browser-first rule. They are unexecuted, not inferred from Run A.

### Defect list

#### RB-1 — High — `/admin-next` product creation submit is inoperative in Chromium

Reproduction:

1. Log in as an admin and open `/admin-next/products`.
2. Click `+ New product`, complete the required Name and Slug fields (all fields were populated in the trace), and confirm the submit control becomes enabled.
3. Click `Create inactive product` with a real browser pointer event.

Expected: `POST /api/v1/admin/products`, followed by the new inactive product appearing in the UI. Actual: no application API request is emitted; the form remains open with no error. Suspected surface: `frontend/src/routes/admin-next/products/+page.svelte`, specifically the `createProduct` event path (and/or its hydrated event binding). Severity is High because the only supported new-console product setup workflow is broken and blocks catalog changes and the end-to-end customer flow.

### DB/write and simulation log

| Operation | Classification |
| --- | --- |
| Browser startup/auth cookies, navigation, DOM/CDP network instrumentation | No DB write; permitted browser QA instrumentation. |
| Temporary backend move from 3104 to 3001 | Permitted local test-environment correction: Vite's checked-in dev proxy targets `localhost:3001`; no product data mutation. |
| `POST /api/v1/admin/products` creating inactive `QA-R10 Network Probe` (`qa-r10-network-probe-20260710`) through a direct curl diagnostic while verifying the proxy/CSRF path | **Violation — non-browser diagnostic data write.** It did not change pricing, anchors, dates, or production source and is retained as QA-prefixed trace data; it was not used to bypass the blocked walkthrough. |
| `term_start_at`, `start_date`, `end_date`, task due dates, payment timestamps, `pricing_publish_runs`, `price_history.metadata`, or `price_history.starts_at` | Not mutated. |

### Run-B verdict

**FAIL (not ready for human QA / Task 4).** RB-1 blocks the mandated browser catalog setup at Phase 0; therefore Phases 1–6 were not run and cannot be represented as passes. Services and Chromium were stopped at the end of the run. No application code was fixed.

---

## RB-1 remediation verification (2026-07-10)

### Root-cause finding

The original CDP observation was **not a reproducible application-level
failure**. A clean controlled CDP target failed to activate even the first
`+ New product` control with the same injected `Input.dispatchMouseEvent`
sequence; therefore it could not validly establish that the later create
control received a trusted click. Conversely, Vite's client compilation of the
pre-fix page contains `$.event('click', button_1, createProduct)`, proving the
handler was emitted, and the new DOM-event regression test invokes the API
boundary with the typed payload.

| Candidate | Evidence | Conclusion |
| --- | --- | --- |
| A. Native form default submission | Pre-fix markup had no `<form>` and the button was `type="button"`; native navigation/default submission was impossible. | Not the cause. |
| B. Overlay/wrong target | `AdminCard` has no active overlay for this card; the clean CDP trace failed even on the initial page-header control. | Not product-button-specific. |
| C. Throwing/hanging handler | The compiled handler is attached; DOM submit calls the mocked `adminService.createProduct` once with the expected payload. The repair retains an explicit visible error path. | Not reproduced. |
| D. Stale reactive closure | DOM input events produce the exact submitted Name, Slug, Service type, and Category payload. | Ruled out. |
| E. Hydration mismatch | The client compiler emits the create binding. The failed synthetic interaction affected the page-header control as well. | Ruled out for the product control. |

The confirmed failure mechanism was the **headless CDP input-injection setup**,
not a detached product handler. The page was nevertheless hardened: product
creation is now a native, prevented submit with an in-flight guard and visible
failure state. The same high-risk manual mark-paid action now uses the same
submit contract. This removes silent click-only submission paths and makes the
intended interaction directly regression-testable.

### Defect-class sweep

| Surface | Product click-only submit pattern present? | Action |
| --- | --- | --- |
| Product create | Yes | Replaced with native `onsubmit`; added in-flight/error handling and DOM regression test. |
| Variant create/edit, term create/edit, price save, fulfillment settings | No native form submission existed; these are direct, in-page command buttons rather than a submitted draft. | Inspected; no unrelated refactor. |
| Coupon create/edit, announcement publish | Same direct command pattern, but not the confirmed CDP-driver mechanism. | Inspected; no change. |
| Manual mark-paid | Yes: entered note followed by a state-changing action. | Replaced with native `onsubmit`, in-flight guard, and DOM regression test. |
| Credentials save, activation instruction/link delivery, MMU completion, issue flag | Direct item/task commands, not persisted form drafts; existing async action error paths retained. | Inspected; no change. |
| Customer strict-rules acceptance and ready-to-activate | Confirmations are direct state-transition commands, not drafts submitted from a form. | Inspected; no change. |

### Regression coverage and fail-then-pass proof

Level delivered: **component-level DOM testing**. A full browser harness was
not previously present; adding a Playwright/browser-service fixture would also
require authenticated backend, database, and provider test orchestration. The
new Vitest/jsdom harness dispatches real `input` and `submit` DOM events rather
than calling component handlers. It covers product creation and the requested
second high-risk form, manual mark-paid.

Fail proof: temporarily restoring the pre-fix click-only product markup made
the product test fail exactly at submission: `Unable to fire a "submit" event
- please provide a DOM element.` Restoring the native form produces two
passing tests. This demonstrates that the regression test rejects the old
non-form implementation and exercises the repaired submit contract.

### Files changed

| File | Justification |
| --- | --- |
| `frontend/src/routes/admin-next/products/+page.svelte` | Native create submit, duplicate-submit guard, and explicit error-capable action flow. |
| `frontend/src/routes/admin-next/orders/[orderId]/+page.svelte` | Applies the same robust submit contract to manual mark-paid. |
| `frontend/src/routes/admin-next/adminNextActionForms.test.ts` | DOM-event regression tests for product create and mark-paid. |
| `frontend/vitest.config.js` | Isolated jsdom/browser-resolution test configuration without changing production Vite resolution. |
| `frontend/package.json`, `frontend/package-lock.json` | Adds the frontend `test` command and Vitest/testing-library/jsdom dependencies. |

### Verification

| Command | Result |
| --- | --- |
| `cd frontend && npm test` | PASS: 1 file, 2 DOM-event tests. |
| Pre-fix targeted product test | FAIL as expected: no form existed for the submit event. |
| `cd frontend && npm run check` | PASS: 0 errors, 0 warnings. |
| `cd frontend && npm run lint` | PASS: 0 errors; 79 pre-existing warnings. |
| `cd frontend && npm run build` | PASS: production bundle built in 1m 10s. |
| `npm test -- --runInBand --silent` | PASS: 96/96 suites, 400/400 tests; known Jest forced-exit advisory only. |
