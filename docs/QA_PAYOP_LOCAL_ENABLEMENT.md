# Local Payop quote enablement

Payop checkout options require two independent inputs. An empty method list in
an otherwise healthy local checkout is expected when either input is absent:

1. Payop must return live methods for the configured project. Set
   `PAYOP_ENABLED=true` and provide the project/public/secret values plus a
   currently valid `PAYOP_JWT_TOKEN`. A rejected or expired JWT prevents the
   application from obtaining the live-method catalog.
2. The locked price snapshot must contain published FX prices and `fx_rate`
   metadata for the display/processing currency and EUR (the fixed Payop fee is
   EUR-denominated). A normal admin base-price save does not manufacture this
   metadata. Configure `CURRENCYAPI_KEY`, set `FX_ENGINE_ENABLED=true`, and run
   both the FX fetch and supported pricing-publish workflow before creating the
   Run-B checkout.

For a deterministic local QA setup, enable both FX jobs temporarily and invoke
their supported service entry points after loading `.env`:

```bash
npx ts-node --transpile-only -e "import('./src/services/jobs/fxJobs').then(async ({ runDailyFxFetch, runWeeklyPricingPublish }) => { await runDailyFxFetch(); await runWeeklyPricingPublish(); })"
```

Use `FX_FETCH_JOB_ENABLED=true` and `FX_PUBLISH_JOB_ENABLED=true` for that
invocation, then restore the desired scheduler flags. Before the browser run,
confirm that the published snapshot contains a same-snapshot EUR row and that
the relevant rows' `metadata.fx_rate` values are positive. Do not insert FX or
price-history rows manually.

The quote service has regression coverage for both per-line multi-snapshot
orders and the legacy header-snapshot fallback with valid FX metadata. Thus a
local missing-FX/invalid-JWT result is an environment gap, not snapshot
resolution failure.
