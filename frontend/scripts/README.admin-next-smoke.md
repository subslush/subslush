# Admin-next smoke harness

The default target is a production Vite preview. Start the backend, build the frontend, then start preview; preview proxies `/api` to the local backend. Provide a local admin JWT.

```bash
# terminal 1, repository root
PORT=3001 EMAIL_PROVIDER=console JOBS_ENABLED=false STRIPE_ENABLED=true PAYPAL_CHECKOUT_ENABLED=true npm run dev

# terminal 2
cd frontend && npm run build && npm run preview

# terminal 3
cd frontend
SMOKE_ADMIN_TOKEN='<local admin JWT>' npm run smoke:admin-next
```

For local UI iteration, `npm run dev` remains supported as an optional target on the same port.

The suite launches system Chromium headlessly and runs strictly sequentially. Catalog changes are made through the real admin-next UI; the deeper form preconditions are created with supported local HTTP APIs. The pending order used by manual mark-paid comes from the real card-checkout route, which is why the local backend must enable PayPal checkout even though no external payment is completed. MMU tasks are created with the application's manual sweep using an explicit reference time; the harness never edits dates directly.

Fixtures are intentionally retained with the `SMOKE-` prefix for local inspection/cleanup; no production cleanup is attempted by this harness. The customer fixtures use the guest owner created by checkout, matching this branch's claim-only guest-order design.

Covered form contracts include product, variant, term, price (including a succeeded pricing-snapshot read-back), fulfillment settings, MMU validation, activation, coupon, announcement, manual mark-paid, credentials/delivery, activation instructions, MMU renewal, strict-rules acknowledgement/reveal, and activation readiness.

Each form contract is enforced as: real pointer click, expected POST response, then visible UI render. A disabled, silent, or non-requesting submit fails the run.
