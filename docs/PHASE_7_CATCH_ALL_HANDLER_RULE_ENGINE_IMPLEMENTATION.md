# Phase 7 - Catch-All Handler + Rule Engine Implementation

## Goals
- Remove hard-coded service/plan enums so new products can be sold without code changes.
- Validate purchases using DB-backed rules and product metadata instead of handler-only logic.
- Keep handlers available as optional overrides for legacy services that explicitly opt in.

## Scope
This phase focuses on the subscription catalog purchase/browse flow and the rule engine that governs validation. It does not add new DB migrations or change admin workflows beyond what was already implemented in previous phases.

## High-Level Summary
- Service types and plan identifiers are now plain strings across backend and frontend.
- Subscription validation is DB-driven (product/variant status, max subscriptions, metadata schema).
- Handler-based validation is optional and only used when a product explicitly opts in via metadata.
- Subscription endpoints now resolve plan data using products + variants (service_plan or variant_code), and only reference handlers when opted in.

## Implementation Details

### 1) Types and Validation (Backend + Frontend)
- `ServiceType` and `ServicePlan` are now `string` types in both backend and frontend.
- Zod and Fastify JSON schemas were updated to accept strings (no enum constraints) and validate at runtime against DB listings.
- Subscription metadata schema now defaults to a permissive record (`z.record(z.string(), z.any())`).

Files:
- `src/types/subscription.ts`
- `src/schemas/subscription.ts`
- `src/routes/subscriptions.ts`
- `src/routes/payments.ts`
- `frontend/src/lib/types/subscription.ts`
- `frontend/src/lib/validation/subscription.ts`

### 2) Catalog Rule Engine (New Utility)
A new rule helper was added to interpret product metadata:
- `metadata.rules` may be an object or JSON string.
- `use_handler` can be provided at the root (`metadata.use_handler`/`useHandler`) or inside rules (`rules.use_handler`/`useHandler`).
- Metadata validation schema can be supplied via:
  - `metadata.rules.metadata_schema` (or camelCase variants), or
  - `metadata.rules` itself if it looks like a JSON Schema object.

File:
- `src/utils/catalogRules.ts`

### 3) DB-Driven Purchase Validation
`SubscriptionService.canPurchaseSubscription` now performs rule checks using the catalog:
1. Product/variant resolution via `catalogService.findProductVariantByServicePlan`.
2. Product must be `active` and variant must be `is_active = true`.
3. `max_subscriptions` is enforced on the product.
4. If a metadata schema exists, subscription metadata is validated using AJV.
5. If `use_handler` is enabled, handler validation is executed in addition to the DB rules.

Schema validation details:
- AJV is configured with `strict: false` and cached per schema to avoid recompilation.
- Invalid schemas are rejected and return a safe validation error.

Files:
- `src/services/subscriptionService.ts`
- `src/utils/catalogRules.ts`

### 4) Handler Opt-In Behavior
Handlers still exist for legacy services, but they are only used when the product opts in:
- `metadata.use_handler = true`, or
- `metadata.rules.use_handler = true`.

Handler usage is now limited to:
- Optional metadata validation if opted in.
- Optional plan detail/feature fallbacks for browse/detail endpoints.

Files:
- `src/services/handlers/baseServiceHandler.ts`
- `src/services/handlers/spotifyHandler.ts`
- `src/services/handlers/netflixHandler.ts`
- `src/services/handlers/tradingviewHandler.ts`

### 5) API and Browse Behavior Updates
Endpoints now resolve plan data from DB listings and only fall back to handlers when opted in.

Key behaviors:
- `/subscriptions/available` reads products + variants, uses `service_plan` or `variant_code`, and skips plans without current pricing. Missing plan codes or prices create admin tasks (via existing helpers).
- `/subscriptions/:serviceType/:planId` and `/subscriptions/related/:serviceType` resolve listing data from DB and require active product/variant + current price.
- `/subscriptions/validate-purchase` uses DB validation and pricing from `price_history`.

Files:
- `src/routes/subscriptions.ts`
- `src/services/catalogService.ts`

### 6) Catalog Service Enhancements
New helpers for DB-driven plan resolution:
- `getProductByServiceType(serviceType)`
- `findProductVariantByServicePlan(serviceType, planCode)` (supports `service_plan` OR `variant_code`)
- `findVariantForServicePlan(serviceType, planCode)` (used in checkout flow)

File:
- `src/services/catalogService.ts`

### 7) Frontend Compatibility Updates
Frontend types and components were updated to use string keys and remove enum reliance.

Files:
- `frontend/src/lib/types/subscription.ts`
- `frontend/src/lib/validation/subscription.ts`
- `frontend/src/lib/components/SubscriptionCard.svelte`
- `frontend/src/lib/components/subscription/SubscriptionCard.svelte`
- `frontend/src/lib/components/subscription/PurchaseModal.svelte`

### 8) Display Name Fallbacks
For unknown service types or plans, display names now fall back to title-cased strings, ensuring new DB entries still render cleanly.

File:
- `src/utils/subscriptionHelpers.ts`

## Rule Configuration Reference

### Product Metadata Flags
Enable handler validation (optional):
```json
{
  "use_handler": true
}
```

Enable handler via rules:
```json
{
  "rules": {
    "use_handler": true
  }
}
```

### Metadata Validation Schema
You can validate subscription metadata using JSON Schema stored on the product:
```json
{
  "rules": {
    "metadata_schema": {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "required": ["region"],
      "properties": {
        "region": { "type": "string", "minLength": 2, "maxLength": 10 },
        "screens": { "type": "integer", "minimum": 1, "maximum": 6 }
      },
      "additionalProperties": true
    }
  }
}
```

If `metadata.rules` itself is a JSON schema object, it will be used directly.
If `metadata.rules` is stored as a JSON string, it is parsed automatically.

## Testing and Smoke Verification

### Automated
- `npm run build` (backend)
- `npm test` (backend)
- `npm run check` (frontend)
- `npm run build` (frontend)

### Live Smoke
- Backend and frontend were started locally and verified via HTTP.
- Temporary product/variant/price_history data was inserted, tested, and removed.
- Endpoints verified:
  - `/api/v1/subscriptions/available`
  - `/api/v1/subscriptions/available?service_type=...`
  - `/api/v1/subscriptions/:serviceType/:planId`
  - `/api/v1/subscriptions/related/:serviceType`
- Frontend SSR routes verified:
  - `/`
  - `/browse`
  - `/browse/subscriptions/:serviceType/:planId`

## Notes and Compatibility
- No new migrations were required for Phase 7.
- Handler logic remains available for services that explicitly opt in via metadata.
- New services can now be introduced by DB records alone (no code changes).

