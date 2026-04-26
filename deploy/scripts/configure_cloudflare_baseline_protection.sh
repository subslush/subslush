#!/usr/bin/env bash
set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required but not installed."
  exit 1
fi

if [[ -z "${CF_API_TOKEN:-}" ]]; then
  echo "CF_API_TOKEN is required."
  exit 1
fi

if [[ -z "${CF_ZONE_ID:-}" ]]; then
  echo "CF_ZONE_ID is required."
  exit 1
fi

CF_API_BASE="https://api.cloudflare.com/client/v4"
CF_ENABLE_SUPER_BOT_FIGHT_MODE="${CF_ENABLE_SUPER_BOT_FIGHT_MODE:-true}"

# Pro/Super Bot Fight Mode defaults (override via env if needed)
CF_SBFM_DEFINITELY_AUTOMATED="${CF_SBFM_DEFINITELY_AUTOMATED:-managed_challenge}"
# Pro plan does not support challenging/blocking likely automated bots in SBFM.
# Keep this at allow by default; Business/Enterprise can override.
CF_SBFM_LIKELY_AUTOMATED="${CF_SBFM_LIKELY_AUTOMATED:-allow}"
CF_SBFM_VERIFIED_BOTS="${CF_SBFM_VERIFIED_BOTS:-allow}"
CF_SBFM_STATIC_RESOURCE_PROTECTION="${CF_SBFM_STATIC_RESOURCE_PROTECTION:-false}"
CF_ENABLE_JS_DETECTIONS="${CF_ENABLE_JS_DETECTIONS:-true}"
CF_ENABLE_API_SBFM_SKIP_RULE="${CF_ENABLE_API_SBFM_SKIP_RULE:-true}"

RULE_REF="${CF_RULE_REF:-subslush_sensitive_routes_managed_challenge_v1}"
RULE_DESCRIPTION="SubSlush baseline managed challenge for login/forgot-password/checkout/order-history"
API_SBFM_SKIP_RULE_REF="${CF_API_SBFM_SKIP_RULE_REF:-subslush_api_skip_sbfm_v1}"
API_SBFM_SKIP_RULE_DESCRIPTION="SubSlush API host bypass for Super Bot Fight Mode"

EXPRESSION='(http.host in {"subslush.com" "www.subslush.com"} and (http.request.uri.path eq "/auth/login" or http.request.uri.path eq "/auth/forgot-password" or starts_with(http.request.uri.path, "/checkout") or starts_with(http.request.uri.path, "/dashboard/orders")))'
API_SBFM_SKIP_EXPRESSION='(http.host in {"api.subslush.com" "api-staging.subslush.com"} or (http.host in {"subslush.com" "www.subslush.com"} and starts_with(http.request.uri.path, "/api/v1/")))'

API_BODY=""
API_STATUS=""

api() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  local tmp_body
  local status

  tmp_body="$(mktemp)"

  if [[ -n "$data" ]]; then
    status="$(curl -sS -o "$tmp_body" -w "%{http_code}" -X "$method" "${CF_API_BASE}${path}" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "$data")"
  else
    status="$(curl -sS -o "$tmp_body" -w "%{http_code}" -X "$method" "${CF_API_BASE}${path}" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json")"
  fi

  API_BODY="$(cat "$tmp_body")"
  API_STATUS="$status"
  rm -f "$tmp_body"
}

print_errors() {
  local response="$1"
  echo "$response" | jq '.errors, .messages'
}

ensure_success() {
  local message="$1"
  local response="${2:-$API_BODY}"
  local status="${3:-$API_STATUS}"
  local success

  success="$(echo "$response" | jq -r '.success // false')"

  if [[ "$status" != 2* ]] || [[ "$success" != "true" ]]; then
    echo "$message"
    echo "HTTP status: $status"
    print_errors "$response"
    exit 1
  fi
}

validate_bool() {
  local name="$1"
  local value="$2"
  if [[ "$value" != "true" && "$value" != "false" ]]; then
    echo "$name must be 'true' or 'false' (got: $value)"
    exit 1
  fi
}

