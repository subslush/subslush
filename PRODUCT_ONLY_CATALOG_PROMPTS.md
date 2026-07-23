# Product-only catalog implementation prompts

These prompts are intentionally standalone. Give them to implementation agents in order; each agent must inspect the repository and current database state before changing anything, and must not assume that an earlier prompt was implemented exactly as written.

## Prompt 1 — Restore product-only administration

You are a senior Tech Lead and software architect working in `/home/yuri/projects/ss`. Review the complete codebase, migrations, API routes, services, frontend stores/types, `/admin-next`, public catalog, cart, checkout, order, subscription, fulfillment, pricing, coupon, FX, analytics, and test paths before making changes. Use the repository and database schema as the source of truth.

The desired catalog model is one independently sellable product per item. For example, “Crunchyroll Mega Fan 1 Month” and “Crunchyroll Mega Fan 12 Months” are separate products, each with its own fixed duration and fixed price. Administrators must not create or manage variants or variant terms for new/current catalog items.

Implement a safe product-only administration flow with these requirements:

- Make `/admin-next` product creation and editing use the product's fixed catalog fields as the canonical sellable configuration: at minimum `duration_months`, `fixed_price_cents`, `fixed_price_currency`, and any existing comparison-price/current-price history behavior required by the platform.
- Add a clearly named **Fixed Catalog Fields** section to the new admin UI for those values, with validation, usable defaults, precise help text, save feedback, and accessible controls.
- Remove the **Variants & Terms** tab and every create/edit/delete/deactivate variant or term action from `/admin-next`. Remove variant-first wording and the “create a variant before setting a price” dead end. The Pricing tab must work directly against the product-only price model and preserve price-history/audit semantics where they exist.
- Ensure product creation can produce an inactive, fully configurable fixed product and that publishing is blocked with an actionable validation message unless required fixed fields are valid. A valid product-only listing must never require a variant.
- Keep historical variant-backed records readable during the transition. Do not destructively delete historical variants, terms, prices, order references, subscriptions, or fulfillment evidence. Any legacy compatibility surface must be explicitly identified and isolated from the new admin workflow.
- Repair the accidental-variant recovery path: an administrator must be able to return an affected product to the product-only model without triggering a public catalog outage. Design the cleanup or deactivation operation from actual foreign-key/data dependencies; do not bypass safeguards blindly.
- Audit public list/detail availability logic so one malformed or transitional product cannot cause “Failed to load subscriptions” for the whole catalog. Invalid listings should fail closed per item with structured diagnostics, while valid fixed products remain available.
- Preserve fulfillment options, delivery presentation metadata, media, taxonomy, labels, coupons, regional/FX display, and existing public URLs.
- Update backend contracts, frontend types, loaders, services, validation, and tests together. Remove truly dead admin-next variant code after proving nothing still imports it.
- If a data migration or repair script is necessary, make it idempotent, transaction-safe, observable, dry-run capable where practical, and reversible. Include pre/post queries that identify affected products and verify price/duration continuity.

Acceptance criteria:

1. An admin can create “Product A — 1 Month” and “Product A — 12 Months” as separate products, configure fixed duration and price, publish them, later change either price, and never touch a variant or term.
2. `/admin-next` visibly contains Fixed Catalog Fields and no Variants & Terms tab or variant/term CRUD controls.
3. Fixed products render in browse, search/category lists, detail, cart, checkout, orders, subscriptions, and fulfillment with the correct product, term, currency, and price.
4. A legacy or accidentally created variant cannot take down unrelated catalog results, and the affected product has a documented safe recovery procedure.
5. Automated tests cover fixed-product creation/editing, publication validation, price updates/history, affected-product repair, mixed legacy/fixed catalogs, and catalog failure isolation.

Before coding, write a concise current-state architecture and dependency map. Then implement, run focused tests plus full backend/frontend validation, review the final diff for unintended behavior, and report migrations, compatibility decisions, risks, and exact verification evidence. Do not commit unrelated working-tree files.

## Prompt 2 — Make product identity durable

You are a senior Tech Lead and data architect working in `/home/yuri/projects/ss`. Fully inspect the repository and schema before changing it. The target catalog is product-only: every sellable item is a separate product with its own fixed duration and price. Variants may remain only as historical compatibility data and must not remain the durable identity for new purchases.

Design and implement durable first-class product identity across the entire purchase lifecycle:

- Inventory every table, model, DTO, API payload, query, job, report, webhook, email, admin page, and frontend state object that currently identifies an item only through `variant_id`/`product_variant_id`, plan code, slug, or free-form metadata. Pay particular attention to cart items, order items, payments, subscriptions, fulfillment tasks, renewal/MMU jobs, coupons, evidence/audit records, refunds, analytics, and customer/admin order views.
- Add explicit `product_id` references wherever a durable sellable-item identity is required. Use appropriate foreign keys, nullability during rollout, indexes, uniqueness rules, and immutable snapshots for user-visible historical name, duration, unit/total price, currency, and fulfillment configuration.
- Do not make historical records depend on a product's current mutable name, slug, duration, price, or metadata. Define which values are identity references and which must be purchase-time snapshots.
- Build an idempotent backfill that derives product identity from trustworthy relationships such as `product_variants.product_id`; detect ambiguous/orphaned rows instead of guessing. Produce counts and identifiers for resolved, unresolved, and conflicting records.
- Use an expand/backfill/verify/contract migration strategy. During compatibility, dual-write product identity for all new records, dual-read with an explicit precedence rule, and emit telemetry when falling back to legacy variant identity. Do not add `NOT NULL` constraints until production data and all writers are verified.
- Update transactional boundaries so product identity and purchase snapshots cannot diverge when carts become orders/subscriptions or when payment webhooks replay.
- Preserve idempotency and existing payment/order references. Never rewrite historical monetary snapshots merely because the catalog price changed.
- Update authorization and ownership queries so direct product IDs cannot introduce IDOR/data-leak regressions.
- Document the eventual legacy-column policy. Dropping a variant reference is a separate, evidence-gated contract step, not an automatic part of this task.

Required deliverables:

1. A dependency map of every legacy identity use and its replacement/compatibility behavior.
2. Safe migration(s), backfill tooling, verification queries, rollback/forward-fix instructions, and observability for fallbacks or unresolved rows.
3. Updated domain types, repositories/services, checkout/order/subscription/fulfillment flows, API serializers, admin/customer UI, reports, and tests.
4. Tests for new fixed-product purchases, legacy purchases, webhook retries, renewals/MMU, refunds, deleted/renamed products, orphan detection, authorization, and mixed data during rollout.

Run the relevant migration checks, backend suites, frontend checks/tests, and focused E2E flows. Report exact row counts/verification results from the test environment, compatibility risks, and the criteria required before enforcing stricter constraints. Do not modify or commit unrelated files.

## Prompt 3 — Modernize the API

You are a senior Tech Lead and API architect working in `/home/yuri/projects/ss`. Inspect all backend routes/services, OpenAPI or JSON schemas, frontend API clients/types, cart/checkout payloads, webhook handlers, jobs, tests, and external integration assumptions before coding. The product is now the canonical sellable entity; variants are legacy compatibility only.

Modernize the API without a flag-day break:

- Define product-centric request and response contracts for public catalog detail/listing, cart pricing, checkout, order/subscription creation, coupons, fulfillment, renewals, and admin catalog operations. New requests should use `product_id` and product fixed fields rather than requiring `variant_id`, variant terms, or plan-code inference.
- Replace misleading variant-centric domain/service naming in the canonical path with product/item terminology. Keep tightly scoped compatibility adapters for legacy callers rather than spreading aliases through the new core.
- Establish one authoritative resolver for sellable product, fixed duration, current price, comparison price, currency/FX, availability, and purchase-time snapshots. Make error semantics explicit and ensure one invalid item cannot turn an otherwise healthy catalog request into a global 500/503.
- During the deprecation window, accept legacy `variant_id` only where needed, translate it to `product_id`, apply a documented precedence/conflict rule if both are sent, return stable deprecation signals, and instrument usage. Do not silently accept mismatched product/variant pairs.
- Keep response compatibility long enough for a staged frontend rollout, but document canonical fields and removal gates. Version the API or use additive evolution according to the repository's existing conventions.
- Update runtime validation schemas, TypeScript types, API clients, stores, cart persistence/migration, checkout, admin-next, tests, and API documentation together. Sanitize stale browser cart entries and give users a recoverable message rather than crashing.
- Preserve idempotency keys, payment replay behavior, authorization, CSRF/CORS controls, rate limits, audit logs, money-in-integer-cents rules, and historical snapshots.
- Add structured errors with stable machine codes for unavailable product, invalid fixed configuration, stale price, unsupported currency, legacy identifier conflict, and invalid duration.

Acceptance criteria:

1. A clean client can complete browse → detail → cart → checkout using product identity only.
2. Legacy clients still work through an observable, tested compatibility adapter during the declared window.
3. Conflicting or stale identifiers fail safely and specifically; malformed products are isolated.
4. API docs, runtime schemas, generated/manual types, frontend clients, and tests agree on field names and nullability.
5. Telemetry can prove when legacy `variant_id` traffic is low enough to remove compatibility.

Start with a current/target contract matrix and rollout sequence. Implement in reversible stages, run contract/integration/security tests plus frontend validation, and report deprecations, compatibility metrics, operational risks, and the exact removal gates. Do not commit unrelated working-tree files.

## Prompt 4 — Full manual E2E, regression, and smoke QA

