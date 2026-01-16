# Phase 3 - Services/API Implementation (Completion Notes)

Date: 2026-01-03
Owner: Tech Lead
Scope: Dashboard overview, orders history, subscriptions list enhancements, PIN services, credential reveal

This document describes what was implemented during Phase 3, including new
endpoints, response shapes, service behavior, rate limits, and operational
notes. It is intended for engineering and QA verification.

---

## 1) Summary of Implemented Changes

### 1.1 New API endpoints
- `GET /api/v1/dashboard/overview`
- `GET /api/v1/orders`
- `POST /api/v1/users/pin/set`
- `POST /api/v1/users/pin/verify`
- `POST /api/v1/users/pin/reset-request`
- `POST /api/v1/subscriptions/:subscriptionId/credentials/reveal`

### 1.2 Subscriptions list and detail
- `GET /api/v1/subscriptions/my-subscriptions` now returns:
  - Correct `total` count (true pagination)
  - Derived fields: `renewal_state`, `days_until_renewal`
  - No `credentials_encrypted` field (redacted)
- `GET /api/v1/subscriptions/:subscriptionId` also redacts
  `credentials_encrypted`.

### 1.3 PIN system
- PIN hashing uses scrypt with per-user salt.
- PIN set requires at least one `orders.status = 'paid'`.
- PIN verify issues a short-lived token (Redis, TTL 10 minutes).
- 5 failed PIN attempts triggers 10-minute lockout.

### 1.4 Credential reveal
- Requires a valid, one-time PIN token.
- Only allowed for `status = 'active'` and `credentials_encrypted IS NOT NULL`.
- Audit log written on every attempt.

---

## 2) Endpoint Details

### 2.1 Dashboard Overview
`GET /api/v1/dashboard/overview`

Auth: required (session cookie or bearer token)

Response (200):
```json
{
  "data": {
    "counts": {
      "active_subscriptions": 0,
      "upcoming_renewals": 0
    },
    "credits": {
      "available_balance": 0,
      "pending_balance": 0,
      "currency": "USD"
    },
    "alerts": [],
    "upcoming_renewals": [],
    "recent_orders": []
  }
}
```

Rules:
- Upcoming renewals = auto-renew subscriptions with billing date within 7 days.
- Recent orders = latest 3 orders for the user (excluding `cart`).
- Alerts are only for important events:
  - `renewal_overdue` (billing date in the past)
  - `renewal_due_soon` (within 3 days)
  - `renewal_payment_failed` (status_reason in `renewal_payment_failed`, `auto_renew_credit_failed`)
  - `low_credits` (credits insufficient for upcoming credit renewals)

### 2.2 Orders History
`GET /api/v1/orders`

Query params:
- `limit` (default 20)
- `offset` (default 0)
- `status` (optional)
- `payment_provider` (optional)
- `include_items` (optional, default false)
- `include_cart` (optional, default false)

Response (200):
```json
{
  "data": {
    "orders": [
      {
        "id": "...",
        "status": "paid",
        "payment_provider": "credits",
        "payment_method_badge": { "type": "credits", "label": "Credits" },
        "items": []
      }
    ],
    "pagination": {
      "limit": 20,
      "offset": 0,
      "total": 1,
      "hasMore": false
    }
  }
}
```

Notes:
- Orders default to excluding `status = 'cart'`.
- When `include_items=true`, each order includes `items`.
- Payment method badge rules:
  - `credits` if `paid_with_credits` or `payment_provider=credits`
  - `stripe` if `payment_provider=stripe`
  - `other` if another provider exists
  - `unknown` if no provider

### 2.3 Subscriptions List
`GET /api/v1/subscriptions/my-subscriptions`

Query params:
- `service_type`, `status`, `limit`, `page`, `offset`, `include_expired`

Derived fields:
- `renewal_state`:
  - `manual` if `auto_renew=false`
  - `unknown` if no billing date
  - `overdue` if billing date in the past
  - `due_soon` if billing date <= 7 days
  - `scheduled` otherwise
- `days_until_renewal`:
  - negative if overdue
  - null if no billing date or manual

Credentials:
- `credentials_encrypted` is never included in list or detail responses.

### 2.4 PIN Set
`POST /api/v1/users/pin/set`

Body:
```json
{ "pin": "1234" }
```

Rules:
- PIN must be exactly 4 digits.
- Requires at least one paid order.
- One-time only (reject if already set).