validate_enum() {
  local name="$1"
  local value="$2"
  shift 2
  local allowed=("$@")
  local item

  for item in "${allowed[@]}"; do
    if [[ "$value" == "$item" ]]; then
      return 0
    fi
  done

  echo "$name must be one of: ${allowed[*]} (got: $value)"
  exit 1
}

validate_bool "CF_ENABLE_SUPER_BOT_FIGHT_MODE" "$CF_ENABLE_SUPER_BOT_FIGHT_MODE"
validate_bool "CF_SBFM_STATIC_RESOURCE_PROTECTION" "$CF_SBFM_STATIC_RESOURCE_PROTECTION"
validate_bool "CF_ENABLE_JS_DETECTIONS" "$CF_ENABLE_JS_DETECTIONS"
validate_bool "CF_ENABLE_API_SBFM_SKIP_RULE" "$CF_ENABLE_API_SBFM_SKIP_RULE"
validate_enum "CF_SBFM_DEFINITELY_AUTOMATED" "$CF_SBFM_DEFINITELY_AUTOMATED" allow block managed_challenge
validate_enum "CF_SBFM_LIKELY_AUTOMATED" "$CF_SBFM_LIKELY_AUTOMATED" allow block managed_challenge
validate_enum "CF_SBFM_VERIFIED_BOTS" "$CF_SBFM_VERIFIED_BOTS" allow block

if [[ "$CF_ENABLE_SUPER_BOT_FIGHT_MODE" == "true" ]]; then
  effective_sbfm_likely="$CF_SBFM_LIKELY_AUTOMATED"
  # Step 1: Explicitly disable basic Bot Fight Mode first.
  disable_bfm_payload='{"fight_mode":false}'
  api PUT "/zones/${CF_ZONE_ID}/bot_management" "$disable_bfm_payload"
  ensure_success "Failed to disable basic Bot Fight Mode before enabling Super Bot Fight Mode."
  echo "Basic Bot Fight Mode disabled (fight_mode=false)."

  # Step 2: Enable/configure Super Bot Fight Mode (Pro plan capability).
  sbfm_payload="$(jq -cn \
    --arg definitely "$CF_SBFM_DEFINITELY_AUTOMATED" \
    --arg likely "$CF_SBFM_LIKELY_AUTOMATED" \
    --arg verified "$CF_SBFM_VERIFIED_BOTS" \
    --argjson static_protection "$CF_SBFM_STATIC_RESOURCE_PROTECTION" \
    --argjson enable_js "$CF_ENABLE_JS_DETECTIONS" \
    '{
      fight_mode: false,
      sbfm_definitely_automated: $definitely,
      sbfm_likely_automated: $likely,
      sbfm_verified_bots: $verified,
      sbfm_static_resource_protection: $static_protection,
      enable_js: $enable_js
    }')"

  api PUT "/zones/${CF_ZONE_ID}/bot_management" "$sbfm_payload"

  sbfm_success="$(echo "$API_BODY" | jq -r '.success // false')"
  if [[ "$API_STATUS" != 2* ]] || [[ "$sbfm_success" != "true" ]]; then
    # Pro plan returns an entitlement error when trying to enable likely automated actions.
    if echo "$API_BODY" | jq -e '.errors[]?.message // "" | test("likely automated bots ruleset"; "i")' >/dev/null; then
      echo "Zone is not entitled to enforce likely automated bot actions on this plan. Retrying with sbfm_likely_automated=allow."
      effective_sbfm_likely="allow"
      sbfm_payload="$(jq -cn \
        --arg definitely "$CF_SBFM_DEFINITELY_AUTOMATED" \
        --arg verified "$CF_SBFM_VERIFIED_BOTS" \
        --argjson static_protection "$CF_SBFM_STATIC_RESOURCE_PROTECTION" \
        --argjson enable_js "$CF_ENABLE_JS_DETECTIONS" \
        '{
          fight_mode: false,
          sbfm_likely_automated: "allow",
          sbfm_definitely_automated: $definitely,
          sbfm_verified_bots: $verified,
          sbfm_static_resource_protection: $static_protection,
          enable_js: $enable_js
        }')"

      api PUT "/zones/${CF_ZONE_ID}/bot_management" "$sbfm_payload"
      ensure_success "Failed to configure Super Bot Fight Mode after Pro-plan fallback."
    else
      ensure_success "Failed to configure Super Bot Fight Mode."
    fi
  fi
  echo "Super Bot Fight Mode configured (definitely=${CF_SBFM_DEFINITELY_AUTOMATED}, likely=${effective_sbfm_likely}, verified=${CF_SBFM_VERIFIED_BOTS}, static_resource_protection=${CF_SBFM_STATIC_RESOURCE_PROTECTION}, enable_js=${CF_ENABLE_JS_DETECTIONS})."
