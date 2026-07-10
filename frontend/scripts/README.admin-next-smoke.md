# Admin-next smoke harness

The default target is a production Vite preview. Start the backend, build the frontend, then start preview; preview proxies `/api` to the local backend. Provide a local admin JWT.

```bash
# terminal 1, repository root
PORT=3001 npm run dev

# terminal 2
cd frontend && npm run build && npm run preview

# terminal 3
cd frontend
SMOKE_ADMIN_TOKEN='<local admin JWT>' npm run smoke:admin-next
```

For local UI iteration, `npm run dev` remains supported as an optional target on the same port.

The suite launches system Chromium headlessly and runs strictly sequentially. It creates `SMOKE-<timestamp>` product and variant fixtures through the real admin-next UI. Fixtures are intentionally retained with the `SMOKE-` prefix for local inspection/cleanup; no production cleanup is attempted by this harness.

Each form contract is enforced as: real pointer click, expected POST response, then visible UI render. A disabled, silent, or non-requesting submit fails the run.