Responses:
- 200: PIN set (returns `pin_set_at`)
- 403: no paid order
- 409: already set
- 400: invalid PIN

### 2.5 PIN Verify (token issuance)
`POST /api/v1/users/pin/verify`

Body:
```json
{ "pin": "1234" }
```

Success (200):
```json
{
  "data": {
    "pin_token": "hex",
    "expires_at": "ISO-8601",
    "expires_in_seconds": 600
  }
}
```

Failure:
- 401 `PIN_INVALID` with attempts remaining
- 429 `PIN_LOCKED` with `locked_until`
- 400 `PIN not set`
- 503 if Redis unavailable (token cannot be issued)

Lockout:
- 5 failed attempts
- 10-minute cooldown
- Successful verify resets attempt counter

### 2.6 PIN Reset Request
`POST /api/v1/users/pin/reset-request`

Response (200):
```json
{
  "data": {
    "support_url": "/help"
  }
}
```

### 2.7 Credential Reveal (PIN-gated)
`POST /api/v1/subscriptions/:subscriptionId/credentials/reveal`

Body:
```json
{ "pin_token": "..." }
```

Rules:
- Requires a valid PIN token (one-time use).
- Token must belong to the same user.
- Subscription must be `active` and have `credentials_encrypted`.

Success (200):
```json
{
  "data": {
    "subscription_id": "...",
    "credentials": "opaque-string"
  }
}
```

Failure cases:
- 401 if token missing/invalid
- 403 if token user mismatch or subscription not eligible
- 404 if subscription not found or credentials missing
- 503 if Redis unavailable

---

## 3) Rate Limits (per user/IP)

- Dashboard overview: 30 requests/min
- Orders list: 60 requests/min
- Subscriptions list: 50 requests/min
- Credential reveal: 10 requests/min
- PIN set: 5 requests/hour
- PIN verify: 20 requests/15 min
- PIN reset request: 3 requests/hour

Note: Rate limiting fails closed if Redis is unavailable (503).

---

## 4) Audit Logging

Credential reveal attempts are stored in
`credential_reveal_audit_logs` with:

- `user_id`
- `subscription_id`
- `success`
- `failure_reason`
- request metadata (IP, user agent, request id)

Known `failure_reason` values:
- `invalid_pin_token`
- `pin_token_invalid`
- `pin_token_unavailable`
- `pin_token_user_mismatch`
- `subscription_not_found`
- `subscription_ineligible`
- `credentials_missing`

---

## 5) Operational Dependencies

- Redis is required for:
  - Rate limiting
  - PIN token issuance/consumption
- `public.users` must include the authenticated user id.
  - If missing, FK constraints will block credits/orders.
  - Backfill available in `database/migrations/20251016_110000_backfill_users_from_auth.sql`.

---

## 6) Files Added/Updated

New:
- `src/routes/dashboard.ts`
- `src/routes/orders.ts`
- `src/services/dashboardService.ts`
- `src/services/pinService.ts`
- `src/schemas/pin.ts`
- `src/utils/pin.ts`
- `src/utils/orderHelpers.ts`

Updated:
- `src/routes/api.ts`
- `src/routes/subscriptions.ts`
- `src/routes/users.ts`
- `src/services/orderService.ts`
- `src/services/subscriptionService.ts`
- `src/services/auditLogService.ts`
- `src/utils/subscriptionHelpers.ts`
- `src/types/order.ts`

---

## 7) Smoke Test Summary (Manual)

Executed:
- Dashboard overview
- Orders list (basic + include_items)
- Subscriptions list with derived fields and redaction
- Credits deposit and credit-based checkout
- PIN set/verify/token issuance
- Credential reveal (missing credentials) + audit log validation
- PIN token one-time use
- PIN lockout + recovery
- Credential reveal success (seeded credentials)

Cleanup:
- Reset `credentials_encrypted` to NULL
- Reset `pin_failed_attempts` and `pin_locked_until`

---

## 8) Notes for Phase 4

- Dashboard UI should consume `/api/v1/dashboard/overview`.
- Subscriptions page should use `/api/v1/subscriptions/my-subscriptions` and
  rely on `renewal_state` and `days_until_renewal`.
- Credential reveal should prompt for PIN, then call:
  1) `/api/v1/users/pin/verify` to get `pin_token`
  2) `/api/v1/subscriptions/:id/credentials/reveal` with token

