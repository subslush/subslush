# Fraud Edge Protection Runbook (SubSlush)

Updated: March 30, 2026

## 1) Cloudflare baseline protection scope

Protect these frontend routes on the proxied `subslush.com` zone:

- `/auth/login`
- `/auth/forgot-password`
- `/checkout` (all subpaths)
- `/dashboard/orders` (all subpaths)

## 2) Important Cloudflare constraints

- Bot protections (`Bot Fight Mode`/`Super Bot Fight Mode`) are zone-wide, not path-scoped.
- Path-scoped friction should be implemented with WAF custom rules.
- For path-specific protection, use WAF custom rules with `Managed Challenge`.
- `api.subslush.com` is currently configured as DNS-only in this repo setup checklist, so Cloudflare WAF/Bot protections do not apply there until it is proxied.

## 3) Recommended baseline configuration

1. Disable basic `Bot Fight Mode`, then enable/configure `Super Bot Fight Mode` (Pro).
2. Add a WAF custom skip rule for API traffic to bypass `http_request_sbfm`:

```text
(http.host in {"api.subslush.com" "api-staging.subslush.com"} or (
  http.host in {"subslush.com" "www.subslush.com"} and
  starts_with(http.request.uri.path, "/api/v1/")
))
```

3. Add one WAF custom rule with action `Managed Challenge` and this expression:

```text
(http.host in {"subslush.com" "www.subslush.com"} and (
  http.request.uri.path eq "/auth/login" or
  http.request.uri.path eq "/auth/forgot-password" or
  starts_with(http.request.uri.path, "/checkout") or
  starts_with(http.request.uri.path, "/dashboard/orders")
))
```

4. Keep challenge passage enabled in Cloudflare defaults to reduce repeat friction.

## 4) API helper script

Use:

```bash
./deploy/scripts/configure_cloudflare_baseline_protection.sh
```

Required environment variables:

- `CF_API_TOKEN`
- `CF_ZONE_ID`

Optional:

- `CF_ENABLE_SUPER_BOT_FIGHT_MODE=true|false` (default: `true`)
- `CF_SBFM_DEFINITELY_AUTOMATED=allow|block|managed_challenge` (default: `managed_challenge`)
- `CF_SBFM_LIKELY_AUTOMATED=allow|block|managed_challenge` (default: `allow` on Pro)
- `CF_SBFM_VERIFIED_BOTS=allow|block` (default: `allow`)
- `CF_SBFM_STATIC_RESOURCE_PROTECTION=true|false` (default: `false`)
- `CF_ENABLE_JS_DETECTIONS=true|false` (default: `true`)
- `CF_RULE_REF=<custom rule ref>` (default: `subslush_sensitive_routes_managed_challenge_v1`)
- `CF_ENABLE_API_SBFM_SKIP_RULE=true|false` (default: `true`)
- `CF_API_SBFM_SKIP_RULE_REF=<custom rule ref>` (default: `subslush_api_skip_sbfm_v1`)

The script uses Cloudflare Rulesets API for WAF custom rules (`http_request_firewall_custom` phase entrypoint).
On Pro zones, Cloudflare does not allow enforcing likely automated traffic via SBFM (challenge/block), so this value should remain `allow`.
Keep the API SBFM skip rule enabled or Cloudflare can challenge API/SSR/XHR traffic (including `subslush.com/api/v1/*` requests before Vercel rewrites).

## 5) Validation checklist

1. Open `/auth/login` in a private window from a non-whitelisted IP and confirm challenge behavior appears in Security Events.
2. Repeat for `/auth/forgot-password`, `/checkout`, `/dashboard/orders`.
3. Verify normal users can pass challenge and proceed.
4. Confirm no unexpected challenge loops in Safari mobile + Chrome desktop.

## 6) Castle.io decision

Castle’s Cloudflare integration can be enabled without immediate app-code changes for edge-level detection.

Current recommendation for SubSlush:

- Phase 1: Keep Castle as Cloudflare-connected/no-code only (optional).
- Phase 2 (if needed): Add Castle SDK + backend event verification for in-app authenticated abuse and account-takeover patterns.

Reason: Cloudflare-only Castle integration is enough for initial baseline friction, but SDK/API signals are stronger for account-level fraud decisions inside logged-in flows.