else
  echo "Skipping Super Bot Fight Mode update (CF_ENABLE_SUPER_BOT_FIGHT_MODE=false)."
fi

api GET "/zones/${CF_ZONE_ID}/rulesets/phases/http_request_firewall_custom/entrypoint"

if [[ "$API_STATUS" == "404" ]]; then
  if [[ "$CF_ENABLE_API_SBFM_SKIP_RULE" == "true" ]]; then
    create_entrypoint_payload="$(jq -cn \
      --arg skip_ref "$API_SBFM_SKIP_RULE_REF" \
      --arg skip_description "$API_SBFM_SKIP_RULE_DESCRIPTION" \
      --arg skip_expression "$API_SBFM_SKIP_EXPRESSION" \
      --arg ref "$RULE_REF" \
      --arg description "$RULE_DESCRIPTION" \
      --arg expression "$EXPRESSION" \
      '{
        name: "default",
        kind: "zone",
        phase: "http_request_firewall_custom",
        rules: [
          {
            ref: $skip_ref,
            description: $skip_description,
            expression: $skip_expression,
            action: "skip",
            action_parameters: {
              phases: ["http_request_sbfm"]
            },
            enabled: true
          },
          {
            ref: $ref,
            description: $description,
            expression: $expression,
            action: "managed_challenge",
            enabled: true
          }
        ]
      }')"
  else
    create_entrypoint_payload="$(jq -cn \
      --arg ref "$RULE_REF" \
      --arg description "$RULE_DESCRIPTION" \
      --arg expression "$EXPRESSION" \
      '{
        name: "default",
        kind: "zone",
        phase: "http_request_firewall_custom",
        rules: [{
          ref: $ref,
          description: $description,
          expression: $expression,
          action: "managed_challenge",
          enabled: true
        }]
      }')"
  fi

  api POST "/zones/${CF_ZONE_ID}/rulesets" "$create_entrypoint_payload"
  ensure_success "Failed to create the custom firewall phase entrypoint ruleset and managed challenge rule."

  created_ruleset_id="$(echo "$API_BODY" | jq -r '.result.id // empty')"
  created_rule_id="$(echo "$API_BODY" | jq -r --arg ref "$RULE_REF" '.result.rules[]? | select((.ref // "") == $ref) | .id' | head -n1)"

  if [[ "$CF_ENABLE_API_SBFM_SKIP_RULE" == "true" ]]; then
    created_skip_rule_id="$(echo "$API_BODY" | jq -r --arg ref "$API_SBFM_SKIP_RULE_REF" '.result.rules[]? | select((.ref // "") == $ref) | .id' | head -n1)"
    echo "Created custom firewall entrypoint ruleset (id=${created_ruleset_id}), API SBFM skip rule (id=${created_skip_rule_id}), and managed challenge rule (id=${created_rule_id})."
    echo "API traffic bypassing Super Bot Fight Mode: api.subslush.com, api-staging.subslush.com, subslush.com/api/v1/*, www.subslush.com/api/v1/*"
  else
    echo "Created custom firewall entrypoint ruleset (id=${created_ruleset_id}) and managed challenge rule (id=${created_rule_id})."
  fi
  echo "Protected paths: /auth/login, /auth/forgot-password, /checkout*, /dashboard/orders*"
  exit 0