You are the senior QA lead responsible for release sign-off in `/home/yuri/projects/ss`. The implementation is intended to make products—not variants—the canonical sellable items, add Fixed Catalog Fields to `/admin-next`, remove Variants & Terms administration, make product identity durable, and modernize APIs with safe legacy compatibility. Perform a genuinely complete manual end-to-end test with smoke, regression, API, database, security, resilience, compatibility, and observability coverage. Do not treat unit tests or mocked browser tests as substitutes for manual E2E.

First inspect the implementation, migrations, environment/runbooks, existing QA artifacts, test accounts/providers, and acceptance criteria. Record the commit SHA, build versions, environment, database migration state, feature flags, browser/device matrix, test data, and limitations. Use an isolated non-production environment and real running frontend/backend/database. Use sandbox payment providers and safe email/fulfillment integrations. Do not use production credentials or charge real money.

Prepare a traceable test matrix and execute at least the following:

- Smoke: health/readiness, startup/migrations, login/logout/session expiry, admin authorization, browse/search/category, product detail, cart, checkout, payment callback/webhook, order creation, customer subscription, admin order/fulfillment, email, logs, and no unexpected console/network errors.
- Product-only admin: create separate 1-month and 12-month products for the same brand; configure all Fixed Catalog Fields; taxonomy, labels, logo/media, public presentation including custom Delivery format title/details, fulfillment choices, coupons, status; publish/unpublish; edit price and duration with validation; verify price history/audit. Confirm there is no Variants & Terms tab, no variant prerequisite, and no variant/term request in normal network traffic.
- Public behavior: verify both products independently across listing/detail/search/category; correct slug/name/duration/current and comparison prices/currency; delivery copy; activation guide; feature fields; responsive and keyboard behavior. A product with no customer-selectable upgrade option must show no Upgrade option card. New-account-only, own-account-only, and both-choice products must show and validate only the applicable customer choices. Admin-only MMU behavior must not be disclosed as a customer action.
- Purchase lifecycle: guest and authenticated flows where supported; add/remove/change quantity; stale/local-storage cart migration; multi-item cart; coupon scopes and boundaries; FX/locale; totals/rounding; concurrent/stale price update; checkout retry; successful, failed, cancelled, expired, duplicate, and out-of-order payment webhooks; idempotent order/subscription/fulfillment creation; confirmation email; customer history; admin evidence; refund/cancellation paths where supported.
- Fulfillment: new account, own account with each credential requirement, activation-link handshake, strict-rules version/acceptance evidence, manual monthly upgrade schedules, retries, credentials reveal/access control, and term/duration consistency. Verify purchase-time snapshots remain unchanged after the catalog product is renamed, repriced, unpublished, or deleted/archived according to supported policy.
- Durable identity/data: inspect database records after each critical flow. Confirm `product_id`, legacy compatibility references, monetary/duration snapshots, foreign keys, indexes, audit evidence, and backfill status are correct. Exercise legacy pre-migration orders/subscriptions and new product-only purchases together; identify fallback telemetry and prove there are no ambiguous/orphaned records hidden by the UI.
- API compatibility: exercise canonical product-only payloads and supported legacy `variant_id` payloads; both matching and conflicting identifiers; missing/invalid IDs; invalid duration/currency; unavailable/misconfigured product; stable status/error codes; deprecation headers/telemetry; authorization, IDOR, CSRF/CORS, rate limiting, payload bounds, and sensitive-data redaction.
- Resilience/regression: one malformed/transitional product must not cause “Failed to load subscriptions” for valid products. Test unavailable price/FX, database/service timeout if the environment supports safe fault injection, webhook replay, refresh/back navigation, two-admin concurrent edits, cache invalidation, and rollback/forward migration behavior. Recheck unrelated critical customer/admin flows.
- Accessibility/cross-browser: desktop and mobile viewports in the supported browser matrix; keyboard-only navigation, focus/error announcement, labels, contrast spot checks, and no layout overflow for long localized presentation text.

For every case capture a test ID, prerequisites/data, exact steps, expected result, actual result, pass/fail/block status, API/network evidence, relevant database evidence, screenshots where useful, and log correlation IDs without secrets. Check browser console and server logs after every major journey. Separate product defects, environment defects, test-data defects, and untested risk.

Run automated backend/frontend build, type/check, unit/integration/contract suites as supporting regression evidence, followed by a clean-environment smoke rerun. Do not fix defects silently during QA: log each defect with severity, reproducibility, scope, evidence, and retest status; if changes are authorized, retest the defect and all affected journeys from a clean state.

Produce a final release report containing scope and exclusions, environment/commit, executed matrix and pass rates, defect list, migration/backfill counts, compatibility/fallback observations, performance/resilience notes, security/access-control results, artifact locations, cleanup performed, residual risks, and an explicit GO/NO-GO recommendation. A GO requires all critical journeys to pass, no open release-blocking defects, no catalog-wide failure from one bad product, verified durable identity for new writes, and a successful final smoke after all changes.
