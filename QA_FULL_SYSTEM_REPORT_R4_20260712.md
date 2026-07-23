# Full System QA R4 — 2026-07-12

## Verdict

**FAIL — not ready for human QA / Task 4.**

The local branch was tested at `3c5fee68ac877f8955927f2046ae791565a11a39`
(`fix: guard ambiguous product listing terms`).  It is one commit ahead of
`origin/Admin-UI-and-Logic-implementation`, which remains at
`24611ee09f91af04ee5ecfb63cf81e2d1b6177d4`; no remote state was changed.

The two prior R3 findings are resolved, but a live admin-next smoke still
cannot create a pending checkout, blocking the required manual-mark-paid and
the remainder of the fresh full E2E sequence.  This report does not treat that
as waived.

## Environment and evidence

- Local Fastify production build on `127.0.0.1:3001`, SvelteKit dev server on
  `127.0.0.1:3000`, PostgreSQL 16.14, Redis local.
- Server run used `EMAIL_PROVIDER=console`, `JOBS_ENABLED=false`; health was
  healthy with database and both Redis clients connected.
- All raw command output is in `qa-artifacts/full-r4-20260712/`.
- Fresh test records use `QA-R4` / `SMOKE-*` prefixes.  The smoke fixture
  cleanup ran after its failure.  Fresh/copy migration databases were dropped.

## Part A — automated / static / migrations

| Check | Actual | Result |
|---|---|---|
| Backend suite | `npm test -- --runInBand --detectOpenHandles`: 99 suites, 424 tests | PASS |
| Frontend suite | `npm test`: 7 files, 17 tests | PASS |
| Backend build | `npm run build` | PASS |
| Backend lint | 0 errors; 10 existing warnings | PASS with warnings |
| Frontend Svelte check | 0 errors, 0 warnings | PASS |
| Frontend lint | 0 errors; 79 existing warnings | PASS with warnings |
| Frontend production build | `npm run build` | PASS |
| Fresh migrations | 61 migrations applied cleanly to `qa_r4_fresh_20260712` | PASS |
| Dev-copy migrations | PostgreSQL-16 dump/restore copy had no pending migrations | PASS |
| Migration validation | 61 legacy migrations grandfathered; all valid | PASS |

The Task-1 safeguard coverage remains present in the passing backend suite:
MMU coverage sums `(6,1)`, `(12,1)`, `(12,2)`, `(6,2)`, `(12,3)`, divisibility
rejection, per-item delivery/reveal, strict-rules gate, handshake transitions,
and expiry sweep.

R3 regression verification:

- An active product with sole active six-month term and no
  `duration_months` activated (200) and its public detail endpoint returned
  200 with month 6.
- A product with active one- and six-month terms but no designation was
  rejected at activation (400, `Cannot activate product: multiple active
  terms...`) and remained unavailable publicly (404).
- Tests force console email, no longer use Jest `forceExit`, and the full
  suite completed under open-handle detection.

## Part B — security evidence

Completed live probes:

- Valid-body unauthenticated requests to per-item reveal, rules acceptance,
  readiness, delivery, activation instructions/link/restart, fulfillment,
  credentials, task credentials, newsletter stats received 401.
- A regular-user JWT received 403 for fulfillment, admin-next orders,
  newsletter stats, subscription credentials, and task credentials.
- A regular user received `303 /dashboard` for both `/admin` and
  `/admin-next`; an admin received 200 for legacy admin and the migrated
  Overview, Orders, Fulfillment, Subscriptions, Payments, Coupons, Users and
  Announcements pages.
- The passing suite covers reveal ownership, strict-rules precondition,
  false/missing confirmation, encrypted credential storage and audit logging.

Note: schema validation precedes authentication for malformed POST bodies, so
malformed anonymous readiness/instruction/link probes return 400; equivalent
well-formed anonymous requests return 401.  No protected transition succeeded.

## Part C / D execution log

| Area | Action / expected / actual | Result |
|---|---|---|
| Startup | Backend boot, job registration, DB/Redis health | PASS |
| Old/new route guards | Admin and admin-next protected equivalently; authenticated admin routes render | PASS |
| Product listing regression | Live create/activate/public detail for ambiguous and sole-term listings | PASS |
| Admin-next browser smoke | Product creation, variants, term, price, fulfillment settings, MMU divisibility negative, coupon and announcement progressed; pending checkout then returned 503 and no pending order was persisted | FAIL |
| Phase 1 webhook / multi-item flow | Prior R3 signed Stripe evidence exists, but this R4 run did not complete a fresh multi-item order after the smoke checkout failure | NOT RUN TO COMPLETION |
| Phases 2–6 | Per-item delivery, claim/reveal, handshake link/restart, manual mark-paid, all MMU cycles, stale Payop/Antom sweep, newsletter, announcements and final cross-surface consistency were blocked/not rerun end-to-end | NOT RUN TO COMPLETION |

## DB and simulation log

```sh
# Fresh migration database (direct PostgreSQL, not the application pooler)
PGPASSWORD=... createdb -h localhost -p 5432 -U subscription_user qa_r4_fresh_20260712
DB_HOST=localhost DB_PORT=5432 DB_DATABASE=qa_r4_fresh_20260712 ... node database/migrate.js up

# Dev-copy migration database (PostgreSQL 16 binaries match PostgreSQL 16 server)
/usr/lib/postgresql/16/bin/pg_dump -h localhost -p 5432 -U subscription_user -Fc --no-owner --no-acl subscription_platform
/usr/lib/postgresql/16/bin/pg_restore -h localhost -p 5432 -U subscription_user -d qa_r4_copy_20260712 --no-owner --no-acl ...
DB_HOST=localhost DB_PORT=5432 DB_DATABASE=qa_r4_copy_20260712 ... node database/migrate.js up
```

The initial copy attempt with the system PostgreSQL-17 client failed only
because it emitted `SET transaction_timeout`, unsupported by PostgreSQL 16;
the matching PostgreSQL-16 retry passed.  No date/time manipulation was
performed in this run because the fresh E2E flow did not reach Phase 5/6.

## Defects and gaps

### QA-R4-01 — High: supported pending-card checkout cannot create the fixture required for manual mark-paid smoke

1. Start local backend and frontend with console email.
2. Run `frontend/scripts/admin-next-smoke.mjs` with a valid local admin JWT.
3. The script creates and configures catalog data successfully, then calls the
   supported `/payments/checkout` path to create its pending card order.

Expected: pending order is persisted, even if a local PSP redirect cannot be
completed; the smoke then exercises manual mark-paid.

Actual: checkout returns 503 and no pending order exists.  The smoke aborts at
`frontend/scripts/admin-next-smoke.mjs:172`; evidence:
`qa-artifacts/full-r4-20260712/admin-next-smoke.log`.

Suspected surfaces: local card checkout/provider configuration and pending
order persistence in `src/routes/payments.ts` / checkout service path.  This
blocks required Phase 4 and the dependent fresh Phase 5–6 walkthrough.

### Coverage gaps — severity: gap

Because QA-R4-01 stopped the fresh walkthrough, this run has no new complete
evidence for: two-user/guest live IDOR fixtures, registered checkout,
multi-item webhook-to-task flow, all three delivery variants, guest claim,
strict-rules modal XSS rendering, full MMU interval-1/2 cycle counts, stale
Payop/Antom sweep, newsletter email, old-console mutations, and final
cross-surface consistency.  Existing automated coverage passed but does not
replace the required scripted E2E evidence.

