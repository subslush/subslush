# Admin-next smoke harness

Start the local backend and frontend first. The backend must expose `/api/v1` to the frontend dev server, and provide a local admin JWT.

```bash
# terminal 1, repository root
PORT=3001 npm run dev

# terminal 2
cd frontend && npm run dev

# terminal 3
cd frontend
SMOKE_ADMIN_TOKEN='<local admin JWT>' npm run smoke:admin-next
```

The suite launches system Chromium headlessly and runs strictly sequentially. It creates `SMOKE-<timestamp>` product and variant fixtures through the real admin-next UI. Fixtures are intentionally retained with the `SMOKE-` prefix for local inspection/cleanup; no production cleanup is attempted by this harness.

Each form contract is enforced as: real pointer click, expected POST response, then visible UI render. A disabled, silent, or non-requesting submit fails the run.