fi

ensure_success "Failed to get custom firewall phase entrypoint ruleset."

ruleset_id="$(echo "$API_BODY" | jq -r '.result.id // empty')"
if [[ -z "$ruleset_id" ]]; then
  echo "Ruleset ID missing from entrypoint response."
  exit 1
fi

existing_rule_id="$(echo "$API_BODY" | jq -r --arg ref "$RULE_REF" --arg desc "$RULE_DESCRIPTION" '.result.rules[]? | select((.ref // "") == $ref or (.description // "") == $desc) | .id' | head -n1)"
existing_skip_rule_id="$(echo "$API_BODY" | jq -r --arg ref "$API_SBFM_SKIP_RULE_REF" --arg desc "$API_SBFM_SKIP_RULE_DESCRIPTION" '.result.rules[]? | select((.ref // "") == $ref or (.description // "") == $desc) | .id' | head -n1)"

rule_payload="$(jq -cn \
  --arg ref "$RULE_REF" \
  --arg description "$RULE_DESCRIPTION" \
  --arg expression "$EXPRESSION" \
  '{
    ref: $ref,
    description: $description,
    expression: $expression,
    action: "managed_challenge",
    enabled: true
  }')"

skip_rule_payload="$(jq -cn \
  --arg ref "$API_SBFM_SKIP_RULE_REF" \
  --arg description "$API_SBFM_SKIP_RULE_DESCRIPTION" \
  --arg expression "$API_SBFM_SKIP_EXPRESSION" \
  '{
    ref: $ref,
    description: $description,
    expression: $expression,
    action: "skip",
    action_parameters: {
      phases: ["http_request_sbfm"]
    },
    enabled: true
  }')"

if [[ "$CF_ENABLE_API_SBFM_SKIP_RULE" == "true" ]]; then
  if [[ -n "$existing_skip_rule_id" ]]; then
    api PATCH "/zones/${CF_ZONE_ID}/rulesets/${ruleset_id}/rules/${existing_skip_rule_id}" "$skip_rule_payload"
    ensure_success "Failed to update API Super Bot Fight Mode skip custom rule."
    echo "Updated API Super Bot Fight Mode skip rule (id=${existing_skip_rule_id}) in ruleset ${ruleset_id}."
  else
    api POST "/zones/${CF_ZONE_ID}/rulesets/${ruleset_id}/rules" "$skip_rule_payload"
    ensure_success "Failed to create API Super Bot Fight Mode skip custom rule."
    created_skip_rule_id="$(echo "$API_BODY" | jq -r '.result.id // empty')"
    echo "Created API Super Bot Fight Mode skip rule (id=${created_skip_rule_id}) in ruleset ${ruleset_id}."
  fi
  echo "API traffic bypassing Super Bot Fight Mode: api.subslush.com, api-staging.subslush.com, subslush.com/api/v1/*, www.subslush.com/api/v1/*"
else
  echo "Skipping API Super Bot Fight Mode bypass rule update (CF_ENABLE_API_SBFM_SKIP_RULE=false)."
fi

if [[ -n "$existing_rule_id" ]]; then
  api PATCH "/zones/${CF_ZONE_ID}/rulesets/${ruleset_id}/rules/${existing_rule_id}" "$rule_payload"
  ensure_success "Failed to update existing managed challenge custom rule."
  echo "Updated managed challenge rule (id=${existing_rule_id}) in ruleset ${ruleset_id}."
else
  api POST "/zones/${CF_ZONE_ID}/rulesets/${ruleset_id}/rules" "$rule_payload"
  ensure_success "Failed to create managed challenge custom rule."
  created_rule_id="$(echo "$API_BODY" | jq -r '.result.id // empty')"
  echo "Created managed challenge rule (id=${created_rule_id}) in ruleset ${ruleset_id}."
fi

echo "Protected paths: /auth/login, /auth/forgot-password, /checkout*, /dashboard/orders*"
